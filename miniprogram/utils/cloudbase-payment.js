/**
 * CloudBase 支付模块
 * 通过云函数实现微信支付功能
 * 
 * 支持功能：
 * - 创建支付订单 (wxpay_order)
 * - 查询订单状态 (wxpay_query_order_by_out_trade_no)
 * - 申请退款 (wxpay_refund)
 * - 查询退款状态 (wxpay_refund_query)
 */

// 云函数名称
const CLOUD_FUNCTION_NAME = 'wxpayFunctions';

// 套餐配置（降级方案 - 当API获取失败时使用）
const FALLBACK_PACKAGES = {
  free: {
    id: 'free',
    name: '免费版',
    price: 0,
    amount: 0,  // 分
    description: 'AI全家福-免费版',
    features: ['标清图片', '可直接保存', '基础功能']
  },
  basic: {
    id: 'basic',
    name: '尝鲜包',
    price: 0.01,
    amount: 1,  // 分
    description: 'AI全家福-尝鲜包',
    features: ['高清无水印', '3-5人合成', '热门模板']
  },
  premium: {
    id: 'premium',
    name: '尊享包',
    price: 29.9,
    amount: 2990,  // 分
    description: 'AI全家福-尊享包',
    features: ['4K原图', '微动态', '贺卡', '全模板', '优先队列'],
    recommended: true
  }
};

// 价格缓存
let priceCache = null;
let priceCacheTime = 0;
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 订单状态
const ORDER_STATUS = {
  PENDING: 'pending',     // 待支付
  PAID: 'paid',           // 已支付
  REFUNDED: 'refunded',   // 已退款
  FAILED: 'failed',       // 支付失败
  CANCELLED: 'cancelled'  // 已取消
};

/**
 * 日志输出
 * @param {string} message 日志消息
 * @param {any} data 附加数据
 */
const log = (message, data = null) => {
  const prefix = '[CloudBase Payment]';
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
};

/**
 * 从API获取最新价格配置
 * @returns {Promise<Object>} 价格配置
 */
const fetchPricesFromAPI = async () => {
  try {
    // 检查缓存
    const now = Date.now();
    if (priceCache && (now - priceCacheTime) < PRICE_CACHE_DURATION) {
      log('使用缓存的价格配置');
      return priceCache;
    }

    const apiBaseUrl = getApp().globalData.apiBaseUrl;
    log('从API获取价格配置', apiBaseUrl);
    
    let result;
    
    // 判断是否使用云托管
    if (apiBaseUrl === 'cloudbase') {
      // 使用 CloudBase SDK 调用云托管服务
      log('使用 CloudBase SDK 调用云托管服务');
      const cloudbaseRequest = require('./cloudbase-request');
      result = await cloudbaseRequest.get('/api/prices/current');
    } else {
      // 使用普通 HTTP 请求
      const apiUrl = `${apiBaseUrl}/api/prices/current`;
      log('使用 HTTP 请求', apiUrl);
      
      result = await new Promise((resolve, reject) => {
        wx.request({
          url: apiUrl,
          method: 'GET',
          timeout: 5000,
          success: (res) => resolve(res),
          fail: (err) => reject(err)
        });
      });
    }

    log('API 响应:', result);

    // CloudBase SDK 返回格式和 wx.request 不同
    // CloudBase SDK 直接返回 {success: true, data: {...}}
    // wx.request 返回 {statusCode: 200, data: {success: true, data: {...}}}
    let responseData, statusCode;
    
    if (apiBaseUrl === 'cloudbase') {
      // CloudBase SDK 返回格式
      responseData = result;
      statusCode = result.success ? 200 : 500;
    } else {
      // wx.request 返回格式
      responseData = result.data;
      statusCode = result.statusCode;
    }

    if (statusCode === 200 && responseData && responseData.success) {
      const apiPrices = responseData.data;
      
      // 转换API返回的价格格式为本地格式
      // API 返回格式: { free: 0, basic: 9.9, premium: 29.9 }
      const packages = {
        free: {
          ...FALLBACK_PACKAGES.free,
          price: apiPrices.free !== undefined ? apiPrices.free : 0,
          amount: (apiPrices.free !== undefined ? apiPrices.free : 0) * 100
        },
        basic: {
          ...FALLBACK_PACKAGES.basic,
          price: apiPrices.basic !== undefined ? apiPrices.basic : 0.01,
          amount: Math.round((apiPrices.basic !== undefined ? apiPrices.basic : 0.01) * 100)
        },
        premium: {
          ...FALLBACK_PACKAGES.premium,
          price: apiPrices.premium !== undefined ? apiPrices.premium : 29.9,
          amount: Math.round((apiPrices.premium !== undefined ? apiPrices.premium : 29.9) * 100)
        }
      };

      // 更新缓存
      priceCache = packages;
      priceCacheTime = now;
      
      log('价格配置获取成功', packages);
      return packages;
    }

    throw new Error('API返回数据格式错误');
  } catch (error) {
    log('从API获取价格失败，使用降级方案', error);
    return FALLBACK_PACKAGES;
  }
};

/**
 * 获取套餐配置（优先从API获取，失败时使用降级方案）
 * @param {string} packageType 套餐类型
 * @returns {Promise<Object|null>} 套餐配置
 */
const getPackageConfig = async (packageType) => {
  const packages = await fetchPricesFromAPI();
  return packages[packageType] || null;
};

/**
 * 获取所有套餐配置（优先从API获取，失败时使用降级方案）
 * @returns {Promise<Object>} 所有套餐配置
 */
const getAllPackages = async () => {
  const packages = await fetchPricesFromAPI();
  return { ...packages };
};

/**
 * 调用支付云函数
 * @param {string} type 云函数类型
 * @param {Object} data 请求数据
 * @returns {Promise<Object>} 云函数返回结果
 */
const callPaymentFunction = async (type, data = {}) => {
  try {
    log(`调用云函数: ${type}`, data);
    
    const result = await wx.cloud.callFunction({
      name: CLOUD_FUNCTION_NAME,
      data: {
        type,
        ...data
      }
    });
    
    log(`云函数返回: ${type}`, result);
    
    // 检查云函数是否返回了结果
    if (!result.result) {
      throw new Error('云函数返回结果为空');
    }
    
    // 检查是否有错误信息
    if (result.result.code === -1 || result.result.error) {
      const errorMsg = result.result.msg || result.result.error || '云函数执行失败';
      // 如果有详细数据，附加到错误信息
      if (result.result.data) {
        console.log('[CloudBase Payment] 错误详情:', result.result.data);
      }
      throw new Error(errorMsg);
    }
    
    // 成功返回
    if (result.result.code === 0) {
      return result.result;
    }
    
    // 其他情况，返回原始结果
    return result.result;
  } catch (error) {
    log(`云函数调用失败: ${type}`, error);
    throw error;
  }
};

/**
 * 创建支付订单
 * @param {Object} params 订单参数
 * @param {string} params.packageType 套餐类型 ('basic' | 'premium')
 * @param {string} params.generationId 关联的生成任务ID
 * @param {string} params.userId 用户ID
 * @returns {Promise<Object>} 支付凭证
 */
const createOrder = async (params) => {
  const { packageType, generationId, userId } = params;
  
  // 获取套餐配置（从API或降级方案）
  const packageConfig = await getPackageConfig(packageType);
  if (!packageConfig) {
    throw new Error(`无效的套餐类型: ${packageType}`);
  }
  
  // 免费版不需要支付
  if (packageType === 'free') {
    return {
      success: true,
      data: {
        packageType: 'free',
        amount: 0,
        status: ORDER_STATUS.PAID
      }
    };
  }
  
  log('创建支付订单', { packageType, generationId, userId, price: packageConfig.price });
  
  try {
    const result = await callPaymentFunction('wxpay_order', {
      packageType,
      generationId,
      userId,
      description: packageConfig.description,
      amount: packageConfig.amount
    });
    
    if (result && result.data) {
      return {
        success: true,
        data: {
          timeStamp: result.data.timeStamp,
          nonceStr: result.data.nonceStr,
          packageVal: result.data.packageVal,
          paySign: result.data.paySign,
          outTradeNo: result.data.outTradeNo,
          packageType,
          amount: packageConfig.amount
        }
      };
    }
    
    throw new Error('创建订单失败：返回数据异常');
  } catch (error) {
    log('创建订单失败', error);
    throw error;
  }
};

/**
 * 发起微信支付
 * @param {Object} paymentData 支付凭证
 * @returns {Promise<Object>} 支付结果
 */
const requestPayment = (paymentData) => {
  return new Promise((resolve, reject) => {
    log('发起微信支付', paymentData);
    
    wx.requestPayment({
      timeStamp: paymentData.timeStamp,
      nonceStr: paymentData.nonceStr,
      package: paymentData.packageVal,
      signType: 'RSA',  // 固定使用 RSA 签名
      paySign: paymentData.paySign,
      success: (res) => {
        log('支付成功', res);
        resolve({
          success: true,
          data: res
        });
      },
      fail: (err) => {
        log('支付失败', err);
        
        // 用户取消支付
        if (err.errMsg && err.errMsg.includes('cancel')) {
          reject({
            code: 'PAY_CANCELLED',
            message: '支付已取消',
            cancelled: true
          });
          return;
        }
        
        reject({
          code: 'PAY_FAILED',
          message: err.errMsg || '支付失败',
          error: err
        });
      }
    });
  });
};

/**
 * 查询订单状态
 * @param {string} outTradeNo 商户订单号
 * @returns {Promise<Object>} 订单状态
 */
const queryOrder = async (outTradeNo) => {
  log('查询订单状态', { outTradeNo });
  
  try {
    const result = await callPaymentFunction('wxpay_query_order_by_out_trade_no', {
      out_trade_no: outTradeNo
    });
    
    if (result && result.data) {
      const tradeState = result.data.trade_state || result.data.tradeState;
      
      return {
        success: true,
        data: {
          outTradeNo: result.data.out_trade_no || result.data.outTradeNo,
          transactionId: result.data.transaction_id || result.data.transactionId,
          tradeState,
          tradeStateDesc: result.data.trade_state_desc || result.data.tradeStateDesc,
          amount: result.data.amount,
          isPaid: tradeState === 'SUCCESS'
        }
      };
    }
    
    return {
      success: false,
      message: '查询订单失败'
    };
  } catch (error) {
    log('查询订单失败', error);
    throw error;
  }
};

/**
 * 通过微信交易号查询订单
 * @param {string} transactionId 微信交易号
 * @returns {Promise<Object>} 订单状态
 */
const queryOrderByTransactionId = async (transactionId) => {
  log('通过交易号查询订单', { transactionId });
  
  try {
    const result = await callPaymentFunction('wxpay_query_order_by_transaction_id', {
      transaction_id: transactionId
    });
    
    if (result && result.data) {
      const tradeState = result.data.trade_state || result.data.tradeState;
      
      return {
        success: true,
        data: {
          outTradeNo: result.data.out_trade_no || result.data.outTradeNo,
          transactionId: result.data.transaction_id || result.data.transactionId,
          tradeState,
          tradeStateDesc: result.data.trade_state_desc || result.data.tradeStateDesc,
          amount: result.data.amount,
          isPaid: tradeState === 'SUCCESS'
        }
      };
    }
    
    return {
      success: false,
      message: '查询订单失败'
    };
  } catch (error) {
    log('查询订单失败', error);
    throw error;
  }
};

/**
 * 申请退款
 * @param {Object} params 退款参数
 * @param {string} params.transactionId 微信交易号
 * @param {string} params.outRefundNo 商户退款单号
 * @param {number} params.refundAmount 退款金额(分)
 * @param {number} params.totalAmount 原订单金额(分)
 * @returns {Promise<Object>} 退款结果
 */
const refund = async (params) => {
  const { transactionId, outRefundNo, refundAmount, totalAmount } = params;
  
  // 验证退款金额
  if (refundAmount > totalAmount) {
    throw new Error('退款金额不能大于原订单金额');
  }
  
  if (refundAmount <= 0) {
    throw new Error('退款金额必须大于0');
  }
  
  log('申请退款', params);
  
  try {
    const result = await callPaymentFunction('wxpay_refund', {
      transaction_id: transactionId,
      out_refund_no: outRefundNo || `refund_${Date.now()}`,
      amount: {
        refund: refundAmount,
        total: totalAmount,
        currency: 'CNY'
      }
    });
    
    if (result && result.data) {
      return {
        success: true,
        data: {
          refundId: result.data.refund_id,
          outRefundNo: result.data.out_refund_no,
          status: result.data.status,
          amount: result.data.amount
        }
      };
    }
    
    return {
      success: false,
      message: '退款申请失败'
    };
  } catch (error) {
    log('退款申请失败', error);
    throw error;
  }
};

/**
 * 查询退款状态
 * @param {string} outRefundNo 商户退款单号
 * @returns {Promise<Object>} 退款状态
 */
const queryRefund = async (outRefundNo) => {
  log('查询退款状态', { outRefundNo });
  
  try {
    const result = await callPaymentFunction('wxpay_refund_query', {
      out_refund_no: outRefundNo
    });
    
    if (result && result.data) {
      return {
        success: true,
        data: {
          refundId: result.data.refund_id,
          outRefundNo: result.data.out_refund_no,
          status: result.data.status,
          amount: result.data.amount
        }
      };
    }
    
    return {
      success: false,
      message: '查询退款状态失败'
    };
  } catch (error) {
    log('查询退款状态失败', error);
    throw error;
  }
};

/**
 * 轮询订单状态（支付成功后确认订单状态）
 * @param {string} outTradeNo 商户订单号
 * @param {Object} options 轮询选项
 * @param {number} options.maxAttempts 最大尝试次数，默认 10
 * @param {number} options.interval 轮询间隔（毫秒），默认 2000
 * @returns {Promise<Object>} 订单状态结果
 */
const pollOrderStatus = async (outTradeNo, options = {}) => {
  const { maxAttempts = 10, interval = 2000 } = options;
  
  log('开始轮询订单状态', { outTradeNo, maxAttempts, interval });
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      log(`轮询订单状态 (${i + 1}/${maxAttempts})`, { outTradeNo });
      
      // 1. 先查询云函数数据库
      try {
        const cloudResult = await queryOrder(outTradeNo);
        if (cloudResult.success && cloudResult.data.isPaid) {
          log('云函数数据库查询到已支付订单', cloudResult.data);
          return { 
            success: true, 
            status: 'paid', 
            source: 'cloud',
            data: cloudResult.data
          };
        }
      } catch (cloudError) {
        log('云函数数据库查询失败（可能不可用）', cloudError);
        // 继续查询后端数据库
      }
      
      // 2. 查询后端数据库
      try {
        const apiBaseUrl = getApp().globalData.apiBaseUrl;
        let backendResult;
        
        if (apiBaseUrl === 'cloudbase') {
          // 使用 CloudBase SDK
          const cloudbaseRequest = require('./cloudbase-request');
          backendResult = await cloudbaseRequest.get(`/api/payment/order/by-trade-no/${outTradeNo}`);
        } else {
          // 使用普通 HTTP 请求
          backendResult = await new Promise((resolve, reject) => {
            wx.request({
              url: `${apiBaseUrl}/api/payment/order/by-trade-no/${outTradeNo}`,
              method: 'GET',
              timeout: 5000,
              success: (res) => resolve(res),
              fail: (err) => reject(err)
            });
          });
        }
        
        // 处理不同的返回格式
        let responseData;
        if (apiBaseUrl === 'cloudbase') {
          responseData = backendResult;
        } else {
          responseData = backendResult.data;
        }
        
        if (responseData && responseData.success && responseData.data) {
          const orderData = responseData.data;
          if (orderData.status === 'paid') {
            log('后端数据库查询到已支付订单', orderData);
            return { 
              success: true, 
              status: 'paid', 
              source: 'backend',
              data: orderData
            };
          }
        }
      } catch (backendError) {
        log('后端数据库查询失败', backendError);
      }
      
      // 3. 如果都没有查到已支付状态，等待后重试
      if (i < maxAttempts - 1) {
        log(`订单尚未支付，等待 ${interval}ms 后重试`);
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    } catch (error) {
      log(`轮询订单状态失败 (${i + 1}/${maxAttempts})`, error);
      
      // 如果不是最后一次尝试，继续重试
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }
  
  log('轮询订单状态超时，未确认支付状态');
  return { 
    success: false, 
    status: 'unknown',
    message: '无法确认订单状态，请稍后查看历史记录'
  };
};

/**
 * 强制刷新用户余额
 * @param {string} userId 用户ID
 * @returns {Promise<Object>} 刷新结果
 */
const refreshUserBalance = async (userId) => {
  try {
    log('强制刷新用户余额', { userId });
    
    const apiBaseUrl = getApp().globalData.apiBaseUrl;
    let result;
    
    if (apiBaseUrl === 'cloudbase') {
      // 使用 CloudBase SDK
      const cloudbaseRequest = require('./cloudbase-request');
      result = await cloudbaseRequest.get(`/api/users/${userId}/balance`);
    } else {
      // 使用普通 HTTP 请求
      result = await new Promise((resolve, reject) => {
        wx.request({
          url: `${apiBaseUrl}/api/users/${userId}/balance`,
          method: 'GET',
          timeout: 5000,
          success: (res) => resolve(res),
          fail: (err) => reject(err)
        });
      });
    }
    
    // 处理不同的返回格式
    let responseData;
    if (apiBaseUrl === 'cloudbase') {
      responseData = result;
    } else {
      responseData = result.data;
    }
    
    if (responseData && responseData.success && responseData.data) {
      log('用户余额刷新成功', responseData.data);
      
      // 更新本地缓存
      const cloudbaseAuth = require('./cloudbase-auth');
      const userInfo = cloudbaseAuth.getUserInfo();
      if (userInfo) {
        userInfo.balance = responseData.data;
        cloudbaseAuth.setUserInfo(userInfo);
      }
      
      return {
        success: true,
        data: responseData.data
      };
    }
    
    throw new Error('刷新余额失败：返回数据异常');
  } catch (error) {
    log('刷新用户余额失败', error);
    return {
      success: false,
      message: error.message || '刷新余额失败'
    };
  }
};

/**
 * 完整支付流程
 * 创建订单 -> 发起支付 -> 轮询确认 -> 刷新余额 -> 返回结果
 * @param {Object} params 支付参数
 * @param {string} params.packageType 套餐类型
 * @param {string} params.generationId 生成任务ID
 * @param {string} params.userId 用户ID
 * @returns {Promise<Object>} 支付结果
 */
const pay = async (params) => {
  const { packageType, generationId, userId } = params;
  
  // 免费版直接返回成功
  if (packageType === 'free') {
    return {
      success: true,
      data: {
        packageType: 'free',
        status: ORDER_STATUS.PAID
      }
    };
  }
  
  try {
    // 1. 创建订单
    const orderResult = await createOrder({ packageType, generationId, userId });
    
    if (!orderResult.success) {
      throw new Error('创建订单失败');
    }
    
    const outTradeNo = orderResult.data.outTradeNo;
    
    // 2. 发起支付
    const paymentResult = await requestPayment(orderResult.data);
    
    // 3. 支付成功，轮询确认订单状态
    if (paymentResult.success) {
      log('支付成功，开始轮询订单状态', { outTradeNo });
      
      // 轮询订单状态（最多 10 次，每次间隔 2 秒）
      const pollResult = await pollOrderStatus(outTradeNo, {
        maxAttempts: 10,
        interval: 2000
      });
      
      if (pollResult.success && pollResult.status === 'paid') {
        log('订单状态确认成功', pollResult);
        
        // 4. 强制刷新用户余额
        const balanceResult = await refreshUserBalance(userId);
        if (balanceResult.success) {
          log('用户余额刷新成功', balanceResult.data);
        } else {
          log('用户余额刷新失败（不影响支付结果）', balanceResult.message);
        }
        
        // 5. 更新本地用户付费状态
        const cloudbaseAuth = require('./cloudbase-auth');
        cloudbaseAuth.updatePaymentStatus(packageType);
        
        return {
          success: true,
          data: {
            packageType,
            outTradeNo,
            status: ORDER_STATUS.PAID,
            balance: balanceResult.success ? balanceResult.data : null
          }
        };
      } else {
        // 轮询超时或失败，但支付可能已成功
        log('订单状态确认超时，但支付可能已成功', pollResult);
        
        // 仍然尝试刷新余额
        await refreshUserBalance(userId);
        
        return {
          success: true,
          warning: true,
          data: {
            packageType,
            outTradeNo,
            status: 'pending_confirmation',
            message: '支付成功，但订单状态确认超时，请稍后查看历史记录'
          }
        };
      }
    }
    
    return paymentResult;
  } catch (error) {
    // 用户取消支付
    if (error.cancelled) {
      return {
        success: false,
        cancelled: true,
        message: '支付已取消'
      };
    }
    
    throw error;
  }
};

module.exports = {
  // 配置
  FALLBACK_PACKAGES,  // 导出降级方案供外部使用
  ORDER_STATUS,
  CLOUD_FUNCTION_NAME,
  getPackageConfig,
  getAllPackages,
  fetchPricesFromAPI,  // 导出价格获取函数
  
  // 支付流程
  createOrder,
  requestPayment,
  pay,
  
  // 订单查询
  queryOrder,
  queryOrderByTransactionId,
  pollOrderStatus,      // ✅ 新增：订单状态轮询
  
  // 用户余额
  refreshUserBalance,   // ✅ 新增：刷新用户余额
  
  // 退款
  refund,
  queryRefund
};
