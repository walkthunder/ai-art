/**
 * 获取用户信息云函数（简化版）
 * 
 * 两种使用方式：
 * 1. 小程序端：直接使用 OPENID（微信自动验证）
 * 2. Web 端：使用 token（用于后端 API 调用）
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 复用支付云函数的数据库连接
const { safeDb } = require('../wxpayFunctions/db/mysql');

/**
 * 验证简单的 session token
 */
function verifySessionToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      console.warn('[wechat_get_user] Token 格式错误');
      return null;
    }
    
    const [payloadBase64, signature] = parts;
    
    // 解码 payload
    const payloadStr = Buffer.from(payloadBase64, 'base64').toString('utf8');
    const payload = JSON.parse(payloadStr);
    
    // 验证签名
    const expectedSignature = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'default-secret')
      .update(payloadStr)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      console.warn('[wechat_get_user] Token 签名验证失败');
      return null;
    }
    
    // 检查是否过期
    if (payload.exp && payload.exp < Date.now()) {
      console.warn('[wechat_get_user] Token 已过期');
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error('[wechat_get_user] Token 解析失败:', error.message);
    return null;
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const { token } = event;
  
  console.log('[wechat_get_user] 收到获取用户信息请求');
  
  try {
    let openid = null;
    let userId = null;
    
    // 方式1：小程序端 - 直接使用微信验证的 OPENID
    if (wxContext.OPENID) {
      openid = wxContext.OPENID;
      console.log('[wechat_get_user] 使用微信 OPENID 验证');
    }
    // 方式2：Web 端 - 使用 token
    else if (token) {
      const payload = verifySessionToken(token);
      if (!payload) {
        return { code: -1, msg: '认证信息无效或已过期' };
      }
      openid = payload.openid;
      userId = payload.userId;
      console.log('[wechat_get_user] 使用 token 验证');
    }
    else {
      return { code: -1, msg: '缺少认证信息' };
    }
    
    // 查询用户信息
    const queryField = userId ? 'id' : 'openid';
    const queryValue = userId || openid;
    
    const { data: users, skipped, error: selectError } = await safeDb.select('users', queryField, queryValue);
    
    if (selectError) {
      console.error('[wechat_get_user] 数据库查询失败');
      return { code: -1, msg: '服务暂时不可用，请稍后重试' };
    }
    
    if (skipped || !users || users.length === 0) {
      return { code: -1, msg: '用户不存在' };
    }
    
    const user = users[0];
    
    // 验证 openid 匹配
    if (user.openid !== openid) {
      console.error('[wechat_get_user] OPENID 不匹配');
      return { code: -1, msg: '认证信息无效' };
    }
    
    // 检查账户状态
    if (user.status === 'banned') {
      const banUntil = user.ban_until ? new Date(user.ban_until) : null;
      const isBanExpired = banUntil && banUntil < new Date();
      
      if (!isBanExpired) {
        return { 
          code: -1, 
          msg: '账户已被封禁',
          data: { ban_until: user.ban_until } 
        };
      }
    }
    
    console.log('[wechat_get_user] 用户信息获取成功');
    
    // 返回用户信息
    return {
      code: 0,
      msg: 'success',
      data: {
        user: {
          id: user.id,
          openid: user.openid,
          nickname: user.nickname,
          avatar_url: user.avatar_url,
          phone: user.phone,
          status: user.status,
          payment_status: user.payment_status,
          last_login_at: user.last_login_at,
          created_at: user.created_at
        }
      }
    };
    
  } catch (error) {
    console.error('[wechat_get_user] 获取用户信息失败:', error);
    return { code: -1, msg: '服务暂时不可用，请稍后重试' };
  }
};
