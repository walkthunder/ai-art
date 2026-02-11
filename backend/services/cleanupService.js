/**
 * 定时清理服务
 * 负责清理超过30天的未付费记录
 * 以及关闭超时的支付订单
 * 以及修复未充值的已支付订单
 */

const cron = require('node-cron');
const generationService = require('./generationService');
const balanceService = require('./balanceService');
const db = require('../db/connection');
const { fixUnpaidOrders } = require('../scripts/fix-unpaid-orders');

/**
 * 恢复失败任务的余额
 * 查询24小时内失败的任务，如果余额未恢复则自动恢复
 * @returns {Promise<number>} 恢复的任务数
 */
async function restoreFailedTaskBalance() {
  const connection = await db.pool.getConnection();
  
  try {
    // 查询24小时内失败的任务，且余额未恢复
    const [failedTasks] = await connection.execute(
      `SELECT gh.id, gh.user_id, gh.mode
       FROM generation_history gh
       WHERE gh.status = 'failed'
       AND gh.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
       AND NOT EXISTS (
         SELECT 1 FROM usage_logs ul
         WHERE ul.reference_id = gh.id AND ul.action_type = 'restore'
       )
       LIMIT 100`
    );
    
    let restoredCount = 0;
    
    for (const task of failedTasks) {
      try {
        const result = await balanceService.restoreBalance(task.user_id, task.id, task.mode);
        
        if (result.success) {
          restoredCount++;
          console.log(`[CleanupService] 恢复失败任务余额: taskId=${task.id}, userId=${task.user_id}, mode=${task.mode}`);
        } else if (result.error === 'ALREADY_RESTORED') {
          // 已经恢复过，跳过
          console.log(`[CleanupService] 任务已恢复过: taskId=${task.id}`);
        } else if (result.error === 'NO_DECREMENT_FOUND') {
          // 没有扣减记录，可能是测试数据，跳过
          console.log(`[CleanupService] 任务无扣减记录: taskId=${task.id}`);
        }
      } catch (error) {
        console.error(`[CleanupService] 恢复任务余额失败: taskId=${task.id}, error:`, error.message);
      }
    }
    
    if (restoredCount > 0) {
      console.log(`[CleanupService] 恢复了 ${restoredCount} 个失败任务的余额`);
    }
    
    return restoredCount;
  } catch (error) {
    console.error('[CleanupService] 恢复失败任务余额失败:', error);
    throw error;
  } finally {
    connection.release();
  }
}

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
 * 每小时修复未充值订单
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

  // ✅ 每小时修复未充值的已支付订单
  const fixUnpaidTask = cron.schedule('0 * * * *', async () => {
    console.log('开始执行未充值订单修复任务...');
    try {
      const result = await fixUnpaidOrders();
      if (result.success && result.fixed > 0) {
        console.log(`未充值订单修复任务完成，修复了 ${result.fixed} 个订单`);
      }
    } catch (error) {
      console.error('未充值订单修复任务执行失败:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Shanghai"
  });

  // ✅ 每30分钟恢复失败任务的余额
  const restoreBalanceTask = cron.schedule('*/30 * * * *', async () => {
    console.log('开始执行失败任务余额恢复任务...');
    try {
      const restoredCount = await restoreFailedTaskBalance();
      if (restoredCount > 0) {
        console.log(`失败任务余额恢复任务完成，恢复了 ${restoredCount} 个任务`);
      }
    } catch (error) {
      console.error('失败任务余额恢复任务执行失败:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Shanghai"
  });

  console.log('定时清理任务已启动：');
  console.log('- 每天凌晨2点清理旧记录');
  console.log('- 每6小时关闭超时订单');
  console.log('- 每小时修复未充值订单');
  console.log('- 每30分钟恢复失败任务余额');
  
  return { cleanupTask, timeoutTask, fixUnpaidTask, restoreBalanceTask };
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
  restoreFailedTaskBalance,
  manualCleanup
};
