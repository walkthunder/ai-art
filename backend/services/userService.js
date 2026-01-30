/**
 * 用户服务
 * 负责用户的创建、查询和更新
 */

const { query, transaction } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * 生成8位邀请码（使用数字和大写字母）
 * @returns {string} 8位邀请码
 */
function generateRandomInviteCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(8);
  let result = '';
  
  for (let i = 0; i < 8; i++) {
    result += chars[bytes[i] % chars.length];
  }
  
  return result;
}

/**
 * 创建新用户
 * @param {string} userId 用户ID (可选,如果不提供则自动生成)
 * @returns {Promise<Object>} 创建的用户对象
 */
async function createUser(userId = null) {
  try {
    // 如果没有提供userId,生成新的UUID
    const id = userId || uuidv4();
    
    // 检查用户是否已存在
    const existingUser = await getUserById(id);
    if (existingUser) {
      console.log(`用户 ${id} 已存在,返回现有用户`);
      return existingUser;
    }
    
    // 插入新用户
    const sql = `
      INSERT INTO users (id, payment_status, regenerate_count)
      VALUES (?, 'free', 3)
    `;
    
    await query(sql, [id]);
    
    console.log(`用户 ${id} 创建成功`);
    
    // 返回创建的用户
    return await getUserById(id);
  } catch (error) {
    console.error('创建用户失败:', error);
    throw new Error(`创建用户失败: ${error.message}`);
  }
}

/**
 * 创建带有微信openid的新用户
 * @param {string} userId 用户ID
 * @param {string} openid 微信openid
 * @returns {Promise<Object>} 创建的用户对象
 */
async function createUserWithOpenid(userId, openid) {
  try {
    // 检查用户是否已存在
    const existingUser = await getUserById(userId);
    if (existingUser) {
      console.log(`用户 ${userId} 已存在,返回现有用户`);
      return existingUser;
    }
    
    // 检查openid是否已被使用
    const existingOpenidUser = await getUserByOpenid(openid);
    if (existingOpenidUser) {
      console.log(`openid ${openid} 已存在,返回现有用户`);
      return existingOpenidUser;
    }
    
    // 插入新用户
    const sql = `
      INSERT INTO users (id, openid, payment_status, regenerate_count)
      VALUES (?, ?, 'free', 3)
    `;
    
    await query(sql, [userId, openid]);
    
    console.log(`用户 ${userId} (openid: ${openid.substring(0, 8)}...) 创建成功`);
    
    // 返回创建的用户
    return await getUserById(userId);
  } catch (error) {
    console.error('创建用户失败:', error);
    throw new Error(`创建用户失败: ${error.message}`);
  }
}

/**
 * 根据微信openid获取用户
 * @param {string} openid 微信openid
 * @returns {Promise<Object|null>} 用户对象,如果不存在则返回null
 */
async function getUserByOpenid(openid) {
  try {
    const sql = `
      SELECT id, openid, nickname, avatar_url,
             created_at, updated_at, payment_status, regenerate_count
      FROM users
      WHERE openid = ?
    `;
    
    const rows = await query(sql, [openid]);
    
    if (rows.length === 0) {
      return null;
    }
    
    return rows[0];
  } catch (error) {
    console.error('根据openid查询用户失败:', error);
    throw new Error(`根据openid查询用户失败: ${error.message}`);
  }
}

/**
 * 根据微信unionid获取用户
 * @param {string} unionid 微信unionid
 * @returns {Promise<Object|null>} 用户对象,如果不存在则返回null
 */
async function getUserByUnionid(unionid) {
  try {
    // unionid 字段暂未在数据库中实现，返回 null
    console.warn('getUserByUnionid: unionid 字段未在数据库中实现');
    return null;
  } catch (error) {
    console.error('根据unionid查询用户失败:', error);
    throw new Error(`根据unionid查询用户失败: ${error.message}`);
  }
}

/**
 * 根据ID获取用户
 * @param {string} userId 用户ID
 * @returns {Promise<Object|null>} 用户对象,如果不存在则返回null
 */
async function getUserById(userId) {
  try {
    const sql = `
      SELECT id, openid, nickname, avatar_url,
             created_at, updated_at, payment_status, regenerate_count,
             usage_count, usage_limit, invite_code, has_ever_paid, first_payment_at, last_payment_at
      FROM users
      WHERE id = ?
    `;
    
    const rows = await query(sql, [userId]);
    
    if (rows.length === 0) {
      return null;
    }
    
    return rows[0];
  } catch (error) {
    console.error('查询用户失败:', error);
    throw new Error(`查询用户失败: ${error.message}`);
  }
}

/**
 * 更新用户付费状态
 * @param {string} userId 用户ID
 * @param {string} paymentStatus 付费状态 ('free', 'basic', 'premium')
 * @returns {Promise<Object>} 更新后的用户对象
 */
async function updateUserPaymentStatus(userId, paymentStatus) {
  try {
    // 验证付费状态
    const validStatuses = ['free', 'basic', 'premium'];
    if (!validStatuses.includes(paymentStatus)) {
      throw new Error(`无效的付费状态: ${paymentStatus}`);
    }
    
    const sql = `
      UPDATE users
      SET payment_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    await query(sql, [paymentStatus, userId]);
    
    console.log(`用户 ${userId} 付费状态更新为 ${paymentStatus}`);
    
    // 返回更新后的用户
    return await getUserById(userId);
  } catch (error) {
    console.error('更新用户付费状态失败:', error);
    throw new Error(`更新用户付费状态失败: ${error.message}`);
  }
}

/**
 * 更新用户重生成次数
 * @param {string} userId 用户ID
 * @param {number} count 重生成次数
 * @returns {Promise<Object>} 更新后的用户对象
 */
async function updateUserRegenerateCount(userId, count) {
  try {
    const sql = `
      UPDATE users
      SET regenerate_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    await query(sql, [count, userId]);
    
    console.log(`用户 ${userId} 重生成次数更新为 ${count}`);
    
    // 返回更新后的用户
    return await getUserById(userId);
  } catch (error) {
    console.error('更新用户重生成次数失败:', error);
    throw new Error(`更新用户重生成次数失败: ${error.message}`);
  }
}

/**
 * 减少用户重生成次数
 * @param {string} userId 用户ID
 * @returns {Promise<Object>} 更新后的用户对象
 */
async function decrementRegenerateCount(userId) {
  try {
    const sql = `
      UPDATE users
      SET regenerate_count = GREATEST(regenerate_count - 1, 0),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    await query(sql, [userId]);
    
    console.log(`用户 ${userId} 重生成次数减1`);
    
    // 返回更新后的用户
    return await getUserById(userId);
  } catch (error) {
    console.error('减少用户重生成次数失败:', error);
    throw new Error(`减少用户重生成次数失败: ${error.message}`);
  }
}

/**
 * 获取或创建用户
 * 如果用户不存在则创建,存在则返回
 * @param {string} userId 用户ID
 * @returns {Promise<Object>} 用户对象
 */
async function getOrCreateUser(userId) {
  try {
    // 先尝试获取用户
    let user = await getUserById(userId);
    
    // 如果用户不存在,创建新用户
    if (!user) {
      console.log(`用户 ${userId} 不存在,创建新用户`);
      user = await createUser(userId);
    }
    
    return user;
  } catch (error) {
    console.error('获取或创建用户失败:', error);
    throw new Error(`获取或创建用户失败: ${error.message}`);
  }
}

/**
 * 创建带邀请码的新用户
 * @param {string} userId - 用户ID
 * @param {string} openid - 微信openid
 * @param {string} inviteCode - 邀请码（可选）
 * @returns {Promise<Object>} 用户对象
 */
async function createUserWithInvite(userId, openid, inviteCode = null) {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    // 检查用户是否已存在
    const existingUser = await getUserById(userId);
    if (existingUser) {
      console.log(`用户 ${userId} 已存在,返回现有用户`);
      return existingUser;
    }
    
    // 检查openid是否已被使用
    const existingOpenidUser = await getUserByOpenid(openid);
    if (existingOpenidUser) {
      console.log(`openid ${openid} 已存在,返回现有用户`);
      return existingOpenidUser;
    }
    
    await connection.beginTransaction();
    
    // 生成新用户的邀请码
    let newUserInviteCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      newUserInviteCode = generateRandomInviteCode();
      
      // 检查邀请码是否已存在
      const [uniqueRows] = await connection.execute(
        'SELECT COUNT(*) as count FROM users WHERE invite_code = ?',
        [newUserInviteCode]
      );
      
      isUnique = uniqueRows[0].count === 0;
      attempts++;
    }
    
    if (!isUnique) {
      throw new Error('生成唯一邀请码失败，请重试');
    }
    
    // 插入新用户（初始化usage_count=3, has_ever_paid=false）
    await connection.execute(
      `INSERT INTO users (id, openid, payment_status, regenerate_count, usage_count, usage_limit, has_ever_paid, invite_code)
       VALUES (?, ?, 'free', 3, 3, 3, FALSE, ?)`,
      [userId, openid, newUserInviteCode]
    );
    
    // 如果提供了邀请码，处理邀请奖励
    if (inviteCode) {
      // 验证邀请码
      const [inviterRows] = await connection.execute(
        'SELECT id FROM users WHERE invite_code = ?',
        [inviteCode]
      );
      
      if (inviterRows.length > 0) {
        const inviterId = inviterRows[0].id;
        
        // 验证不是自我邀请
        if (inviterId !== userId) {
          // 创建invite_records记录
          const inviteRecordId = uuidv4();
          await connection.execute(
            `INSERT INTO invite_records (id, inviter_id, invitee_id, invite_code, reward_granted, created_at)
             VALUES (?, ?, ?, ?, TRUE, NOW())`,
            [inviteRecordId, inviterId, userId, inviteCode]
          );
          
          // 增加inviter的usage_count
          await connection.execute(
            'UPDATE users SET usage_count = usage_count + 1 WHERE id = ?',
            [inviterId]
          );
          
          // 获取inviter的新usage_count用于日志
          const [updatedInviterRows] = await connection.execute(
            'SELECT usage_count FROM users WHERE id = ?',
            [inviterId]
          );
          const newInviterCount = updatedInviterRows[0]?.usage_count || 0;
          
          // 记录usage_logs
          const logId = uuidv4();
          await connection.execute(
            `INSERT INTO usage_logs (id, user_id, action_type, amount, remaining_count, reason, reference_id, created_at)
             VALUES (?, ?, 'increment', 1, ?, 'invite_reward', ?, NOW())`,
            [logId, inviterId, newInviterCount, inviteRecordId]
          );
          
          // 更新或创建invite_stats
          const [statsRows] = await connection.execute(
            'SELECT user_id FROM invite_stats WHERE user_id = ?',
            [inviterId]
          );
          
          if (statsRows.length === 0) {
            await connection.execute(
              `INSERT INTO invite_stats (user_id, total_invites, successful_invites, total_rewards, last_invite_at, updated_at)
               VALUES (?, 1, 1, 1, NOW(), NOW())`,
              [inviterId]
            );
          } else {
            await connection.execute(
              `UPDATE invite_stats 
               SET total_invites = total_invites + 1,
                   successful_invites = successful_invites + 1,
                   total_rewards = total_rewards + 1,
                   last_invite_at = NOW(),
                   updated_at = NOW()
               WHERE user_id = ?`,
              [inviterId]
            );
          }
        }
      }
    }
    
    await connection.commit();
    
    console.log(`用户 ${userId} (openid: ${openid.substring(0, 8)}...) 创建成功，邀请码: ${newUserInviteCode}`);
    
    // 返回创建的用户
    return await getUserById(userId);
  } catch (error) {
    await connection.rollback();
    console.error('创建带邀请码的用户失败:', error);
    throw new Error(`创建带邀请码的用户失败: ${error.message}`);
  } finally {
    connection.release();
  }
}

/**
 * 更新用户付费状态（扩展版本）
 * @param {string} userId - 用户ID
 * @param {string} tier - 'basic' | 'premium'
 * @param {number} amount - 订单金额
 * @returns {Promise<Object>} 更新后的用户对象
 */
async function processPaymentUpgrade(userId, tier, amount) {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    // 验证套餐类型
    const validTiers = ['basic', 'premium'];
    if (!validTiers.includes(tier)) {
      throw new Error(`无效的套餐类型: ${tier}`);
    }
    
    // 确定增加的使用次数
    const usageIncrement = tier === 'basic' ? 5 : 20;
    
    await connection.beginTransaction();
    
    // 获取用户当前状态（使用行锁）
    const [userRows] = await connection.execute(
      'SELECT usage_count, has_ever_paid, first_payment_at FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );
    
    if (userRows.length === 0) {
      throw new Error('用户不存在');
    }
    
    const user = userRows[0];
    const currentCount = user.usage_count || 0;
    const hasEverPaid = user.has_ever_paid || false;
    const isFirstPayment = !hasEverPaid;
    
    // 更新用户信息
    if (isFirstPayment) {
      // 首次付费：设置has_ever_paid=true, first_payment_at, last_payment_at, 增加usage_count
      await connection.execute(
        `UPDATE users 
         SET usage_count = usage_count + ?,
             has_ever_paid = TRUE,
             first_payment_at = NOW(),
             last_payment_at = NOW(),
             payment_status = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [usageIncrement, tier, userId]
      );
    } else {
      // 后续付费：只更新last_payment_at和usage_count
      await connection.execute(
        `UPDATE users 
         SET usage_count = usage_count + ?,
             last_payment_at = NOW(),
             payment_status = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [usageIncrement, tier, userId]
      );
    }
    
    const newCount = currentCount + usageIncrement;
    
    // 记录usage_logs
    const logId = uuidv4();
    await connection.execute(
      `INSERT INTO usage_logs (id, user_id, action_type, amount, remaining_count, reason, reference_id, created_at)
       VALUES (?, ?, 'increment', ?, ?, 'payment', NULL, NOW())`,
      [logId, userId, usageIncrement, newCount]
    );
    
    await connection.commit();
    
    console.log(`用户 ${userId} 付费升级成功: ${tier} (+${usageIncrement}次), 首次付费: ${isFirstPayment}`);
    
    // 返回更新后的用户
    return await getUserById(userId);
  } catch (error) {
    await connection.rollback();
    console.error('处理付费升级失败:', error);
    throw new Error(`处理付费升级失败: ${error.message}`);
  } finally {
    connection.release();
  }
}

/**
 * 获取用户完整信息（包含使用次数）
 * @param {string} userId - 用户ID
 * @returns {Promise<Object>} 用户完整信息
 */
async function getUserWithUsageInfo(userId) {
  try {
    const sql = `
      SELECT 
        id, 
        openid, 
        created_at, 
        updated_at, 
        payment_status, 
        regenerate_count,
        usage_count,
        usage_limit,
        invite_code,
        has_ever_paid,
        first_payment_at,
        last_payment_at
      FROM users
      WHERE id = ?
    `;
    
    const rows = await query(sql, [userId]);
    
    if (rows.length === 0) {
      return null;
    }
    
    const user = rows[0];
    
    // 添加计算字段
    return {
      ...user,
      user_type: user.has_ever_paid ? 'paid' : 'free',
      can_generate: (user.usage_count || 0) > 0
    };
  } catch (error) {
    console.error('获取用户完整信息失败:', error);
    throw new Error(`获取用户完整信息失败: ${error.message}`);
  }
}

module.exports = {
  createUser,
  createUserWithOpenid,
  getUserById,
  getUserByOpenid,
  getUserByUnionid,
  updateUserPaymentStatus,
  updateUserRegenerateCount,
  decrementRegenerateCount,
  getOrCreateUser,
  createUserWithInvite,
  processPaymentUpgrade,
  getUserWithUsageInfo
};
