/**
 * 定时清理服务
 * 负责清理超过30天的未付费记录
 * 以及关闭超时的支付订单
 * 以及修复未充值的已支付订单
 * 以及轮询财神视频生成任务状态
 */

const cron = require('node-cron');
const generationService = require('./generationService');
const balanceService = require('./balanceService');
const videoGenerationService = require('./videoGenerationService');
const userServiceV2 = require('./userServiceV2');
const db = require('../db/connection');
const { fixUnpaidOrders } = require('../scripts/fix-unpaid-orders');

/**
 * 轮询财神视频任务状态
 * 查询所有处理中的财神任务，更新其状态
 * @returns {Promise<Object>} 轮询结果统计
 */
async function pollCaishenVideoTasks() {
  const connection = await db.pool.getConnection();
  
  try {
    // 查询所有处理中的财神任务（1小时内创建的）
    const [tasks] = await connection.execute(
      `SELECT gh.id, gh.user_id, gh.task_ids, gh.created_at
       FROM generation_history gh
       WHERE gh.mode = 'caishen'
       AND gh.status IN ('pending', 'processing')
       AND gh.created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
       ORDER BY gh.created_at ASC
       LIMIT 50`
    );
    
    if (tasks.length === 0) {
      return { total: 0, succeeded: 0, failed: 0, processing: 0 };
    }
    
    console.log(`[CleanupService] 开始轮询 ${tasks.length} 个财神视频任务...`);
    
    let succeeded = 0;
    let failed = 0;
    let processing = 0;
    
    for (const task of tasks) {
      try {
        // 检查任务是否超时（超过1小时）
        const taskAge = Date.now() - new Date(task.created_at).getTime();
        const maxAge = 60 * 60 * 1000; // 1小时
        
        if (taskAge > maxAge) {
          console.log(`[CleanupService] 任务 ${task.id} 已超时 (${Math.round(taskAge / 60000)} 分钟)`);
          
          // 检查是否已经处理过
          const [existing] = await connection.execute(
            'SELECT status FROM generation_history WHERE id = ?',
            [task.id]
          );
          
          if (existing[0].status !== 'failed') {
            // 更新数据库
            await generationService.updateGenerationHistory(task.id, {
              status: 'failed'
            });
            
            // 恢复用户余额
            await balanceService.restoreBalance(task.user_id, task.id, 'caishen');
            
            failed++;
            console.log(`[CleanupService] ❌ 任务 ${task.id} 超时，已标记为失败并恢复余额`);
          }
          
          continue;
        }
        
        // 解析 task_ids，支持多种格式
        let taskIds = [];
        try {
          if (typeof task.task_ids === 'string') {
            // 尝试解析JSON字符串
            taskIds = JSON.parse(task.task_ids);
          } else if (Array.isArray(task.task_ids)) {
            // 已经是数组
            taskIds = task.task_ids;
          }
        } catch (parseError) {
          console.error(`[CleanupService] 任务 ${task.id} task_ids 解析失败:`, task.task_ids);
          continue;
        }
        
        if (!Array.isArray(taskIds) || taskIds.length === 0) {
          console.log(`[CleanupService] 任务 ${task.id} 没有有效的 taskId，跳过`);
          continue;
        }
        
        const arkTaskId = taskIds[0];
        
        // 查询火山引擎任务状态
        let status;
        try {
          status = await videoGenerationService.getVideoTaskStatus(arkTaskId);
          console.log(`[CleanupService] 任务 ${arkTaskId} 状态: ${status.status}`);
        } catch (queryError) {
          // 如果任务不存在（404），标记为失败
          if (queryError.message.includes('not found') || queryError.message.includes('404')) {
            console.log(`[CleanupService] 任务 ${arkTaskId} 不存在（404），标记为失败`);
            
            // 检查是否已经处理过
            const [existing] = await connection.execute(
              'SELECT status FROM generation_history WHERE id = ?',
              [task.id]
            );
            
            if (existing[0].status !== 'failed') {
              // 更新数据库
              await generationService.updateGenerationHistory(task.id, {
                status: 'failed'
              });
              
              // 恢复用户余额
              await balanceService.restoreBalance(task.user_id, task.id, 'caishen');
              
              failed++;
              console.log(`[CleanupService] ❌ 任务 ${task.id} 不存在，已标记为失败并恢复余额`);
            }
            
            continue;
          }
          
          // 其他错误，抛出让外层catch处理
          throw queryError;
        }
        
        // 任务成功
        if (status.status === 'succeeded' && status.videoUrl) {
          // 检查是否已经处理过
          const [existing] = await connection.execute(
            'SELECT status, generated_image_urls FROM generation_history WHERE id = ?',
            [task.id]
          );
          
          if (existing[0].status === 'completed') {
            console.log(`[CleanupService] 任务 ${task.id} 已完成，跳过`);
            continue;
          }
          
          // 获取用户付费状态
          const user = await userServiceV2.getUserById(task.user_id);
          const paymentStatus = user?.payment_status || 'free';
          
          // 为免费用户添加水印
          let finalVideoUrl = status.videoUrl;
          if (paymentStatus === 'free') {
            try {
              finalVideoUrl = await videoGenerationService.applyVideoWatermarkIfNeeded(
                status.videoUrl,
                paymentStatus
              );
              console.log(`[CleanupService] 任务 ${task.id} 水印添加完成`);
            } catch (watermarkError) {
              console.error(`[CleanupService] 任务 ${task.id} 水印添加失败:`, watermarkError.message);
            }
          }
          
          // 更新数据库
          await generationService.updateGenerationHistory(task.id, {
            generatedImageUrls: [finalVideoUrl],
            status: 'completed'
          });
          
          succeeded++;
          console.log(`[CleanupService] ✅ 任务 ${task.id} 完成`);
        }
        // 任务失败
        else if (status.status === 'failed') {
          // 检查是否已经处理过
          const [existing] = await connection.execute(
            'SELECT status FROM generation_history WHERE id = ?',
            [task.id]
          );
          
          if (existing[0].status === 'failed') {
            console.log(`[CleanupService] 任务 ${task.id} 已标记为失败，跳过`);
            continue;
          }
          
          // 更新数据库
          await generationService.updateGenerationHistory(task.id, {
            status: 'failed'
          });
          
          // 恢复用户余额
          await balanceService.restoreBalance(task.user_id, task.id, 'caishen');
          
          failed++;
          console.log(`[CleanupService] ❌ 任务 ${task.id} 失败，已恢复余额`);
        }
        // 任务处理中
        else {
          processing++;
        }
        
      } catch (error) {
        console.error(`[CleanupService] 轮询任务 ${task.id} 失败:`, error.message);
      }
    }
    
    const result = {
      total: tasks.length,
      succeeded,
      failed,
      processing
    };
    
    if (succeeded > 0 || failed > 0) {
      console.log(`[CleanupService] 轮询完成: 总计 ${result.total}, 成功 ${succeeded}, 失败 ${failed}, 处理中 ${processing}`);
    }
    
    return result;
    
  } catch (error) {
    console.error('[CleanupService] 轮询财神视频任务失败:', error);
    throw error;
  } finally {
    connection.release();
  }
}

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

  // ✅ 每分钟轮询财神视频任务状态
  const pollCaishenTask = cron.schedule('* * * * *', async () => {
    try {
      const result = await pollCaishenVideoTasks();
      // 只在有任务更新时输出日志
      if (result.succeeded > 0 || result.failed > 0) {
        console.log(`财神视频任务轮询完成: 成功 ${result.succeeded}, 失败 ${result.failed}`);
      }
    } catch (error) {
      console.error('财神视频任务轮询失败:', error);
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
  console.log('- 每分钟轮询财神视频任务状态');
  
  return { cleanupTask, timeoutTask, fixUnpaidTask, restoreBalanceTask, pollCaishenTask };
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
  pollCaishenVideoTasks,
  manualCleanup
};
