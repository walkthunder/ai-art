/**
 * 历史记录路由模块
 */

const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const generationService = require('../services/generationService');

// 获取所有历史记录 (调试用)
router.get('/all', async (req, res) => {
  try {
    const { limit } = req.query;
    const connection = await db.pool.getConnection();
    const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 100); // 限制1-100
    
    try {
      // MySQL2 execute 不支持 LIMIT 参数化，使用 query 方法
      const [rows] = await connection.query(
        `SELECT * FROM generation_history ORDER BY created_at DESC LIMIT ${limitNum}`
      );
      
      const parseJsonField = (field) => {
        if (!field) return null;
        if (typeof field === 'string') {
          try { return JSON.parse(field); } catch (e) { return null; }
        }
        return field;
      };
      
      const formattedRows = rows.map(record => ({
        id: record.id,
        user_id: record.user_id,
        task_ids: parseJsonField(record.task_ids),
        original_image_urls: parseJsonField(record.original_image_urls),
        template_url: record.template_url,
        generated_image_urls: parseJsonField(record.generated_image_urls),
        selected_image_url: record.selected_image_url,
        status: record.status,
        created_at: record.created_at,
        updated_at: record.updated_at
      }));
      
      res.json({ success: true, data: formattedRows });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('获取所有历史记录失败:', error);
    res.status(500).json({ error: '获取所有历史记录失败', message: error.message });
  }
});

// 获取用户历史记录
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit, mode } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 userId 参数' });
    }
    
    // 验证 mode 参数（如果提供）
    if (mode && !['transform', 'puzzle'].includes(mode)) {
      return res.status(400).json({ error: '参数错误', message: 'mode 参数必须是 transform 或 puzzle' });
    }
    
    const historyRecords = await generationService.getGenerationHistoryByUserId(
      userId, 
      limit ? parseInt(limit) : 10,
      mode || null
    );
    
    const formattedRecords = historyRecords.map(record => ({
      id: record.id,
      user_id: record.userId,
      task_ids: record.taskIds,
      original_image_urls: record.originalImageUrls,
      template_url: record.templateUrl,
      generated_image_urls: record.generatedImageUrls,
      selected_image_url: record.selectedImageUrl,
      status: record.status,
      mode: record.mode,
      created_at: record.createdAt,
      updated_at: record.updatedAt
    }));
    
    res.json({ success: true, data: formattedRecords });
  } catch (error) {
    console.error('获取用户历史记录失败:', error);
    res.status(500).json({ error: '获取用户历史记录失败', message: error.message });
  }
});

// 根据任务ID获取历史记录 (必须放在 /:recordId 之前，避免路由冲突)
router.get('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!taskId) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 taskId 参数' });
    }
    
    const record = await generationService.getGenerationHistoryByTaskId(taskId);
    if (!record) {
      return res.status(404).json({ error: '未找到记录', message: '未找到对应的任务记录' });
    }
    
    res.json({ success: true, data: record });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    res.status(500).json({ error: '获取历史记录失败', message: error.message });
  }
});

// 根据记录ID获取历史记录
router.get('/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    
    if (!recordId) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 recordId 参数' });
    }
    
    // 先尝试通过 recordId 查询
    let record = await generationService.getGenerationHistoryById(recordId);
    
    // 如果找不到，尝试通过 taskId 查询（兼容旧的分享链接）
    if (!record) {
      console.log(`[History] 通过 recordId 未找到记录，尝试通过 taskId 查询: ${recordId}`);
      record = await generationService.getGenerationHistoryByTaskId(recordId);
    }
    
    if (!record) {
      return res.status(404).json({ error: '未找到记录', message: '未找到对应的历史记录' });
    }
    
    res.json({ success: true, data: record });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    res.status(500).json({ error: '获取历史记录失败', message: error.message });
  }
});

// 更新历史记录
router.put('/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const { selectedImageUrl, status } = req.body;
    
    if (!recordId) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 recordId 参数' });
    }
    
    const connection = await db.pool.getConnection();
    try {
      const updates = [];
      const values = [];
      
      if (selectedImageUrl !== undefined) {
        updates.push('selected_image_url = ?');
        values.push(selectedImageUrl);
      }
      
      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }
      
      if (updates.length === 0) {
        return res.status(400).json({ error: '缺少更新参数', message: '需要提供至少一个更新字段' });
      }
      
      updates.push('updated_at = NOW()');
      values.push(recordId);
      
      const [result] = await connection.execute(
        `UPDATE generation_history SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: '记录不存在', message: '未找到对应的历史记录' });
      }
      
      res.json({ success: true, message: '历史记录更新成功', data: { recordId } });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('更新历史记录失败:', error);
    res.status(500).json({ error: '更新历史记录失败', message: error.message });
  }
});

// 删除历史记录
router.delete('/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const { userId } = req.query;
    
    if (!recordId) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 recordId 参数' });
    }
    
    const connection = await db.pool.getConnection();
    try {
      // 先查询记录是否存在，并验证用户权限
      const [rows] = await connection.execute(
        'SELECT id, user_id FROM generation_history WHERE id = ?',
        [recordId]
      );
      
      if (rows.length === 0) {
        return res.status(404).json({ error: '记录不存在', message: '未找到对应的历史记录' });
      }
      
      // 如果提供了 userId，验证记录是否属于该用户
      if (userId && rows[0].user_id !== userId) {
        return res.status(403).json({ error: '无权限', message: '您没有权限删除此记录' });
      }
      
      // 执行删除
      const [result] = await connection.execute(
        'DELETE FROM generation_history WHERE id = ?',
        [recordId]
      );
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: '删除失败', message: '记录可能已被删除' });
      }
      
      console.log(`[History] 删除历史记录成功: ${recordId}, userId: ${userId || 'unknown'}`);
      res.json({ success: true, message: '历史记录删除成功', data: { recordId } });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('删除历史记录失败:', error);
    res.status(500).json({ error: '删除历史记录失败', message: error.message });
  }
});

// 批量删除历史记录
router.post('/batch-delete', async (req, res) => {
  try {
    const { recordIds, userId } = req.body;
    
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 recordIds 数组' });
    }
    
    if (recordIds.length > 50) {
      return res.status(400).json({ error: '参数超限', message: '单次最多删除50条记录' });
    }
    
    const connection = await db.pool.getConnection();
    try {
      // 构建 IN 查询的占位符
      const placeholders = recordIds.map(() => '?').join(',');
      
      // 如果提供了 userId，只删除属于该用户的记录
      let query = `DELETE FROM generation_history WHERE id IN (${placeholders})`;
      let params = [...recordIds];
      
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }
      
      const [result] = await connection.execute(query, params);
      
      console.log(`[History] 批量删除历史记录: 请求${recordIds.length}条, 实际删除${result.affectedRows}条, userId: ${userId || 'unknown'}`);
      
      res.json({ 
        success: true, 
        message: '批量删除成功', 
        data: { 
          requested: recordIds.length,
          deleted: result.affectedRows 
        } 
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('批量删除历史记录失败:', error);
    res.status(500).json({ error: '批量删除历史记录失败', message: error.message });
  }
});

// 清空用户所有历史记录
router.delete('/user/:userId/all', async (req, res) => {
  try {
    const { userId } = req.params;
    const { mode } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 userId 参数' });
    }
    
    // 验证 mode 参数（如果提供）
    if (mode && !['transform', 'puzzle'].includes(mode)) {
      return res.status(400).json({ error: '参数错误', message: 'mode 参数必须是 transform 或 puzzle' });
    }
    
    const connection = await db.pool.getConnection();
    try {
      let query = 'DELETE FROM generation_history WHERE user_id = ?';
      const params = [userId];
      
      // 如果指定了 mode，只删除该模式的记录
      if (mode) {
        query += ' AND mode = ?';
        params.push(mode);
      }
      
      const [result] = await connection.execute(query, params);
      
      console.log(`[History] 清空用户历史记录: userId=${userId}, mode=${mode || 'all'}, 删除${result.affectedRows}条`);
      
      res.json({ 
        success: true, 
        message: '历史记录已清空', 
        data: { 
          userId,
          mode: mode || 'all',
          deleted: result.affectedRows 
        } 
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('清空用户历史记录失败:', error);
    res.status(500).json({ error: '清空用户历史记录失败', message: error.message });
  }
});

module.exports = router;
