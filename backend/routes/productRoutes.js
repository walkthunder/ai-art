/**
 * 产品订单路由模块
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const userServiceV2 = require('../services/userServiceV2');
const generationService = require('../services/generationService');
const { exportOrdersExcel } = require('../services/pythonBridge');
const { validateRequest, validateCreateProductOrderParams } = require('../utils/validation');

// 创建产品订单
router.post('/create', validateRequest(validateCreateProductOrderParams), async (req, res) => {
  try {
    const { userId, generationId, productType, productPrice, shippingName, shippingPhone, shippingAddress, imageUrl } = req.body;
    
    if (!userId || !generationId || !productType || !productPrice || !shippingName || !shippingPhone || !shippingAddress || !imageUrl) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供所有必要的订单信息' });
    }
    
    const validProductTypes = ['crystal', 'scroll'];
    if (!validProductTypes.includes(productType)) {
      return res.status(400).json({ error: '无效的产品类型', message: '产品类型必须是 crystal 或 scroll' });
    }
    
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(shippingPhone)) {
      return res.status(400).json({ error: '无效的手机号', message: '请输入正确的11位手机号' });
    }
    
    const user = await userServiceV2.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在', message: '未找到对应的用户' });
    }
    
    const generationRecord = await generationService.getGenerationHistoryById(generationId);
    if (!generationRecord) {
      return res.status(404).json({ error: '生成记录不存在', message: '未找到对应的生成记录' });
    }
    
    const orderId = uuidv4();
    const connection = await db.pool.getConnection();
    
    try {
      await connection.execute(
        `INSERT INTO product_orders 
        (id, user_id, generation_id, product_type, product_price, shipping_name, shipping_phone, shipping_address, status, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [orderId, userId, generationId, productType, productPrice, shippingName, shippingPhone, shippingAddress, 'pending']
      );
      
      console.log(`创建产品订单成功: ${orderId}`);
      
      res.json({ 
        success: true, 
        data: {
          orderId, productType, productPrice, status: 'pending',
          message: '订单创建成功，我们将在1-2个工作日内与您联系'
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('创建产品订单失败:', error);
    res.status(500).json({ error: '创建产品订单失败', message: error.message });
  }
});

// 查询用户的所有产品订单 (必须放在 /:orderId 之前)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit } = req.query;
    
    const connection = await db.pool.getConnection();
    try {
      const limitValue = limit ? parseInt(limit) : 10;
      const [rows] = await connection.execute(
        `SELECT po.*, gh.selected_image_url 
        FROM product_orders po 
        LEFT JOIN generation_history gh ON po.generation_id = gh.id 
        WHERE po.user_id = ? 
        ORDER BY po.created_at DESC 
        LIMIT ?`,
        [userId, limitValue]
      );
      
      const orders = rows.map(row => ({
        orderId: row.id, userId: row.user_id, generationId: row.generation_id,
        productType: row.product_type, productPrice: parseFloat(row.product_price),
        shippingName: row.shipping_name, shippingPhone: row.shipping_phone,
        shippingAddress: row.shipping_address, status: row.status,
        imageUrl: row.selected_image_url,
        createdAt: row.created_at, updatedAt: row.updated_at
      }));
      
      res.json({ success: true, data: orders });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('查询用户产品订单失败:', error);
    res.status(500).json({ error: '查询用户产品订单失败', message: error.message });
  }
});

// 查询产品订单
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const connection = await db.pool.getConnection();
    try {
      const [rows] = await connection.execute('SELECT * FROM product_orders WHERE id = ?', [orderId]);
      
      if (rows.length === 0) {
        return res.status(404).json({ error: '订单不存在', message: '未找到对应的产品订单' });
      }
      
      const order = rows[0];
      res.json({ 
        success: true, 
        data: {
          orderId: order.id, userId: order.user_id, generationId: order.generation_id,
          productType: order.product_type, productPrice: parseFloat(order.product_price),
          shippingName: order.shipping_name, shippingPhone: order.shipping_phone,
          shippingAddress: order.shipping_address, status: order.status,
          createdAt: order.created_at, updatedAt: order.updated_at
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('查询产品订单失败:', error);
    res.status(500).json({ error: '查询产品订单失败', message: error.message });
  }
});

// 更新产品订单状态
router.put('/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    if (!orderId || !status) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 orderId 和 status 参数' });
    }
    
    const validStatuses = ['pending', 'paid', 'exported', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '无效的状态值' });
    }
    
    const connection = await db.pool.getConnection();
    try {
      const [result] = await connection.execute(
        'UPDATE product_orders SET status = ?, updated_at = NOW() WHERE id = ?',
        [status, orderId]
      );
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: '订单不存在', message: '未找到对应的产品订单' });
      }
      
      res.json({ success: true, message: '订单状态更新成功', data: { orderId, status } });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('更新产品订单状态失败:', error);
    res.status(500).json({ error: '更新产品订单状态失败', message: error.message });
  }
});

// 导出产品订单Excel (管理员)
router.post('/export-excel', async (req, res) => {
  try {
    const { status, startDate, endDate } = req.body;
    
    const connection = await db.pool.getConnection();
    try {
      let query = `
        SELECT po.id as order_id, po.shipping_name as user_name, po.shipping_phone as phone,
        po.shipping_address as address, po.product_type, gh.selected_image_url as image_url,
        po.created_at as create_time
        FROM product_orders po
        LEFT JOIN generation_history gh ON po.generation_id = gh.id
        WHERE 1=1
      `;
      
      const queryParams = [];
      
      if (status) {
        query += ' AND po.status = ?';
        queryParams.push(status);
      }
      if (startDate) {
        query += ' AND po.created_at >= ?';
        queryParams.push(startDate);
      }
      if (endDate) {
        query += ' AND po.created_at <= ?';
        queryParams.push(endDate);
      }
      
      query += ' ORDER BY po.created_at DESC';
      
      const [rows] = await connection.execute(query, queryParams);
      
      if (rows.length === 0) {
        return res.json({ success: true, message: '没有符合条件的订单', data: { orderCount: 0 } });
      }
      
      const orders = rows.map(row => ({
        order_id: row.order_id, user_name: row.user_name, phone: row.phone,
        address: row.address, product_type: row.product_type,
        image_url: row.image_url || '', create_time: row.create_time
      }));
      
      const result = await exportOrdersExcel(orders);
      
      if (!result.success) {
        return res.status(500).json({ error: 'Excel导出失败', message: result.message });
      }
      
      const filePath = result.output_path;
      
      if (!fs.existsSync(filePath)) {
        return res.status(500).json({ error: 'Excel文件不存在' });
      }
      
      // 更新订单状态为已导出
      if (status !== 'exported') {
        const orderIds = orders.map(o => o.order_id);
        if (orderIds.length > 0) {
          const placeholders = orderIds.map(() => '?').join(',');
          await connection.execute(
            `UPDATE product_orders SET status = 'exported', updated_at = NOW() WHERE id IN (${placeholders})`,
            orderIds
          );
        }
      }
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent('product_orders.xlsx')}"`);
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      fileStream.on('end', () => {
        try { fs.unlinkSync(filePath); } catch (e) { console.error('删除临时文件失败:', e); }
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('导出产品订单Excel失败:', error);
    res.status(500).json({ error: '导出产品订单Excel失败', message: error.message });
  }
});

module.exports = router;
