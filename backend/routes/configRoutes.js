/**
 * 系统配置路由
 */

const express = require('express');
const router = express.Router();

// 默认配置
const defaultConfig = {
  initialBalance: {
    freePuzzle: 3,
    freeTransform: 3,
  },
  invite: {
    rewardCount: 1,
  },
  task: {
    timeoutMinutes: 60,
    maxRetries: 2,
  },
  order: {
    timeoutHours: 24,
  },
  monitor: {
    orderFailureThreshold: 5,
    callbackFailureThreshold: 5,
    dbBackupThreshold: 10,
  },
};

// 内存存储配置（生产环境建议使用数据库或Redis）
let systemConfig = { ...defaultConfig };

/**
 * 获取系统配置
 * GET /api/admin/config/system
 */
router.get('/system', async (req, res) => {
  try {
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
 * 更新系统配置
 * PUT /api/admin/config/system
 */
router.put('/system', async (req, res) => {
  try {
    const newConfig = req.body;
    
    // 验证配置格式
    if (!newConfig.initialBalance || !newConfig.invite || !newConfig.task || !newConfig.order || !newConfig.monitor) {
      return res.status(400).json({
        success: false,
        message: '配置格式不正确',
      });
    }
    
    // 更新配置
    systemConfig = {
      ...systemConfig,
      ...newConfig,
    };
    
    console.log('[ConfigRoutes] 系统配置已更新:', systemConfig);
    
    res.json({
      success: true,
      message: '配置更新成功',
      data: systemConfig,
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
 * 重置系统配置为默认值
 * POST /api/admin/config/reset
 */
router.post('/reset', async (req, res) => {
  try {
    systemConfig = { ...defaultConfig };
    
    console.log('[ConfigRoutes] 系统配置已重置为默认值');
    
    res.json({
      success: true,
      message: '配置已重置',
      data: systemConfig,
    });
  } catch (error) {
    console.error('[ConfigRoutes] 重置系统配置失败:', error);
    res.status(500).json({
      success: false,
      message: '重置系统配置失败',
    });
  }
});

/**
 * 导出配置供其他模块使用
 */
function getConfig() {
  return systemConfig;
}

module.exports = router;
module.exports.getConfig = getConfig;
