/**
 * 财神变身API路由
 * 处理财神视频生成相关的HTTP请求
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const videoGenerationService = require('../services/videoGenerationService');
const balanceService = require('../services/balanceService');
const generationService = require('../services/generationService');
const userServiceV2 = require('../services/userServiceV2');
const db = require('../db/connection');

/**
 * POST /api/caishen/generate
 * 生成财神变身视频
 */
router.post('/generate', async (req, res) => {
  const { userImageUrl, templateId, userId } = req.body;
  
  console.log('[财神API] 收到生成请求:', { userId, templateId });
  
  try {
    // 1. 参数验证
    if (!userImageUrl || !templateId || !userId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }
    
    // 2. 检查用户余额（使用 balanceService 标准API）
    const balanceInfo = await balanceService.checkBalance(userId, 'caishen');
    console.log('[财神API] 用户余额:', balanceInfo);
    
    if (!balanceInfo.can_generate_mode) {
      return res.status(403).json({
        success: false,
        message: '财神变身次数不足',
        code: 'INSUFFICIENT_BALANCE'
      });
    }
    
    // 3. 获取用户信息（检查付费状态）
    const user = await userServiceV2.getUserById(userId);
    const paymentStatus = user?.payment_status === 'free' ? 'free' : 'paid';
    console.log('[财神API] 用户付费状态:', paymentStatus);
    
    // 4. 创建生成记录（使用 generationService）
    const recordId = uuidv4();
    const placeholderTaskId = 'pending_' + recordId; // 使用占位符任务ID
    const generationRecord = await generationService.saveGenerationHistory({
      userId,
      taskIds: [placeholderTaskId], // 使用占位符，稍后更新为真实任务ID
      originalImageUrls: [userImageUrl],
      templateUrl: templateId,
      status: 'pending',
      mode: 'caishen'
    });
    
    console.log('[财神API] 生成记录已创建:', generationRecord.id);
    
    // 5. 扣减余额（使用 balanceService 标准API）
    try {
      await balanceService.decrementBalance(userId, generationRecord.id, 'caishen');
      console.log('[财神API] 余额已扣减');
    } catch (balanceError) {
      console.error('[财神API] 扣减余额失败:', balanceError);
      
      // 更新记录状态为失败
      await generationService.updateGenerationHistory(generationRecord.id, {
        status: 'failed'
      });
      
      return res.status(403).json({
        success: false,
        message: balanceError.message || '余额不足',
        code: 'INSUFFICIENT_BALANCE'
      });
    }
    
    // 6. 调用视频生成服务
    let taskId;
    try {
      taskId = await videoGenerationService.generateCaishenVideo(
        userImageUrl,
        templateId,
        userId,
        paymentStatus
      );
      
      console.log('[财神API] 视频生成任务已创建:', taskId);
      
    } catch (error) {
      // 生成失败，恢复余额
      console.error('[财神API] 视频生成失败，恢复余额:', error);
      await balanceService.restoreBalance(userId, generationRecord.id, 'caishen');
      
      // 更新记录状态为失败
      await generationService.updateGenerationHistory(generationRecord.id, {
        status: 'failed'
      });
      
      throw error;
    }
    
    // 7. 更新记录的任务ID和状态（放在try-catch外，确保taskId已获取）
    try {
      await generationService.updateTaskIds(generationRecord.id, [taskId]);
      await generationService.updateGenerationHistory(generationRecord.id, {
        status: 'processing'
      });
      
      console.log('[财神API] 记录已更新，任务ID:', taskId);
      
    } catch (updateError) {
      // 更新失败，记录错误但不恢复余额（任务已提交）
      console.error('[财神API] 更新记录失败:', updateError);
      // 任务已经提交，不恢复余额，让轮询机制处理
    }
    
    // 8. 返回成功响应
    res.json({
      success: true,
      data: {
        recordId: generationRecord.id,
        taskId,
        message: '视频生成任务已提交'
      }
    });
    
  } catch (error) {
    console.error('[财神API] 生成请求处理失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '视频生成失败'
    });
  }
});

/**
 * GET /api/caishen/task/:taskId
 * 查询视频生成任务状态
 */
router.get('/task/:taskId', async (req, res) => {
  const { taskId } = req.params;
  
  console.log('[财神API] 查询任务状态:', taskId);
  
  try {
    // 查询任务状态
    const status = await videoGenerationService.getVideoTaskStatus(taskId);
    
    // 如果任务成功，更新数据库记录（使用 generationService）
    if (status.status === 'succeeded' && status.videoUrl) {
      // 查找对应的生成记录
      const record = await generationService.getGenerationHistoryByTaskId(taskId);
      
      if (record) {
        // 获取用户付费状态
        const user = await userServiceV2.getUserById(record.userId);
        const paymentStatus = user?.payment_status || 'free';
        
        // 为免费用户添加自定义水印
        let finalVideoUrl = status.videoUrl;
        if (paymentStatus === 'free') {
          console.log('[财神API] 免费用户，准备添加自定义水印...');
          try {
            finalVideoUrl = await videoGenerationService.applyVideoWatermarkIfNeeded(
              status.videoUrl, 
              paymentStatus
            );
            status.videoUrl = finalVideoUrl;
          } catch (watermarkError) {
            console.error('[财神API] 添加水印失败，使用原视频:', watermarkError);
          }
        }
        
        await generationService.updateGenerationHistory(record.id, {
          generatedImageUrls: [finalVideoUrl],
          status: 'completed'
        });
        
        console.log('[财神API] 数据库记录已更新');
      }
    }
    
    // 如果任务失败，更新数据库记录并恢复余额
    if (status.status === 'failed') {
      // 查找对应的生成记录
      const record = await generationService.getGenerationHistoryByTaskId(taskId);
      
      if (record) {
        // 更新状态为失败
        await generationService.updateGenerationHistory(record.id, {
          status: 'failed'
        });
        
        // 恢复用户余额（使用 balanceService 标准API）
        await balanceService.restoreBalance(record.userId, record.id, 'caishen');
        console.log('[财神API] 任务失败，已恢复用户余额');
      }
    }
    
    res.json({
      success: true,
      data: status
    });
    
  } catch (error) {
    console.error('[财神API] 查询任务状态失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '查询任务状态失败'
    });
  }
});

/**
 * GET /api/caishen/templates
 * 获取财神模板列表
 */
router.get('/templates', async (req, res) => {
  console.log('[财神API] 获取模板列表');
  
  try {
    const templates = require('../config/templates');
    const caishenTemplates = templates.getTemplatesByMode('caishen');
    
    res.json({
      success: true,
      data: caishenTemplates
    });
    
  } catch (error) {
    console.error('[财神API] 获取模板列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取模板列表失败'
    });
  }
});

/**
 * GET /api/caishen/history
 * 获取用户的财神视频历史记录
 */
router.get('/history', async (req, res) => {
  const { userId, page = 1, limit = 20 } = req.query;
  
  console.log('[财神API] 获取历史记录:', userId);
  
  try {
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少用户ID'
      });
    }
    
    // 使用 generationService 获取历史记录
    const result = await generationService.getGenerationHistoryByUserId(
      userId,
      parseInt(limit) || 20,
      'caishen',
      parseInt(page) || 1
    );
    
    res.json({
      success: true,
      data: result.records,
      pagination: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages
      }
    });
    
  } catch (error) {
    console.error('[财神API] 获取历史记录失败:', error);
    res.status(500).json({
      success: false,
      message: '获取历史记录失败'
    });
  }
});

module.exports = router;
