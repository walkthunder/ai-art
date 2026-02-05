/**
 * 系统配置路由
 */

const express = require('express');
const router = express.Router();
const appConfigService = require('../services/appConfigService');
const { verifyAdminAuth } = require('../middleware/adminAuth');

/**
 * 获取所有配置（管理后台）
 * GET /admin-api/config/all
 * 需要管理员权限
 */
router.get('/all', verifyAdminAuth, async (req, res) => {
  try {
    const config = await appConfigService.getAllConfig(true);
    
    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('[ConfigRoutes] 获取所有配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配置失败',
    });
  }
});

/**
 * 获取公开配置（小程序可访问）
 * GET /api/config/public
 */
router.get('/public', async (req, res) => {
  try {
    const config = await appConfigService.getPublicConfig();
    
    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('[ConfigRoutes] 获取公开配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配置失败',
    });
  }
});

/**
 * 更新配置（管理后台）
 * PUT /admin-api/config
 * 需要管理员权限
 */
router.put('/', verifyAdminAuth, async (req, res) => {
  try {
    const configs = req.body;
    const updatedBy = req.user?.username || req.user?.id || 'admin';
    
    // 验证请求体
    if (!configs || typeof configs !== 'object') {
      return res.status(400).json({
        success: false,
        message: '无效的配置数据',
      });
    }
    
    // 将嵌套对象扁平化
    const flatConfigs = flattenObject(configs);
    
    await appConfigService.batchUpdateConfig(flatConfigs, updatedBy);
    
    res.json({
      success: true,
      message: '配置更新成功',
    });
  } catch (error) {
    console.error('[ConfigRoutes] 更新配置失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '更新配置失败',
    });
  }
});

/**
 * 获取系统配置（兼容旧版）
 * GET /admin-api/config/system
 * 需要管理员权限
 */
router.get('/system', verifyAdminAuth, async (req, res) => {
  try {
    const config = await appConfigService.getAllConfig();
    
    // 兼容旧版格式
    const systemConfig = {
      initialBalance: config.system?.initialBalance || { freePuzzle: 3, freeTransform: 3 },
      invite: config.system?.invite || { rewardCount: 1 },
      task: config.system?.task || { timeoutMinutes: 60, maxRetries: 2 },
      order: config.system?.order || { timeoutHours: 24 },
      monitor: config.system?.monitor || { 
        orderFailureThreshold: 5, 
        callbackFailureThreshold: 5, 
        dbBackupThreshold: 10 
      },
    };
    
    res.json({
      success: true,
      data: systemConfig,
    });
  } catch (error) {
    console.error('[ConfigRoutes] 获取系统配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统配置失败',
    });
  }
});

/**
 * 更新系统配置（兼容旧版）
 * PUT /admin-api/config/system
 * 需要管理员权限
 */
router.put('/system', verifyAdminAuth, async (req, res) => {
  try {
    const newConfig = req.body;
    const updatedBy = req.user?.username || 'admin';
    
    // 转换为扁平化格式
    const flatConfigs = {};
    
    if (newConfig.initialBalance) {
      flatConfigs['system.initialBalance.freePuzzle'] = newConfig.initialBalance.freePuzzle;
      flatConfigs['system.initialBalance.freeTransform'] = newConfig.initialBalance.freeTransform;
    }
    
    if (newConfig.invite) {
      flatConfigs['system.invite.rewardCount'] = newConfig.invite.rewardCount;
    }
    
    if (newConfig.task) {
      flatConfigs['system.task.timeoutMinutes'] = newConfig.task.timeoutMinutes;
      flatConfigs['system.task.maxRetries'] = newConfig.task.maxRetries;
    }
    
    if (newConfig.order) {
      flatConfigs['system.order.timeoutHours'] = newConfig.order.timeoutHours;
    }
    
    if (newConfig.monitor) {
      flatConfigs['system.monitor.orderFailureThreshold'] = newConfig.monitor.orderFailureThreshold;
      flatConfigs['system.monitor.callbackFailureThreshold'] = newConfig.monitor.callbackFailureThreshold;
      flatConfigs['system.monitor.dbBackupThreshold'] = newConfig.monitor.dbBackupThreshold;
    }
    
    await appConfigService.batchUpdateConfig(flatConfigs, updatedBy);
    
    res.json({
      success: true,
      message: '配置更新成功',
    });
  } catch (error) {
    console.error('[ConfigRoutes] 更新系统配置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新系统配置失败',
    });
  }
});

/**
 * 将嵌套对象扁平化
 * @param {Object} obj - 嵌套对象
 * @param {string} prefix - 前缀
 * @returns {Object} 扁平化对象
 */
function flattenObject(obj, prefix = '') {
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  
  return result;
}

module.exports = router;
