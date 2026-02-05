/**
 * 邀请相关路由
 * 提供邀请码生成、验证、注册和统计的API端点
 */

const express = require('express');
const router = express.Router();
const inviteService = require('../services/inviteService');

/**
 * GET /api/invite/code/:userId
 * 获取用户的邀请码
 */
router.get('/code/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: '用户ID不能为空'
      });
    }

    const inviteCode = await inviteService.generateInviteCode(userId);

    res.json({
      success: true,
      invite_code: inviteCode,
      // qr_code_url 可以在未来添加
      qr_code_url: null
    });
  } catch (error) {
    console.error('获取邀请码失败:', error);

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
      message: '获取邀请码失败',
      details: error.message
    });
  }
});

/**
 * POST /api/invite/register
 * 处理邀请注册（已废弃，使用 /bind 代替）
 * Body: { invite_code: string, new_user_id: string, openid: string }
 */
router.post('/register', async (req, res) => {
  try {
    const { invite_code, new_user_id, openid } = req.body;

    // 验证参数
    if (!invite_code) {
      return res.status(400).json({
        success: false,
        error: 'INVITE_CODE_REQUIRED',
        message: '邀请码不能为空'
      });
    }

    if (!new_user_id) {
      return res.status(400).json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: '用户ID不能为空'
      });
    }

    if (!openid) {
      return res.status(400).json({
        success: false,
        error: 'OPENID_REQUIRED',
        message: 'openid不能为空'
      });
    }

    const result = await inviteService.processInviteRegistration(
      invite_code,
      new_user_id,
      openid
    );

    res.json({
      success: true,
      inviter_id: result.inviter_id,
      reward_granted: result.reward_granted,
      message: '邀请注册成功'
    });
  } catch (error) {
    console.error('处理邀请注册失败:', error);

    // 处理特定错误
    if (error.message.includes('邀请码无效') || error.message.includes('邀请码不存在')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INVITE_CODE',
        message: '邀请码无效或已过期',
        details: {
          invite_code: req.body.invite_code
        }
      });
    }

    if (error.message.includes('不能使用自己的邀请码') || error.message === 'SELF_INVITE_NOT_ALLOWED') {
      return res.status(400).json({
        success: false,
        error: 'SELF_INVITE_NOT_ALLOWED',
        message: '不能使用自己的邀请码',
        details: {
          user_id: req.body.new_user_id
        }
      });
    }

    if (error.message.includes('已存在') || error.message.includes('重复邀请') || error.message === 'USER_ALREADY_EXISTS') {
      return res.status(400).json({
        success: false,
        error: 'DUPLICATE_INVITE',
        message: '该用户已被邀请过',
        details: {
          invitee_id: req.body.new_user_id
        }
      });
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '处理邀请注册失败',
      details: error.message
    });
  }
});

/**
 * POST /api/invite/bind
 * 绑定邀请关系（新接口，用户已存在的情况）
 * Body: { invite_code: string, user_id: string }
 */
router.post('/bind', async (req, res) => {
  try {
    const { invite_code, user_id } = req.body;

    // 验证参数
    if (!invite_code) {
      return res.status(400).json({
        success: false,
        error: 'INVITE_CODE_REQUIRED',
        message: '邀请码不能为空'
      });
    }

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: '用户ID不能为空'
      });
    }

    const result = await inviteService.bindInviteRelation(invite_code, user_id);

    res.json({
      success: true,
      data: {
        inviter_id: result.inviter_id,
        reward_granted: result.reward_granted
      },
      message: '邀请绑定成功'
    });
  } catch (error) {
    console.error('绑定邀请关系失败:', error);

    // 处理特定错误
    if (error.message.includes('邀请码无效') || error.message.includes('邀请码不存在')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INVITE_CODE',
        message: '邀请码无效或已过期'
      });
    }

    if (error.message.includes('不能使用自己的邀请码')) {
      return res.status(400).json({
        success: false,
        error: 'SELF_INVITE_NOT_ALLOWED',
        message: '不能使用自己的邀请码'
      });
    }

    if (error.message.includes('已被邀请') || error.message.includes('已绑定')) {
      return res.status(400).json({
        success: false,
        error: 'ALREADY_INVITED',
        message: '该用户已被邀请过，不能重复绑定'
      });
    }

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
      message: '绑定邀请关系失败',
      details: error.message
    });
  }
});

/**
 * GET /api/invite/stats/:userId
 * 获取邀请统计
 */
router.get('/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: '用户ID不能为空'
      });
    }

    const stats = await inviteService.getInviteStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取邀请统计失败:', error);

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '获取邀请统计失败',
      details: error.message
    });
  }
});

/**
 * GET /api/invite/records/:userId
 * 获取邀请记录
 * Query: { page: number, pageSize: number }
 */
router.get('/records/:userId', async (req, res) => {
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

    const result = await inviteService.getInviteRecords(
      userId,
      parseInt(page),
      parseInt(pageSize)
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取邀请记录失败:', error);

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '获取邀请记录失败',
      details: error.message
    });
  }
});

/**
 * GET /api/invite/validate/:inviteCode
 * 验证邀请码
 */
router.get('/validate/:inviteCode', async (req, res) => {
  try {
    const { inviteCode } = req.params;

    if (!inviteCode) {
      return res.status(400).json({
        success: false,
        error: 'INVITE_CODE_REQUIRED',
        message: '邀请码不能为空'
      });
    }

    const result = await inviteService.validateInviteCode(inviteCode);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: 'INVALID_INVITE_CODE',
        message: result.error || '邀请码无效'
      });
    }

    res.json({
      success: true,
      valid: result.valid,
      inviter_id: result.inviter_id,
      inviter_nickname: result.inviter_nickname
    });
  } catch (error) {
    console.error('验证邀请码失败:', error);

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '验证邀请码失败',
      details: error.message
    });
  }
});

module.exports = router;
