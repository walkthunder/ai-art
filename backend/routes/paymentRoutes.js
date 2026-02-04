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
    
    if (!userId || !generationId || !packageType) {
      return res.status(400).json({ 
        error: '缺少必要参数', 
        message: '需要提供 userId, generationId 和 packageType 参数' 
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
    
    const connection = await db.pool.getConnection();
    try {
      await connection.execute(
        `INSERT INTO payment_orders 
        (id, user_id, generation_id, amount, package_type, payment_method, status, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [orderId, userId, generationId, amount, packageType, 'wechat', 'pending']
      );
      
      console.log(`创建支付订单成功: ${orderId}, 用户: ${userId}, 金额: ${amount}`);
      
      res.json({ 
        success: true, 
        data: { orderId, amount, packageType, status: 'pending' }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('创建支付订单失败:', error);
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
        
        await connection.execute(
          `INSERT INTO payment_orders 
          (id, user_id, generation_id, amount, package_type, payment_method, trade_type, status, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [finalOrderId, userId || null, generationId || null, orderAmount, packageType, 'wechat', 'NATIVE', 'pending']
        );
        
        order = {
          id: finalOrderId,
          amount: orderAmount,
          package_type: packageType
        };
        
        console.log(`创建 Native 支付订单: ${finalOrderId}`);
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
          packageType: order.package_type
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
      reason, dbError 
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
    
    console.log(`处理订单备份: ${outTradeNo}, 原因: ${reason}, 金额: ${amount}`);
    
    const connection = await db.pool.getConnection();
    try {
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
      }
      
      // 2. 备份订单（使用 INSERT IGNORE 避免重复）
      if (effectiveUserId) {
        await connection.execute(
          `INSERT IGNORE INTO payment_orders 
           (id, user_id, generation_id, out_trade_no, amount, package_type, 
            payment_method, trade_type, status, _openid, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, 'wechat', ?, ?, ?, NOW(), NOW())`,
          [
            orderId || `order-${outTradeNo}`,
            effectiveUserId,
            effectiveUserId,  // generation_id 使用 user_id 作为默认值
            outTradeNo,
            (amount / 100).toFixed(2),  // 转换为元
            packageType || 'basic',
            tradeType || 'JSAPI',
            status || 'pending',
            openid || ''
          ]
        );
        console.log(`订单已备份: ${outTradeNo}`);
      }
      
      // 3. 记录错误日志
      await errorLogService.logError('CLOUD_DB_UNAVAILABLE', `云函数数据库故障: ${reason}`, {
        orderId, outTradeNo, dbError, reason
      });
      
      res.json({ success: true, message: '订单已备份', userId: effectiveUserId });
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
    
    // ⚠️ 如果没有 transactionId，说明这是订单备份通知，不是支付成功通知
    if (!transactionId) {
      console.log('[PAYMENT_NOTIFY] 订单备份通知（无 transactionId），无需处理业务逻辑');
      return res.json({ success: true, message: '订单备份已接收' });
    }
    
    console.log(`处理支付成功通知: 订单 ${outTradeNo}, 微信订单号 ${transactionId}, 状态 ${status}`);
    
    const connection = await db.pool.getConnection();
    try {
      // 1. 更新订单状态（幂等性处理）
      const [orderRows] = await connection.execute(
        'SELECT * FROM payment_orders WHERE out_trade_no = ?',
        [outTradeNo]
      );
      
      if (orderRows.length > 0) {
        const order = orderRows[0];
        
        // 只有订单状态为 pending 时才更新
        if (order.status === 'pending' && status === 'paid') {
          await connection.execute(
            `UPDATE payment_orders 
             SET status = ?, transaction_id = ?, paid_at = NOW(), updated_at = NOW() 
             WHERE out_trade_no = ?`,
            [status, transactionId, outTradeNo]
          );
          
          // 更新用户权益
          if (order.user_id && packageType) {
            await connection.execute(
              'UPDATE users SET payment_status = ?, updated_at = NOW() WHERE id = ?',
              [packageType, order.user_id]
            );
          }
          
          console.log(`订单 ${outTradeNo} 状态已更新为 ${status}`);
          
          // 2. 触发业务逻辑（可选）
          // await triggerBusinessLogic({ orderId: order.id, userId: order.user_id, packageType });
          
          // 3. 实时推送给前端（可选）
          // io.to(`order:${outTradeNo}`).emit('payment:status', { outTradeNo, status });
        } else {
          console.log(`订单 ${outTradeNo} 已处理，当前状态: ${order.status}`);
        }
      } else {
        console.warn(`订单 ${outTradeNo} 不存在于后端数据库`);
      }
      
      res.json({ success: true, message: '处理成功' });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('处理内部通知失败:', error);
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
            try {
              // ✅ 从 priceConfigService 读取充值次数配置
              const rechargeAmount = await priceConfigService.getRechargeAmount(package_type, connection);
              
              await balanceService.addBalance(user_id, rechargeAmount, 'payment', orderId, balanceService.BALANCE_TYPES.PAID);
              
              // 更新用户支付状态
              await userServiceV2.updatePaymentStatus(user_id, package_type, amount);
              
              console.log(`用户 ${user_id} 付费充值成功: ${package_type}, 金额: ${amount}, 次数: ${rechargeAmount}`);
            } catch (upgradeError) {
              console.error(`用户 ${user_id} 付费充值失败:`, upgradeError);
              throw upgradeError;
            }
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
        
        try {
          // ✅ 从 priceConfigService 读取充值次数配置
          const rechargeAmount = await priceConfigService.getRechargeAmount(packageType, connection);
          
          await balanceService.addBalance(order.user_id, rechargeAmount, 'payment', orderId, balanceService.BALANCE_TYPES.PAID);
          
          // 更新用户支付状态
          await userServiceV2.updatePaymentStatus(order.user_id, packageType, amount);
          
          console.log(`用户 ${order.user_id} 付费充值成功: ${packageType}`);
        } catch (upgradeError) {
          console.error(`用户 ${order.user_id} 付费充值失败:`, upgradeError);
          throw upgradeError;
        }
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
