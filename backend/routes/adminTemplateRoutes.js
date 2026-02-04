/**
 * 管理后台 - 模板管理路由
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/adminAuth');
const { logOperation } = require('../middleware/adminLogger');
const db = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

/**
 * 获取所有模板
 * GET /admin-api/templates
 */
router.get('/', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { mode } = req.query;
    
    const connection = await db.pool.getConnection();
    try {
      let query = 'SELECT * FROM templates WHERE 1=1';
      const params = [];
      
      if (mode) {
        query += ' AND mode = ?';
        params.push(mode);
      }
      
      query += ' ORDER BY sort_order ASC, created_at DESC';
      
      const [rows] = await connection.execute(query, params);
      res.json({ success: true, data: rows });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('获取模板列表失败:', error);
    res.status(500).json({ error: '获取模板列表失败', message: error.message });
  }
});

/**
 * 创建模板
 * POST /admin-api/templates
 */
router.post('/', 
  authenticate, 
  authorize('super_admin'), 
  logOperation,
  async (req, res) => {
    try {
      const { mode, code, name, imageUrl, prompt, category, sortOrder, status } = req.body;
      
      if (!mode || !code || !name || !imageUrl) {
        return res.status(400).json({ 
          error: '缺少必要参数', 
          message: '需要提供 mode, code, name 和 imageUrl' 
        });
      }
      
      const connection = await db.pool.getConnection();
      try {
        const id = uuidv4();
        
        await connection.execute(
          `INSERT INTO templates 
           (id, mode, code, name, image_url, prompt, category, sort_order, status, created_by, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            id, 
            mode, 
            code, 
            name, 
            imageUrl, 
            prompt || '', 
            category || 'default', 
            sortOrder || 0, 
            status || 'active',
            req.admin.id
          ]
        );
        
        res.json({ success: true, data: { id, mode, code, name } });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('创建模板失败:', error);
      res.status(500).json({ error: '创建模板失败', message: error.message });
    }
  }
);

/**
 * 更新模板
 * PUT /admin-api/templates/:id
 */
router.put('/:id', 
  authenticate, 
  authorize('super_admin'), 
  logOperation,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, imageUrl, prompt, category, sortOrder, status } = req.body;
      
      const connection = await db.pool.getConnection();
      try {
        const updates = [];
        const params = [];
        
        if (name !== undefined) {
          updates.push('name = ?');
          params.push(name);
        }
        if (imageUrl !== undefined) {
          updates.push('image_url = ?');
          params.push(imageUrl);
        }
        if (prompt !== undefined) {
          updates.push('prompt = ?');
          params.push(prompt);
        }
        if (category !== undefined) {
          updates.push('category = ?');
          params.push(category);
        }
        if (sortOrder !== undefined) {
          updates.push('sort_order = ?');
          params.push(sortOrder);
        }
        if (status !== undefined) {
          updates.push('status = ?');
          params.push(status);
        }
        
        updates.push('updated_at = NOW()');
        params.push(id);
        
        await connection.execute(
          `UPDATE templates SET ${updates.join(', ')} WHERE id = ?`,
          params
        );
        
        res.json({ success: true, message: '模板更新成功' });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('更新模板失败:', error);
      res.status(500).json({ error: '更新模板失败', message: error.message });
    }
  }
);

/**
 * 删除模板
 * DELETE /admin-api/templates/:id
 */
router.delete('/:id', 
  authenticate, 
  authorize('super_admin'), 
  logOperation,
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const connection = await db.pool.getConnection();
      try {
        await connection.execute('DELETE FROM templates WHERE id = ?', [id]);
        res.json({ success: true, message: '模板删除成功' });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('删除模板失败:', error);
      res.status(500).json({ error: '删除模板失败', message: error.message });
    }
  }
);

module.exports = router;
