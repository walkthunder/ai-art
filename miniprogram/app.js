/**
 * AI全家福·团圆照相馆 - 小程序入口
 * 
 * 全局状态管理：
 * - userInfo: 用户信息对象
 * - userId: 用户ID
 * - openid: 微信openid
 * - isElderMode: 老年模式开关
 * - useCloudBase: 是否使用云托管（默认 true）
 * - cloudbaseInitialized: CloudBase 是否已初始化
 */

// 导入 API 配置
const { API_BASE_URL, CLOUDBASE_CONFIG, currentConfig } = require('./config/api');
const appConfig = require('./config/app');

// CloudBase 配置
const CLOUDBASE_ENV_ID = CLOUDBASE_CONFIG.env; // 云开发环境 ID
const CLOUDBASE_SERVICE_NAME = CLOUDBASE_CONFIG.serviceName; // 云托管服务名称

App({
  /**
   * 全局数据
   * @type {Object}
   */
  globalData: {
    userInfo: null,      // 用户信息
    userId: '',          // 用户ID
    openid: '',          // 微信openid
    isElderMode: false,  // 老年模式
    useCloudBase: !currentConfig.useLocalServer,  // 使用云托管（根据环境配置）
    cloudbaseInitialized: false, // CloudBase 是否已初始化
    usageCount: 0,       // 剩余使用次数
    userType: 'free',     // 用户类型 ('free' | 'paid')
    apiBaseUrl: API_BASE_URL, // API基础URL（从配置文件读取）
    appConfig: null,     // 应用配置（从服务器加载）
    // 导航栏相关
    statusBarHeight: 0,  // 状态栏高度
    navBarHeight: 0,     // 导航栏高度
    menuButtonInfo: null, // 胶囊按钮信息
    // 登录状态管理
    isLoginReady: false, // 登录流程是否完成（无论成功失败）
    loginPromise: null,  // 登录 Promise，用于等待登录完成
    isLoggingIn: false,  // 是否正在登录（防止并发）
    currentLoginPromise: null, // 当前登录 Promise
    // 使用次数缓存
    usageCacheTime: 0,   // 缓存时间戳
    usageCacheData: null // 缓存数据
  },

  /**
   * 小程序启动时执行
   * 恢复设置、检查登录状态、初始化云开发
   */
  onLaunch() {
    console.log('[App] 小程序启动');
    
    // 获取系统信息和导航栏高度
    this.getSystemInfo();
    
    // 恢复老年模式设置
    this.restoreElderMode();
    
    // 初始化开发者模式
    this.initDevMode();
    
    // 加载应用配置
    this.loadAppConfig();
    
    // 初始化云开发并自动登录（顺序执行）
    // 保存 Promise 供页面等待
    this.globalData.loginPromise = this.initAndLogin();
  },
  
  /**
   * 加载应用配置
   */
  async loadAppConfig() {
    try {
      console.log('[App] 开始加载应用配置...');
      const config = await appConfig.loadConfig();
      this.globalData.appConfig = config;
      console.log('[App] 应用配置加载成功:', config.app?.name);
    } catch (error) {
      console.error('[App] 加载应用配置失败:', error);
    }
  },

  /**
   * 获取系统信息和导航栏高度
   * 使用胶囊按钮位置计算自定义导航栏高度
   */
  getSystemInfo() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
      
      // 状态栏高度
      const statusBarHeight = systemInfo.statusBarHeight || 0;
      
      // 导航栏高度 = (胶囊按钮top - 状态栏高度) * 2 + 胶囊按钮高度
      const navBarHeight = (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height;
      
      this.globalData.statusBarHeight = statusBarHeight;
      this.globalData.navBarHeight = navBarHeight;
      this.globalData.menuButtonInfo = menuButtonInfo;
      
      console.log('[App] 系统信息:', {
        statusBarHeight,
        navBarHeight,
        menuButton: menuButtonInfo,
        model: systemInfo.model,
        system: systemInfo.system
      });
    } catch (error) {
      console.error('[App] 获取系统信息失败:', error);
      // 设置默认值
      this.globalData.statusBarHeight = 44;
      this.globalData.navBarHeight = 44;
    }
  },

  /**
   * 初始化云开发并自动登录
   * 确保初始化完成后再执行登录，避免 code 重复使用
   */
  async initAndLogin() {
    try {
      console.log('[App] 开始初始化云开发...');
      // 先初始化云开发
      await this.initCloudBase();
      
      // 初始化成功后再自动登录
      if (this.globalData.cloudbaseInitialized) {
        console.log('[App] 云开发初始化成功，开始自动登录...');
        await this.autoLogin();
      } else {
        console.warn('[App] 云开发初始化失败，跳过自动登录');
      }
    } catch (err) {
      console.error('[App] 初始化或登录失败:', err);
    } finally {
      // 标记登录流程完成（无论成功失败）
      this.globalData.isLoginReady = true;
      console.log('[App] 登录流程完成，isLoginReady = true');
    }
  },

  /**
   * 初始化云开发
   * 配置云托管环境和 CloudBase 认证
   */
  async initCloudBase() {
    try {
      // 使用 CloudBase 认证模块初始化
      const cloudbaseAuth = require('./utils/cloudbase-auth');
      const success = await cloudbaseAuth.initCloudBase({
        env: CLOUDBASE_ENV_ID,
        region: 'ap-shanghai'
      });

      if (success) {
        // 设置云托管环境 ID
        const cloudbaseRequest = require('./utils/cloudbase-request');
        cloudbaseRequest.setEnvId(CLOUDBASE_ENV_ID);
        
        this.globalData.cloudbaseInitialized = true;
        console.log('[App] CloudBase 初始化成功');
      } else {
        throw new Error('CloudBase 初始化返回失败');
      }
    } catch (err) {
      console.error('[App] CloudBase 初始化失败:', err);
      this.globalData.cloudbaseInitialized = false;
      // 初始化失败时回退到传统 HTTP 请求
      this.globalData.useCloudBase = false;
    }
  },

  /**
   * 自动登录
   * 检查登录状态，如果未登录或已过期则自动执行静默登录
   */
  async autoLogin() {
    try {
      // 检查是否处于开发环境（本地调试模式）
      const cloudbaseRequest = require('./utils/cloudbase-request');
      if (cloudbaseRequest && cloudbaseRequest.isLocalMode && cloudbaseRequest.isLocalMode()) {
        console.log('[App] 本地调试模式，跳过自动微信登录');
        console.log('[App] 💡 提示：请使用开发者面板进行登录测试');
        return;
      }
      
      // 检查是否处于开发者模式
      const devMode = this.globalData.devModeUtil;
      if (devMode && devMode.isDevModeActive && devMode.isDevModeActive()) {
        console.log('[App] 开发者模式已激活，跳过自动微信登录');
        return;
      }
      
      const cloudbaseAuth = require('./utils/cloudbase-auth');
      
      // 检查登录状态
      const isValid = await cloudbaseAuth.checkLoginState();
      
      if (isValid) {
        // 登录状态有效，恢复用户信息
        const userInfo = await cloudbaseAuth.getCurrentUser();
        if (userInfo) {
          this.globalData.userId = userInfo.userId;
          this.globalData.openid = userInfo.openid || '';
          this.globalData.userInfo = userInfo;
          console.log('[App] 登录状态有效，用户:', userInfo.userId);
          
          // 后台同步用户信息
          cloudbaseAuth.syncUserInfo().catch(err => {
            console.warn('[App] 后台同步用户信息失败:', err);
          });
          return;
        }
      }
      
      // 登录状态无效，执行静默登录
      console.log('[App] 登录状态无效，执行静默登录...');
      await this.login();
    } catch (err) {
      console.error('[App] 自动登录失败:', err);
      // 自动登录失败不阻断应用启动，等待页面触发登录
    }
  },

  /**
   * 小程序显示时执行（从后台切换到前台）
   */
  onShow() {
    console.log('[App] 小程序显示');
  },

  /**
   * 小程序隐藏时执行（切换到后台）
   */
  onHide() {
    console.log('[App] 小程序隐藏');
  },

  /**
   * 恢复老年模式设置
   * 从本地存储读取老年模式状态
   */
  restoreElderMode() {
    try {
      const isElderMode = wx.getStorageSync('isElderMode');
      this.globalData.isElderMode = isElderMode || false;
      console.log('[App] 老年模式状态:', this.globalData.isElderMode ? '开启' : '关闭');
    } catch (err) {
      console.error('[App] 恢复老年模式设置失败:', err);
      this.globalData.isElderMode = false;
    }
  },

  /**
   * 初始化开发者模式
   * 在开发环境下启用开发者模式功能
   */
  initDevMode() {
    try {
      const devMode = require('./utils/devMode');
      devMode.initDevMode();
      
      // 保存到全局数据
      this.globalData.devModeUtil = devMode;
      console.log('[App] 开发者模式已初始化');
    } catch (err) {
      console.error('[App] 初始化开发者模式失败:', err);
    }
  },

  /**
   * 检查登录状态（兼容旧方法）
   * 从本地存储读取用户信息，更新全局状态
   * @returns {boolean} 是否已登录
   */
  checkLoginStatus() {
    try {
      const cloudbaseAuth = require('./utils/cloudbase-auth');
      const loginState = cloudbaseAuth.getLoginState();
      
      if (loginState && loginState.userId) {
        this.globalData.userId = loginState.userId;
        this.globalData.openid = loginState.openid || '';
        this.globalData.userInfo = {
          userId: loginState.userId,
          openid: loginState.openid,
          paymentStatus: loginState.paymentStatus || 'free'
        };
        console.log('[App] 已登录用户:', loginState.userId);
        return true;
      } else {
        console.log('[App] 用户未登录');
        return false;
      }
    } catch (err) {
      console.error('[App] 检查登录状态失败:', err);
      return false;
    }
  },

  /**
   * 执行登录
   * 调用 CloudBase 认证模块进行静默登录
   * @returns {Promise<Object>} 登录结果
   */
  async login() {
    const cloudbaseAuth = require('./utils/cloudbase-auth');
    try {
      console.log('[App] 开始登录...');
      const loginState = await cloudbaseAuth.signInWithUnionId();
      
      // 更新全局状态
      this.globalData.userId = loginState.userId;
      this.globalData.openid = loginState.openid || '';
      this.globalData.userInfo = {
        userId: loginState.userId,
        openid: loginState.openid,
        paymentStatus: loginState.paymentStatus || 'free'
      };
      
      console.log('[App] 登录成功:', loginState.userId);
      
      // 处理邀请码（如果是新用户首次登录）
      await this.processInviteCode(loginState);
      
      // 预加载邀请码（用于分享功能）
      this.preloadInviteCode(loginState.userId).catch(err => {
        console.warn('[App] 预加载邀请码失败:', err);
      });
      
      // 后台同步用户信息
      cloudbaseAuth.syncUserInfo().catch(err => {
        console.warn('[App] 后台同步用户信息失败:', err);
      });
      
      return loginState;
    } catch (err) {
      console.error('[App] 登录失败:', err);
      throw err;
    }
  },

  /**
   * 处理邀请码绑定
   * @param {Object} loginState - 登录状态
   */
  async processInviteCode(loginState) {
    try {
      // 检查是否有待处理的邀请码
      const inviteCode = wx.getStorageSync('pending_invite_code');
      
      if (!inviteCode) {
        return;
      }

      console.log('[App] 处理邀请码:', inviteCode);

      // 检查是否是新用户
      if (!loginState.isNewUser) {
        console.log('[App] 非新用户，清除邀请码');
        wx.removeStorageSync('pending_invite_code');
        return;
      }

      // 调用后端接口绑定邀请关系（使用新接口）
      const cloudbaseRequest = require('./utils/cloudbase-request');
      const res = await cloudbaseRequest.post('/api/invite/bind', {
        invite_code: inviteCode,
        user_id: loginState.userId
      });

      if (res && res.success) {
        console.log('[App] 邀请绑定成功，邀请人:', res.data.inviter_id);
        
        // 清除待处理的邀请码
        wx.removeStorageSync('pending_invite_code');
        
        // 显示成功提示
        wx.showToast({
          title: '邀请成功，已获得奖励',
          icon: 'success',
          duration: 2000
        });
      } else {
        console.warn('[App] 邀请绑定失败:', res?.message);
        // 失败也清除邀请码，避免重复尝试
        wx.removeStorageSync('pending_invite_code');
      }
    } catch (err) {
      console.error('[App] 处理邀请码失败:', err);
      // 失败也清除邀请码
      wx.removeStorageSync('pending_invite_code');
    }
  },

  /**
   * 预加载邀请码（用于分享功能）
   * @param {string} userId - 用户ID
   */
  async preloadInviteCode(userId) {
    try {
      if (!userId) {
        return;
      }

      console.log('[App] 预加载邀请码...');
      
      const cloudbaseRequest = require('./utils/cloudbase-request');
      const res = await cloudbaseRequest.get(`/api/invite/code/${userId}`);

      if (res && res.success && res.data && res.data.invite_code) {
        const inviteCode = res.data.invite_code;
        // 保存到本地存储
        wx.setStorageSync(`invite_code_${userId}`, inviteCode);
        console.log('[App] 邀请码预加载成功');
      }
    } catch (err) {
      console.error('[App] 预加载邀请码失败:', err);
      // 预加载失败不影响主流程
    }
  },

  /**
   * 确保登录流程已完成
   * 等待 onLaunch 中的登录流程完成
   * @returns {Promise<void>}
   */
  async ensureLoginReady() {
    if (this.globalData.isLoginReady) {
      return;
    }
    
    console.log('[App] 等待登录流程完成...');
    if (this.globalData.loginPromise) {
      await this.globalData.loginPromise;
    }
    
    // 双重检查
    if (!this.globalData.isLoginReady) {
      this.globalData.isLoginReady = true;
    }
  },

  /**
   * 获取当前用户 ID（确保已登录）
   * @param {boolean} [autoLogin=true] 如果未登录是否自动登录
   * @returns {Promise<string|null>} 用户ID
   */
  async getUserId(autoLogin = true) {
    // 1. 先等待登录流程完成
    await this.ensureLoginReady();
    
    // 2. 检查开发者模式
    const devMode = this.globalData.devModeUtil;
    if (devMode && devMode.isDevModeActive && devMode.isDevModeActive()) {
      // 开发者模式下使用特殊 userId
      const devUserId = wx.getStorageSync('dev_userId') || 'dev_user_001';
      console.log('[App] 开发者模式，使用测试 userId:', devUserId);
      this.globalData.userId = devUserId;
      return devUserId;
    }
    
    // 3. 检查本地调试模式
    const cloudbaseRequest = require('./utils/cloudbase-request');
    if (cloudbaseRequest && cloudbaseRequest.isLocalMode && cloudbaseRequest.isLocalMode()) {
      // 本地调试模式下使用测试 userId
      const localUserId = wx.getStorageSync('local_userId') || 'local_test_user';
      console.log('[App] 本地调试模式，使用测试 userId:', localUserId);
      this.globalData.userId = localUserId;
      return localUserId;
    }
    
    // 4. 检查 globalData
    if (this.globalData.userId) {
      return this.globalData.userId;
    }
    
    // 5. 尝试从 storage 恢复
    const cloudbaseAuth = require('./utils/cloudbase-auth');
    const loginState = cloudbaseAuth.getLoginState();
    if (loginState && loginState.userId) {
      // 检查是否过期
      const isValid = await cloudbaseAuth.checkLoginState();
      if (isValid) {
        this.globalData.userId = loginState.userId;
        this.globalData.openid = loginState.openid || '';
        console.log('[App] 从 storage 恢复 userId:', loginState.userId);
        return loginState.userId;
      } else {
        console.log('[App] storage 中的登录状态已过期');
      }
    }
    
    // 6. 如果需要，自动登录（带并发控制）
    if (autoLogin) {
      // ✅ 检查是否正在登录
      if (this.globalData.isLoggingIn && this.globalData.currentLoginPromise) {
        console.log('[App] 登录进行中，等待完成...');
        try {
          await this.globalData.currentLoginPromise;
          return this.globalData.userId;
        } catch (err) {
          console.error('[App] 等待登录失败:', err);
          return null;
        }
      }
      
      // ✅ 标记正在登录
      this.globalData.isLoggingIn = true;
      this.globalData.currentLoginPromise = (async () => {
        try {
          console.log('[App] 开始自动登录...');
          const userInfo = await this.ensureLogin();
          return userInfo.userId;
        } catch (err) {
          console.error('[App] 自动登录失败:', err);
          throw err;
        } finally {
          // ✅ 清除登录标记
          this.globalData.isLoggingIn = false;
          this.globalData.currentLoginPromise = null;
        }
      })();
      
      try {
        return await this.globalData.currentLoginPromise;
      } catch (err) {
        return null;
      }
    }
    
    return null;
  },

  /**
   * 确保已登录
   * 如果未登录则自动执行登录
   * @returns {Promise<Object>} 用户信息
   */
  async ensureLogin() {
    const cloudbaseAuth = require('./utils/cloudbase-auth');
    try {
      const userInfo = await cloudbaseAuth.ensureLogin();
      
      // 更新全局状态
      this.globalData.userId = userInfo.userId;
      this.globalData.openid = userInfo.openid || '';
      this.globalData.userInfo = userInfo;
      
      return userInfo;
    } catch (err) {
      console.error('[App] ensureLogin 失败:', err);
      throw err;
    }
  },

  /**
   * 切换老年模式
   * 切换状态并保存到本地存储
   * @returns {boolean} 切换后的状态
   */
  toggleElderMode() {
    this.globalData.isElderMode = !this.globalData.isElderMode;
    
    // 保存到本地存储
    try {
      wx.setStorageSync('isElderMode', this.globalData.isElderMode);
    } catch (err) {
      console.error('[App] 保存老年模式设置失败:', err);
    }
    
    console.log('[App] 老年模式:', this.globalData.isElderMode ? '开启' : '关闭');
    return this.globalData.isElderMode;
  },

  /**
   * 设置老年模式
   * 直接设置状态并保存
   * @param {boolean} isElderMode 是否开启老年模式
   * @returns {boolean} 设置后的状态
   */
  setElderMode(isElderMode) {
    this.globalData.isElderMode = !!isElderMode;
    
    try {
      wx.setStorageSync('isElderMode', this.globalData.isElderMode);
    } catch (err) {
      console.error('[App] 保存老年模式设置失败:', err);
    }
    
    console.log('[App] 老年模式设置为:', this.globalData.isElderMode ? '开启' : '关闭');
    return this.globalData.isElderMode;
  },

  /**
   * 获取全局数据
   * @param {string} [key] 键名，不传则返回全部
   * @returns {any} 全局数据
   */
  getGlobalData(key) {
    return key ? this.globalData[key] : this.globalData;
  },

  /**
   * 设置全局数据
   * @param {string|Object} key 键名或键值对对象
   * @param {any} [value] 值（当key为字符串时）
   */
  setGlobalData(key, value) {
    if (typeof key === 'object') {
      Object.assign(this.globalData, key);
    } else {
      this.globalData[key] = value;
    }
  },

  /**
   * 更新用户信息
   * @param {Object} userInfo 用户信息
   */
  updateUserInfo(userInfo) {
    this.globalData.userInfo = { ...this.globalData.userInfo, ...userInfo };
    if (userInfo.userId) {
      this.globalData.userId = userInfo.userId;
    }
    if (userInfo.openid) {
      this.globalData.openid = userInfo.openid;
    }
  },

  /**
   * 退出登录
   * 清除全局状态和本地存储
   */
  async logout() {
    const cloudbaseAuth = require('./utils/cloudbase-auth');
    
    try {
      // 调用 CloudBase 认证模块的退出登录
      await cloudbaseAuth.signOut();
      
      // 清除全局状态
      this.globalData.userInfo = null;
      this.globalData.userId = '';
      this.globalData.openid = '';
      this.globalData.usageCount = 0;
      this.globalData.userType = 'free';
      
      console.log('[App] 已退出登录');
    } catch (err) {
      console.error('[App] 退出登录失败:', err);
      // 即使失败也清除全局状态
      this.globalData.userInfo = null;
      this.globalData.userId = '';
      this.globalData.openid = '';
      this.globalData.usageCount = 0;
      this.globalData.userType = 'free';
    }
  },

  /**
   * 更新使用次数
   * 从服务器获取最新的使用次数并更新全局状态
   * @param {boolean} [forceRefresh=false] 是否强制刷新（跳过缓存）
   * @returns {Promise<Object>} { usageCount, userType, paymentStatus, canGenerate, modeData }
   */
  async updateUsageCount(forceRefresh = false) {
    try {
      // 强制获取 userId，确保已登录
      const userId = await this.getUserId(true);
      
      if (!userId) {
        // 登录失败，抛出错误而不是返回默认值
        throw new Error('用户未登录，请先登录');
      }

      // ✅ 检查缓存（30秒内有效）
      const now = Date.now();
      const CACHE_DURATION = 30 * 1000; // 30秒缓存
      
      if (!forceRefresh && 
          this.globalData.usageCacheData && 
          this.globalData.usageCacheTime &&
          (now - this.globalData.usageCacheTime) < CACHE_DURATION) {
        console.log('[App] 使用缓存的次数数据，缓存剩余:', 
          Math.round((CACHE_DURATION - (now - this.globalData.usageCacheTime)) / 1000), '秒');
        return this.globalData.usageCacheData;
      }

      console.log('[App] 从服务器获取使用次数...');
      const cloudbaseRequest = require('./utils/cloudbase-request');
      const res = await cloudbaseRequest.get(`/api/usage/check/${userId}`);

      if (res && res.success) {
        const data = res.data;
        
        // 从本地存储获取paymentStatus
        const paymentStatus = wx.getStorageSync('paymentStatus') || 'free';
        
        // 计算总使用次数（向后兼容）
        // 使用 ?? 而不是 || 来正确处理 0 值
        const puzzleRemaining = data.puzzle?.remaining ?? 0;
        const transformRemaining = data.transform?.remaining ?? 0;
        const paidRemaining = data.paid?.remaining ?? 0;
        const usageCount = puzzleRemaining + transformRemaining + paidRemaining;
        
        // 更新全局状态
        this.globalData.usageCount = usageCount;
        this.globalData.userType = data.user_type || 'free';
        
        console.log('[App] 使用次数已更新:', {
          puzzle: puzzleRemaining,
          transform: transformRemaining,
          paid: paidRemaining,
          total: usageCount,
          can_generate: data.can_generate
        });
        
        const result = {
          usageCount: usageCount,
          userType: data.user_type || 'free',
          paymentStatus: paymentStatus,
          canGenerate: data.can_generate || false,
          modeData: {
            puzzle: data.puzzle || { free_count: 3, remaining: 0 },
            transform: data.transform || { free_count: 3, remaining: 0 },
            paid: data.paid || { count: 0, remaining: 0 }
          }
        };
        
        // ✅ 更新缓存
        this.globalData.usageCacheTime = now;
        this.globalData.usageCacheData = result;
        
        // 通知所有页面更新
        this.notifyPagesUsageUpdate(result);
        
        return result;
      } else {
        throw new Error(res.message || '获取使用次数失败');
      }
    } catch (err) {
      console.error('[App] 更新使用次数异常:', err);
      // 不返回默认值，让调用方处理错误
      throw err;
    }
  },

  /**
   * 通知所有页面使用次数已更新
   * @param {Object} data - 使用次数数据
   */
  notifyPagesUsageUpdate(data) {
    try {
      const pages = getCurrentPages();
      pages.forEach(page => {
        if (typeof page.onUsageCountUpdate === 'function') {
          page.onUsageCountUpdate(data);
        }
      });
    } catch (err) {
      console.error('[App] 通知页面更新失败:', err);
    }
  },

  /**
   * 扣减使用次数
   * @param {string} generationId - 生成记录ID
   * @param {string} mode - 生成模式 ('puzzle' | 'transform')，可选，默认 'puzzle'
   * @returns {Promise<Object>} { success, remaining }
   */
  async decrementUsageCount(generationId, mode = 'puzzle') {
    try {
      // 强制获取 userId
      const userId = await this.getUserId(true);
      if (!userId) {
        throw new Error('用户未登录');
      }

      const cloudbaseRequest = require('./utils/cloudbase-request');
      const res = await cloudbaseRequest.post('/api/usage/decrement', {
        userId,
        generationId,
        mode
      });

      if (res && res.success) {
        const remaining = res.data;
        
        // 计算总使用次数
        const usageCount = (remaining.puzzle || 0) + 
                          (remaining.transform || 0) + 
                          (remaining.paid || 0);
        
        // 更新全局状态
        this.globalData.usageCount = usageCount;
        
        // ✅ 清除缓存，强制下次重新获取
        this.globalData.usageCacheTime = 0;
        this.globalData.usageCacheData = null;
        
        console.log('[App] 使用次数已扣减，剩余:', remaining);
        
        // 从本地存储获取paymentStatus
        const paymentStatus = wx.getStorageSync('paymentStatus') || 'free';
        
        // 通知页面更新
        this.notifyPagesUsageUpdate({
          usageCount: usageCount,
          userType: this.globalData.userType,
          paymentStatus: paymentStatus,
          canGenerate: usageCount > 0,
          modeData: {
            puzzle: { remaining: remaining.puzzle || 0 },
            transform: { remaining: remaining.transform || 0 },
            paid: { remaining: remaining.paid || 0 }
          }
        });
        
        return {
          success: true,
          remaining: remaining
        };
      } else {
        throw new Error(res.message || '扣减使用次数失败');
      }
    } catch (err) {
      console.error('[App] 扣减使用次数失败:', err);
      throw err;
    }
  },

  /**
   * 恢复使用次数（生成失败时）
   * @param {string} generationId - 生成记录ID
   * @param {string} mode - 生成模式 ('puzzle' | 'transform')，可选，默认 'puzzle'
   * @returns {Promise<Object>} { success, remaining }
   */
  async restoreUsageCount(generationId, mode = 'puzzle') {
    try {
      // 强制获取 userId
      const userId = await this.getUserId(true);
      if (!userId) {
        throw new Error('用户未登录');
      }

      const cloudbaseRequest = require('./utils/cloudbase-request');
      const res = await cloudbaseRequest.post('/api/usage/restore', {
        userId,
        generationId,
        mode
      });

      if (res && res.success) {
        const remaining = res.data;
        
        // 计算总使用次数
        const usageCount = (remaining.puzzle || 0) + 
                          (remaining.transform || 0) + 
                          (remaining.paid || 0);
        
        // 更新全局状态
        this.globalData.usageCount = usageCount;
        
        // ✅ 清除缓存，强制下次重新获取
        this.globalData.usageCacheTime = 0;
        this.globalData.usageCacheData = null;
        
        console.log('[App] 使用次数已恢复，剩余:', remaining);
        
        // 通知页面更新
        this.notifyPagesUsageUpdate({
          usageCount: usageCount,
          userType: this.globalData.userType,
          canGenerate: usageCount > 0,
          modeData: {
            puzzle: { remaining: remaining.puzzle || 0 },
            transform: { remaining: remaining.transform || 0 },
            paid: { remaining: remaining.paid || 0 }
          }
        });
        
        return {
          success: true,
          remaining: remaining
        };
      } else {
        throw new Error(res.message || '恢复使用次数失败');
      }
    } catch (err) {
      console.error('[App] 恢复使用次数失败:', err);
      throw err;
    }
  }
});
