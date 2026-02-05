const express = require('express');
const router = express.Router();
const db = require('../db/connection');

/**
 * 获取回调日志列表
 */
router.get('/logs', async (req, res) => {
  try {
    const { status, page = 1, pageSize = 20, startDate, endDate } = req.query;
    
    const offset = (page - 1) * pageSize;
    let whereConditions = [];
    let params = [];
    
    if (status) {
      whereConditions.push('status = ?');
      params.push(status);
    }
    
    if (startDate) {
      whereConditions.push('created_at >= ?');
      params.push(startDate);
    }
    
    if (endDate) {
      whereConditions.push('created_at <= ?');
      params.push(endDate);
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // 查询总数
    const [countResult] = await db.pool.execute(
      `SELECT COUNT(*) as total FROM payment_callback_logs ${whereClause}`,
      params
    );
    
    const total = countResult[0].total;
    
    // 查询列表
    const [logs] = await db.pool.execute(
      `SELECT * FROM payment_callback_logs 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    
    res.json({
      success: true,
      data: {
        list: logs,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('[CallbackLog] 查询失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 获取回调统计
 */
router.get('/stats', async (req, res) => {
  try {
    const [stats] = await db.pool.execute(`
      SELECT 
        status,
        COUNT(*) as count,
        DATE(created_at) as date
      FROM payment_callback_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY status, DATE(created_at)
      ORDER BY date DESC, status
    `);
    
    // 获取今日统计
    const [todayStats] = await db.pool.execute(`
      SELECT 
        status,
        COUNT(*) as count
      FROM payment_callback_logs
      WHERE DATE(created_at) = CURDATE()
      GROUP BY status
    `);
    
    // 获取失败未解决的数量
    const [unresolvedCount] = await db.pool.execute(`
      SELECT COUNT(*) as count
      FROM payment_callback_logs
      WHERE status IN ('decrypt_failed', 'process_failed')
      AND resolved_at IS NULL
    `);
    
    res.json({
      success: true,
      data: {
        history: stats,
        today: todayStats,
        unresolved: unresolvedCount[0].count
      }
    });
  } catch (error) {
    console.error('[CallbackLog] 统计失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 标记为已解决
 */
router.post('/resolve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.pool.execute(
      'UPDATE payment_callback_logs SET resolved_at = NOW() WHERE id = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: '已标记为解决'
    });
  } catch (error) {
    console.error('[CallbackLog] 标记失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 重试失败的回调
 */
router.post('/retry/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 查询日志详情
    const [logs] = await db.pool.execute(
      'SELECT * FROM payment_callback_logs WHERE id = ?',
      [id]
    );
    
    if (logs.length === 0) {
      return res.status(404).json({
        success: false,
        message: '日志不存在'
      });
    }
    
    const log = logs[0];
    
    // 如果有订单号，尝试重新处理
    if (log.out_trade_no) {
      // 查询订单
      const [orders] = await db.pool.execute(
        'SELECT * FROM payment_orders WHERE out_trade_no = ?',
        [log.out_trade_no]
      );
      
      if (orders.length > 0 && orders[0].status === 'paid') {
        // 订单已支付，检查是否已充值
        const [usageLogs] = await db.pool.execute(
          `SELECT * FROM usage_logs 
           WHERE reference_id = ? AND action_type = 'increment'`,
          [orders[0].id]
        );
        
        if (usageLogs.length === 0) {
          // 未充值，需要手动处理
          return res.json({
            success: false,
            message: '订单已支付但未充值，请使用手动补单功能',
            data: { order: orders[0] }
          });
        } else {
          // 已充值，标记为已解决
          await db.pool.execute(
            'UPDATE payment_callback_logs SET resolved_at = NOW(), retry_count = retry_count + 1 WHERE id = ?',
            [id]
          );
          
          return res.json({
            success: true,
            message: '订单已充值，已标记为解决'
          });
        }
      }
    }
    
    // 更新重试次数
    await db.pool.execute(
      'UPDATE payment_callback_logs SET retry_count = retry_count + 1 WHERE id = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: '重试次数已更新，请手动处理'
    });
  } catch (error) {
    console.error('[CallbackLog] 重试失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
