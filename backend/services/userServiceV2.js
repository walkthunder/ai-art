/**
 * 用户服务 V2
 * 使用新的数据库结构（users + user_balances + user_payments + user_invites）
 */

const { query } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { convertObjectTimesToCST } = require('../utils/timezone');
const balanceService = require('./balanceService');

/**
 * 生成8位邀请码
 */
function generateInviteCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(8);
  let result = '';
  
  for (let i = 0; i < 8; i++) {
    result += chars[bytes[i] % chars.length];
  }
  
  return result;
}

/**
 * 创建新用户（使用存储过程）
 * @param {string} userId - 用户ID
 * @param {string} openid - 微信openid
 * @param {string} inviteCode - 邀请码（可选）
 * @returns {Promise<Object>} 用户信息
 */
async function createUser(userId, openid, inviteCode = null) {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    // 检查用户是否已存在
    const existingUser = await getUserById(userId);
    if (existingUser) {
      console.log(`用户 ${userId} 已存在`);
      return existingUser;
    }
    
    await connection.beginTransaction();
    
    // 1. 创建用户
    await connection.execute(
      'INSERT INTO users (id, openid, payment_status, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [userId, openid, 'free']
    );
    
    // 2. 初始化余额（每个模式3次免费）
    const balances = [
      { id: uuidv4(), type: 'free_puzzle', amount: 3 },
      { id: uuidv4(), type: 'free_transform', amount: 3 },
      { id: uuidv4(), type: 'paid', amount: 0 }
    ];
    
    for (const balance of balances) {
      await connection.execute(
        'INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [balance.id, userId, balance.type, balance.amount]
      );
    }
    
    // 3. 初始化付费信息
    await connection.execute(
      'INSERT INTO user_payments (id, user_id, has_ever_paid, current_tier, created_at, updated_at) VALUES (?, ?, FALSE, ?, NOW(), NOW())',
      [uuidv4(), userId, 'free']
    );
    
    // 4. 生成并保存邀请码
    let newInviteCode = generateInviteCode();
    let attempts = 0;
    let isUnique = false;
    
    while (!isUnique && attempts < 10) {
      const [existingCodes] = await connection.execute(
        'SELECT COUNT(*) as count FROM user_invites WHERE invite_code = ?',
        [newInviteCode]
      );
      
      if (existingCodes[0].count === 0) {
        isUnique = true;
      } else {
        newInviteCode = generateInviteCode();
        attempts++;
      }
    }
    
    if (!isUnique) {
      throw new Error('生成唯一邀请码失败');
    }
    
    await connection.execute(
      'INSERT INTO user_invites (id, user_id, invite_code, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [uuidv4(), userId, newInviteCode]
    );
    
    // 5. 处理邀请关系
    if (inviteCode) {
      const [inviterRows] = await connection.execute(
        'SELECT user_id FROM user_invites WHERE invite_code = ?',
        [inviteCode]
      );
      
      if (inviterRows.length > 0) {
        const inviterId = inviterRows[0].user_id;
        
        if (inviterId !== userId) {
          // 更新被邀请人的邀请关系
          await connection.execute(
            'UPDATE user_invites SET invited_by = ? WHERE user_id = ?',
            [inviterId, userId]
          );
          
          // 给邀请人增加1次付费次数
          await connection.execute(
            `INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
             VALUES (?, ?, 'paid', 1, NOW(), NOW())
             ON DUPLICATE KEY UPDATE amount = amount + 1, updated_at = NOW()`,
            [`${inviterId}-paid`, inviterId]
          );
          
          // 记录邀请记录
          const inviteRecordId = uuidv4();
          await connection.execute(
            'INSERT INTO invite_records (id, inviter_id, invitee_id, invite_code, reward_granted, created_at) VALUES (?, ?, ?, ?, TRUE, NOW())',
            [inviteRecordId, inviterId, userId, inviteCode]
          );
          
          // 获取邀请人的新余额
          const [balanceRows] = await connection.execute(
            'SELECT amount FROM user_balances WHERE user_id = ? AND balance_type = ?',
            [inviterId, 'paid']
          );
          const newBalance = balanceRows[0]?.amount || 0;
          
          // 记录 usage_logs
          const logId = uuidv4();
          await connection.execute(
            `INSERT INTO usage_logs (id, user_id, action_type, amount, remaining_count, reason, reference_id, mode, created_at)
             VALUES (?, ?, 'increment', 1, ?, 'invite_reward', ?, 'paid', NOW())`,
            [logId, inviterId, newBalance, inviteRecordId]
          );
          
          // 更新或创建 invite_stats
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
    
    console.log(`用户 ${userId} 创建成功，邀请码: ${newInviteCode}`);
    
    return await getUserById(userId);
  } catch (error) {
    await connection.rollback();
    console.error('创建用户失败:', error);
    throw new Error(`创建用户失败: ${error.message}`);
  } finally {
    connection.release();
  }
}

/**
 * 根据ID获取用户完整信息
 * @param {string} userId - 用户ID
 * @returns {Promise<Object|null>} 用户信息
 */
async function getUserById(userId) {
  try {
    const sql = `
      SELECT * FROM users WHERE id = ?
    `;
    
    const rows = await query(sql, [userId]);
    
    if (rows.length === 0) {
      return null;
    }
    
    return convertObjectTimesToCST(rows[0]);
  } catch (error) {
    console.error('查询用户失败:', error);
    throw new Error(`查询用户失败: ${error.message}`);
  }
}

/**
 * 根据openid获取用户
 * @param {string} openid - 微信openid
 * @returns {Promise<Object|null>} 用户信息
 */
async function getUserByOpenid(openid) {
  try {
    const sql = `
      SELECT * FROM users WHERE openid = ?
    `;
    
    const rows = await query(sql, [openid]);
    
    if (rows.length === 0) {
      return null;
    }
    
    return convertObjectTimesToCST(rows[0]);
  } catch (error) {
    console.error('根据openid查询用户失败:', error);
    throw new Error(`根据openid查询用户失败: ${error.message}`);
  }
}

/**
 * 处理付费升级
 * @param {string} userId - 用户ID
 * @param {string} tier - 套餐类型 ('basic' | 'premium')
 * @param {number} amount - 订单金额
 * @returns {Promise<Object>} 更新后的用户信息
 */
async function processPaymentUpgrade(userId, tier, amount) {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    const validTiers = ['basic', 'premium'];
    if (!validTiers.includes(tier)) {
      throw new Error(`无效的套餐类型: ${tier}`);
    }
    
    // 确定增加的次数
    const usageIncrement = tier === 'basic' ? 5 : 20;
    
    await connection.beginTransaction();
    
    // 获取用户当前付费状态
    const [paymentRows] = await connection.execute(
      'SELECT has_ever_paid FROM user_payments WHERE user_id = ? FOR UPDATE',
      [userId]
    );
    
    const isFirstPayment = paymentRows.length === 0 || !paymentRows[0].has_ever_paid;
    
    // 更新付费信息
    if (isFirstPayment) {
      await connection.execute(
        `INSERT INTO user_payments (id, user_id, has_ever_paid, first_payment_at, last_payment_at, total_paid_amount, payment_count, current_tier, created_at, updated_at)
         VALUES (?, ?, TRUE, NOW(), NOW(), ?, 1, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE 
           has_ever_paid = TRUE,
           first_payment_at = COALESCE(first_payment_at, NOW()),
           last_payment_at = NOW(),
           total_paid_amount = total_paid_amount + ?,
           payment_count = payment_count + 1,
           current_tier = ?,
           updated_at = NOW()`,
        [`${userId}-payment`, userId, amount, tier, amount, tier]
      );
    } else {
      await connection.execute(
        `UPDATE user_payments 
         SET last_payment_at = NOW(),
             total_paid_amount = total_paid_amount + ?,
             payment_count = payment_count + 1,
             current_tier = ?,
             updated_at = NOW()
         WHERE user_id = ?`,
        [amount, tier, userId]
      );
    }
    
    // 更新 users 表的 payment_status（冗余但有价值）
    await connection.execute(
      'UPDATE users SET payment_status = ?, updated_at = NOW() WHERE id = ?',
      [tier, userId]
    );
    
    // 增加付费余额
    await connection.execute(
      `INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
       VALUES (?, ?, 'paid', ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE amount = amount + ?, updated_at = NOW()`,
      [`${userId}-paid`, userId, usageIncrement, usageIncrement]
    );
    
    // 获取新余额
    const [balanceRows] = await connection.execute(
      'SELECT amount FROM user_balances WHERE user_id = ? AND balance_type = ?',
      [userId, 'paid']
    );
    const newBalance = balanceRows[0]?.amount || 0;
    
    // 记录 usage_logs
    const logId = uuidv4();
    await connection.execute(
      `INSERT INTO usage_logs (id, user_id, action_type, amount, remaining_count, reason, reference_id, mode, created_at)
       VALUES (?, ?, 'increment', ?, ?, 'payment', NULL, 'paid', NOW())`,
      [logId, userId, usageIncrement, newBalance]
    );
    
    await connection.commit();
    
    console.log(`用户 ${userId} 付费升级成功: ${tier} (+${usageIncrement}次), 首次付费: ${isFirstPayment}`);
    
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
 * 获取或创建用户
 * @param {string} userId - 用户ID
 * @param {string} openid - 微信openid
 * @returns {Promise<Object>} 用户信息
 */
async function getOrCreateUser(userId, openid) {
  try {
    let user = await getUserById(userId);
    
    if (!user) {
      console.log(`用户 ${userId} 不存在，创建新用户`);
      user = await createUser(userId, openid);
    }
    
    return user;
  } catch (error) {
    console.error('获取或创建用户失败:', error);
    throw new Error(`获取或创建用户失败: ${error.message}`);
  }
}

module.exports = {
  createUser,
  getUserById,
  getUserByOpenid,
  getUserByUnionid,
  updatePaymentStatus,
  updateUserPaymentStatus: updatePaymentStatus,  // 别名
  processPaymentUpgrade,
  getOrCreateUser,
  generateInviteCode
};

/**
 * 通过 unionid 获取用户
 * @param {string} unionid - 微信 unionid
 * @returns {Promise<Object|null>} 用户信息
 */
async function getUserByUnionid(unionid) {
  try {
    if (!unionid) return null;
    
    const sql = `
      SELECT * FROM users WHERE unionid = ?
    `;
    
    const rows = await query(sql, [unionid]);
    
    if (rows.length === 0) {
      return null;
    }
    
    return convertObjectTimesToCST(rows[0]);
  } catch (error) {
    console.error('根据unionid查询用户失败:', error);
    throw new Error(`根据unionid查询用户失败: ${error.message}`);
  }
}

/**
 * 更新用户支付状态
 * @param {string} userId - 用户ID
 * @param {string} tier - 套餐类型 ('basic' | 'premium')
 * @param {number} amount - 订单金额
 * @returns {Promise<Object>} 更新结果
 */
async function updatePaymentStatus(userId, tier, amount) {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 获取当前付费信息
    const [paymentRows] = await connection.execute(
      'SELECT has_ever_paid, first_payment_at FROM user_payments WHERE user_id = ? FOR UPDATE',
      [userId]
    );
    
    const isFirstPayment = !paymentRows[0]?.has_ever_paid;
    
    // 更新 user_payments 表
    if (isFirstPayment) {
      await connection.execute(
        `UPDATE user_payments 
         SET has_ever_paid = TRUE,
             first_payment_at = NOW(),
             last_payment_at = NOW(),
             current_tier = ?,
             payment_count = payment_count + 1,
             total_paid_amount = total_paid_amount + ?,
             updated_at = NOW()
         WHERE user_id = ?`,
        [tier, amount, userId]
      );
    } else {
      await connection.execute(
        `UPDATE user_payments 
         SET last_payment_at = NOW(),
             current_tier = ?,
             payment_count = payment_count + 1,
             total_paid_amount = total_paid_amount + ?,
             updated_at = NOW()
         WHERE user_id = ?`,
        [tier, amount, userId]
      );
    }
    
    // 更新 users 表的 payment_status（冗余字段，用于快速查询）
    await connection.execute(
      'UPDATE users SET payment_status = ?, updated_at = NOW() WHERE id = ?',
      [tier, userId]
    );
    
    await connection.commit();
    
    return {
      success: true,
      is_first_payment: isFirstPayment
    };
  } catch (error) {
    await connection.rollback();
    console.error('更新支付状态失败:', error);
    throw new Error(`更新支付状态失败: ${error.message}`);
  } finally {
    connection.release();
  }
}
