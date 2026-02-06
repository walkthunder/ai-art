/**
 * 邀请服务
 * 负责邀请码生成、验证、邀请注册处理和统计
 */

const { query } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const balanceService = require('./balanceService');

/**
 * 生成8位邀请码（使用数字和大写字母）
 * 使用crypto.randomBytes确保随机性和唯一性
 * @returns {string} 8位邀请码
 */
function generateRandomCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(8);
  let result = '';
  
  for (let i = 0; i < 8; i++) {
    result += chars[bytes[i] % chars.length];
  }
  
  return result;
}

/**
 * 生成邀请码
 * @param {string} userId - 用户ID
 * @returns {Promise<string>} 邀请码
 */
async function generateInviteCode(userId) {
  try {
    // 检查用户是否已有邀请码（从 user_invites 表）
    const checkSql = `
      SELECT invite_code
      FROM user_invites
      WHERE user_id = ?
    `;
    
    const rows = await query(checkSql, [userId]);
    
    // 如果已有邀请码，直接返回
    if (rows.length > 0 && rows[0].invite_code) {
      return rows[0].invite_code;
    }
    
    // 验证用户是否存在
    const userCheckSql = 'SELECT id FROM users WHERE id = ?';
    const userRows = await query(userCheckSql, [userId]);
    if (userRows.length === 0) {
      throw new Error(`用户 ${userId} 不存在`);
    }
    
    // 生成新的邀请码，确保唯一性
    let inviteCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      inviteCode = generateRandomCode();
      
      // 检查邀请码是否已存在（从 user_invites 表）
      const uniqueCheckSql = `
        SELECT COUNT(*) as count
        FROM user_invites
        WHERE invite_code = ?
      `;
      
      const uniqueRows = await query(uniqueCheckSql, [inviteCode]);
      isUnique = uniqueRows[0].count === 0;
      attempts++;
    }
    
    if (!isUnique) {
      throw new Error('生成唯一邀请码失败，请重试');
    }
    
    // 插入或更新用户的邀请码（使用 INSERT ... ON DUPLICATE KEY UPDATE）
    const inviteId = `${userId}-invite`;
    const upsertSql = `
      INSERT INTO user_invites (id, user_id, invite_code, created_at, updated_at)
      VALUES (?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE invite_code = ?, updated_at = NOW()
    `;
    
    await query(upsertSql, [inviteId, userId, inviteCode, inviteCode]);
    
    return inviteCode;
  } catch (error) {
    console.error('生成邀请码失败:', error);
    throw new Error(`生成邀请码失败: ${error.message}`);
  }
}

/**
 * 验证邀请码
 * @param {string} inviteCode - 邀请码
 * @returns {Promise<Object>} { valid, inviter_id, inviter_nickname }
 */
async function validateInviteCode(inviteCode) {
  try {
    // 验证邀请码格式（8位字母数字组合）
    if (!inviteCode || typeof inviteCode !== 'string') {
      return {
        valid: false,
        inviter_id: null,
        inviter_nickname: null,
        error: '邀请码格式无效'
      };
    }
    
    if (inviteCode.length !== 8) {
      return {
        valid: false,
        inviter_id: null,
        inviter_nickname: null,
        error: '邀请码长度必须为8位'
      };
    }
    
    // 查询邀请码对应的用户（从 user_invites 表）
    const sql = `
      SELECT ui.user_id as id, u.nickname
      FROM user_invites ui
      LEFT JOIN users u ON ui.user_id = u.id
      WHERE ui.invite_code = ?
    `;
    
    const rows = await query(sql, [inviteCode]);
    
    if (rows.length === 0) {
      return {
        valid: false,
        inviter_id: null,
        inviter_nickname: null,
        error: '邀请码不存在'
      };
    }
    
    const inviter = rows[0];
    
    return {
      valid: true,
      inviter_id: inviter.id,
      inviter_nickname: inviter.nickname || '未知用户'
    };
  } catch (error) {
    console.error('验证邀请码失败:', error);
    throw new Error(`验证邀请码失败: ${error.message}`);
  }
}

/**
 * 处理邀请注册
 * @param {string} inviteCode - 邀请码
 * @param {string} newUserId - 新用户ID
 * @param {string} openid - 新用户openid
 * @returns {Promise<Object>} { success, inviter_id, reward_granted }
 */
async function processInviteRegistration(inviteCode, newUserId, openid) {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 在事务中验证邀请码
    const [inviterRows] = await connection.execute(
      `SELECT ui.user_id as id, u.nickname
       FROM user_invites ui
       LEFT JOIN users u ON ui.user_id = u.id
       WHERE ui.invite_code = ?`,
      [inviteCode]
    );
    
    if (inviterRows.length === 0) {
      throw new Error('邀请码不存在');
    }
    
    const inviterId = inviterRows[0].id;
    
    // 验证不是自我邀请
    if (inviterId === newUserId) {
      throw new Error('SELF_INVITE_NOT_ALLOWED');
    }
    
    // 验证invitee是新用户（不存在记录）
    const [existingUserRows] = await connection.execute(
      'SELECT id FROM users WHERE id = ? OR openid = ?',
      [newUserId, openid]
    );
    
    if (existingUserRows.length > 0) {
      throw new Error('USER_ALREADY_EXISTS');
    }
    
    // 创建新用户（不再在 users 表存储 invite_code）
    await connection.execute(
      `INSERT INTO users (id, openid, created_at, updated_at) 
       VALUES (?, ?, NOW(), NOW())`,
      [newUserId, openid]
    );
    
    // 初始化新用户的余额（在 user_balances 表中）
    const balanceIdPuzzle = `${newUserId}-puzzle`;
    const balanceIdTransform = `${newUserId}-transform`;
    const balanceIdPaid = `${newUserId}-paid`;
    
    await connection.execute(
      `INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
       VALUES 
         (?, ?, 'free_puzzle', 3, NOW(), NOW()),
         (?, ?, 'free_transform', 3, NOW(), NOW()),
         (?, ?, 'paid', 0, NOW(), NOW())`,
      [balanceIdPuzzle, newUserId, balanceIdTransform, newUserId, balanceIdPaid, newUserId]
    );
    
    // 初始化新用户的付费信息
    const paymentId = `${newUserId}-payment`;
    await connection.execute(
      `INSERT INTO user_payments (id, user_id, has_ever_paid, current_tier, created_at, updated_at)
       VALUES (?, ?, FALSE, 'free', NOW(), NOW())`,
      [paymentId, newUserId]
    );
    
    // 生成并存储新用户的邀请码（在 user_invites 表中）
    const newUserInviteCode = generateRandomCode();
    const inviteIdNew = `${newUserId}-invite`;
    
    await connection.execute(
      `INSERT INTO user_invites (id, user_id, invite_code, invited_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [inviteIdNew, newUserId, newUserInviteCode, inviterId]
    );
    
    // 创建invite_records记录
    const inviteRecordId = uuidv4();
    await connection.execute(
      `INSERT INTO invite_records (id, inviter_id, invitee_id, invite_code, reward_granted, created_at)
       VALUES (?, ?, ?, ?, TRUE, NOW())`,
      [inviteRecordId, inviterId, newUserId, inviteCode]
    );
    
    // 增加inviter的付费次数（邀请奖励）- 在事务中执行
    await connection.execute(
      `UPDATE user_balances 
       SET amount = amount + ?, updated_at = NOW()
       WHERE user_id = ? AND balance_type = 'paid'`,
      [1, inviterId]
    );
    
    // 记录余额变动日志
    const balanceLogId = uuidv4();
    await connection.execute(
      `INSERT INTO balance_logs (id, user_id, amount, balance_type, reason, reference_id, created_at)
       VALUES (?, ?, ?, 'paid', 'invite_reward', ?, NOW())`,
      [balanceLogId, inviterId, 1, inviteRecordId]
    );
    
    // 更新或创建invite_stats
    // 先检查是否存在
    const [statsRows] = await connection.execute(
      'SELECT user_id FROM invite_stats WHERE user_id = ?',
      [inviterId]
    );
    
    if (statsRows.length === 0) {
      // 创建新的统计记录
      await connection.execute(
        `INSERT INTO invite_stats (user_id, total_invites, successful_invites, total_rewards, last_invite_at, updated_at)
         VALUES (?, 1, 1, 1, NOW(), NOW())`,
        [inviterId]
      );
    } else {
      // 更新现有统计记录
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
    
    // 提交事务
    await connection.commit();
    
    return {
      success: true,
      inviter_id: inviterId,
      reward_granted: true
    };
  } catch (error) {
    // 回滚事务
    await connection.rollback();
    
    // 处理特定错误
    if (error.message === 'SELF_INVITE_NOT_ALLOWED') {
      throw new Error('不能使用自己的邀请码');
    } else if (error.message === 'USER_ALREADY_EXISTS') {
      throw new Error('该用户已存在，不能重复邀请');
    } else {
      console.error('处理邀请注册失败:', error);
      throw new Error(`处理邀请注册失败: ${error.message}`);
    }
  } finally {
    connection.release();
  }
}

/**
 * 获取邀请统计
 * @param {string} userId - 用户ID
 * @returns {Promise<Object>} { total_invites, successful_invites, total_rewards }
 */
async function getInviteStats(userId) {
  try {
    // 查询 invite_stats 表
    const sql = `
      SELECT total_invites, successful_invites, total_rewards, last_invite_at
      FROM invite_stats
      WHERE user_id = ?
    `;
    
    const rows = await query(sql, [userId]);
    
    // 如果没有统计记录，返回零值
    if (rows.length === 0) {
      return {
        total_invites: 0,
        successful_invites: 0,
        total_rewards: 0,
        last_invite_at: null
      };
    }
    
    return {
      total_invites: rows[0].total_invites,
      successful_invites: rows[0].successful_invites,
      total_rewards: rows[0].total_rewards,
      last_invite_at: rows[0].last_invite_at
    };
  } catch (error) {
    console.error('获取邀请统计失败:', error);
    throw new Error(`获取邀请统计失败: ${error.message}`);
  }
}

/**
 * 获取邀请记录
 * @param {string} userId - 用户ID
 * @param {number} page - 页码（从1开始）
 * @param {number} pageSize - 每页数量
 * @returns {Promise<Object>} { records, total, page, pageSize }
 */
async function getInviteRecords(userId, page = 1, pageSize = 20) {
  try {
    console.log('[InviteService] 获取邀请记录:', { userId, page, pageSize });
    
    // 验证分页参数
    const validPage = Math.max(1, parseInt(page) || 1);
    const validPageSize = Math.min(100, Math.max(1, parseInt(pageSize) || 20));
    const offset = (validPage - 1) * validPageSize;
    
    console.log('[InviteService] 验证后的参数:', { validPage, validPageSize, offset });
    
    // 查询总记录数
    const countSql = `
      SELECT COUNT(*) as total
      FROM invite_records
      WHERE inviter_id = ?
    `;
    
    const countRows = await query(countSql, [userId]);
    const total = countRows[0].total;
    
    console.log('[InviteService] 总记录数:', total);
    
    // 如果没有记录，直接返回空结果
    if (total === 0) {
      return {
        records: [],
        total: 0,
        page: validPage,
        pageSize: validPageSize,
        totalPages: 0
      };
    }
    
    // 查询分页记录 - 使用整数参数
    const recordsSql = `
      SELECT 
        ir.id,
        ir.invitee_id,
        COALESCE(u.nickname, '未知用户') as invitee_nickname,
        ir.created_at,
        ir.reward_granted
      FROM invite_records ir
      LEFT JOIN users u ON ir.invitee_id = u.id
      WHERE ir.inviter_id = ?
      ORDER BY ir.created_at DESC
      LIMIT ${validPageSize} OFFSET ${offset}
    `;
    
    console.log('[InviteService] 执行查询:', recordsSql);
    
    const records = await query(recordsSql, [userId]);
    
    console.log('[InviteService] 查询到记录数:', records.length);
    
    // 格式化记录
    const formattedRecords = records.map(record => ({
      id: record.id,
      invitee_id: record.invitee_id,
      invitee_nickname: record.invitee_nickname,
      created_at: record.created_at,
      reward_granted: Boolean(record.reward_granted)
    }));
    
    return {
      records: formattedRecords,
      total,
      page: validPage,
      pageSize: validPageSize,
      totalPages: Math.ceil(total / validPageSize)
    };
  } catch (error) {
    console.error('[InviteService] 获取邀请记录失败:', error);
    console.error('[InviteService] 错误堆栈:', error.stack);
    throw new Error(`获取邀请记录失败: ${error.message}`);
  }
}

/**
 * 绑定邀请关系（用户已存在的情况）
 * @param {string} inviteCode - 邀请码
 * @param {string} userId - 用户ID
 * @returns {Promise<Object>} { success, inviter_id, reward_granted }
 */
async function bindInviteRelation(inviteCode, userId) {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 在事务中验证邀请码
    const [inviterRows] = await connection.execute(
      `SELECT ui.user_id as id, u.nickname
       FROM user_invites ui
       LEFT JOIN users u ON ui.user_id = u.id
       WHERE ui.invite_code = ?`,
      [inviteCode]
    );
    
    if (inviterRows.length === 0) {
      throw new Error('邀请码不存在');
    }
    
    const inviterId = inviterRows[0].id;
    
    // 验证不是自我邀请
    if (inviterId === userId) {
      throw new Error('不能使用自己的邀请码');
    }
    
    // 验证用户存在
    const [userRows] = await connection.execute(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );
    
    if (userRows.length === 0) {
      throw new Error('用户不存在');
    }
    
    // 检查用户是否已被邀请
    const [inviteCheckRows] = await connection.execute(
      'SELECT invited_by FROM user_invites WHERE user_id = ?',
      [userId]
    );
    
    if (inviteCheckRows.length > 0 && inviteCheckRows[0].invited_by) {
      throw new Error('该用户已被邀请过，不能重复绑定');
    }
    
    // 更新用户的邀请关系
    await connection.execute(
      'UPDATE user_invites SET invited_by = ?, updated_at = NOW() WHERE user_id = ?',
      [inviterId, userId]
    );
    
    // 创建invite_records记录
    const { v4: uuidv4 } = require('uuid');
    const inviteRecordId = uuidv4();
    await connection.execute(
      `INSERT INTO invite_records (id, inviter_id, invitee_id, invite_code, reward_granted, created_at)
       VALUES (?, ?, ?, ?, TRUE, NOW())`,
      [inviteRecordId, inviterId, userId, inviteCode]
    );
    
    // 增加inviter的付费次数（邀请奖励）- 在事务中执行
    await connection.execute(
      `UPDATE user_balances 
       SET amount = amount + ?, updated_at = NOW()
       WHERE user_id = ? AND balance_type = 'paid'`,
      [1, inviterId]
    );
    
    // 记录余额变动日志
    const balanceLogId = uuidv4();
    await connection.execute(
      `INSERT INTO balance_logs (id, user_id, amount, balance_type, reason, reference_id, created_at)
       VALUES (?, ?, ?, 'paid', 'invite_reward', ?, NOW())`,
      [balanceLogId, inviterId, 1, inviteRecordId]
    );
    
    // 更新或创建invite_stats
    const [statsRows] = await connection.execute(
      'SELECT user_id FROM invite_stats WHERE user_id = ?',
      [inviterId]
    );
    
    if (statsRows.length === 0) {
      // 创建新的统计记录
      await connection.execute(
        `INSERT INTO invite_stats (user_id, total_invites, successful_invites, total_rewards, last_invite_at, updated_at)
         VALUES (?, 1, 1, 1, NOW(), NOW())`,
        [inviterId]
      );
    } else {
      // 更新现有统计记录
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
    
    // 提交事务
    await connection.commit();
    
    return {
      success: true,
      inviter_id: inviterId,
      reward_granted: true
    };
  } catch (error) {
    // 回滚事务
    await connection.rollback();
    
    console.error('绑定邀请关系失败:', error);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  generateInviteCode,
  validateInviteCode,
  processInviteRegistration,
  bindInviteRelation,
  getInviteStats,
  getInviteRecords
};
