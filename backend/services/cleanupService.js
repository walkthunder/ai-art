/**
 * 定时清理服务
 * 负责清理超过30天的未付费记录
 * 以及关闭超时的支付订单
 */

const cron = require('node-cron');
const generationService = require('./generationService');
const db = require('../db/connection');

/**
 * 关闭超时订单
 * 超过24小时未支付的订单自动关闭
 * @returns {Promise<number>} 关闭的订单数
 */
async function closeTimeoutOrders() {
  const connection = await db.pool.getConnection();
  
  try {
    const [result] = await connection.execute(
      `UPDATE payment_orders 
       SET status = 'failed', updated_at = NOW()
       WHERE status = 'pending' 
       AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    
    const closedCount = result.affectedRows;
    
    if (closedCount > 0) {
      console.log(`[CleanupService] 关闭了 ${closedCount} 个超时订单`);
    }
    
    return closedCount;
  } catch (error) {
    console.error('[CleanupService] 关闭超时订单失败:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 启动定时清理任务
 * 每天凌晨2点执行清理任务
 * 每6小时关闭超时订单
 */
function startCleanupSchedule() {
  // 使用cron表达式: 0 2 * * * 表示每天凌晨2点执行
  const cleanupTask = cron.schedule('0 2 * * *', async () => {
    console.log('开始执行定时清理任务...');
    try {
      const deletedCount = await generationService.deleteOldUnpaidRecords(30);
      console.log(`定时清理任务完成，删除了 ${deletedCount} 条记录`);
    } catch (error) {
      console.error('定时清理任务执行失败:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Shanghai" // 使用中国时区
  });

  // 每6小时关闭超时订单
  const timeoutTask = cron.schedule('0 */6 * * *', async () => {
    console.log('开始执行超时订单关闭任务...');
    try {
      const closedCount = await closeTimeoutOrders();
      if (closedCount > 0) {
        console.log(`超时订单关闭任务完成，关闭了 ${closedCount} 个订单`);
      }
    } catch (error) {
      console.error('超时订单关闭任务执行失败:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Shanghai"
  });

  console.log('定时清理任务已启动：');
  console.log('- 每天凌晨2点清理旧记录');
  console.log('- 每6小时关闭超时订单');
  
  return { cleanupTask, timeoutTask };
}

/**
 * 手动执行清理任务
 * @param {number} days 清理超过指定天数的记录(默认30天)
 * @returns {Promise<number>} 删除的记录数
 */
async function manualCleanup(days = 30) {
  console.log(`手动执行清理任务，清理超过 ${days} 天的未付费记录...`);
  try {
    const deletedCount = await generationService.deleteOldUnpaidRecords(days);
    console.log(`手动清理任务完成，删除了 ${deletedCount} 条记录`);
    return deletedCount;
  } catch (error) {
    console.error('手动清理任务执行失败:', error);
    throw error;
  }
}

module.exports = {
  startCleanupSchedule,
  closeTimeoutOrders,
  manualCleanup
};
