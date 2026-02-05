/**
 * 支付相关路由模块
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const userServiceV2 = require('../services/userServiceV2');
const balanceService = require('../services/balanceService');
const priceConfigService = require('../services/priceConfigService');
const { 
  isWechatPaymentAvailable, createJsapiPayment, createNativePayment,
  verifyCallbackSign, decipherCallback 
} = require('../services/wechatPayService');
const { executeWithRetry } = require('../utils/apiRetry');
const { validateRequest, validateCreatePaymentParams, validateWechatPaymentParams } = require('../utils/validation');
const errorLogService = require('../services/errorLogService');
const monitorService = require('../services/monitorService');

// 套餐价格配置 - 已迁移到数据库，保留作为降级方案
const FALLBACK_PACKAGE_PRICES = { 'free': 0, 'basic': 0.01, 'premium': 29.9 };

/**
 * 获取套餐价格（优先从数据库获取，失败时使用降级方案）
 */
async function getPackagePrices() {
  try {
    const prices = await priceConfigService.getCurrentPrices(true);
    return prices;
  } catch (error) {
    console.warn('从数据库获取价格失败，使用降级方案:', error.message);
    return FALLBACK_PACKAGE_PRICES;
  }
}

// 创建支付订单
router.post('/create', validateRequest(validateCreatePaymentParams), async (req, res) => {
  try {
    const { userId, generationId, packageType } = req.body;
    
    if (!userId || !packageType) {
      return res.status(400).json({ 
        error: '缺少必要参数', 
        message: '需要提供 userId 和 packageType 参数' 
      });
    }
    
    const validPackageTypes = ['free', 'basic', 'premium'];
    if (!validPackageTypes.includes(packageType)) {
      return res.status(400).json({ 
        error: '无效的套餐类型', 
        message: '套餐类型必须是 free, basic 或 premium' 
      });
    }
    
    const user = await userServiceV2.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在', message: '未找到对应的用户' });
    }
    
    const orderId = uuidv4();
    
    // 从数据库获取价格配置
    const packagePrices = await getPackagePrices();
    const amount = packagePrices[packageType];
    
    // 判断订单类型：有 generationId 是生成订单，否则是充值订单
    const orderType = generationId ? 'generation' : 'recharge';
    
    const connection = await db.pool.getConnection();
    try {
      await connection.execute(
        `INSERT INTO payment_orders 
        (id, user_id, generation_id, amount, package_type, order_type, payment_method, status, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [orderId, userId, generationId || null, amount, packageType, orderType, 'wechat', 'pending']
      );
      
      console.log(`创建${orderType === 'recharge' ? '充值' : '生成'}订单成功: ${orderId}, 用户: ${userId}, 金额: ${amount}`);
      
      // 记录监控指标
      monitorService.recordOrderCreated(true);
      
      res.json({ 
        success: true, 
        data: { orderId, amount, packageType, orderType, status: 'pending' }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('创建支付订单失败:', error);
    
    // 记录监控指标
    monitorService.recordOrderCreated(false);
    
    await errorLogService.logError('PAYMENT_ORDER_CREATE_FAILED', error.message, {
      userId: req.body.userId, packageType: req.body.packageType
    });
    res.status(500).json({ error: '创建支付订单失败', message: error.message });
  }
});

// 发起微信支付
router.post('/wechat/jsapi', validateRequest(validateWechatPaymentParams), async (req, res) => {
  try {
    const { orderId, openid } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 orderId 参数' });
    }
    
    if (!isWechatPaymentAvailable()) {
      return res.status(503).json({ error: '支付服务不可用', message: '微信支付配置未完整设置' });
    }
    
    const connection = await db.pool.getConnection();
    try {
      const [rows] = await connection.execute('SELECT * FROM payment_orders WHERE id = ?', [orderId]);
      
      if (rows.length === 0) {
        return res.status(404).json({ error: '订单不存在', message: '未找到对应的支付订单' });
      }
      
      const order = rows[0];
      
      if (order.status !== 'pending') {
        return res.status(400).json({ 
          error: '订单状态异常', 
          message: `订单状态为 ${order.status}，无法支付` 
        });
      }
      
      const params = {
        description: `AI全家福-${order.package_type === 'basic' ? '尝鲜包' : '尊享包'}`,
        out_trade_no: orderId,
        notify_url: `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/payment/callback`,
        amount: { total: Math.round(order.amount * 100), currency: 'CNY' },
        payer: { openid: openid || 'test_openid' }
      };
      
      const result = await executeWithRetry(
        () => createJsapiPayment(params),
        { maxRetries: 1, timeout: 30000, operationName: '微信支付JSAPI' }
      );
      
      res.json({ success: true, data: result });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('发起微信支付失败:', error);
    await errorLogService.logError('WECHAT_PAYMENT_FAILED', error.message, { orderId: req.body.orderId });
    res.status(500).json({ error: '发起微信支付失败', message: error.message });
  }
});

// 发起 Native 支付（PC扫码支付）
router.post('/wechat/native', async (req, res) => {
  try {
    const { orderId, packageType, userId, generationId, description, amount } = req.body;
    
    if (!isWechatPaymentAvailable()) {
      return res.status(503).json({ error: '支付服务不可用', message: '微信支付配置未完整设置' });
    }
    
    const connection = await db.pool.getConnection();
    try {
      let order;
      let finalOrderId = orderId;
      
      // 如果提供了 orderId，查询现有订单
      if (orderId) {
        const [rows] = await connection.execute('SELECT * FROM payment_orders WHERE id = ?', [orderId]);
        
        if (rows.length === 0) {
          return res.status(404).json({ error: '订单不存在', message: '未找到对应的支付订单' });
        }
        
        order = rows[0];
        
        if (order.status !== 'pending') {
          return res.status(400).json({ 
            error: '订单状态异常', 
            message: `订单状态为 ${order.status}，无法支付` 
          });
        }
      } else {
        // 没有 orderId，创建新订单
        if (!packageType) {
          return res.status(400).json({ error: '缺少必要参数', message: '需要提供 orderId 或 packageType' });
        }
        
        const validPackageTypes = ['basic', 'premium'];
        if (!validPackageTypes.includes(packageType)) {
          return res.status(400).json({ error: '无效的套餐类型' });
        }
        
        finalOrderId = uuidv4();
        
        // 从数据库获取价格配置
        const packagePrices = await getPackagePrices();
        const orderAmount = amount || packagePrices[packageType];
        
        // 判断订单类型
        const orderType = generationId ? 'generation' : 'recharge';
        
        await connection.execute(
          `INSERT INTO payment_orders 
          (id, user_id, generation_id, amount, package_type, order_type, payment_method, trade_type, status, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [finalOrderId, userId || null, generationId || null, orderAmount, packageType, orderType, 'wechat', 'NATIVE', 'pending']
        );
        
        order = {
          id: finalOrderId,
          amount: orderAmount,
          package_type: packageType,
          order_type: orderType
        };
        
        console.log(`创建 Native ${orderType === 'recharge' ? '充值' : '生成'}订单: ${finalOrderId}`);
      }
      
      const params = {
        description: description || `AI全家福-${order.package_type === 'basic' ? '尝鲜包' : '尊享包'}`,
        out_trade_no: finalOrderId,
        notify_url: `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/payment/callback`,
        amount: { total: Math.round(order.amount * 100), currency: 'CNY' }
      };
      
      const result = await executeWithRetry(
        () => createNativePayment(params),
        { maxRetries: 1, timeout: 30000, operationName: '微信支付Native' }
      );
      
      // 更新订单的 trade_type
      await connection.execute(
        'UPDATE payment_orders SET trade_type = ? WHERE id = ?',
        ['NATIVE', finalOrderId]
      );
      
      res.json({ 
        success: true, 
        data: {
          orderId: finalOrderId,
          codeUrl: result.code_url,
          amount: order.amount,
          packageType: order.package_type,
          orderType: order.order_type || 'recharge'
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('发起 Native 支付失败:', error);
    await errorLogService.logError('WECHAT_NATIVE_PAYMENT_FAILED', error.message, { 
      orderId: req.body.orderId,
      packageType: req.body.packageType 
    });
    res.status(500).json({ error: '发起 Native 支付失败', message: error.message });
  }
});

// 内部订单备份接口（数据库故障时使用）
router.post('/internal/order-created', async (req, res) => {
  try {
    console.log('收到云函数订单备份通知', req.body);
    
    // 验证内部调用（如果配置了密钥）
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (internalSecret) {
      const requestSecret = req.headers['x-internal-secret'];
      if (requestSecret !== internalSecret) {
        console.error('订单备份验证失败：密钥不匹配');
        return res.status(403).json({ error: '无权访问' });
      }
    }
    
    const { 
      orderId, outTradeNo, userId, openid, unionid,
      amount, packageType, tradeType, status, 
      generationId, reason, dbError 
    } = req.body;
    
    // outTradeNo 是必需的
    if (!outTradeNo) {
      console.error('订单备份失败：缺少 outTradeNo');
      return res.status(400).json({ error: '缺少订单号', message: '必须提供 outTradeNo' });
    }
    
    // amount 是必需的
    if (amount === undefined || amount === null) {
      console.error('订单备份失败：缺少 amount');
      return res.status(400).json({ error: '缺少金额', message: '必须提供 amount' });
    }
    
    console.log(`处理订单备份: ${outTradeNo}, 原因: ${reason}, 金额: ${amount}, 状态: ${status}`);
    
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      
      // 1. 检查用户是否存在，不存在则创建
      let effectiveUserId = userId;
      if (userId) {
        const [userRows] = await connection.execute('SELECT id FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0 && openid) {
          // 用户不存在，尝试创建
          await connection.execute(
            `INSERT INTO users (id, openid, unionid, payment_status, created_at, updated_at) 
             VALUES (?, ?, ?, 'free', NOW(), NOW())
             ON DUPLICATE KEY UPDATE updated_at = NOW()`,
            [userId, openid, unionid || null]
          );
          console.log(`创建用户: ${userId}`);
          
          // 初始化用户余额
          try {
            await balanceService.initializeUserBalances(userId, connection);
            console.log(`✅ 用户 ${userId} 余额初始化成功`);
          } catch (initError) {
            console.error(`⚠️ 用户 ${userId} 余额初始化失败:`, initError.message);
          }
        }
      } else if (openid) {
        // 没有 userId，通过 openid 查找或创建
        const [userRows] = await connection.execute('SELECT id FROM users WHERE openid = ?', [openid]);
        if (userRows.length > 0) {
          effectiveUserId = userRows[0].id;
        } else {
          effectiveUserId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await connection.execute(
            `INSERT INTO users (id, openid, unionid, payment_status, created_at, updated_at) 
             VALUES (?, ?, ?, 'free', NOW(), NOW())`,
            [effectiveUserId, openid, unionid || null]
          );
          console.log(`创建新用户: ${effectiveUserId}`);
          
          // 初始化用户余额
          try {
            await balanceService.initializeUserBalances(effectiveUserId, connection);
            console.log(`✅ 用户 ${effectiveUserId} 余额初始化成功`);
          } catch (initError) {
            console.error(`⚠️ 用户 ${effectiveUserId} 余额初始化失败:`, initError.message);
          }
        }
      } else {
        // 既没有 userId 也没有 openid，创建临时用户
        effectiveUserId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await connection.execute(
          `INSERT INTO users (id, payment_status, created_at, updated_at) 
           VALUES (?, 'free', NOW(), NOW())`,
          [effectiveUserId]
        );
        console.log(`创建临时用户: ${effectiveUserId}`);
        
        // 初始化用户余额
        try {
          await balanceService.initializeUserBalances(effectiveUserId, connection);
          console.log(`✅ 用户 ${effectiveUserId} 余额初始化成功`);
        } catch (initError) {
          console.error(`⚠️ 用户 ${effectiveUserId} 余额初始化失败:`, initError.message);
        }
      }
      
      // 2. 备份订单（使用 INSERT IGNORE 避免重复）
      if (effectiveUserId) {
        // 判断订单类型
        const orderType = generationId ? 'generation' : 'recharge';
        const finalOrderId = orderId || `order-${outTradeNo}`;
        
        await connection.execute(
          `INSERT IGNORE INTO payment_orders 
           (id, user_id, generation_id, out_trade_no, amount, package_type, order_type,
            payment_method, trade_type, status, _openid, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 'wechat', ?, ?, ?, NOW(), NOW())`,
          [
            finalOrderId,
            effectiveUserId,
            generationId || null,  // 充值订单可以为 NULL
            outTradeNo,
            (amount / 100).toFixed(2),  // 转换为元
            packageType || 'basic',
            orderType,
            tradeType || 'JSAPI',
            status || 'pending',
            openid || ''
          ]
        );
        console.log(`✅ 订单已备份: ${outTradeNo}, 类型: ${orderType}, 状态: ${status || 'pending'}`);
        
        // ✅ 关键修复：如果订单状态是 paid，立即充值
        if (status === 'paid' && packageType) {
          try {
            // 检查是否已经充值过
            const [logRows] = await connection.execute(
              `SELECT id FROM usage_logs 
               WHERE user_id = ? AND reference_id = ? AND action_type = 'increment' AND reason = 'payment'
               LIMIT 1`,
              [effectiveUserId, finalOrderId]
            );
            
            if (logRows.length === 0) {
              // 还没充值，立即充值
              const rechargeAmount = await priceConfigService.getRechargeAmount(packageType, connection);
              
              if (rechargeAmount > 0 && rechargeAmount <= 1000) {
                await balanceService.addBalance(
                  effectiveUserId, 
                  rechargeAmount, 
                  'payment', 
                  finalOrderId, 
                  balanceService.BALANCE_TYPES.PAID,
                  connection
                );
                
                // 更新用户支付状态
                await connection.execute(
                  'UPDATE users SET payment_status = ?, updated_at = NOW() WHERE id = ?',
                  [packageType, effectiveUserId]
                );
                
                console.log(`✅ 订单备份时已充值: 用户 ${effectiveUserId}, 套餐 ${packageType}, 次数 ${rechargeAmount}`);
              } else {
                console.error(`❌ 充值次数配置异常: ${rechargeAmount}`);
              }
            } else {
              console.log(`✅ 订单 ${outTradeNo} 已充值过，跳过`);
            }
          } catch (rechargeError) {
            console.error(`❌ 订单备份充值失败:`, rechargeError);
            // 记录错误但不影响订单保存
            await errorLogService.logError('BACKUP_RECHARGE_FAILED', rechargeError.message, {
              userId: effectiveUserId,
              orderId: finalOrderId,
              packageType
            });
          }
        }
      }
      
      await connection.commit();
      
      // 3. 记录错误日志
      await errorLogService.logError('CLOUD_DB_UNAVAILABLE', `云函数数据库故障: ${reason}`, {
        orderId, outTradeNo, dbError, reason
      });
      
      // 4. 记录监控指标
      monitorService.recordDbBackup();
      
      res.json({ success: true, message: '订单已备份', userId: effectiveUserId });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('处理订单备份失败:', error);
    await errorLogService.logError('ORDER_BACKUP_FAILED', error.message, {
      outTradeNo: req.body.outTradeNo
    });
    res.status(500).json({ error: '备份失败', message: error.message });
  }
});

// 内部通知接口（支付成功时调用）
router.post('/internal/notify', async (req, res) => {
  try {
    console.log('收到云函数内部通知', req.body);
    
    // 验证内部调用（如果配置了密钥）
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (internalSecret) {
      const requestSecret = req.headers['x-internal-secret'];
      if (requestSecret !== internalSecret) {
        console.error('内部通知验证失败：密钥不匹配');
        return res.status(403).json({ error: '无权访问' });
      }
    }
    
    const { outTradeNo, transactionId, status, packageType, generationId, openid } = req.body;
    
    if (!outTradeNo) {
      return res.status(400).json({ error: '缺少订单号' });
    }
    
    console.log(`处理支付通知: 订单 ${outTradeNo}, 微信订单号 ${transactionId || '无'}, 状态 ${status}`);
    
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      
      // 1. 查询订单
      const [orderRows] = await connection.execute(
        'SELECT * FROM payment_orders WHERE out_trade_no = ?',
        [outTradeNo]
      );
      
      if (orderRows.length === 0) {
        await connection.rollback();
        console.warn(`订单 ${outTradeNo} 不存在于后端数据库`);
        return res.status(404).json({ error: '订单不存在', message: '请先调用订单备份接口' });
      }
      
      const order = orderRows[0];
      console.log(`找到订单: ${order.id}, 当前状态: ${order.status}, 用户: ${order.user_id}`);
      
      // 2. 更新订单状态（如果需要）
      if (order.status !== 'paid' && status === 'paid') {
        await connection.execute(
          `UPDATE payment_orders 
           SET status = 'paid', transaction_id = ?, paid_at = NOW(), updated_at = NOW() 
           WHERE id = ?`,
          [transactionId || order.transaction_id, order.id]
        );
        console.log(`✅ 订单 ${outTradeNo} 状态已更新为 paid`);
      }
      
      // 3. 检查并充值余额（幂等性处理）
      if (status === 'paid' || order.status === 'paid') {
        // 检查是否已经充值过
        const [logRows] = await connection.execute(
          `SELECT id FROM usage_logs 
           WHERE user_id = ? AND reference_id = ? AND action_type = 'increment' AND reason = 'payment'
           LIMIT 1`,
          [order.user_id, order.id]
        );
        
        if (logRows.length === 0) {
          // 还没充值，立即充值
          const effectivePackageType = packageType || order.package_type;
          
          try {
            const rechargeAmount = await priceConfigService.getRechargeAmount(effectivePackageType, connection);
            
            if (rechargeAmount > 0 && rechargeAmount <= 1000) {
              await balanceService.addBalance(
                order.user_id, 
                rechargeAmount, 
                'payment', 
                order.id, 
                balanceService.BALANCE_TYPES.PAID,
                connection
              );
              
              // 更新用户支付状态
              await connection.execute(
                'UPDATE users SET payment_status = ?, updated_at = NOW() WHERE id = ?',
                [effectivePackageType, order.user_id]
              );
              
              console.log(`✅ 充值成功: 用户 ${order.user_id}, 订单 ${outTradeNo}, 套餐 ${effectivePackageType}, 次数 ${rechargeAmount}`);
              
              // 记录监控指标
              monitorService.recordCallback(true);
            } else {
              console.error(`❌ 充值次数配置异常: ${rechargeAmount}`);
              await errorLogService.logError('INVALID_RECHARGE_AMOUNT', `充值次数配置异常: ${rechargeAmount}`, {
                userId: order.user_id,
                orderId: order.id,
                packageType: effectivePackageType
              });
            }
          } catch (rechargeError) {
            console.error(`❌ 充值失败:`, rechargeError);
            await errorLogService.logError('BALANCE_RECHARGE_FAILED', rechargeError.message, {
              userId: order.user_id,
              orderId: order.id,
              packageType: effectivePackageType
            });
            // 不回滚事务，订单状态已更新，可以后续补单
          }
        } else {
          console.log(`✅ 订单 ${outTradeNo} 已充值过，跳过（幂等性保护）`);
        }
      }
      
      await connection.commit();
      
      res.json({ success: true, message: '处理成功' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('处理内部通知失败:', error);
    
    // 记录监控指标
    monitorService.recordCallback(false);
    
    await errorLogService.logError('INTERNAL_NOTIFY_FAILED', error.message, {
      outTradeNo: req.body.outTradeNo
    });
    res.status(500).json({ error: '处理失败', message: error.message });
  }
});

// 微信支付回调
router.post('/callback', async (req, res) => {
  try {
    console.log('收到微信支付回调');
    
    if (!isWechatPaymentAvailable()) {
      return res.status(503).json({ code: 'FAIL', message: '支付服务不可用' });
    }
    
    const signature = req.headers['wechatpay-signature'];
    const timestamp = req.headers['wechatpay-timestamp'];
    const nonce = req.headers['wechatpay-nonce'];
    const serial = req.headers['wechatpay-serial'];
    const body = req.body;
    
    let isValid = false;
    try {
      isValid = await verifyCallbackSign({ signature, timestamp, nonce, body: JSON.stringify(body), serial });
    } catch (verifyError) {
      console.error('签名验证失败:', verifyError);
      return res.status(401).json({ code: 'FAIL', message: '签名验证失败' });
    }
    
    if (!isValid) {
      return res.status(401).json({ code: 'FAIL', message: '签名验证不通过' });
    }
    
    let decryptedData;
    try {
      decryptedData = decipherCallback(
        body.resource.ciphertext, body.resource.associated_data, body.resource.nonce
      );
    } catch (decryptError) {
      console.error('解密回调数据失败:', decryptError);
      return res.status(500).json({ code: 'FAIL', message: '解密失败' });
    }
    
    if (body.event_type === 'TRANSACTION.SUCCESS') {
      const orderId = decryptedData.out_trade_no;
      const transactionId = decryptedData.transaction_id;
      const tradeState = decryptedData.trade_state;
      
      console.log(`订单 ${orderId} 支付成功，微信交易ID: ${transactionId}`);
      
      const connection = await db.pool.getConnection();
      try {
        await connection.beginTransaction();
        
        await connection.execute(
          `UPDATE payment_orders SET status = ?, transaction_id = ?, updated_at = NOW() WHERE id = ?`,
          [tradeState === 'SUCCESS' ? 'paid' : 'failed', transactionId, orderId]
        );
        
        if (tradeState === 'SUCCESS') {
          const [orderRows] = await connection.execute(
            'SELECT user_id, package_type, amount FROM payment_orders WHERE id = ?', [orderId]
          );
          
          if (orderRows.length > 0) {
            const { user_id, package_type, amount } = orderRows[0];
            
            // 使用 balanceService 处理付费充值
            // ✅ 从 priceConfigService 读取充值次数配置
            const rechargeAmount = await priceConfigService.getRechargeAmount(package_type, connection);
            
            // 验证充值次数合理性
            if (rechargeAmount <= 0 || rechargeAmount > 1000) {
              throw new Error(`充值次数配置异常: ${rechargeAmount}`);
            }
            
            await balanceService.addBalance(user_id, rechargeAmount, 'payment', orderId, balanceService.BALANCE_TYPES.PAID);
            
            // 更新用户支付状态
            await userServiceV2.updatePaymentStatus(user_id, package_type, amount);
            
            console.log(`用户 ${user_id} 付费充值成功: ${package_type}, 金额: ${amount}, 次数: ${rechargeAmount}`);
          }
        }
        
        await connection.commit();
      } catch (dbError) {
        await connection.rollback();
        console.error('更新订单状态失败:', dbError);
        return res.status(500).json({ code: 'FAIL', message: '数据库更新失败' });
      } finally {
        connection.release();
      }
    }
    
    res.json({ code: 'SUCCESS', message: '成功' });
  } catch (error) {
    console.error('处理微信支付回调失败:', error);
    await errorLogService.logError('WECHAT_CALLBACK_FAILED', error.message, {
      headers: { signature: req.headers['wechatpay-signature'] }
    });
    res.status(500).json({ code: 'FAIL', message: error.message });
  }
});

// 查询支付订单状态
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const connection = await db.pool.getConnection();
    try {
      const [rows] = await connection.execute('SELECT * FROM payment_orders WHERE id = ?', [orderId]);
      
      if (rows.length === 0) {
        return res.status(404).json({ error: '订单不存在', message: '未找到对应的支付订单' });
      }
      
      const order = rows[0];
      res.json({ 
        success: true, 
        data: {
          orderId: order.id, userId: order.user_id, generationId: order.generation_id,
          amount: parseFloat(order.amount), packageType: order.package_type,
          paymentMethod: order.payment_method, transactionId: order.transaction_id,
          status: order.status, createdAt: order.created_at, updatedAt: order.updated_at
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('查询支付订单失败:', error);
    res.status(500).json({ error: '查询支付订单失败', message: error.message });
  }
});

// 通过商户订单号查询订单状态（用于小程序轮询）
router.get('/order/by-trade-no/:outTradeNo', async (req, res) => {
  try {
    const { outTradeNo } = req.params;
    
    const connection = await db.pool.getConnection();
    try {
      const [rows] = await connection.execute('SELECT * FROM payment_orders WHERE out_trade_no = ?', [outTradeNo]);
      
      if (rows.length === 0) {
        return res.status(404).json({ error: '订单不存在', message: '未找到对应的支付订单' });
      }
      
      const order = rows[0];
      res.json({ 
        success: true, 
        data: {
          orderId: order.id, 
          outTradeNo: order.out_trade_no,
          userId: order.user_id, 
          generationId: order.generation_id,
          amount: parseFloat(order.amount), 
          packageType: order.package_type,
          paymentMethod: order.payment_method, 
          transactionId: order.transaction_id,
          status: order.status, 
          createdAt: order.created_at, 
          updatedAt: order.updated_at,
          paidAt: order.paid_at
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('查询支付订单失败:', error);
    res.status(500).json({ error: '查询支付订单失败', message: error.message });
  }
});

// 更新支付订单状态
router.put('/order/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, transactionId } = req.body;
    
    if (!orderId || !status) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 orderId 和 status 参数' });
    }
    
    const validStatuses = ['pending', 'paid', 'failed', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '无效的状态值' });
    }
    
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      
      const [orderRows] = await connection.execute(
        'SELECT user_id, package_type, status FROM payment_orders WHERE id = ?', [orderId]
      );
      
      if (orderRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: '订单不存在' });
      }
      
      const order = orderRows[0];
      
      if (transactionId) {
        await connection.execute(
          'UPDATE payment_orders SET status = ?, transaction_id = ?, updated_at = NOW() WHERE id = ?',
          [status, transactionId, orderId]
        );
      } else {
        await connection.execute(
          'UPDATE payment_orders SET status = ?, updated_at = NOW() WHERE id = ?',
          [status, orderId]
        );
      }
      
      if (status === 'paid' && order.status !== 'paid') {
        // 使用 balanceService 处理付费充值
        const [orderDetails] = await connection.execute(
          'SELECT amount, package_type FROM payment_orders WHERE id = ?', [orderId]
        );
        const amount = orderDetails[0]?.amount || 0;
        const packageType = orderDetails[0]?.package_type || 'basic';
        
        // ✅ 从 priceConfigService 读取充值次数配置
        const rechargeAmount = await priceConfigService.getRechargeAmount(packageType, connection);
        
        // 验证充值次数合理性
        if (rechargeAmount <= 0 || rechargeAmount > 1000) {
          throw new Error(`充值次数配置异常: ${rechargeAmount}`);
        }
        
        await balanceService.addBalance(order.user_id, rechargeAmount, 'payment', orderId, balanceService.BALANCE_TYPES.PAID);
        
        // 更新用户支付状态
        await userServiceV2.updatePaymentStatus(order.user_id, packageType, amount);
        
        console.log(`用户 ${order.user_id} 付费充值成功: ${packageType}`);
      }
      
      await connection.commit();
      
      res.json({ 
        success: true, message: '订单状态更新成功',
        data: { orderId, status, userPaymentStatus: status === 'paid' ? order.package_type : null }
      });
    } catch (dbError) {
      await connection.rollback();
      throw dbError;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('更新支付订单状态失败:', error);
    res.status(500).json({ error: '更新支付订单状态失败', message: error.message });
  }
});

// 重试支付订单
router.post('/order/:orderId/retry', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { openid } = req.body;
    
    const connection = await db.pool.getConnection();
    try {
      const [rows] = await connection.execute('SELECT * FROM payment_orders WHERE id = ?', [orderId]);
      
      if (rows.length === 0) {
        return res.status(404).json({ error: '订单不存在' });
      }
      
      const order = rows[0];
      
      if (order.status !== 'pending' && order.status !== 'failed') {
        return res.status(400).json({ error: '订单状态异常', message: `订单状态为 ${order.status}，无法重试` });
      }
      
      await connection.execute(
        'UPDATE payment_orders SET status = ?, updated_at = NOW() WHERE id = ?',
        ['pending', orderId]
      );
      
      if (!isWechatPaymentAvailable()) {
        return res.status(503).json({ error: '支付服务不可用' });
      }
      
      const params = {
        description: `AI全家福-${order.package_type === 'basic' ? '尝鲜包' : '尊享包'}`,
        out_trade_no: orderId,
        notify_url: `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/payment/callback`,
        amount: { total: Math.round(order.amount * 100), currency: 'CNY' },
        payer: { openid: openid || 'test_openid' }
      };
      
      const result = await executeWithRetry(
        () => createJsapiPayment(params),
        { maxRetries: 1, timeout: 30000, operationName: '重试微信支付' }
      );
      
      res.json({ success: true, message: '重试支付成功', data: result });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('重试支付失败:', error);
    res.status(500).json({ error: '重试支付失败', message: error.message });
  }
});

module.exports = router;
