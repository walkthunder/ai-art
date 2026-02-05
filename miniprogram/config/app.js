/**
 * 小程序应用配置
 * 从后端API动态获取配置
 */

const API_BASE_URL = require('./api').API_BASE_URL;

// 配置缓存
let configCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

const config = {
  // 默认配置（降级方案）
  _defaultConfig: {
    app: {
      name: 'WhisperAI',
      alternateName: '团圆照相馆',
      description: 'AI智能照片生成',
      version: '1.0.0',
    },
    brand: {
      slogan: 'AI智能照片生成',
    },
    legal: {
      privacyPolicyPath: '/pages/privacy/privacy',
      userAgreementPath: '/pages/agreement/agreement',
      companyName: '您的公司名称',
    },
    features: {
      enableInvite: true,
      enablePayment: true,
      enableWatermark: true,
    },
  },
  
  /**
   * 从后端加载配置
   */
  async loadConfig(forceRefresh = false) {
    const now = Date.now();
    
    // 使用缓存
    if (!forceRefresh && configCache && (now - cacheTimestamp < CACHE_TTL)) {
      return configCache;
    }
    
    try {
      const response = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('请求超时'));
        }, 5000); // 5秒超时
        
        wx.request({
          url: `${API_BASE_URL}/config/public`,
          method: 'GET',
          timeout: 5000,
          success: (res) => {
            clearTimeout(timer);
            resolve(res);
          },
          fail: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });
      });
      
      if (response.statusCode === 200 && response.data.success) {
        configCache = response.data.data;
        cacheTimestamp = now;
        console.log('[AppConfig] 配置已从服务器加载');
        return configCache;
      } else {
        console.warn('[AppConfig] 加载配置失败，使用默认配置:', response.statusCode);
        // 使用旧缓存（如果有）
        if (configCache) {
          console.log('[AppConfig] 使用旧缓存配置');
          return configCache;
        }
        return this._defaultConfig;
      }
    } catch (error) {
      console.error('[AppConfig] 加载配置失败:', error);
      // 使用旧缓存（如果有）
      if (configCache) {
        console.log('[AppConfig] 使用旧缓存配置');
        return configCache;
      }
      return this._defaultConfig;
    }
  },
  
  /**
   * 获取配置值
   */
  async getConfig(key, defaultValue = null) {
    const config = await this.loadConfig();
    
    const keys = key.split('.');
    let value = config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value !== undefined ? value : defaultValue;
  },
  
  /**
   * 获取小程序名称
   */
  async getAppName() {
    return await this.getConfig('app.name', 'WhisperAI');
  },
  
  /**
   * 获取页面标题（带小程序名称）
   */
  async getPageTitle(pageTitle) {
    const appName = await this.getAppName();
    if (pageTitle) {
      return `${pageTitle} - ${appName}`;
    }
    return appName;
  },
  
  /**
   * 同步获取配置（使用缓存）
   */
  getConfigSync(key, defaultValue = null) {
    if (!configCache) {
      // 如果没有缓存，返回默认值
      const keys = key.split('.');
      let value = this._defaultConfig;
      
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return defaultValue;
        }
      }
      
      return value !== undefined ? value : defaultValue;
    }
    
    const keys = key.split('.');
    let value = configCache;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value !== undefined ? value : defaultValue;
  },
  
  /**
   * 同步获取小程序名称
   */
  getAppNameSync() {
    return this.getConfigSync('app.name', 'WhisperAI');
  },
};

module.exports = config;
