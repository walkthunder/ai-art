/**
 * 开发者模式路由
 * 仅在开发环境下启用，用于调试和测试
 */

const express = require('express');
const router = express.Router();
const balanceService = require('../services/balanceService');
const userServiceV2 = require('../services/userServiceV2');

// 检查是否为开发环境
const isDev = process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true';

console.log('[DevRoutes] 开发者模式状态:', {
  NODE_ENV: process.env.NODE_ENV,
  DEV_MODE: process.env.DEV_MODE,
  isDev: isDev
});

// 中间件：验证开发者模式是否启用
const checkDevMode = (req, res, next) => {
  if (!isDev) {
    console.log('[DevRoutes] 开发者模式未启用，拒绝访问');
    return res.status(403).json({
      success: false,
      error: 'DEV_MODE_DISABLED',
      message: '开发者模式未启用'
    });
  }
  console.log('[DevRoutes] 开发者模式已启用，允许访问:', req.method, req.path);
  next();
};

/**
 * POST /api/dev/usage/set
 * 设置用户使用次数（开发者模式）
 * Body: { userId: string, mode: string, count: number }
 */
router.post('/usage/set', checkDevMode, async (req, res) => {
  try {
    const { userId, mode = 'paid', count } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: '用户ID不能为空'
      });
    }

    if (typeof count !== 'number' || count < 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_COUNT',
        message: '使用次数必须是非负整数'
      });
    }

    const validModes = ['puzzle', 'transform', 'paid'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MODE',
        message: `模式必须是: ${validModes.join(', ')}`
      });
    }

    // 获取当前余额
    const oldBalances = await balanceService.getUserBalances(userId);
    const oldCount = oldBalances[mode]?.balance || 0;

    // 设置新余额
    await balanceService.setBalance(userId, mode, count, 'dev_mode_set');

    res.json({
      success: true,
      message: '使用次数已设置',
      data: {
        userId,
        mode,
        oldCount,
        newCount: count,
        difference: count - oldCount
      }
    });
  } catch (error) {
    console.error('设置使用次数失败:', error);

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
      message: '设置使用次数失败',
      details: error.message
    });
  }
});

/**
 * POST /api/dev/usage/add
 * 增加用户使用次数（开发者模式）
 * Body: { userId: string, mode: string, amount: number }
 */
router.post('/usage/add', checkDevMode, async (req, res) => {
  try {
    const { userId, mode = 'paid', amount } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: '用户ID不能为空'
      });
    }

    if (typeof amount !== 'number' || amount === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_AMOUNT',
        message: '增加数量必须是非零数字'
      });
    }

    const validModes = ['puzzle', 'transform', 'paid'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MODE',
        message: `模式必须是: ${validModes.join(', ')}`
      });
    }

    // 将 mode 转换为 balance_type
    const balanceType = mode === 'puzzle' ? balanceService.BALANCE_TYPES.PUZZLE_FREE :
                        mode === 'transform' ? balanceService.BALANCE_TYPES.TRANSFORM_FREE :
                        balanceService.BALANCE_TYPES.PAID;
    
    const result = await balanceService.addBalance(
      userId,
      Math.abs(amount),
      'admin_grant',
      'dev_mode_' + Date.now(),
      balanceType
    );

    res.json({
      success: true,
      message: '使用次数已更新',
      data: {
        userId,
        mode,
        amount,
        newBalance: result.new_balance
      }
    });
  } catch (error) {
    console.error('增加使用次数失败:', error);

    if (error.message.includes('用户不存在')) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '用户不存在'
      });
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '增加使用次数失败',
      details: error.message
    });
  }
});

/**
 * POST /api/dev/usage/switch-status
 * 切换用户状态（免费/VIP）
 * Body: { userId: string, status: 'free' | 'vip', puzzleCount: number, transformCount: number, paidCount: number }
 */
router.post('/usage/switch-status', checkDevMode, async (req, res) => {
  try {
    const { userId, status, puzzleCount, transformCount, paidCount } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: '用户ID不能为空'
      });
    }

    if (!['free', 'vip'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: '状态必须是 free 或 vip'
      });
    }

    // 获取旧数据
    const oldBalances = await balanceService.getUserBalances(userId);

    // 根据状态设置不同的值
    let finalPuzzleCount, finalTransformCount, finalPaidCount;
    
    if (status === 'free') {
      finalPuzzleCount = puzzleCount || 3;
      finalTransformCount = transformCount || 3;
      finalPaidCount = paidCount || 0;
    } else {
      finalPuzzleCount = puzzleCount || 3;
      finalTransformCount = transformCount || 3;
      finalPaidCount = paidCount || 20;
    }

    // 设置余额
    await balanceService.setBalance(userId, 'puzzle', finalPuzzleCount, 'dev_mode_switch');
    await balanceService.setBalance(userId, 'transform', finalTransformCount, 'dev_mode_switch');
    await balanceService.setBalance(userId, 'paid', finalPaidCount, 'dev_mode_switch');

    // 获取新数据
    const newBalances = await balanceService.getUserBalances(userId);

    res.json({
      success: true,
      message: `已切换为${status === 'free' ? '免费用户' : 'VIP用户'}`,
      data: {
        userId,
        status,
        oldData: oldBalances,
        newData: newBalances
      }
    });
  } catch (error) {
    console.error('切换用户状态失败:', error);

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
      message: '切换用户状态失败',
      details: error.message
    });
  }
});

/**
 * POST /api/dev/login
 * 开发者模式快速登录
 * Body: { userId: string }
 */
router.post('/login', checkDevMode, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: '用户ID不能为空'
      });
    }
    
    // 获取或创建用户
    let user = await userServiceV2.getUserById(userId);
    
    if (!user) {
      // 创建新用户
      user = await userServiceV2.createUser({ id: userId });
      console.log(`[DevMode] 创建新用户: ${userId}`);
    }

    // 获取余额信息
    const balances = await balanceService.getUserBalances(userId);

    res.json({
      success: true,
      message: '登录成功',
      data: {
        userId: user.id,
        balances: balances,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('开发者登录失败:', error);

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '登录失败',
      details: error.message
    });
  }
});

/**
 * GET /api/dev/usage/check/:userId
 * 检查用户使用次数详情（开发者模式）
 */
router.get('/usage/check/:userId', checkDevMode, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: '用户ID不能为空'
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
 * GET /api/dev/status
 * 获取开发者模式状态
 */
router.get('/status', (req, res) => {
  console.log('[DevRoutes] 访问 /status 接口');
  res.json({
    success: true,
    devMode: isDev,
    environment: process.env.NODE_ENV || 'unknown',
    message: isDev ? '开发者模式已启用' : '开发者模式未启用'
  });
});

console.log('[DevRoutes] 路由已注册，开发者模式:', isDev ? '已启用' : '未启用');

module.exports = router;
