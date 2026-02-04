/**
 * 模板管理路由模块
 */

const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { getTemplateConfig } = require('../config/templates');

/**
 * 获取模板列表
 * 优先从数据库读取，失败时降级到配置文件
 */
router.get('/', async (req, res) => {
  try {
    const { mode } = req.query;
    
    if (!mode) {
      return res.status(400).json({ error: '缺少参数', message: '需要提供 mode 参数' });
    }
    
    // 尝试从数据库读取
    try {
      const connection = await db.pool.getConnection();
      try {
        const [rows] = await connection.execute(
          `SELECT id, code as id, name, image_url as imageUrl, category, sort_order
           FROM templates 
           WHERE mode = ? AND status = 'active'
           ORDER BY sort_order ASC, created_at DESC`,
          [mode]
        );
        
        if (rows.length > 0) {
          console.log(`从数据库读取到 ${rows.length} 个模板 (mode: ${mode})`);
          
          // 返回模板列表（不包含 prompt）
          const safeTemplates = rows.map(t => ({
            id: t.id,
            name: t.name,
            imageUrl: t.imageUrl,
            category: t.category
          }));
          
          return res.json({ success: true, data: safeTemplates, source: 'database' });
        }
      } finally {
        connection.release();
      }
    } catch (dbError) {
      console.warn('从数据库读取模板失败，降级到配置文件:', dbError.message);
    }
    
    // 降级方案：从配置文件读取
    const { getTemplateList } = require('../config/templates');
    const templates = getTemplateList(mode);
    
    const safeTemplates = templates.map(t => ({
      id: t.id,
      name: t.name,
      imageUrl: t.imageUrl,
      category: t.category
    }));
    
    console.log(`从配置文件读取到 ${safeTemplates.length} 个模板 (mode: ${mode})`);
    res.json({ success: true, data: safeTemplates, source: 'config' });
  } catch (error) {
    console.error('获取模板列表失败:', error);
    res.status(500).json({ error: '获取模板列表失败', message: error.message });
  }
});

/**
 * 获取单个模板详情（内部使用，包含 prompt）
 * 优先从数据库读取，失败时降级到配置文件
 */
router.get('/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const { mode } = req.query;
    
    // 尝试从数据库读取
    try {
      const connection = await db.pool.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM templates WHERE code = ? AND status = \'active\'',
          [templateId]
        );
        
        if (rows.length > 0) {
          const template = rows[0];
          return res.json({ 
            success: true, 
            data: {
              id: template.code,
              name: template.name,
              imageUrl: template.image_url,
              prompt: template.prompt,
              category: template.category
            },
            source: 'database'
          });
        }
      } finally {
        connection.release();
      }
    } catch (dbError) {
      console.warn('从数据库读取模板详情失败，降级到配置文件:', dbError.message);
    }
    
    // 降级方案：从配置文件读取
    if (!mode) {
      return res.status(400).json({ error: '缺少参数', message: '需要提供 mode 参数' });
    }
    
    const template = getTemplateConfig(mode, templateId);
    
    if (!template) {
      return res.status(404).json({ error: '模板不存在', message: '未找到对应的模板' });
    }
    
    res.json({ success: true, data: template, source: 'config' });
  } catch (error) {
    console.error('获取模板详情失败:', error);
    res.status(500).json({ error: '获取模板详情失败', message: error.message });
  }
});

module.exports = router;
