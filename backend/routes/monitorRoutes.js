/**
 * 监控路由模块
 * 提供系统监控指标查询接口
 */

const express = require('express');
const router = express.Router();
const monitorService = require('../services/monitorService');

/**
 * 获取监控指标
 * GET /api/monitor/metrics
 */
router.get('/metrics', (req, res) => {
  try {
    const metrics = monitorService.getMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('获取监控指标失败:', error);
    res.status(500).json({
      success: false,
      error: '获取监控指标失败',
      message: error.message
    });
  }
});

/**
 * 检查告警
 * GET /api/monitor/alerts
 */
router.get('/alerts', (req, res) => {
  try {
    const alerts = monitorService.checkAlerts();
    res.json({
      success: true,
      data: {
        hasAlerts: alerts.length > 0,
        count: alerts.length,
        alerts
      }
    });
  } catch (error) {
    console.error('检查告警失败:', error);
    res.status(500).json({
      success: false,
      error: '检查告警失败',
      message: error.message
    });
  }
});

/**
 * 重置指标（手动）
 * POST /api/monitor/reset
 */
router.post('/reset', (req, res) => {
  try {
    monitorService.resetMetrics();
    res.json({
      success: true,
      message: '指标已重置'
    });
  } catch (error) {
    console.error('重置指标失败:', error);
    res.status(500).json({
      success: false,
      error: '重置指标失败',
      message: error.message
    });
  }
});

/**
 * 记录监控事件（内部接口）
 * POST /api/monitor/record
 */
router.post('/record', (req, res) => {
  try {
    // 验证内部调用
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (internalSecret && req.headers['x-internal-secret'] !== internalSecret) {
      return res.status(403).json({
        success: false,
        error: '无权访问'
      });
    }
    
    const { event } = req.body;
    
    switch (event) {
      case 'orderCreated':
        monitorService.recordOrderCreated(true);
        break;
      case 'orderCreateFailed':
        monitorService.recordOrderCreated(false);
        break;
      case 'callbackSuccess':
        monitorService.recordCallback(true);
        break;
      case 'callbackFailed':
        monitorService.recordCallback(false);
        break;
      case 'dbBackup':
        monitorService.recordDbBackup();
        break;
      default:
        return res.status(400).json({
          success: false,
          error: '无效的事件类型'
        });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('记录监控事件失败:', error);
    res.status(500).json({
      success: false,
      error: '记录监控事件失败',
      message: error.message
    });
  }
});

/**
 * 健康检查
 * GET /api/monitor/health
 */
router.get('/health', (req, res) => {
  const alerts = monitorService.checkAlerts();
  const criticalAlerts = alerts.filter(a => a.level === 'critical');
  const metrics = monitorService.getMetrics();
  
  res.json({
    success: true,
    data: {
      status: criticalAlerts.length > 0 ? 'error' : alerts.length > 0 ? 'warning' : 'healthy',
      lastReset: metrics.lastReset,
      alerts: {
        total: alerts.length,
        critical: criticalAlerts.length,
        warning: alerts.filter(a => a.level === 'warning').length
      }
    }
  });
});

module.exports = router;
