/**
 * CloudBase 认证模块
 * 实现微信小程序 UnionId 静默登录、登录状态管理、退出登录等功能
 * 
 * 使用 @cloudbase/js-sdk 进行认证
 */

// CloudBase 配置
const CLOUDBASE_CONFIG = {
  env: '', // 云开发环境 ID
  region: 'ap-shanghai', // 地域
  initialized: false
};

// 登录状态存储键
const STORAGE_KEYS = {
  LOGIN_STATE: 'cloudbase_login_state',
  USER_INFO: 'cloudbase_user_info',
  LOGIN_TIME: 'cloudbase_login_time',
  EXPIRE_TIME: 'cloudbase_expire_time'
};

// 登录状态过期时间（7天，单位毫秒）
const LOGIN_EXPIRE_TIME = 7 * 24 * 60 * 60 * 1000;

// 登录锁，防止重复登录
let isLoggingIn = false;
let loginPromise = null;

// 日志级别
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

let currentLogLevel = LOG_LEVELS.INFO;

/**
 * 日志输出
 * @param {string} level 日志级别
 * @param {string} message 日志消息
 * @param {any} data 附加数据
 */
const log = (level, message, data = null) => {
  const levelValue = LOG_LEVELS[level] || LOG_LEVELS.INFO;
  if (levelValue < currentLogLevel) return;
  
  const prefix = `[CloudBase Auth][${level}]`;
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
};

/**
 * 设置日志级别
 * @param {string} level 日志级别 ('DEBUG' | 'INFO' | 'WARN' | 'ERROR')
 */
const setLogLevel = (level) => {
  if (LOG_LEVELS[level] !== undefined) {
    currentLogLevel = LOG_LEVELS[level];
    log('INFO', `日志级别设置为: ${level}`);
  }
};

/**
 * 初始化 CloudBase
 * @param {Object} options 配置选项
 * @param {string} options.env 云开发环境 ID
 * @param {string} [options.region='ap-shanghai'] 地域
 * @returns {Promise<boolean>} 初始化是否成功
 */
const initCloudBase = async (options = {}) => {
  try {
    const { env, region = 'ap-shanghai' } = options;
    
    if (!env) {
      log('ERROR', '初始化失败: 缺少环境 ID');
      return false;
    }
    
    // 保存配置
    CLOUDBASE_CONFIG.env = env;
    CLOUDBASE_CONFIG.region = region;
    
    // 初始化 wx.cloud
    wx.cloud.init({
      env: env,
      traceUser: true
    });
    
    CLOUDBASE_CONFIG.initialized = true;
    log('INFO', 'CloudBase 初始化成功', { env, region });
    
    return true;
  } catch (error) {
    log('ERROR', 'CloudBase 初始化失败', error);
    CLOUDBASE_CONFIG.initialized = false;
    return false;
  }
};

/**
 * 检查 CloudBase 是否已初始化
 * @returns {boolean}
 */
const isInitialized = () => {
  return CLOUDBASE_CONFIG.initialized;
};

/**
 * 获取 CloudBase 配置
 * @returns {Object}
 */
const getConfig = () => {
  return { ...CLOUDBASE_CONFIG };
};

/**
 * UnionId 静默登录
 * 注意：此方法需要在 CloudBase 控制台配置微信小程序身份源并启用 UnionId 登录
 * @returns {Promise<Object>} 登录状态对象
 */
const signInWithUnionId = async () => {
  // 防止重复登录
  if (isLoggingIn && loginPromise) {
    log('DEBUG', '登录进行中，等待现有登录完成...');
    return loginPromise;
  }
  
  isLoggingIn = true;
  loginPromise = (async () => {
    try {
      if (!CLOUDBASE_CONFIG.initialized) {
        throw new Error('CloudBase 未初始化，请先调用 initCloudBase');
      }
      
      log('INFO', '开始 UnionId 静默登录...');
      
      // 使用 wx.login 获取 code，调用云托管后端
      const loginResult = await wxLogin();
      
      if (!loginResult.code) {
        throw new Error('获取微信登录凭证失败');
      }
      
      log('DEBUG', '获取到 wx.login code', loginResult.code.substring(0, 10) + '...');
      
      // 调用云托管后端进行登录（禁用重试，因为 code 只能用一次）
      const cloudbaseRequest = require('./cloudbase-request');
      const result = await cloudbaseRequest.post('/api/wechat/login', {
        code: loginResult.code
      }, { showError: false, noRetry: true });
      
      if (!result.success) {
        throw new Error(result.message || '登录失败');
      }
      
      const { userId, openid, token, paymentStatus, isNewUser } = result.data;
      
      // 构建登录状态对象
      const loginState = {
        userId,
        openid,
        token,
        paymentStatus: paymentStatus || 'free',
        isNewUser: isNewUser || false,
        loginTime: Date.now(),
        expireTime: Date.now() + LOGIN_EXPIRE_TIME
      };
      
      // 存储登录状态
      saveLoginState(loginState);
      
      log('INFO', 'UnionId 静默登录成功', { userId, openid: openid?.substring(0, 8) + '...' });
      
      return loginState;
    } catch (error) {
      log('ERROR', 'UnionId 静默登录失败', error);
      throw error;
    } finally {
      isLoggingIn = false;
      loginPromise = null;
    }
  })();
  
  return loginPromise;
};

/**
 * 调用 wx.login 获取 code
 * @returns {Promise<Object>}
 */
const wxLogin = () => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        resolve(res);
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

/**
 * 保存登录状态到本地存储
 * @param {Object} loginState 登录状态对象
 */
const saveLoginState = (loginState) => {
  try {
    wx.setStorageSync(STORAGE_KEYS.LOGIN_STATE, JSON.stringify(loginState));
    wx.setStorageSync(STORAGE_KEYS.USER_INFO, JSON.stringify({
      userId: loginState.userId,
      openid: loginState.openid,
      paymentStatus: loginState.paymentStatus
    }));
    wx.setStorageSync(STORAGE_KEYS.LOGIN_TIME, loginState.loginTime);
    wx.setStorageSync(STORAGE_KEYS.EXPIRE_TIME, loginState.expireTime);
    
    // 同时保存到旧的存储键，保持兼容性
    wx.setStorageSync('userId', loginState.userId);
    wx.setStorageSync('openid', loginState.openid);
    wx.setStorageSync('token', loginState.token);
    wx.setStorageSync('paymentStatus', loginState.paymentStatus);
    wx.setStorageSync('loginTime', loginState.loginTime);
    
    log('DEBUG', '登录状态已保存到本地存储');
  } catch (error) {
    log('ERROR', '保存登录状态失败', error);
  }
};

/**
 * 从本地存储读取登录状态
 * @returns {Object|null} 登录状态对象
 */
const getLoginState = () => {
  try {
    const stateStr = wx.getStorageSync(STORAGE_KEYS.LOGIN_STATE);
    if (stateStr) {
      return JSON.parse(stateStr);
    }
    
    // 尝试从旧的存储键读取
    const userId = wx.getStorageSync('userId');
    const openid = wx.getStorageSync('openid');
    const token = wx.getStorageSync('token');
    const paymentStatus = wx.getStorageSync('paymentStatus');
    const loginTime = wx.getStorageSync('loginTime');
    
    if (userId) {
      return {
        userId,
        openid,
        token,
        paymentStatus: paymentStatus || 'free',
        loginTime: loginTime || Date.now(),
        expireTime: (loginTime || Date.now()) + LOGIN_EXPIRE_TIME
      };
    }
    
    return null;
  } catch (error) {
    log('ERROR', '读取登录状态失败', error);
    return null;
  }
};

/**
 * 检查登录状态是否有效
 * @returns {Promise<boolean>}
 */
const checkLoginState = async () => {
  try {
    const loginState = getLoginState();
    
    if (!loginState) {
      log('DEBUG', '登录状态不存在');
      return false;
    }
    
    // 检查是否过期
    if (loginState.expireTime && Date.now() > loginState.expireTime) {
      log('INFO', '登录状态已过期，清除本地数据');
      // 清除过期的登录状态
      clearLoginState();
      
      // 清除全局状态中的 userId
      const app = getApp();
      if (app) {
        app.globalData.userId = '';
        app.globalData.openid = '';
        app.globalData.userInfo = null;
      }
      
      return false;
    }
    
    // 检查必要字段
    if (!loginState.userId) {
      log('DEBUG', '登录状态无效: 缺少 userId');
      return false;
    }
    
    log('DEBUG', '登录状态有效', { userId: loginState.userId });
    return true;
  } catch (error) {
    log('ERROR', '检查登录状态失败', error);
    return false;
  }
};

/**
 * 获取当前用户信息
 * @returns {Promise<Object|null>}
 */
const getCurrentUser = async () => {
  try {
    const isValid = await checkLoginState();
    if (!isValid) {
      return null;
    }
    
    const loginState = getLoginState();
    return {
      userId: loginState.userId,
      openid: loginState.openid,
      paymentStatus: loginState.paymentStatus,
      loginTime: loginState.loginTime
    };
  } catch (error) {
    log('ERROR', '获取当前用户失败', error);
    return null;
  }
};

/**
 * 刷新登录状态
 * @returns {Promise<Object>} 新的登录状态
 */
const refreshLoginState = async () => {
  try {
    log('INFO', '刷新登录状态...');
    
    // 清除旧的登录状态
    clearLoginState();
    
    // 重新登录
    const newState = await signInWithUnionId();
    
    log('INFO', '登录状态刷新成功');
    return newState;
  } catch (error) {
    log('ERROR', '刷新登录状态失败', error);
    // 刷新失败时清除本地凭证
    clearLoginState();
    throw error;
  }
};

/**
 * 退出登录
 * @returns {Promise<void>}
 */
const signOut = async () => {
  try {
    log('INFO', '退出登录...');
    
    // 清除本地存储的登录状态
    clearLoginState();
    
    // 重置全局状态
    const app = getApp();
    if (app) {
      app.globalData.userInfo = null;
      app.globalData.userId = '';
      app.globalData.openid = '';
    }
    
    log('INFO', '退出登录成功');
  } catch (error) {
    log('ERROR', '退出登录失败', error);
    // 即使失败也清除本地数据
    clearLoginState();
    throw error;
  }
};

/**
 * 清除登录状态
 */
const clearLoginState = () => {
  try {
    // 清除新的存储键
    wx.removeStorageSync(STORAGE_KEYS.LOGIN_STATE);
    wx.removeStorageSync(STORAGE_KEYS.USER_INFO);
    wx.removeStorageSync(STORAGE_KEYS.LOGIN_TIME);
    wx.removeStorageSync(STORAGE_KEYS.EXPIRE_TIME);
    
    // 清除旧的存储键
    wx.removeStorageSync('userId');
    wx.removeStorageSync('openid');
    wx.removeStorageSync('token');
    wx.removeStorageSync('paymentStatus');
    wx.removeStorageSync('loginTime');
    
    log('DEBUG', '登录状态已清除');
  } catch (error) {
    log('ERROR', '清除登录状态失败', error);
  }
};

/**
 * 确保已登录
 * 如果未登录则自动执行登录
 * @returns {Promise<Object>} 用户信息
 */
const ensureLogin = async () => {
  const isValid = await checkLoginState();
  
  if (isValid) {
    return await getCurrentUser();
  }
  
  log('INFO', '未登录或登录已过期，自动登录...');
  const loginState = await signInWithUnionId();
  
  return {
    userId: loginState.userId,
    openid: loginState.openid,
    paymentStatus: loginState.paymentStatus,
    loginTime: loginState.loginTime
  };
};

/**
 * 同步用户信息到云托管后端
 * @returns {Promise<Object>} 同步后的用户信息
 */
const syncUserInfo = async () => {
  try {
    const loginState = getLoginState();
    if (!loginState || !loginState.userId) {
      throw new Error('用户未登录');
    }
    
    log('INFO', '同步用户信息到后端...');
    
    const cloudbaseRequest = require('./cloudbase-request');
    const result = await cloudbaseRequest.post('/api/user/sync', {
      userId: loginState.userId,
      openid: loginState.openid
    }, { showError: false });
    
    if (result.success && result.data) {
      // 更新本地存储的用户信息
      const updatedState = {
        ...loginState,
        paymentStatus: result.data.payment_status || loginState.paymentStatus
      };
      saveLoginState(updatedState);
      
      log('INFO', '用户信息同步成功');
      return result.data;
    }
    
    log('WARN', '用户信息同步返回异常', result);
    return null;
  } catch (error) {
    log('ERROR', '用户信息同步失败', error);
    // 同步失败不阻断登录流程
    return null;
  }
};

/**
 * 更新用户付费状态
 * @param {string} paymentStatus 付费状态
 */
const updatePaymentStatus = (paymentStatus) => {
  try {
    const loginState = getLoginState();
    if (loginState) {
      loginState.paymentStatus = paymentStatus;
      saveLoginState(loginState);
      
      // 更新全局状态
      const app = getApp();
      if (app && app.globalData.userInfo) {
        app.globalData.userInfo.paymentStatus = paymentStatus;
      }
      
      log('INFO', '付费状态已更新', { paymentStatus });
    }
  } catch (error) {
    log('ERROR', '更新付费状态失败', error);
  }
};

module.exports = {
  // 初始化
  initCloudBase,
  isInitialized,
  getConfig,
  
  // 登录
  signInWithUnionId,
  checkLoginState,
  getCurrentUser,
  refreshLoginState,
  ensureLogin,
  
  // 退出
  signOut,
  clearLoginState,
  
  // 用户信息
  syncUserInfo,
  updatePaymentStatus,
  getLoginState,
  
  // 工具
  setLogLevel,
  
  // 常量
  STORAGE_KEYS,
  LOG_LEVELS
};
