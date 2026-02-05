/**
 * 应用配置服务
 * 从数据库读取和管理应用配置
 */

const db = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

// 配置缓存
let configCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 1分钟缓存

/**
 * 从数据库加载所有配置
 * @param {boolean} forceRefresh - 是否强制刷新缓存
 * @returns {Promise<Object>} 配置对象
 */
async function loadConfig(forceRefresh = false) {
  const now = Date.now();
  
  // 使用缓存
  if (!forceRefresh && configCache && (now - cacheTimestamp < CACHE_TTL)) {
    return configCache;
  }
  
  const connection = await db.pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT config_key, config_value, config_type FROM app_config'
    );
    
    const config = {};
    
    rows.forEach(row => {
      const keys = row.config_key.split('.');
      let current = config;
      
      // 防止原型污染攻击
      const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
      if (keys.some(key => dangerousKeys.includes(key))) {
        console.warn(`[AppConfig] 跳过危险的配置键: ${row.config_key}`);
        return;
      }
      
      // 构建嵌套对象
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      // 解析值
      const lastKey = keys[keys.length - 1];
      current[lastKey] = parseConfigValue(row.config_value, row.config_type);
    });
    
    // 更新缓存
    configCache = config;
    cacheTimestamp = now;
    
    return config;
  } finally {
    connection.release();
  }
}

/**
 * 解析配置值
 * @param {string} value - 配置值
 * @param {string} type - 配置类型
 * @returns {any} 解析后的值
 */
function parseConfigValue(value, type) {
  try {
    switch (type) {
      case 'number':
        return Number(value);
      case 'boolean':
        return value === 'true' || value === '1';
      case 'json':
        return JSON.parse(value);
      case 'string':
      default:
        // 移除字符串两端的引号
        return value.replace(/^"(.*)"$/, '$1');
    }
  } catch (error) {
    console.error(`解析配置值失败: ${value}, type: ${type}`, error);
    return value;
  }
}

/**
 * 获取配置值
 * @param {string} key - 配置键（支持点号分隔，如 'app.name'）
 * @param {any} defaultValue - 默认值
 * @returns {Promise<any>} 配置值
 */
async function getConfig(key, defaultValue = null) {
  const config = await loadConfig();
  
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
}

/**
 * 获取所有配置
 * @param {boolean} forceRefresh - 是否强制刷新
 * @returns {Promise<Object>} 所有配置
 */
async function getAllConfig(forceRefresh = false) {
  return await loadConfig(forceRefresh);
}

/**
 * 获取公开配置（小程序可访问）
 * @returns {Promise<Object>} 公开配置
 */
async function getPublicConfig() {
  const connection = await db.pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT config_key, config_value, config_type FROM app_config WHERE is_public = TRUE'
    );
    
    const config = {};
    
    rows.forEach(row => {
      const keys = row.config_key.split('.');
      let current = config;
      
      // 防止原型污染攻击
      const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
      if (keys.some(key => dangerousKeys.includes(key))) {
        console.warn(`[AppConfig] 跳过危险的配置键: ${row.config_key}`);
        return;
      }
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      const lastKey = keys[keys.length - 1];
      current[lastKey] = parseConfigValue(row.config_value, row.config_type);
    });
    
    return config;
  } finally {
    connection.release();
  }
}

/**
 * 验证配置键是否安全
 * @param {string} key - 配置键
 * @returns {boolean} 是否安全
 */
function isValidConfigKey(key) {
  // 只允许字母、数字、点号、下划线
  const validPattern = /^[a-zA-Z0-9._]+$/;
  if (!validPattern.test(key)) {
    return false;
  }
  
  // 防止原型污染
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  const keys = key.split('.');
  if (keys.some(k => dangerousKeys.includes(k))) {
    return false;
  }
  
  // 限制嵌套深度
  if (keys.length > 5) {
    return false;
  }
  
  return true;
}

/**
 * 设置配置值
 * @param {string} key - 配置键
 * @param {any} value - 配置值
 * @param {string} updatedBy - 更新人
 * @returns {Promise<void>}
 */
async function setConfig(key, value, updatedBy = 'system') {
  // 验证配置键
  if (!isValidConfigKey(key)) {
    throw new Error(`无效的配置键: ${key}`);
  }
  
  const connection = await db.pool.getConnection();
  try {
    // 确定配置类型
    let configType = 'string';
    let configValue = value;
    
    if (typeof value === 'number') {
      configType = 'number';
      configValue = String(value);
    } else if (typeof value === 'boolean') {
      configType = 'boolean';
      configValue = value ? 'true' : 'false';
    } else if (typeof value === 'object') {
      configType = 'json';
      configValue = JSON.stringify(value);
    } else {
      configValue = `"${value}"`;
    }
    
    // 更新或插入配置
    await connection.execute(
      `INSERT INTO app_config (id, config_key, config_value, config_type, updated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE config_value = ?, config_type = ?, updated_at = NOW()`,
      [uuidv4(), key, configValue, configType, configValue, configType]
    );
    
    // 清除缓存
    clearCache();
    
    console.log(`[AppConfig] 配置已更新: ${key} = ${value} (by ${updatedBy})`);
  } finally {
    connection.release();
  }
}

/**
 * 批量更新配置
 * @param {Object} configs - 配置对象（扁平化的键值对）
 * @param {string} updatedBy - 更新人
 * @returns {Promise<void>}
 */
async function batchUpdateConfig(configs, updatedBy = 'system') {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();
    
    for (const [key, value] of Object.entries(configs)) {
      // 验证配置键
      if (!isValidConfigKey(key)) {
        console.warn(`[AppConfig] 跳过无效的配置键: ${key}`);
        continue;
      }
      
      let configType = 'string';
      let configValue = value;
      
      if (typeof value === 'number') {
        configType = 'number';
        configValue = String(value);
      } else if (typeof value === 'boolean') {
        configType = 'boolean';
        configValue = value ? 'true' : 'false';
      } else if (typeof value === 'object') {
        configType = 'json';
        configValue = JSON.stringify(value);
      } else {
        configValue = `"${value}"`;
      }
      
      await connection.execute(
        `INSERT INTO app_config (id, config_key, config_value, config_type, updated_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE config_value = ?, config_type = ?, updated_at = NOW()`,
        [uuidv4(), key, configValue, configType, configValue, configType]
      );
    }
    
    await connection.commit();
    
    // 清除缓存
    clearCache();
    
    console.log(`[AppConfig] 批量更新配置完成，共 ${Object.keys(configs).length} 项 (by ${updatedBy})`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 清除缓存
 */
function clearCache() {
  configCache = null;
  cacheTimestamp = 0;
}

/**
 * 获取小程序名称
 * @returns {Promise<string>}
 */
async function getAppName() {
  return await getConfig('app.name', 'WhisperAI');
}

/**
 * 获取水印配置
 * @returns {Promise<Object>}
 */
async function getWatermarkConfig() {
  const appName = await getAppName();
  const textTemplate = await getConfig('watermark.textTemplate', '{appName}\n扫码去水印');
  const qrUrl = await getConfig('watermark.qrUrl', 'https://your-domain.com/pay');
  const position = await getConfig('watermark.position', 'center');
  const opacity = await getConfig('watermark.opacity', 180);
  
  return {
    text: textTemplate.replace('{appName}', appName),
    qrUrl,
    position,
    opacity,
  };
}

module.exports = {
  loadConfig,
  getConfig,
  getAllConfig,
  getPublicConfig,
  setConfig,
  batchUpdateConfig,
  clearCache,
  getAppName,
  getWatermarkConfig,
};
