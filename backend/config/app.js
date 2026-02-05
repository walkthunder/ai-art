/**
 * 应用配置文件
 * 从数据库读取配置，提供向后兼容的接口
 */

const appConfigService = require('../services/appConfigService');

// 同步获取配置的包装器（用于向后兼容）
let cachedConfig = null;

// 初始化配置
async function initConfig() {
  try {
    cachedConfig = await appConfigService.getAllConfig();
    console.log('[AppConfig] 配置已从数据库加载');
  } catch (error) {
    console.error('[AppConfig] 加载配置失败，使用默认值:', error);
    cachedConfig = getDefaultConfig();
  }
}

// 默认配置（降级方案）
function getDefaultConfig() {
  return {
    app: {
      name: process.env.APP_NAME || 'WhisperAI',
      alternateName: '团圆照相馆',
      description: 'AI智能照片生成',
      version: '1.0.0',
      appId: process.env.WECHAT_APP_ID || '',
    },
    watermark: {
      textTemplate: '{appName}\n扫码去水印',
      qrUrl: process.env.WATERMARK_QR_URL || 'https://your-domain.com/pay',
      position: 'center',
      opacity: 180,
    },
    brand: {
      slogan: 'AI智能照片生成',
      customerService: {
        email: 'support@example.com',
        phone: '',
      },
      social: {
        wechat: '',
        weibo: '',
      },
    },
    legal: {
      privacyPolicyUrl: '/pages/privacy/privacy',
      userAgreementUrl: '/pages/agreement/agreement',
      companyName: '您的公司名称',
      icpNumber: '',
    },
    features: {
      enableInvite: true,
      enablePayment: true,
      enableWatermark: true,
      enableDevMode: process.env.NODE_ENV === 'development',
    },
  };
}

// 导出模块
module.exports = {
  // 异步方法（推荐使用）
  async getConfig(key, defaultValue) {
    return await appConfigService.getConfig(key, defaultValue);
  },
  
  async getAllConfig() {
    return await appConfigService.getAllConfig();
  },
  
  async getAppName() {
    return await appConfigService.getAppName();
  },
  
  async getWatermarkConfig() {
    return await appConfigService.getWatermarkConfig();
  },
  
  // 同步方法（向后兼容，使用缓存）
  getAppNameSync() {
    return cachedConfig?.app?.name || process.env.APP_NAME || 'WhisperAI';
  },
  
  getWatermarkConfigSync() {
    const appName = this.getAppNameSync();
    const textTemplate = cachedConfig?.watermark?.textTemplate || '{appName}\n扫码去水印';
    return {
      text: textTemplate.replace('{appName}', appName),
      qrUrl: cachedConfig?.watermark?.qrUrl || process.env.WATERMARK_QR_URL || 'https://your-domain.com/pay',
      position: cachedConfig?.watermark?.position || 'center',
      opacity: cachedConfig?.watermark?.opacity || 180,
    };
  },
  
  // 初始化
  initConfig,
  
  // 向后兼容的属性访问
  get app() {
    return cachedConfig?.app || getDefaultConfig().app;
  },
  
  get watermark() {
    return cachedConfig?.watermark || getDefaultConfig().watermark;
  },
  
  get brand() {
    return cachedConfig?.brand || getDefaultConfig().brand;
  },
  
  get legal() {
    return cachedConfig?.legal || getDefaultConfig().legal;
  },
  
  get features() {
    return cachedConfig?.features || getDefaultConfig().features;
  },
};

// 启动时初始化配置
initConfig().catch(err => {
  console.error('[AppConfig] 初始化配置失败:', err);
});
