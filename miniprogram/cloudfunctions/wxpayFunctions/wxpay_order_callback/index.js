/**
 * 微信支付 - 支付结果回调
 */
const cloud = require('wx-server-sdk');
const { safeDb, formatMySQLDateTime } = require('../db/mysql');
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 解密微信支付回调数据
 * 算法：AEAD_AES_256_GCM
 * 参考：https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_2.shtml
 */
function decryptCallback(ciphertext, associatedData, nonce, key) {
  const isDebug = process.env.DEBUG_MODE === 'true';
  
  if (isDebug) {
    console.log('[wxpay_order_callback] 解密详细参数:', {
      ciphertext_first_20: ciphertext.substring(0, 20),
      ciphertext_last_20: ciphertext.substring(ciphertext.length - 20),
      nonce_hex: Buffer.from(nonce).toString('hex'),
      aad_hex: Buffer.from(associatedData).toString('hex')
    });
  }
  
  // Base64 解码密文
  const buffer = Buffer.from(ciphertext, 'base64');
  
  // 分离数据和认证标签（最后16字节）
  const authTag = buffer.slice(buffer.length - 16);
  const data = buffer.slice(0, buffer.length - 16);
  
  // 创建解密器
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associatedData));
  
  // 解密
  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final()
  ]);
  
  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * 记录回调日志到数据库
 */
async function logCallback(status, data) {
  try {
    const logId = uuidv4();
    const logData = {
      id: logId,
      out_trade_no: data.outTradeNo || null,
      transaction_id: data.transactionId || null,
      event_type: data.eventType || null,
      status: status,
      error_message: data.errorMessage || null,
      error_code: data.errorCode || null,
      request_data: data.requestData ? JSON.stringify(data.requestData) : null,
      response_data: data.responseData ? JSON.stringify(data.responseData) : null,
      retry_count: 0
    };
    
    await safeDb.insert('payment_callback_logs', logData);
    console.log('[wxpay_order_callback] 回调日志已记录:', logId);
  } catch (error) {
    console.error('[wxpay_order_callback] 记录回调日志失败:', error.message);
    // 不影响主流程
  }
}

exports.main = async (event, context) => {
  console.log('[wxpay_order_callback] 收到支付回调');
  
  try {
    let decryptedData = null;
    
    // 解密加密的回调数据
    if (event.resource && event.resource.ciphertext) {
      console.log('[wxpay_order_callback] 开始解密回调数据');
      
      const apiv3Key = process.env.WECHAT_APIV3_KEY;
      if (!apiv3Key) {
        console.error('[wxpay_order_callback] APIv3密钥未配置');
        
        // 记录失败日志
        await logCallback('decrypt_failed', {
          eventType: event.event_type,
          errorMessage: 'APIv3密钥未配置',
          errorCode: 'MISSING_API_KEY',
          requestData: { event_type: event.event_type }
        });
        
        return { code: 'FAIL', message: 'APIv3密钥未配置' };
      }
      
      try {
        decryptedData = decryptCallback(
          event.resource.ciphertext,
          event.resource.associated_data,
          event.resource.nonce,
          apiv3Key
        );
        console.log('[wxpay_order_callback] ✅ 解密成功');
      } catch (error) {
        console.error('[wxpay_order_callback] ❌ 解密失败:', error.message);
        
        // 记录解密失败日志
        await logCallback('decrypt_failed', {
          eventType: event.event_type,
          errorMessage: error.message,
          errorCode: 'DECRYPT_ERROR',
          requestData: {
            event_type: event.event_type,
            algorithm: event.resource?.algorithm,
            ciphertext_length: event.resource?.ciphertext?.length
          }
        });
        
        // 返回 SUCCESS 避免微信重复回调
        return { 
          code: 'SUCCESS', 
          message: '解密失败，已记录日志' 
        };
      }
    }
    
    // 获取订单数据
    const resource = decryptedData || event.resource || event;
    const eventType = event.event_type || resource.event_type;
    
    if (eventType !== 'TRANSACTION.SUCCESS') {
      console.log('[wxpay_order_callback] 非支付成功事件:', eventType);
      return { code: 'SUCCESS', message: '处理成功' };
    }
    
    const outTradeNo = resource.out_trade_no || resource.outTradeNo;
    const transactionId = resource.transaction_id || resource.transactionId;
    const amount = resource.amount;
    const payer = resource.payer;
    
    if (!outTradeNo) {
      console.error('[wxpay_order_callback] 缺少订单号');
      return { code: 'SUCCESS', message: '缺少订单号' };
    }
    
    console.log('[wxpay_order_callback] 处理订单:', { outTradeNo, transactionId });
    
    // 查询订单
    let order = null;
    try {
      const { data: orders, skipped } = await safeDb.select('payment_orders', 'out_trade_no', outTradeNo);
      
      if (skipped) {
        console.log('[wxpay_order_callback] 数据库不可用，跳过订单查询');
      } else {
        order = orders && orders[0];
      }
    } catch (dbError) {
      console.warn('[wxpay_order_callback] 查询订单失败:', dbError.message);
    }
    
    if (!order) {
      console.log('[wxpay_order_callback] 订单不存在，尝试补录');
      try {
        const orderId = `order-${outTradeNo}`;
        let userId = null;
        const payerOpenid = payer?.openid;
        
        if (payerOpenid) {
          const { data: existingUsers } = await safeDb.select('users', 'openid', payerOpenid);
          if (existingUsers && existingUsers.length > 0) {
            userId = existingUsers[0].id;
            console.log('[wxpay_order_callback] 找到用户:', userId);
          } else {
            userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await safeDb.insert('users', {
              id: userId,
              openid: payerOpenid,
              payment_status: 'free'
            });
            console.log('[wxpay_order_callback] 创建用户:', userId);
            
            // 通知后端初始化用户
            try {
              const apiBaseUrl = process.env.API_BASE_URL;
              if (apiBaseUrl) {
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
            }
          }
        } else {
          userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        
        await safeDb.insert('payment_orders', {
          id: orderId,
          user_id: userId,
          generation_id: userId,
          out_trade_no: outTradeNo,
          transaction_id: transactionId,
          amount: ((amount?.total || 0) / 100).toFixed(2),
          package_type: 'basic',
          payment_method: 'wechat',
          trade_type: 'JSAPI',
          _openid: payerOpenid || '',
          status: 'paid',
          paid_at: formatMySQLDateTime()
        });
        
        console.log('[wxpay_order_callback] 订单补录成功');
      } catch (e) {
        console.warn('[wxpay_order_callback] 订单补录失败:', e.message);
      }
      
      // 通知后端
      const notifyResult = await notifyBackend({
        outTradeNo,
        transactionId,
        status: 'paid',
        packageType: 'basic',
        generationId: null,
        openid: payer?.openid
      });
      
      // 记录成功日志（订单补录场景）
      await logCallback('success', {
        outTradeNo,
        transactionId,
        eventType,
        responseData: { code: 'SUCCESS', message: '订单已补录并处理', notifyResult }
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
        transaction_id: transactionId,
        paid_at: formatMySQLDateTime()
      });
      
      if (updateResult.skipped) {
        console.log('[wxpay_order_callback] 数据库不可用，订单状态将由后端更新');
      } else if (updateResult.error) {
        console.warn('[wxpay_order_callback] 更新订单失败:', updateResult.error);
      } else {
        console.log('[wxpay_order_callback] 订单状态已更新');
      }
    } catch (updateError) {
      console.warn('[wxpay_order_callback] 更新订单异常:', updateError.message);
    }
    
    // 通知后端处理充值
    const notifyResult = await notifyBackend({
      outTradeNo,
      transactionId,
      status: 'paid',
      packageType: order.package_type,
      generationId: order.generation_id,
      openid: payer?.openid
    });
    
    // 记录成功日志（包含后端通知结果）
    await logCallback('success', {
      outTradeNo,
      transactionId,
      eventType,
      responseData: { 
        code: 'SUCCESS', 
        message: '处理成功', 
        notifyResult,
        backendNotified: notifyResult.success 
      }
    });
    
    return { code: 'SUCCESS', message: '处理成功' };
    
  } catch (error) {
    console.error('[wxpay_order_callback] 处理失败:', error);
    
    // 记录处理失败日志
    await logCallback('process_failed', {
      errorMessage: error.message,
      errorCode: 'PROCESS_ERROR',
      requestData: { event_type: event.event_type }
    });
    
    return { code: 'FAIL', message: error.message || '处理失败' };
  }
};

/**
 * 通知后端服务器
 */
async function notifyBackend(paymentData) {
  const apiBaseUrl = process.env.API_BASE_URL;
  const internalSecret = process.env.INTERNAL_API_SECRET;
  
  if (!apiBaseUrl) {
    console.log('[wxpay_order_callback] API_BASE_URL 未配置，跳过后端通知');
    return { success: false, message: 'API_BASE_URL未配置' };
  }
  
  try {
    const url = `${apiBaseUrl}/api/payment/internal/notify`;
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (internalSecret) {
      headers['X-Internal-Secret'] = internalSecret;
    }
    
    console.log('[wxpay_order_callback] 通知后端:', url);
    
    const response = await axios.post(url, paymentData, {
      timeout: 5000,
      headers
    });
    
    console.log('[wxpay_order_callback] 后端通知成功:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('[wxpay_order_callback] 后端服务器连接被拒绝');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('[wxpay_order_callback] 后端服务器响应超时');
    } else {
      console.error('[wxpay_order_callback] 通知后端失败:', error.message);
    }
    return { success: false, message: error.message };
  }
}
