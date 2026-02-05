/**
 * 日志查询路由
 */

const express = require('express');
const router = express.Router();
const db = require('../db/connection');

/**
 * 获取错误日志
 * GET /api/admin/logs/errors
 */
router.get('/errors', async (req, res) => {
  const connection = await db.pool.getConnection();
  
  try {
    const {
      page = 1,
      pageSize = 20,
      startDate,
      endDate,
      level,
      search,
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // 构建查询条件
    let whereConditions = [];
    let params = [];
    
    if (startDate && endDate) {
      whereConditions.push('DATE(created_at) BETWEEN ? AND ?');
      params.push(startDate, endDate);
    }
    
    if (level && level !== 'all') {
      whereConditions.push('UPPER(level) = UPPER(?)');
      params.push(level);
    }
    
    if (search) {
      whereConditions.push('error_message LIKE ?');
      params.push(`%${search}%`);
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // 查询总数
    const [countResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM error_logs ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    
    // 查询日志 - 适配实际表结构
    const [logs] = await connection.execute(
      `SELECT 
        id,
        level,
        error_message,
        context as stack_trace,
        created_at,
        NULL as user_id
       FROM error_logs ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    );
    
    res.json({
      success: true,
      data: {
        logs,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      },
    });
  } catch (error) {
    console.error('[LogRoutes] 获取错误日志失败:', error);
    res.status(500).json({
      success: false,
      message: '获取错误日志失败',
      error: error.message,
    });
  } finally {
    connection.release();
  }
});

/**
 * 获取使用日志
 * GET /api/admin/logs/usage
 */
router.get('/usage', async (req, res) => {
  const connection = await db.pool.getConnection();
  
  try {
    const {
      page = 1,
      pageSize = 20,
      startDate,
      endDate,
      actionType,
      userId,
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // 构建查询条件
    let whereConditions = [];
    let params = [];
    
    if (startDate && endDate) {
      whereConditions.push('DATE(created_at) BETWEEN ? AND ?');
      params.push(startDate, endDate);
    }
    
    if (actionType && actionType !== 'all') {
      whereConditions.push('action_type = ?');
      params.push(actionType);
    }
    
    if (userId) {
      whereConditions.push('user_id LIKE ?');
      params.push(`%${userId}%`);
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // 查询总数
    const [countResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM usage_logs ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    
    // 查询日志 - 适配实际表结构
    const [logs] = await connection.execute(
      `SELECT 
        id,
        user_id,
        action_type,
        amount,
        mode,
        reference_id,
        reason as notes,
        created_at
       FROM usage_logs ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    );
    
    res.json({
      success: true,
      data: {
        logs,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      },
    });
  } catch (error) {
    console.error('[LogRoutes] 获取使用日志失败:', error);
    res.status(500).json({
      success: false,
      message: '获取使用日志失败',
      error: error.message,
    });
  } finally {
    connection.release();
  }
});

module.exports = router;
