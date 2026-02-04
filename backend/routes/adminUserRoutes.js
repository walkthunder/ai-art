/**
 * 用户管理路由模块（管理后台）
 * 管理普通用户的查询、筛选、导出等功能
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/adminAuth');
const { logOperation } = require('../middleware/adminLogger');
const db = require('../db/connection');
const { convertArrayTimesToCST, convertObjectTimesToCST } = require('../utils/timezone');

/**
 * 获取用户列表（支持分页、筛选）
 * GET /admin-api/users
 */
router.get('/', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { 
      page = 1, 
      pageSize = 20, 
      search = '', 
      paymentStatus = '', 
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // 构建查询条件
    const conditions = [];
    const params = [];
    
    if (search) {
      conditions.push('(u.openid LIKE ? OR u.id LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }
    
    if (paymentStatus) {
      conditions.push('u.payment_status = ?');
      params.push(paymentStatus);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // 验证排序字段
    const validSortFields = ['created_at', 'updated_at', 'payment_status'];
    const validSortOrders = ['ASC', 'DESC'];
    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const finalSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    const connection = await db.pool.getConnection();
    try {
      // 获取总数
      const [countRows] = await connection.execute(
        `SELECT COUNT(*) as total FROM users u ${whereClause}`,
        params
      );
      const total = countRows[0].total;
      
      // 获取用户列表（使用query而不是execute）
      const query = 'SELECT u.id, u.openid, u.payment_status, ' +
                    'u.created_at, u.updated_at ' +
                    'FROM users u ' +
                    whereClause + ' ' +
                    'ORDER BY u.' + finalSortBy + ' ' + finalSortOrder + ' ' +
                    'LIMIT ' + limit + ' OFFSET ' + offset;
      
      const [users] = await connection.query(query, params);
      
      // 为每个用户添加统计信息
      for (const user of users) {
        const [genCount] = await connection.execute(
          'SELECT COUNT(*) as count FROM generation_history WHERE user_id = ?',
          [user.id]
        );
        const [orderCount] = await connection.execute(
          'SELECT COUNT(*) as count FROM payment_orders WHERE user_id = ?',
          [user.id]
        );
        user.generation_count = genCount[0].count;
        user.order_count = orderCount[0].count;
      }
      
      // 转换时区为 CST (UTC+8)
      const usersWithCST = convertArrayTimesToCST(users);
      
      res.json({
        success: true,
        data: {
          users: usersWithCST,
          pagination: {
            page: parseInt(page),
            pageSize: limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败', message: error.message });
  }
});

/**
 * 获取用户详情
 * GET /admin-api/users/:id
 */
router.get('/:id', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const connection = await db.pool.getConnection();
    try {
      // 获取用户基本信息
      const [userRows] = await connection.execute(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
      
      if (userRows.length === 0) {
        return res.status(404).json({ error: '用户不存在' });
      }
      
      const user = userRows[0];
      
      // 获取用户生成历史
      const [generations] = await connection.execute(
        `SELECT id, mode, template_url, status, selected_image_url, created_at 
         FROM generation_history 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT 10`,
        [id]
      );
      
      // 获取用户订单记录
      const [orders] = await connection.execute(
        `SELECT id, amount, package_type, payment_method, status, transaction_id, created_at 
         FROM payment_orders 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT 10`,
        [id]
      );
      
      // 转换时区为 CST (UTC+8)
      const userWithCST = convertObjectTimesToCST(user);
      const generationsWithCST = convertArrayTimesToCST(generations);
      const ordersWithCST = convertArrayTimesToCST(orders);
      
      res.json({
        success: true,
        data: {
          user: userWithCST,
          generations: generationsWithCST,
          orders: ordersWithCST
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('获取用户详情失败:', error);
    res.status(500).json({ error: '获取用户详情失败', message: error.message });
  }
});

/**
 * 更新用户付费状态
 * PUT /admin-api/users/:id/payment-status
 */
router.put('/:id/payment-status', 
  authenticate, 
  authorize('super_admin'), 
  logOperation,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { paymentStatus } = req.body;
      
      if (!paymentStatus) {
        return res.status(400).json({ error: '缺少必要参数', message: '需要提供 paymentStatus' });
      }
      
      const validStatuses = ['free', 'basic', 'premium'];
      if (!validStatuses.includes(paymentStatus)) {
        return res.status(400).json({ 
          error: '无效的付费状态', 
          message: '付费状态必须是 free, basic 或 premium' 
        });
      }
      
      const connection = await db.pool.getConnection();
      try {
        const [result] = await connection.execute(
          'UPDATE users SET payment_status = ?, updated_at = NOW() WHERE id = ?',
          [paymentStatus, id]
        );
        
        if (result.affectedRows === 0) {
          return res.status(404).json({ error: '用户不存在' });
        }
        
        res.json({ 
          success: true, 
          message: '付费状态更新成功',
          data: { id, paymentStatus }
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('更新付费状态失败:', error);
      res.status(500).json({ error: '更新付费状态失败', message: error.message });
    }
  }
);

/**
 * 导出用户数据
 * GET /admin-api/users/export
 */
router.get('/export/data', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { search = '', paymentStatus = '' } = req.query;
    
    // 构建查询条件
    const conditions = [];
    const params = [];
    
    if (search) {
      conditions.push('(u.openid LIKE ? OR u.id LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }
    
    if (paymentStatus) {
      conditions.push('u.payment_status = ?');
      params.push(paymentStatus);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const connection = await db.pool.getConnection();
    try {
      const [users] = await connection.execute(
        `SELECT u.id, u.openid, u.payment_status,
                u.created_at, u.updated_at,
                COUNT(DISTINCT g.id) as generation_count,
                COUNT(DISTINCT po.id) as order_count,
                SUM(CASE WHEN po.status = 'paid' THEN po.amount ELSE 0 END) as total_spent
         FROM users u
         LEFT JOIN generation_history g ON u.id = g.user_id
         LEFT JOIN payment_orders po ON u.id = po.user_id
         ${whereClause}
         GROUP BY u.id
         ORDER BY u.created_at DESC`,
        params
      );
      
      // 转换为CSV格式
      const csvHeader = 'ID,OpenID,付费状态,生成次数,订单数量,总消费,注册时间\n';
      const csvRows = users.map(u => 
        `${u.id},${u.openid || ''},${u.payment_status},${u.generation_count},${u.order_count},${u.total_spent || 0},${u.created_at}`
      ).join('\n');
      
      const csv = csvHeader + csvRows;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=users_${Date.now()}.csv`);
      res.send('\uFEFF' + csv); // 添加BOM以支持Excel正确显示中文
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('导出用户数据失败:', error);
    res.status(500).json({ error: '导出用户数据失败', message: error.message });
  }
});

module.exports = router;
