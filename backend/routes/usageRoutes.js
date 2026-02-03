/**
 * 使用次数相关路由
 * 提供使用次数查询、扣减、恢复和历史记录的API端点
 */

const express = require('express');
const router = express.Router();
const balanceService = require('../services/balanceService');

/**
 * GET /api/usage/check/:userId
 * 检查用户使用次数
 */
router.get('/check/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 验证 userId 格式
    if (!userId || userId === 'undefined' || userId === 'null' || userId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_USER_ID',
        message: '无效的用户ID'
      });
    }

    // 验证 userId 长度（防止异常长的字符串）
    if (userId.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_USER_ID',
        message: '用户ID格式错误'
      });
    }

    const result = await balanceService.getUserBalances(userId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('检查使用次数失败:', error);

    if (error.message.includes('不存在')) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '用户不存在'
      });
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '检查使用次数失败',
      details: error.message
    });
  }
});

/**
 * POST /api/usage/decrement
 * 扣减使用次数
 * Body: { userId: string, generationId: string, mode?: string }
 */
router.post('/decrement', async (req, res) => {
  try {
    const { userId, generationId, mode = 'puzzle' } = req.body;

    // 验证 userId
    if (!userId || userId === 'undefined' || userId === 'null' || userId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_USER_ID',
        message: '无效的用户ID'
      });
    }

    if (!generationId) {
      return res.status(400).json({
        success: false,
        error: 'GENERATION_ID_REQUIRED',
        message: '生成记录ID不能为空'
      });
    }

    const validModes = ['puzzle', 'transform'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MODE',
        message: `模式必须是以下之一: ${validModes.join(', ')}`
      });
    }

    const result = await balanceService.decrementBalance(userId, generationId, mode);

    res.json({
      success: true,
      data: result.remaining,
      message: '使用次数扣减成功'
    });
  } catch (error) {
    console.error('扣减使用次数失败:', error);

    // 处理特定错误
    if (error.message.includes('使用次数不足') || error.message === 'INSUFFICIENT_USAGE') {
      return res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_USAGE',
        message: '使用次数不足',
        details: {
          current_count: 0,
          required_count: 1
        }
      });
    }

    if (error.message.includes('用户不存在') || error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '用户不存在'
      });
    }

    // 并发冲突错误
    if (error.message.includes('Lock wait timeout') || error.message.includes('Deadlock')) {
      return res.status(409).json({
        success: false,
        error: 'CONCURRENT_CONFLICT',
        message: '操作冲突，请重试',
        details: {
          operation: 'decrement_usage',
          user_id: req.body.userId
        }
      });
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '扣减使用次数失败',
      details: error.message
    });
  }
});

/**
 * POST /api/usage/restore
 * 恢复使用次数（生成失败时）
 * Body: { userId: string, generationId: string, mode?: string }
 */
router.post('/restore', async (req, res) => {
  try {
    const { userId, generationId, mode = 'puzzle' } = req.body;

    // 验证 userId
    if (!userId || userId === 'undefined' || userId === 'null' || userId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_USER_ID',
        message: '无效的用户ID'
      });
    }

    if (!generationId) {
      return res.status(400).json({
        success: false,
        error: 'GENERATION_ID_REQUIRED',
        message: '生成记录ID不能为空'
      });
    }

    const result = await balanceService.restoreBalance(userId, generationId, mode);

    res.json({
      success: true,
      data: result.remaining,
      message: '使用次数恢复成功'
    });
  } catch (error) {
    console.error('恢复使用次数失败:', error);

    if (error.message.includes('用户不存在') || error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '用户不存在'
      });
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '恢复使用次数失败',
      details: error.message
    });
  }
});

/**
 * GET /api/usage/history/:userId
 * 获取使用历史
 * Query: { page: number, pageSize: number }
 */
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: '用户ID不能为空'
      });
    }

    const result = await balanceService.getUsageHistory(
      userId,
      parseInt(page),
      parseInt(pageSize)
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取使用历史失败:', error);

    if (error.message.includes('不存在')) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '用户不存在'
      });
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '获取使用历史失败',
      details: error.message
    });
  }
});

/**
 * GET /api/history/:userId
 * 获取生成历史（按模式筛选）
 * Query: { mode?: 'puzzle' | 'transform', page?: number, pageSize?: number }
 */
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { mode = null, page = 1, pageSize = 20 } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: '用户ID不能为空'
      });
    }

    // 验证 mode 参数
    if (mode && !['puzzle', 'transform'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MODE',
        message: "模式必须是 'puzzle' 或 'transform'"
      });
    }

    const result = await balanceService.getUsageHistory(
      userId,
      parseInt(page),
      parseInt(pageSize),
      mode
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取生成历史失败:', error);

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '获取生成历史失败',
      details: error.message
    });
  }
});

module.exports = router;
