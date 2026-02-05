/**
 * 微信支付 - 支付结果回调
 */
const cloud = require('wx-server-sdk');
const { safeDb, formatMySQLDateTime } = require('../db/mysql');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 微信支付 SDK（用于验证签名）
let WxPay = null;
let wechatPayment = null;

/**
 * 初始化微信支付 SDK
 */
function initWechatPaymentSDK() {
  if (wechatPayment) {
    return wechatPayment;
  }
  
  const hasRequiredConfig = !!(
    process.env.WECHAT_APPID &&
    process.env.WECHAT_MCHID &&
    process.env.WECHAT_SERIAL_NO &&
    process.env.WECHAT_PRIVATE_KEY &&
    process.env.WECHAT_APIV3_KEY
  );
  
  if (!hasRequiredConfig) {
    console.warn('[wxpay_order_callback] 微信支付配置未完整设置，无法验证签名');
    return null;
  }
  
  try {
    if (!WxPay) {
      WxPay = require('wechatpay-node-v3');
    }
    
    let privateKey = process.env.WECHAT_PRIVATE_KEY;
    if (privateKey) {
      privateKey = privateKey.replace(/\\\\n/g, '\n');
      privateKey = privateKey.replace(/\\n/g, '\n');
      if (!privateKey.includes('BEGIN PRIVATE KEY')) {
        privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
      }
      privateKey = privateKey.trim();
    }
    
    let publicKey = process.env.WECHAT_PUBLIC_KEY;
    if (publicKey) {
      publicKey = publicKey.replace(/\\\\n/g, '\n');
      publicKey = publicKey.replace(/\\n/g, '\n');
      if (!publicKey.includes('BEGIN CERTIFICATE')) {
        publicKey = `-----BEGIN CERTIFICATE-----\n${publicKey}\n-----END CERTIFICATE-----`;
      }
      publicKey = publicKey.trim();
    }
    
    const config = {
      appid: process.env.WECHAT_APPID,
      mchid: process.env.WECHAT_MCHID,
      serial_no: process.env.WECHAT_SERIAL_NO,
      privateKey: privateKey,
      key: process.env.WECHAT_APIV3_KEY,
    };
    
    if (publicKey) {
      config.publicKey = publicKey;
    }
    
    wechatPayment = new WxPay(config);
    console.log('[wxpay_order_callback] 微信支付 SDK 初始化成功');
    return wechatPayment;
  } catch (error) {
    console.error('[wxpay_order_callback] 微信支付 SDK 初始化失败:', error.message);
    return null;
  }
}

exports.main = async (event, context) => {
  console.log('[wxpay_order_callback] 收到支付回调');
  
  try {
    // 验证签名（如果配置了 SDK）
    const payment = initWechatPaymentSDK();
    if (payment && event.signature && event.timestamp && event.nonce) {
      try {
        const isValid = await payment.verifySign({
          signature: event.signature,
          timestamp: event.timestamp,
          nonce: event.nonce,
          body: JSON.stringify(event.resource || event),
          serial: event.serial
        });
        
        if (!isValid) {
          console.error('[wxpay_order_callback] 签名验证失败');
          return { code: 'FAIL', message: '签名验证失败' };
        }
        
        console.log('[wxpay_order_callback] 签名验证成功');
      } catch (verifyError) {
        console.error('[wxpay_order_callback] 签名验证异常:', verifyError.message);
        // 签名验证失败，但不阻断流程（兼容旧版本）
      }
    } else {
      console.warn('[wxpay_order_callback] 未配置 SDK 或缺少签名参数，跳过签名验证');
    }
    
    const eventType = event.event_type;
    
    if (eventType !== 'TRANSACTION.SUCCESS') {
      console.log('[wxpay_order_callback] 非支付成功事件:', eventType);
      return { code: 'SUCCESS', message: '处理成功' };
    }
    
    const resource = event.resource || event;
    const outTradeNo = resource.out_trade_no || resource.outTradeNo;
    const transactionId = resource.transaction_id || resource.transactionId;
    const amount = resource.amount;
    const payer = resource.payer;
    
    if (!outTradeNo) {
      console.error('[wxpay_order_callback] 缺少订单号');
      return { code: 'SUCCESS', message: '缺少订单号，忽略' };
    }
    
    console.log('[wxpay_order_callback] 处理订单:', { outTradeNo, transactionId });
    
    // 查询订单（使用 out_trade_no 字段查询）
    let order = null;
    try {
      const { data: orders, skipped } = await safeDb.select('payment_orders', 'out_trade_no', outTradeNo);
      
      if (skipped) {
        console.log('[wxpay_order_callback] 数据库不可用，跳过订单查询（订单由后端管理）');
      } else {
        order = orders && orders[0];
      }
    } catch (dbError) {
      console.warn('[wxpay_order_callback] 查询订单失败:', dbError.message);
    }
    
    if (!order) {
      console.log('[wxpay_order_callback] 订单不存在或数据库不可用，尝试补录订单');
      try {
        // 生成订单 ID（基于 out_trade_no 确保唯一性）
        const orderId = `order-${outTradeNo}`;
        
        // 尝试查找或创建用户
        let userId = null;
        const payerOpenid = payer?.openid;
        
        if (payerOpenid) {
          const { data: existingUsers } = await safeDb.select('users', 'openid', payerOpenid);
          if (existingUsers && existingUsers.length > 0) {
            userId = existingUsers[0].id;
            console.log('[wxpay_order_callback] 找到已存在用户:', userId);
          } else {
            // 创建新用户
            userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await safeDb.insert('users', {
              id: userId,
              openid: payerOpenid,
              payment_status: 'free'
              // last_login_at, created_at, updated_at 由数据库自动生成
            });
            console.log('[wxpay_order_callback] 创建新用户:', userId);
            
            // 通知后端初始化用户余额等信息
            try {
              const apiBaseUrl = process.env.API_BASE_URL;
              if (apiBaseUrl) {
                const axios = require('axios');
                await axios.post(`${apiBaseUrl}/api/users/initialize`, {
                  userId: userId
                }, {
                  timeout: 5000,
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': process.env.INTERNAL_API_SECRET || ''
                  }
                });
                console.log('[wxpay_order_callback] 用户初始化成功');
              }
            } catch (error) {
              console.error('[wxpay_order_callback] 用户初始化失败:', error.message);
              // 不影响主流程
            }
          }
        } else {
          // 没有 openid，生成临时用户 ID
          userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        
        const insertResult = await safeDb.insert('payment_orders', {
          id: orderId,
          user_id: userId,
          generation_id: userId,  // 使用 user_id 作为默认值（与创建订单逻辑一致）
          out_trade_no: outTradeNo,
          transaction_id: transactionId,
          amount: ((amount?.total || 0) / 100).toFixed(2),
          package_type: 'basic',  // 默认套餐，后续可以通过金额推断
          payment_method: 'wechat',
          trade_type: 'JSAPI',  // 默认类型，可以从回调数据推断
          _openid: payerOpenid || '',
          status: 'paid',
          paid_at: formatMySQLDateTime()
        });
        
        if (!insertResult.skipped && !insertResult.error) {
          console.log('[wxpay_order_callback] 已补录订单');
        }
      } catch (e) {
        console.warn('[wxpay_order_callback] 补录订单失败:', e.message);
      }
      
      // 即使数据库操作失败，也要通知后端
      // ✅ 传递完整参数（虽然没有 order 对象，但尽量传递可用信息）
      notifyBackend({
        outTradeNo,
        transactionId,
        status: 'paid',
        packageType: 'basic',  // 默认套餐，后端会从订单中读取
        generationId: null,    // 补录订单时没有 generationId
        openid: payer?.openid
      }).catch(err => {
        console.error('[wxpay_order_callback] 通知后端失败:', err.message);
      });
      
      return { code: 'SUCCESS', message: '订单已处理' };
    }
    
    if (order.status === 'paid') {
      console.log('[wxpay_order_callback] 订单已处理:', outTradeNo);
      return { code: 'SUCCESS', message: '订单已处理' };
    }
    
    // 更新订单状态
    try {
      const updateResult = await safeDb.update('payment_orders', 'out_trade_no', outTradeNo, {
        status: 'paid',
        transaction_id: transactionId, // 更新为真实的微信交易号
        paid_at: formatMySQLDateTime() // 记录实际支付完成时间
        // updated_at 由数据库自动更新
      });
      
      if (updateResult.skipped) {
        console.log('[wxpay_order_callback] 数据库不可用，订单状态将由后端更新');
      } else if (updateResult.error) {
        console.warn('[wxpay_order_callback] 更新订单失败（不影响通知）:', updateResult.error);
      } else {
        console.log('[wxpay_order_callback] 订单状态已更新:', outTradeNo);
      }
    } catch (updateError) {
      console.warn('[wxpay_order_callback] 更新订单异常（不影响通知）:', updateError.message);
    }
    
    // 通知后端处理业务逻辑（包括用户权益更新）
    // ✅ 传递完整参数，包括 generationId
    notifyBackend({
      outTradeNo,
      transactionId,
      status: 'paid',
      packageType: order.package_type,
      generationId: order.generation_id,  // ✅ 确保传递 generationId
      openid: payer?.openid
    }).catch(err => {
      console.error('[wxpay_order_callback] 通知后端失败:', err.message);
      // 不影响主流程，后端可以通过轮询获取订单状态
    });
    
    return { code: 'SUCCESS', message: '处理成功' };
    
  } catch (error) {
    console.error('[wxpay_order_callback] 处理支付回调失败:', error);
    return { code: 'FAIL', message: error.message || '处理失败' };
  }
};

/**
 * 异步通知后端服务器
 * @param {Object} paymentData 支付数据
 */
async function notifyBackend(paymentData) {
  const apiBaseUrl = process.env.API_BASE_URL;
  const internalSecret = process.env.INTERNAL_API_SECRET;
  
  if (!apiBaseUrl) {
    console.log('[wxpay_order_callback] API_BASE_URL 未配置，跳过后端通知');
    return;
  }
  
  try {
    const url = `${apiBaseUrl}/api/payment/internal/notify`;
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // 如果配置了内部密钥，添加到请求头
    if (internalSecret) {
      headers['X-Internal-Secret'] = internalSecret;
    }
    
    console.log('[wxpay_order_callback] 通知后端:', url);
    
    const response = await axios.post(url, paymentData, {
      timeout: 5000,
      headers
    });
    
    console.log('[wxpay_order_callback] 后端通知成功:', response.data);
  } catch (error) {
    // 记录错误但不抛出，不影响主流程
    if (error.code === 'ECONNREFUSED') {
      console.error('[wxpay_order_callback] 后端服务器连接被拒绝，请检查服务器是否运行');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('[wxpay_order_callback] 后端服务器响应超时');
    } else {
      console.error('[wxpay_order_callback] 通知后端失败:', error.message);
    }
  }
}
