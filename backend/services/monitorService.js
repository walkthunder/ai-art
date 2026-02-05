/**
 * 监控服务
 * 收集关键指标并提供告警检查
 * 
 * 注意：当前使用内存存储指标，生产环境建议使用 Redis 或专业监控系统
 */

// 内存中的指标
const metrics = {
  orderCreated: 0,
  orderCreateFailed: 0,
  callbackSuccess: 0,
  callbackFailed: 0,
  dbBackup: 0,
  lastReset: new Date()
};

/**
 * 记录订单创建
 * @param {boolean} success - 是否成功
 */
function recordOrderCreated(success = true) {
  if (success) {
    metrics.orderCreated++;
  } else {
    metrics.orderCreateFailed++;
  }
}

/**
 * 记录回调处理
 * @param {boolean} success - 是否成功
 */
function recordCallback(success = true) {
  if (success) {
    metrics.callbackSuccess++;
  } else {
    metrics.callbackFailed++;
  }
}

/**
 * 记录数据库备份
 */
function recordDbBackup() {
  metrics.dbBackup++;
}

/**
 * 获取指标
 * @returns {Object} 指标对象
 */
function getMetrics() {
  const totalOrders = metrics.orderCreated + metrics.orderCreateFailed;
  const totalCallbacks = metrics.callbackSuccess + metrics.callbackFailed;
  
  return {
    ...metrics,
    orderCreateFailureRate: totalOrders > 0 
      ? (metrics.orderCreateFailed / totalOrders * 100).toFixed(2) + '%'
      : '0%',
    callbackFailureRate: totalCallbacks > 0
      ? (metrics.callbackFailed / totalCallbacks * 100).toFixed(2) + '%'
      : '0%',
    lastReset: metrics.lastReset
  };
}

/**
 * 检查告警阈值
 * @returns {Array} 告警列表
 */
function checkAlerts() {
  const totalOrders = metrics.orderCreated + metrics.orderCreateFailed;
  const totalCallbacks = metrics.callbackSuccess + metrics.callbackFailed;
  
  const alerts = [];
  
  // 订单创建失败率 > 5%（至少10个订单）
  if (totalOrders >= 10 && metrics.orderCreateFailed / totalOrders > 0.05) {
    alerts.push({
      level: 'warning',
      type: 'order_create_failure',
      message: `订单创建失败率过高: ${(metrics.orderCreateFailed / totalOrders * 100).toFixed(2)}%`,
      data: {
        total: totalOrders,
        failed: metrics.orderCreateFailed,
        rate: (metrics.orderCreateFailed / totalOrders * 100).toFixed(2)
      }
    });
  }
  
  // 回调处理失败率 > 5%（至少10个回调）
  if (totalCallbacks >= 10 && metrics.callbackFailed / totalCallbacks > 0.05) {
    alerts.push({
      level: 'warning',
      type: 'callback_failure',
      message: `回调处理失败率过高: ${(metrics.callbackFailed / totalCallbacks * 100).toFixed(2)}%`,
      data: {
        total: totalCallbacks,
        failed: metrics.callbackFailed,
        rate: (metrics.callbackFailed / totalCallbacks * 100).toFixed(2)
      }
    });
  }
  
  // 数据库备份次数 > 10（1小时内）
  if (metrics.dbBackup > 10) {
    alerts.push({
      level: 'critical',
      type: 'db_backup_frequent',
      message: `数据库故障频繁，备份次数: ${metrics.dbBackup}`,
      data: {
        backupCount: metrics.dbBackup,
        timeSinceReset: Date.now() - metrics.lastReset.getTime()
      }
    });
  }
  
  return alerts;
}

/**
 * 重置指标（每小时重置一次）
 */
function resetMetrics() {
  metrics.orderCreated = 0;
  metrics.orderCreateFailed = 0;
  metrics.callbackSuccess = 0;
  metrics.callbackFailed = 0;
  metrics.dbBackup = 0;
  metrics.lastReset = new Date();
  
  console.log('[MonitorService] 指标已重置');
}

/**
 * 启动定时重置任务
 */
function startMetricsReset() {
  // 每小时重置一次指标
  setInterval(() => {
    const alerts = checkAlerts();
    
    // 如果有告警，记录日志
    if (alerts.length > 0) {
      console.warn('[MonitorService] 检测到告警:');
      alerts.forEach(alert => {
        console.warn(`  [${alert.level.toUpperCase()}] ${alert.message}`);
      });
    }
    
    // 重置指标
    resetMetrics();
  }, 60 * 60 * 1000); // 1小时
  
  console.log('[MonitorService] 指标重置任务已启动（每小时执行）');
}

module.exports = {
  recordOrderCreated,
  recordCallback,
  recordDbBackup,
  getMetrics,
  checkAlerts,
  resetMetrics,
  startMetricsReset
};
