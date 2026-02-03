/**
 * 微信登录云函数（简化版）
 * 利用微信云开发的原生身份验证机制
 * 
 * 核心原理：
 * - 微信自动验证用户身份并注入 OPENID
 * - cloud.getWXContext() 返回的身份信息已经过微信验证，可信任
 * - 无需自定义 JWT 或复杂加密，微信已提供安全保障
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 复用支付云函数的数据库连接
const { safeDb } = require('../wxpayFunctions/db/mysql');

/**
 * 生成简单的 session token（仅用于 Web 扫码登录）
 * 注意：小程序端不需要 token，直接使用 OPENID
 */
function generateSessionToken(userId, openid) {
  const payload = {
    userId,
    openid,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天过期（毫秒）
  };
  
  const payloadStr = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadStr).toString('base64');
  
  // 简单签名（仅用于防篡改）
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'default-secret')
    .update(payloadStr)
    .digest('hex');
  
  return `${payloadBase64}.${signature}`;
}

/**
 * 格式化 MySQL 日期时间
 */
function formatMySQLDateTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

exports.main = async (event) => {
  // 1. 从微信获取已验证的用户身份（自动注入，已验证）
  const wxContext = cloud.getWXContext();
  const { OPENID, UNIONID, APPID } = wxContext;
  
  const { 
    userInfo, 
    source = 'miniprogram', 
    clientIp,
    sessionId // Web 扫码登录时的会话 ID
  } = event;
  
  console.log('[wechat_login] 收到登录请求:', { 
    source, 
    hasUserInfo: !!userInfo,
    hasOpenid: !!OPENID,
    sessionId: sessionId ? '***' : null
  });
  
  try {
    // 验证微信身份
    if (!OPENID) {
      console.error('[wechat_login] 无法获取 OPENID');
      return { code: -1, msg: '身份验证失败' };
    }
    
    // 2. 查询或创建用户
    let user = null;
    const { data: existingUsers, skipped, error: selectError } = await safeDb.select('users', 'openid', OPENID);
    
    if (selectError) {
      console.error('[wechat_login] 数据库查询失败');
      return { code: -1, msg: '服务暂时不可用，请稍后重试' };
    }
    
    if (!skipped && existingUsers && existingUsers.length > 0) {
      // 用户已存在，更新登录信息
      user = existingUsers[0];
      
      const updateData = {
        last_login_at: formatMySQLDateTime(),
        last_login_source: source
      };
      
      if (clientIp) {
        updateData.last_login_ip = clientIp;
      }
      
      // 更新用户信息（仅当提供了新信息时）
      if (userInfo) {
        if (userInfo.nickName) updateData.nickname = userInfo.nickName;
        if (userInfo.avatarUrl) updateData.avatar_url = userInfo.avatarUrl;
      }
      
      const updateResult = await safeDb.update('users', 'openid', OPENID, updateData);
      
      if (updateResult.error) {
        console.error('[wechat_login] 更新用户信息失败');
        // 不影响登录流程，继续
      }
      
      // 合并更新后的数据
      user = { ...user, ...updateData };
      
      console.log('[wechat_login] 用户登录成功:', user.id);
    } else {
      // 创建新用户
      const userId = crypto.randomUUID();
      
      const newUser = {
        id: userId,
        openid: OPENID,
        unionid: UNIONID || null,
        nickname: userInfo?.nickName || null,
        avatar_url: userInfo?.avatarUrl || null,
        phone: null,
        status: 'active',
        payment_status: 'free',
        last_login_at: formatMySQLDateTime(),
        last_login_ip: clientIp || null,
        last_login_source: source,
        created_at: formatMySQLDateTime(),
        updated_at: formatMySQLDateTime()
      };
      
      const insertResult = await safeDb.insert('users', newUser);
      
      if (insertResult.skipped || insertResult.error) {
        console.error('[wechat_login] 创建用户失败');
        return { code: -1, msg: '注册失败，请稍后重试' };
      }
      
      // 通知后端初始化用户余额等信息
      try {
        const apiBaseUrl = process.env.API_BASE_URL;
        if (apiBaseUrl) {
          const axios = require('axios');
          await axios.post(`${apiBaseUrl}/api/users/initialize`, {
            userId: userId
          }, {
            timeout: 5000,
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': process.env.INTERNAL_API_SECRET || ''
            }
          });
          console.log('[wechat_login] 用户初始化成功');
        }
      } catch (error) {
        console.error('[wechat_login] 用户初始化失败:', error.message);
        // 不影响主流程，后续访问时会自动初始化
      }
      
      user = newUser;
      console.log('[wechat_login] 新用户注册成功:', userId);
    }
    
    // 3. 检查账户状态
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
      
      // 封禁已过期，自动解封
      await safeDb.update('users', 'id', user.id, {
        status: 'active',
        ban_reason: null,
        ban_until: null
      });
      user.status = 'active';
    }
    
    // 4. 生成 token（仅用于 Web 扫码登录或后端 API 调用）
    // 注意：小程序端不需要 token，直接使用 OPENID 即可
    let token = null;
    if (source === 'web' || sessionId) {
      token = generateSessionToken(user.id, OPENID);
    }
    
    // 5. 如果是 Web 扫码登录，绑定 sessionId
    if (sessionId && source === 'web') {
      try {
        const apiBaseUrl = process.env.API_BASE_URL;
        if (apiBaseUrl) {
          const axios = require('axios');
          await axios.post(`${apiBaseUrl}/api/auth/bind-session`, {
            sessionId,
            token,
            status: 'success'
          }, {
            timeout: 5000,
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': process.env.INTERNAL_API_SECRET || ''
            }
          });
          console.log('[wechat_login] Session 绑定成功');
        }
      } catch (error) {
        console.error('[wechat_login] Session 绑定失败:', error.message);
        // 不影响主流程
      }
    }
    
    // 6. 返回用户信息
    const response = {
      code: 0,
      msg: 'success',
      data: {
        user: {
          id: user.id,
          openid: OPENID, // 小程序端可以直接使用 openid 作为身份标识
          nickname: user.nickname,
          avatar_url: user.avatar_url,
          phone: user.phone,
          status: user.status,
          payment_status: user.payment_status,
          created_at: user.created_at
        }
      }
    };
    
    // 仅在需要时返回 token
    if (token) {
      response.data.token = token;
    }
    
    return response;
    
  } catch (error) {
    console.error('[wechat_login] 登录失败:', error);
    // 不返回详细错误信息，避免信息泄露
    return { code: -1, msg: '登录失败，请稍后重试' };
  }
};
