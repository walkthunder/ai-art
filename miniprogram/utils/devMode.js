/**
 * 开发者模式管理工具
 * 用于激活和管理开发者模式
 */

let devModeActive = false;
let tapCount = 0;
let lastTapTime = 0;
const TAP_THRESHOLD = 500; // 毫秒
const REQUIRED_TAPS = 5; // 需要的点击次数

/**
 * 初始化开发者模式
 * 通过快速点击状态栏5次来激活
 */
function initDevMode() {
  // 检查环境变量（小程序环境中 __DEV__ 可能未定义）
  const isDev = (typeof __DEV__ !== 'undefined' && __DEV__) || 
                (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development');
  
  if (!isDev) {
    console.log('[DevMode] 非开发环境，开发者模式不可用');
    return;
  }

  console.log('[DevMode] 开发者模式已初始化，快速点击状态栏5次来激活');
}

/**
 * 处理点击事件（用于激活开发者模式）
 * @param {Function} callback 激活时的回调函数
 */
function handleTap(callback) {
  const now = Date.now();

  // 如果距离上次点击超过阈值，重置计数
  if (now - lastTapTime > TAP_THRESHOLD) {
    tapCount = 0;
  }

  tapCount++;
  lastTapTime = now;

  console.log(`[DevMode] 点击 ${tapCount}/${REQUIRED_TAPS}`);

  // 达到所需点击次数
  if (tapCount >= REQUIRED_TAPS) {
    activateDevMode(callback);
    tapCount = 0;
  }
}

/**
 * 激活开发者模式
 * @param {Function} callback 激活时的回调函数
 */
function activateDevMode(callback) {
  devModeActive = true;
  console.log('[DevMode] ✅ 开发者模式已激活！');
  
  wx.showToast({
    title: '🔧 开发者模式已激活',
    icon: 'success',
    duration: 2000
  });

  if (typeof callback === 'function') {
    callback();
  }
}

/**
 * 检查开发者模式是否激活
 */
function isDevModeActive() {
  return devModeActive;
}

/**
 * 禁用开发者模式
 */
function disableDevMode() {
  devModeActive = false;
  tapCount = 0;
  console.log('[DevMode] 开发者模式已禁用');
}

/**
 * 获取开发者模式状态
 */
function getDevModeStatus() {
  const isDev = (typeof __DEV__ !== 'undefined' && __DEV__) || 
                (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development');
  
  return {
    active: devModeActive,
    isDev: isDev
  };
}

/**
 * 开发者模式快速登录
 * @param {string} userId - 用户ID（可选，不提供则生成测试ID）
 * @returns {Promise<Object>} 登录结果
 */
async function devLogin(userId = null) {
  const { post } = require('./cloudbase-request');
  
  try {
    // 如果没有提供userId，生成一个测试ID
    const testUserId = userId || `dev_user_${Date.now()}`;
    
    console.log('[DevMode] 开发者登录:', testUserId);
    
    // 调用后端开发者登录API
    const response = await post('/api/dev/login', {
      userId: testUserId
    }, {
      showError: false
    });
    
    if (response.success) {
      // 更新全局状态
      const app = getApp();
      app.globalData.userId = response.data.userId;
      app.globalData.usageCount = response.data.usageCount;
      app.globalData.userType = response.data.hasEverPaid ? 'paid' : 'free';
      
      // 更新本地缓存
      wx.setStorageSync('userId', response.data.userId);
      wx.setStorageSync('hasEverPaid', response.data.hasEverPaid);
      wx.setStorageSync('paymentStatus', response.data.paymentStatus);
      
      console.log('[DevMode] 登录成功:', response.data);
      
      return {
        success: true,
        data: response.data
      };
    } else {
      throw new Error(response.message || '登录失败');
    }
  } catch (error) {
    console.error('[DevMode] 登录失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  initDevMode,
  handleTap,
  activateDevMode,
  isDevModeActive,
  disableDevMode,
  getDevModeStatus,
  devLogin
};
