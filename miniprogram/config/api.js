/**
 * API 配置文件
 * 
 * 🔧 环境切换统一配置
 * 只需修改 CURRENT_ENV 即可切换开发/生产环境
 */

// ============================================
// 🎯 环境配置 - 只需修改这里！
// ============================================
const CURRENT_ENV = 'production';  // 'development' | 'production'

// ============================================
// 环境配置详情
// ============================================
const ENV_CONFIG = {
  // 开发环境（本地后端）
  development: {
    useLocalServer: true,
    apiBaseUrl: 'http://localhost:3001',
    cloudbaseEnv: 'test-1g71tc7eb37627e2',
    serviceName: 'express',
    region: 'ap-shanghai',
    description: '本地开发环境 - 需要启动本地后端 (pnpm run dev)'
  },
  
  // 生产环境（云托管）
  production: {
    useLocalServer: false,
    apiBaseUrl: 'cloudbase',  // 使用 CloudBase SDK
    cloudbaseEnv: 'test-1g71tc7eb37627e2',
    serviceName: 'express',
    region: 'ap-shanghai',
    description: '生产环境 - 云托管服务'
  }
};

// 获取当前环境配置
const getCurrentConfig = () => {
  const config = ENV_CONFIG[CURRENT_ENV];
  if (!config) {
    console.error(`[API Config] 无效的环境配置: ${CURRENT_ENV}`);
    return ENV_CONFIG.production; // 默认使用生产环境
  }
  return config;
};

// 导出当前配置
const currentConfig = getCurrentConfig();

// 导出的配置（向后兼容）
const API_BASE_URL = currentConfig.apiBaseUrl;
const CLOUDBASE_CONFIG = {
  env: currentConfig.cloudbaseEnv,
  serviceName: currentConfig.serviceName,
  region: currentConfig.region
};

// 打印当前环境信息
console.log('========================================');
console.log('🔧 API 环境配置');
console.log('========================================');
console.log('当前环境:', CURRENT_ENV);
console.log('描述:', currentConfig.description);
console.log('使用本地服务器:', currentConfig.useLocalServer);
console.log('API 地址:', currentConfig.apiBaseUrl);
console.log('CloudBase 环境:', currentConfig.cloudbaseEnv);
console.log('========================================');

// 导出配置
module.exports = {
  // 当前环境
  CURRENT_ENV,
  
  // 当前配置
  currentConfig,
  
  // 向后兼容
  API_BASE_URL,
  CLOUDBASE_CONFIG,
  
  // 完整配置
  ENV_CONFIG,
  
  // 工具方法
  getCurrentConfig,
  isProduction: () => CURRENT_ENV === 'production',
  isDevelopment: () => CURRENT_ENV === 'development'
};
