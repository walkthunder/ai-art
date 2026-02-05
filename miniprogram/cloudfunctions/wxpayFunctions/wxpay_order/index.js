/**
 * 微信支付 - 下单
 * 支持两种支付模式：
 * - JSAPI: 小程序支付（默认）
 * - NATIVE: PC 扫码支付
 */
const cloud = require('wx-server-sdk');
const { safeDb } = require('../db/mysql');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 微信支付 SDK（用于 Native 支付）
let WxPay = null;
let wechatPayment = null;

/**
 * 初始化微信支付 SDK（用于 Native 支付）
 */
function initWechatPaymentSDK() {
  if (wechatPayment) {
    return wechatPayment;
  }
  
  // 检查必要的配置
  const hasRequiredConfig = !!(
    process.env.WECHAT_APPID &&
    process.env.WECHAT_MCHID &&
    process.env.WECHAT_SERIAL_NO &&
    process.env.WECHAT_PRIVATE_KEY &&
    process.env.WECHAT_APIV3_KEY
  );
  
  if (!hasRequiredConfig) {
    console.warn('[wxpay_order] Native 支付配置未完整设置');
    return null;
  }
  
  try {
    if (!WxPay) {
      WxPay = require('wechatpay-node-v3');
    }
    
    // 处理私钥 - 处理换行符和格式
    let privateKey = process.env.WECHAT_PRIVATE_KEY;
    if (privateKey) {
      // 处理各种可能的换行符格式
      privateKey = privateKey.replace(/\\\\n/g, '\n');
      privateKey = privateKey.replace(/\\n/g, '\n');
      
      // 确保私钥格式正确（包含头尾标记）
      if (!privateKey.includes('BEGIN PRIVATE KEY')) {
        privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
      }
      
      privateKey = privateKey.trim();
    }
    
    // 处理平台公钥证书（可选，用于验证回调签名）
    let publicKey = process.env.WECHAT_PUBLIC_KEY;
    if (publicKey) {
      // 处理换行符
      publicKey = publicKey.replace(/\\\\n/g, '\n');
      publicKey = publicKey.replace(/\\n/g, '\n');
      
      // 确保公钥格式正确
      if (!publicKey.includes('BEGIN CERTIFICATE')) {
        publicKey = `-----BEGIN CERTIFICATE-----\n${publicKey}\n-----END CERTIFICATE-----`;
      }
      
      publicKey = publicKey.trim();
    }
    
    console.log('[wxpay_order] 初始化微信支付 SDK，配置信息:', {
      appid: process.env.WECHAT_APPID,
      mchid: process.env.WECHAT_MCHID,
      serial_no: process.env.WECHAT_SERIAL_NO,
      hasPrivateKey: !!privateKey,
      privateKeyLength: privateKey ? privateKey.length : 0,
      hasPublicKey: !!publicKey,
      publicKeyLength: publicKey ? publicKey.length : 0,
      hasApiv3Key: !!process.env.WECHAT_APIV3_KEY
    });
    
    // 初始化配置
    const config = {
      appid: process.env.WECHAT_APPID,
      mchid: process.env.WECHAT_MCHID,
      serial_no: process.env.WECHAT_SERIAL_NO,
      privateKey: privateKey,
      key: process.env.WECHAT_APIV3_KEY,
    };
    
    // 如果提供了平台公钥，添加到配置中
    if (publicKey) {
      config.publicKey = publicKey;
    }
    
    wechatPayment = new WxPay(config);
    
    console.log('[wxpay_order] 微信支付 SDK 初始化成功');
    return wechatPayment;
  } catch (error) {
    console.error('[wxpay_order] 微信支付 SDK 初始化失败:', error.message);
    console.error('[wxpay_order] 错误详情:', error);
    return null;
  }
}

// 降级方案 - 本地默认价格
const FALLBACK_PACKAGES = {
  basic: { name: '0.01元尝鲜包', amount: 1, description: 'AI全家福-尝鲜包' },
  premium: { name: '29.9元尊享包', amount: 2990, description: 'AI全家福-尊享包' }
};

// 价格缓存
let priceCache = null;
let priceCacheTime = 0;
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// API基础URL - 从环境变量获取
const API_BASE_URL = process.env.API_BASE_URL;

/**
 * 从API获取价格配置
 */
async function fetchPricesFromAPI() {
  // 如果未配置 API_BASE_URL，直接使用降级方案
  if (!API_BASE_URL) {
    console.warn('[wxpay_order] API_BASE_URL 未配置，使用降级价格方案');
    return FALLBACK_PACKAGES;
  }
  
  try {
    // 检查缓存
    const now = Date.now();
    if (priceCache && (now - priceCacheTime) < PRICE_CACHE_DURATION) {
      console.log('[wxpay_order] 使用缓存的价格配置');
      return priceCache;
    }

    console.log('[wxpay_order] 从API获取价格配置');
    
    const response = await axios.get(`${API_BASE_URL}/api/prices/current`, {
      timeout: 5000
    });

    if (response.data && response.data.success && response.data.data) {
      const apiPrices = response.data.data;
      
      // 转换API返回的价格格式
      // API 返回格式: { free: 0, basic: 9.9, premium: 29.9 }
      const packages = {
        basic: {
          name: '尝鲜包',
          amount: Math.round((apiPrices.basic !== undefined ? apiPrices.basic : 0.01) * 100),
          description: 'AI全家福-尝鲜包'
        },
        premium: {
          name: '尊享包',
          amount: Math.round((apiPrices.premium !== undefined ? apiPrices.premium : 29.9) * 100),
          description: 'AI全家福-尊享包'
        }
      };

      // 更新缓存
      priceCache = packages;
      priceCacheTime = now;
      
      console.log('[wxpay_order] 价格配置获取成功', packages);
      return packages;
    }

    throw new Error('API返回数据格式错误');
  } catch (error) {
    console.warn('[wxpay_order] 从API获取价格失败，使用降级方案', error.message);
    return FALLBACK_PACKAGES;
  }
}

// 支付模式
const TRADE_TYPES = {
  JSAPI: 'JSAPI',   // 小程序支付
  NATIVE: 'NATIVE'  // PC 扫码支付
};

function generateOutTradeNo() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `${timestamp}${random}`;
}

/**
 * 小程序支付下单 (JSAPI)
 */
async function createJsapiOrder(params) {
  const { orderDescription, orderAmount, outTradeNo, openid } = params;
  
  console.log('[wxpay_order] 调用 cloudbase_module 下单 (JSAPI)...');
  const res = await cloud.callFunction({
    name: 'cloudbase_module',
    data: {
      name: 'wxpay_order',
      data: {
        description: orderDescription,
        amount: { total: orderAmount, currency: 'CNY' },
        out_trade_no: outTradeNo,
        payer: { openid }
      }
    }
  });
  
  console.log('[wxpay_order] cloudbase_module 返回:', JSON.stringify(res.result));
  
  if (!res.result) {
    return { code: -1, msg: '支付服务返回为空' };
  }
  
  // 检查各种可能的返回格式
  if (res.result.payment) {
    return {
      code: 0,
      data: {
        tradeType: TRADE_TYPES.JSAPI,
        timeStamp: res.result.payment.timeStamp,
        nonceStr: res.result.payment.nonceStr,
        packageVal: res.result.payment.package || res.result.payment.packageVal,
        paySign: res.result.payment.paySign,
        outTradeNo
      }
    };
  } else if (res.result.code === 0 && res.result.data) {
    const data = res.result.data;
    return {
      code: 0,
      data: {
        tradeType: TRADE_TYPES.JSAPI,
        timeStamp: data.timeStamp,
        nonceStr: data.nonceStr,
        packageVal: data.package || data.packageVal,
        paySign: data.paySign,
        outTradeNo
      }
    };
  } else if (res.result.timeStamp && res.result.paySign) {
    return {
      code: 0,
      data: {
        tradeType: TRADE_TYPES.JSAPI,
        timeStamp: res.result.timeStamp,
        nonceStr: res.result.nonceStr,
        packageVal: res.result.package || res.result.packageVal,
        paySign: res.result.paySign,
        outTradeNo
      }
    };
  } else if (res.result.errcode && res.result.errmsg) {
    return { 
      code: -1, 
      msg: res.result.errmsg || '支付下单失败',
      errcode: res.result.errcode,
      data: res.result
    };
  }
  
  return { 
    code: -1, 
    msg: '支付服务返回格式异常',
    data: res.result
  };
}

/**
 * PC 扫码支付下单 (NATIVE)
 * 尝试通过 cloudbase_module 调用，如果不支持则使用直接调用方式
 * 
 * @param {Object} params - 支付参数
 * @param {string} params.orderDescription - 订单描述
 * @param {number} params.orderAmount - 订单金额（分）
 * @param {string} params.outTradeNo - 商户订单号
 * @param {string} params.packageType - 套餐类型（用于日志）
 * @param {string} params.userId - 用户ID（用于日志）
 * @param {string} params.generationId - 生成任务ID（用于日志）
 */
async function createNativeOrder(params) {
  const { orderDescription, orderAmount, outTradeNo } = params;
  
  console.log('[wxpay_order] 创建 Native 支付订单...');
  
  // 方案 1: 尝试通过 cloudbase_module 调用（优先，复用已有配置）
  try {
    console.log('[wxpay_order] 尝试通过 cloudbase_module 调用 Native 支付...');
    
    const res = await cloud.callFunction({
      name: 'cloudbase_module',
      data: {
        name: 'wxpay_native_order',
        data: {
          description: orderDescription,
          amount: { total: orderAmount, currency: 'CNY' },
          out_trade_no: outTradeNo
        }
      }
    });
    
    console.log('[wxpay_order] cloudbase_module Native 返回:', JSON.stringify(res.result));
    
    // 检查返回结果
    if (res.result && res.result.code_url) {
      return {
        code: 0,
        data: {
          tradeType: TRADE_TYPES.NATIVE,
          codeUrl: res.result.code_url,
          outTradeNo
        }
      };
    } else if (res.result && res.result.code === 0 && res.result.data && res.result.data.code_url) {
      return {
        code: 0,
        data: {
          tradeType: TRADE_TYPES.NATIVE,
          codeUrl: res.result.data.code_url,
          outTradeNo
        }
      };
    }
    
    // cloudbase_module 不支持或返回错误
    console.warn('[wxpay_order] cloudbase_module 不支持 Native 支付或返回错误:', res.result);
  } catch (cloudbaseError) {
    console.warn('[wxpay_order] cloudbase_module 调用失败:', cloudbaseError.message);
  }
  
  // 方案 2: 使用直接调用方式（需要配置环境变量）
  try {
    console.log('[wxpay_order] 尝试直接调用微信支付 API...');
    
    const payment = initWechatPaymentSDK();
    
    if (!payment) {
      return { 
        code: -1, 
        msg: 'Native 支付不可用。cloudbase_module 不支持，且未配置直接调用所需的环境变量。\n' +
             '请在云函数环境变量中配置: WECHAT_APPID, WECHAT_MCHID, WECHAT_SERIAL_NO, WECHAT_PRIVATE_KEY, WECHAT_APIV3_KEY\n' +
             '（可复用扩展能力中已配置的相同值）'
      };
    }
    
    const paymentParams = {
      description: orderDescription,
      out_trade_no: outTradeNo,
      notify_url: process.env.WECHAT_NOTIFY_URL || (API_BASE_URL ? `${API_BASE_URL}/api/payment/callback` : `https://placeholder.com/callback`),
      amount: { 
        total: orderAmount, 
        currency: 'CNY' 
      }
    };
    
    // 检查回调地址
    if (!process.env.WECHAT_NOTIFY_URL && !API_BASE_URL) {
      console.warn('[wxpay_order] 未配置回调地址，使用占位符地址。支付成功后需要手动查询订单状态');
    } else if (!process.env.WECHAT_NOTIFY_URL) {
      console.log('[wxpay_order] 使用 API_BASE_URL 生成回调地址:', paymentParams.notify_url);
    } else {
      console.log('[wxpay_order] 使用配置的回调地址:', paymentParams.notify_url);
    }
    
    console.log('[wxpay_order] 调用微信支付 Native API');
    
    const result = await payment.transactions_native(paymentParams);
    
    console.log('[wxpay_order] 微信支付 Native 返回成功');
    
    // 处理不同的返回格式
    let codeUrl = null;
    
    // 格式1: { code_url: "..." }
    if (result && result.code_url) {
      codeUrl = result.code_url;
    }
    // 格式2: { status: 200, data: { code_url: "..." } }
    else if (result && result.data && result.data.code_url) {
      codeUrl = result.data.code_url;
    }
    // 格式3: { status: 200, data: "weixin://..." }
    else if (result && result.data && typeof result.data === 'string' && result.data.startsWith('weixin://')) {
      codeUrl = result.data;
    }
    
    if (codeUrl) {
      return {
        code: 0,
        data: {
          tradeType: TRADE_TYPES.NATIVE,
          codeUrl: codeUrl,
          outTradeNo: outTradeNo
        }
      };
    } else {
      return { 
        code: -1, 
        msg: '微信支付返回格式异常',
        data: result
      };
    }
  } catch (error) {
    console.error('[wxpay_order] Native 支付调用失败:', error);
    return { 
      code: -1, 
      msg: error.message || 'Native 支付调用失败',
      error: error.message
    };
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { 
    packageType, 
    generationId, 
    userId, 
    description, 
    amount,
    tradeType = TRADE_TYPES.JSAPI,  // 默认小程序支付
    openid: customOpenid  // 允许外部传入 openid（用于 Web 端）
  } = event;
  
  // 打印环境信息用于调试
  console.log('[wxpay_order] 环境信息:', {
    ENV: wxContext.ENV,
    APPID: wxContext.APPID,
    OPENID: wxContext.OPENID,
    SOURCE: wxContext.SOURCE
  });
  
  console.log('[wxpay_order] 收到请求:', { 
    packageType, generationId, userId, tradeType,
    openid: wxContext.OPENID || customOpenid
  });
  
  // 从API获取价格配置（带降级方案）
  const PACKAGES = await fetchPricesFromAPI();
  
  const packageConfig = PACKAGES[packageType];
  if (!packageConfig && !amount) {
    return { code: -1, msg: '无效的套餐类型或未指定金额' };
  }
  
  const orderAmount = amount || packageConfig.amount;
  const orderDescription = description || packageConfig.description;
  const outTradeNo = generateOutTradeNo();
  const effectiveOpenid = wxContext.OPENID || customOpenid;
  
  console.log('[wxpay_order] 订单信息:', { outTradeNo, orderAmount, orderDescription, tradeType });
  
  // 根据支付类型调用不同的下单方法
  let paymentResult;
  try {
    if (tradeType === TRADE_TYPES.NATIVE) {
      // PC 扫码支付
      paymentResult = await createNativeOrder({
        orderDescription,
        orderAmount,
        outTradeNo,
        packageType,
        userId,
        generationId
      });
    } else {
      // 小程序支付（默认）
      if (!effectiveOpenid) {
        return { code: -1, msg: 'JSAPI支付需要用户openid' };
      }
      paymentResult = await createJsapiOrder({
        orderDescription,
        orderAmount,
        outTradeNo,
        openid: effectiveOpenid
      });
    }
    
    if (paymentResult.code !== 0) {
      return paymentResult;
    }
  } catch (error) {
    console.error('[wxpay_order] 调用支付服务失败:', error);
    return { code: -1, msg: error.message || '调用支付服务失败' };
  }
  
  // 存储订单到数据库（关键流程，必须成功或有明确的失败处理）
  let dbInsertSuccess = false;
  try {
    // 生成 UUID 作为订单 ID
    const orderId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 确保 user_id 存在（如果没有，先创建用户记录）
    let effectiveUserId = userId;
    
    // 如果提供了 userId，先验证用户是否存在
    if (effectiveUserId) {
      try {
        const { data: existingUsers, skipped } = await safeDb.select('users', 'id', effectiveUserId);
        if (!skipped && (!existingUsers || existingUsers.length === 0)) {
          // 用户不存在，尝试创建
          console.log('[wxpay_order] 用户不存在，尝试创建:', effectiveUserId);
          const wxContext = cloud.getWXContext();
          const userInsertResult = await safeDb.insert('users', {
            id: effectiveUserId,
            openid: effectiveOpenid || null,
            unionid: wxContext.UNIONID || null,
            payment_status: 'free'
            // last_login_at 和 created_at, updated_at 由数据库自动生成
          });
          
          if (userInsertResult.error && !userInsertResult.skipped) {
            console.error('[wxpay_order] ❌ 创建用户失败:', userInsertResult.error);
            throw new Error(`用户创建失败: ${userInsertResult.error}`);
          }
          
          // 通知后端初始化用户余额等信息
          if (!userInsertResult.error && !userInsertResult.skipped) {
            try {
              const apiBaseUrl = process.env.API_BASE_URL;
              if (apiBaseUrl) {
                const axios = require('axios');
                await axios.post(`${apiBaseUrl}/api/users/initialize`, {
                  userId: effectiveUserId
                }, {
                  timeout: 5000,
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': process.env.INTERNAL_API_SECRET || ''
                  }
                });
                console.log('[wxpay_order] 用户初始化成功');
              }
            } catch (error) {
              console.error('[wxpay_order] 用户初始化失败:', error.message);
              // 不影响主流程
            }
          }
        }
      } catch (userError) {
        console.error('[wxpay_order] ❌ 用户验证/创建失败:', userError.message);
        throw userError;
      }
    } else if (effectiveOpenid) {
      // 没有 userId，通过 openid 查找或创建用户
      try {
        const { data: existingUsers } = await safeDb.select('users', 'openid', effectiveOpenid);
        if (existingUsers && existingUsers.length > 0) {
          effectiveUserId = existingUsers[0].id;
          console.log('[wxpay_order] 找到已存在用户:', effectiveUserId);
        } else {
          // 创建新用户
          effectiveUserId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const wxContext = cloud.getWXContext();
          const userInsertResult = await safeDb.insert('users', {
            id: effectiveUserId,
            openid: effectiveOpenid,
            unionid: wxContext.UNIONID || null,
            payment_status: 'free'
            // last_login_at, created_at, updated_at 由数据库自动生成
          });
          
          if (!userInsertResult.error && !userInsertResult.skipped) {
            console.log('[wxpay_order] ✅ 创建新用户成功:', effectiveUserId);
            
            // 通知后端初始化用户余额等信息
            try {
              const apiBaseUrl = process.env.API_BASE_URL;
              if (apiBaseUrl) {
                const axios = require('axios');
                await axios.post(`${apiBaseUrl}/api/users/initialize`, {
                  userId: effectiveUserId
                }, {
                  timeout: 5000,
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': process.env.INTERNAL_API_SECRET || ''
                  }
                });
                console.log('[wxpay_order] ✅ 用户初始化成功');
              }
            } catch (error) {
              console.error('[wxpay_order] ⚠️ 用户初始化失败:', error.message);
              // 不影响主流程
            }
          } else {
            console.error('[wxpay_order] ❌ 创建用户失败:', userInsertResult.error);
            throw new Error(`用户创建失败: ${userInsertResult.error || '数据库不可用'}`);
          }
        }
      } catch (userError) {
        console.error('[wxpay_order] ❌ 用户查询/创建失败:', userError.message);
        throw userError;
      }
    }
    
    if (!effectiveUserId) {
      throw new Error('无法确定有效的 user_id');
    }
    
    // 插入订单记录
    const dbResult = await safeDb.insert('payment_orders', {
      id: orderId,
      user_id: effectiveUserId,
      generation_id: generationId || effectiveUserId, // generation_id 是 NOT NULL，使用 user_id 作为默认值
      amount: (orderAmount / 100).toFixed(2), // 转换为元（DECIMAL 类型）
      package_type: packageType || 'basic',
      payment_method: 'wechat',
      trade_type: tradeType || 'JSAPI',
      out_trade_no: outTradeNo, // 商户订单号（用于查询）
      transaction_id: null, // 支付成功后由回调更新为微信交易号
      _openid: effectiveOpenid || '',
      status: 'pending'
      // created_at 和 updated_at 由数据库自动生成
    });
    
    if (dbResult.skipped) {
      console.error('[wxpay_order] ⚠️ 数据库不可用！订单信息:', {
        orderId, outTradeNo, amount: orderAmount, packageType, userId: effectiveUserId, tradeType
      });
      // 数据库不可用，立即通知后端备份
      await notifyBackendOrderCreated({
        orderId, outTradeNo, userId: effectiveUserId, 
        openid: effectiveOpenid,
        amount: orderAmount, packageType, tradeType, status: 'pending',
        reason: 'db_unavailable'
      });
    } else if (dbResult.error) {
      console.error('[wxpay_order] ❌ 数据库存储失败！错误:', dbResult.error);
      console.error('[wxpay_order] 订单信息:', {
        orderId, outTradeNo, amount: orderAmount, packageType, userId: effectiveUserId, tradeType
      });
      // 数据库写入失败，立即通知后端
      await notifyBackendOrderCreated({
        orderId, outTradeNo, userId: effectiveUserId,
        openid: effectiveOpenid,
        amount: orderAmount, packageType, tradeType, status: 'pending', 
        dbError: dbResult.error,
        reason: 'db_insert_failed'
      });
    } else {
      console.log('[wxpay_order] ✅ 订单已成功存储到数据库, ID:', orderId);
      dbInsertSuccess = true;
    }
  } catch (dbError) {
    console.error('[wxpay_order] ❌ 数据库操作异常！', dbError.message);
    console.error('[wxpay_order] 订单信息:', {
      outTradeNo, amount: orderAmount, packageType, openid: effectiveOpenid, tradeType
    });
    // 异常情况，立即通知后端备份
    await notifyBackendOrderCreated({
      outTradeNo, userId, 
      openid: effectiveOpenid,
      amount: orderAmount, 
      packageType, tradeType, status: 'pending', 
      dbError: dbError.message,
      reason: 'db_exception'
    });
  }
  
  // 如果数据库写入失败，在返回结果中添加警告
  const result = { code: 0, msg: 'success', data: paymentResult.data };
  if (!dbInsertSuccess) {
    result.warning = 'order_not_saved_to_db';
    result.warningMsg = '订单已创建但未保存到数据库，已通知后端备份';
    console.warn('[wxpay_order] ⚠️ 订单未保存到数据库，但支付流程正常');
    
    // 通知后端记录监控指标
    try {
      await notifyBackendMonitor('orderCreateFailed');
    } catch (e) {
      // 忽略监控通知失败
    }
  } else {
    // 通知后端记录成功指标
    try {
      await notifyBackendMonitor('orderCreated');
    } catch (e) {
      // 忽略监控通知失败
    }
  }
  
  return result;
};

/**
 * 通知后端订单创建（用于数据库失败时的备份）
 */
async function notifyBackendOrderCreated(orderData) {
  const apiBaseUrl = process.env.API_BASE_URL;
  if (!apiBaseUrl) {
    console.error('[wxpay_order] ❌ API_BASE_URL 未配置，无法通知后端！订单可能丢失！');
    console.error('[wxpay_order] 订单数据:', orderData);
    return;
  }
  
  try {
    const axios = require('axios');
    const response = await axios.post(
      `${apiBaseUrl}/api/payment/internal/order-created`, 
      orderData, 
      {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': process.env.INTERNAL_API_SECRET || ''
        }
      }
    );
    console.log('[wxpay_order] ✅ 已通知后端订单创建:', response.data);
  } catch (error) {
    console.error('[wxpay_order] ❌ 通知后端失败！订单可能丢失！', error.message);
    console.error('[wxpay_order] 订单数据:', orderData);
  }
}

/**
 * 通知后端监控指标
 */
async function notifyBackendMonitor(event) {
  const apiBaseUrl = process.env.API_BASE_URL;
  if (!apiBaseUrl) {
    return;
  }
  
  try {
    const axios = require('axios');
    await axios.post(
      `${apiBaseUrl}/api/monitor/record`, 
      { event }, 
      {
        timeout: 2000,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': process.env.INTERNAL_API_SECRET || ''
        }
      }
    );
  } catch (error) {
    // 忽略监控通知失败
  }
}
