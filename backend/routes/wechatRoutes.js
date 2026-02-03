/**
 * 微信小程序路由模块
 * 处理微信登录、小程序码生成等功能
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const userService = require('../services/userService');
const errorLogService = require('../services/errorLogService');

// 微信小程序配置
const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_SECRET = process.env.WECHAT_SECRET;

/**
 * 微信小程序登录
 * POST /api/wechat/login
 * 
 * 请求体:
 * - code: 微信登录凭证
 * 
 * 响应:
 * - userId: 用户ID
 * - openid: 微信openid
 * - token: JWT token (简化版，使用 base64 编码)
 * - paymentStatus: 付费状态
 */
router.post('/login', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: '缺少登录凭证 code'
      });
    }
    
    // 检查微信配置
    if (!WECHAT_APPID || !WECHAT_SECRET) {
      console.error('微信小程序配置缺失: WECHAT_APPID 或 WECHAT_SECRET 未设置');
      return res.status(500).json({
        success: false,
        message: '服务器配置错误'
      });
    }
    
    // 调用微信 code2Session 接口
    const wxResponse = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: WECHAT_APPID,
        secret: WECHAT_SECRET,
        js_code: code,
        grant_type: 'authorization_code'
      }
    });
    
    const { openid, session_key, unionid, errcode, errmsg } = wxResponse.data;
    
    // 检查微信接口返回错误
    if (errcode) {
      console.error('微信登录失败:', errcode, errmsg);
      
      await errorLogService.logError(
        'WECHAT_LOGIN_FAILED',
        `微信登录失败: ${errmsg}`,
        { errcode, errmsg, endpoint: '/api/wechat/login', method: 'POST' }
      );
      
      return res.status(400).json({
        success: false,
        message: errmsg || '微信登录失败'
      });
    }
    
    if (!openid) {
      return res.status(400).json({
        success: false,
        message: '获取 openid 失败'
      });
    }
    
    const unionidLog = unionid ? `, unionid: ${unionid.substring(0, 8)}...` : '';
    console.log(`[WeChat Login] 获取到 openid: ${openid.substring(0, 8)}...${unionidLog}`);
    
    // 查找或创建用户
    // 优先使用 unionid 查找（跨应用统一用户）
    let user = null;
    
    if (unionid) {
      user = await userService.getUserByUnionid(unionid);
      if (user) {
        console.log(`[WeChat Login] 通过 unionid 找到用户: ${user.id}`);
      }
    }
    
    // 如果通过 unionid 没找到，再用 openid 查找
    if (!user) {
      user = await userService.getUserByOpenid(openid);
      if (user) {
        console.log(`[WeChat Login] 通过 openid 找到用户: ${user.id}`);
      }
    }
    
    // 如果都没找到，创建新用户
    if (!user) {
      const userId = uuidv4();
      user = await userService.createUserWithOpenid(userId, openid, unionid);
      console.log(`[WeChat Login] 创建新用户: ${userId}`);
    }
    
    // 生成简化版 token (base64 编码的 JSON)
    // 生产环境建议使用 JWT
    const tokenPayload = {
      userId: user.id,
      openid,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天过期
    };
    const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
    
    res.json({
      success: true,
      data: {
        userId: user.id,
        openid,
        token,
        paymentStatus: user.payment_status
      }
    });
    
  } catch (error) {
    console.error('微信登录失败:', error);
    
    await errorLogService.logError(
      'WECHAT_LOGIN_ERROR',
      error.message,
      { endpoint: '/api/wechat/login', method: 'POST', stack: error.stack }
    );
    
    res.status(500).json({
      success: false,
      message: '登录失败，请重试'
    });
  }
});

/**
 * 生成小程序码
 * POST /api/wechat/qrcode
 * 
 * 请求体:
 * - path: 小程序页面路径
 * - width: 二维码宽度 (默认 280)
 * 
 * 响应:
 * - qrCodeUrl: 小程序码图片URL (base64)
 */
router.post('/qrcode', async (req, res) => {
  try {
    const { path = 'pages/launch/launch', width = 280 } = req.body;
    
    // 检查微信配置
    if (!WECHAT_APPID || !WECHAT_SECRET) {
      console.error('微信小程序配置缺失');
      return res.status(500).json({
        success: false,
        message: '服务器配置错误'
      });
    }
    
    // 获取 access_token
    const tokenResponse = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: {
        grant_type: 'client_credential',
        appid: WECHAT_APPID,
        secret: WECHAT_SECRET
      }
    });
    
    const { access_token, errcode: tokenErrcode, errmsg: tokenErrmsg } = tokenResponse.data;
    
    if (tokenErrcode || !access_token) {
      console.error('获取 access_token 失败:', tokenErrcode, tokenErrmsg);
      return res.status(500).json({
        success: false,
        message: '获取 access_token 失败'
      });
    }
    
    // 生成小程序码
    const qrResponse = await axios.post(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${access_token}`,
      {
        page: path,
        width,
        check_path: false,
        env_version: 'release' // 正式版
      },
      {
        responseType: 'arraybuffer'
      }
    );
    
    // 检查是否返回错误 (JSON 格式)
    const contentType = qrResponse.headers['content-type'];
    if (contentType && contentType.includes('application/json')) {
      const errorData = JSON.parse(qrResponse.data.toString());
      console.error('生成小程序码失败:', errorData);
      return res.status(500).json({
        success: false,
        message: errorData.errmsg || '生成小程序码失败'
      });
    }
    
    // 转换为 base64
    const base64Image = Buffer.from(qrResponse.data).toString('base64');
    const qrCodeUrl = `data:image/png;base64,${base64Image}`;
    
    res.json({
      success: true,
      data: {
        qrCodeUrl
      }
    });
    
  } catch (error) {
    console.error('生成小程序码失败:', error);
    
    await errorLogService.logError(
      'WECHAT_QRCODE_ERROR',
      error.message,
      { endpoint: '/api/wechat/qrcode', method: 'POST', stack: error.stack }
    );
    
    res.status(500).json({
      success: false,
      message: '生成小程序码失败'
    });
  }
});

module.exports = router;
