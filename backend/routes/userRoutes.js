/**
 * 用户管理路由模块
 */

const express = require('express');
const router = express.Router();
const userServiceV2 = require('../services/userServiceV2');
const errorLogService = require('../services/errorLogService');

// 创建或获取用户
router.post('/init', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        error: '缺少必要参数', 
        message: '需要提供 userId 参数' 
      });
    }
    
    const user = await userServiceV2.getOrCreateUser(userId);
    
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('初始化用户失败:', error);
    
    await errorLogService.logError(
      'USER_INIT_FAILED',
      error.message,
      { userId: req.body.userId, endpoint: '/api/user/init', method: 'POST' }
    );
    
    res.status(500).json({ error: '初始化用户失败', message: error.message });
  }
});

// 获取用户信息
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ 
        error: '缺少必要参数', 
        message: '需要提供 userId 参数' 
      });
    }
    
    const user = await userServiceV2.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        error: '用户不存在', 
        message: '未找到对应的用户' 
      });
    }
    
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({ error: '获取用户信息失败', message: error.message });
  }
});

// 更新用户付费状态
router.put('/:userId/payment-status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { paymentStatus } = req.body;
    
    if (!userId || !paymentStatus) {
      return res.status(400).json({ 
        error: '缺少必要参数', 
        message: '需要提供 userId 和 paymentStatus 参数' 
      });
    }
    
    const user = await userServiceV2.updateUserPaymentStatus(userId, paymentStatus);
    
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('更新用户付费状态失败:', error);
    res.status(500).json({ error: '更新用户付费状态失败', message: error.message });
  }
});

// 同步用户信息（小程序登录后调用）
router.post('/sync', async (req, res) => {
  try {
    const { userId, openid } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        message: '缺少 userId 参数' 
      });
    }
    
    // 获取用户信息
    let user = await userServiceV2.getUserById(userId);
    
    if (!user) {
      // 用户不存在，返回空数据（不自动创建，因为登录时已创建）
      return res.json({ 
        success: true, 
        data: null,
        message: '用户不存在'
      });
    }
    
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('同步用户信息失败:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
