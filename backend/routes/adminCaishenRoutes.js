/**
 * 财神变身管理后台API路由
 * 处理财神模板管理和统计相关的HTTP请求
 */

const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { authenticate } = require('../middleware/adminAuth');
const templates = require('../config/templates');

/**
 * GET /admin-api/caishen/stats
 * 获取财神变身统计数据
 * 需要管理员认证
 */
router.get('/stats', authenticate, async (req, res) => {
  console.log('[财神管理] 获取统计数据');
  
  try {
    // 总生成数
    const [totalResult] = await db.query(
      "SELECT COUNT(*) as total FROM generation_history WHERE mode = 'caishen'"
    );
    
    // 成功数
    const [successResult] = await db.query(
      "SELECT COUNT(*) as success FROM generation_history WHERE mode = 'caishen' AND status = 'completed'"
    );
    
    // 失败数
    const [failedResult] = await db.query(
      "SELECT COUNT(*) as failed FROM generation_history WHERE mode = 'caishen' AND status = 'failed'"
    );
    
    // 用户数
    const [userResult] = await db.query(
      "SELECT COUNT(DISTINCT user_id) as users FROM generation_history WHERE mode = 'caishen'"
    );
    
    // 今日生成数
    const [todayResult] = await db.query(
      "SELECT COUNT(*) as today FROM generation_history WHERE mode = 'caishen' AND DATE(created_at) = CURDATE()"
    );
    
    // 热门模板
    const [popularTemplates] = await db.query(`
      SELECT 
        template_url as template_id,
        COUNT(*) as count
      FROM generation_history 
      WHERE mode = 'caishen'
      GROUP BY template_url
      ORDER BY count DESC
      LIMIT 5
    `);
    
    // 安全地获取统计数据
    const total = (totalResult && totalResult[0]) ? totalResult[0].total : 0;
    const success = (successResult && successResult[0]) ? successResult[0].success : 0;
    const failed = (failedResult && failedResult[0]) ? failedResult[0].failed : 0;
    const users = (userResult && userResult[0]) ? userResult[0].users : 0;
    const today = (todayResult && todayResult[0]) ? todayResult[0].today : 0;
    
    const stats = {
      total,
      success,
      failed,
      users,
      today,
      successRate: total > 0 
        ? ((success / total) * 100).toFixed(2) + '%'
        : '0%',
      popularTemplates: popularTemplates || []
    };
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('[财神管理] 获取统计数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计数据失败'
    });
  }
});

/**
 * GET /admin-api/caishen/templates
 * 获取财神模板列表
 * 需要管理员认证
 */
router.get('/templates', authenticate, async (req, res) => {
  console.log('[财神管理] 获取模板列表');
  
  try {
    const caishenTemplates = templates.getTemplatesByMode('caishen');
    
    // 转换为数组格式，包含完整信息
    const templateList = Object.values(caishenTemplates).map(template => ({
      id: template.id,
      name: template.name,
      imageUrl: template.imageUrl,
      prompt: template.prompt,
      category: template.category,
      duration: template.duration || 5
    }));
    
    res.json({
      success: true,
      data: templateList
    });
    
  } catch (error) {
    console.error('[财神管理] 获取模板列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取模板列表失败'
    });
  }
});

/**
 * POST /admin-api/caishen/templates
 * 添加财神模板
 * 需要管理员认证
 */
router.post('/templates', authenticate, async (req, res) => {
  console.log('[财神管理] 添加模板');
  
  try {
    const { id, name, prompt, imageUrl, category, duration } = req.body;
    
    // 参数验证
    if (!id || !name || !prompt) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: id, name, prompt'
      });
    }
    
    // 检查模板ID是否已存在
    const existingTemplate = templates.getTemplateConfig('caishen', id);
    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        message: '模板ID已存在'
      });
    }
    
    // 注意：当前模板配置在 config/templates.js 中
    // 实际生产环境应该存储到数据库
    // 这里返回成功，但提示需要手动更新配置文件
    
    res.json({
      success: true,
      message: '模板添加请求已接收，请在 backend/config/templates.js 中手动添加模板配置',
      data: {
        id,
        name,
        prompt,
        imageUrl: imageUrl || null,
        category: category || 'default',
        duration: duration || 5
      }
    });
    
  } catch (error) {
    console.error('[财神管理] 添加模板失败:', error);
    res.status(500).json({
      success: false,
      message: '添加模板失败'
    });
  }
});

/**
 * PUT /admin-api/caishen/templates/:id
 * 更新财神模板
 * 需要管理员认证
 */
router.put('/templates/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  console.log('[财神管理] 更新模板:', id);
  
  try {
    const { name, prompt, imageUrl, category, duration } = req.body;
    
    // 检查模板是否存在
    const existingTemplate = templates.getTemplateConfig('caishen', id);
    if (!existingTemplate) {
      return res.status(404).json({
        success: false,
        message: '模板不存在'
      });
    }
    
    // 注意：当前模板配置在 config/templates.js 中
    // 实际生产环境应该存储到数据库
    // 这里返回成功，但提示需要手动更新配置文件
    
    res.json({
      success: true,
      message: '模板更新请求已接收，请在 backend/config/templates.js 中手动更新模板配置',
      data: {
        id,
        name: name || existingTemplate.name,
        prompt: prompt || existingTemplate.prompt,
        imageUrl: imageUrl || existingTemplate.imageUrl,
        category: category || existingTemplate.category,
        duration: duration || existingTemplate.duration
      }
    });
    
  } catch (error) {
    console.error('[财神管理] 更新模板失败:', error);
    res.status(500).json({
      success: false,
      message: '更新模板失败'
    });
  }
});

/**
 * DELETE /admin-api/caishen/templates/:id
 * 删除财神模板
 * 需要管理员认证
 */
router.delete('/templates/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  console.log('[财神管理] 删除模板:', id);
  
  try {
    // 检查模板是否存在
    const existingTemplate = templates.getTemplateConfig('caishen', id);
    if (!existingTemplate) {
      return res.status(404).json({
        success: false,
        message: '模板不存在'
      });
    }
    
    // 检查是否有生成记录使用该模板
    const [usageResult] = await db.query(
      "SELECT COUNT(*) as count FROM generation_history WHERE mode = 'caishen' AND template_url = ?",
      [existingTemplate.imageUrl]
    );
    
    if (usageResult[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `该模板已被使用 ${usageResult[0].count} 次，无法删除`
      });
    }
    
    // 注意：当前模板配置在 config/templates.js 中
    // 实际生产环境应该存储到数据库
    // 这里返回成功，但提示需要手动更新配置文件
    
    res.json({
      success: true,
      message: '模板删除请求已接收，请在 backend/config/templates.js 中手动删除模板配置'
    });
    
  } catch (error) {
    console.error('[财神管理] 删除模板失败:', error);
    res.status(500).json({
      success: false,
      message: '删除模板失败'
    });
  }
});

module.exports = router;
