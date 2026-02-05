/**
 * 余额服务
 * 管理用户余额（替代原来的 usageService）
 * 支持动态扩展新模式
 */

const { query } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

/**
 * 余额类型映射
 */
const BALANCE_TYPES = {
  PUZZLE_FREE: 'free_puzzle',
  TRANSFORM_FREE: 'free_transform',
  PAID: 'paid'
};

/**
 * 模式到余额类型的映射
 */
function getBalanceType(mode, isPaid = false) {
  if (isPaid) {
    return BALANCE_TYPES.PAID;
  }
  
  switch (mode) {
    case 'puzzle':
      return BALANCE_TYPES.PUZZLE_FREE;
    case 'transform':
      return BALANCE_TYPES.TRANSFORM_FREE;
    default:
      throw new Error(`未知的模式: ${mode}`);
  }
}

/**
 * 检查用户余额
 * @param {string} userId - 用户ID
 * @param {string} mode - 生成模式 ('puzzle' | 'transform')，可选
 * @param {number} retryCount - 重试次数（内部使用）
 * @returns {Promise<Object>} 余额信息
 */
async function checkBalance(userId, mode = null, retryCount = 0) {
  try {
    const sql = `
      SELECT balance_type, amount
      FROM user_balances
      WHERE user_id = ?
    `;
    
    let rows = await query(sql, [userId]);
    
    // 如果用户没有余额记录，自动初始化
    if (rows.length === 0) {
      console.log(`[BalanceService] 用户 ${userId} 没有余额记录，自动初始化...`);
      
      const pool = require('../db/connection').pool;
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();
        
        // 检查用户是否存在，不存在则创建
        const [userRows] = await connection.execute('SELECT id FROM users WHERE id = ?', [userId]);
        
        if (userRows.length === 0) {
          console.log(`[BalanceService] 用户 ${userId} 不存在，自动创建...`);
          await connection.execute(
            'INSERT INTO users (id, created_at, updated_at) VALUES (?, NOW(), NOW())',
            [userId]
          );
        }
        
        // 初始化余额记录
        await connection.execute(`
          INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
          VALUES 
            (?, ?, 'free_puzzle', 3, NOW(), NOW()),
            (?, ?, 'free_transform', 3, NOW(), NOW()),
            (?, ?, 'paid', 0, NOW(), NOW())
        `, [
          uuidv4(), userId,
          uuidv4(), userId,
          uuidv4(), userId
        ]);
        
        // 初始化付费信息
        await connection.execute(`
          INSERT IGNORE INTO user_payments (id, user_id, has_ever_paid, current_tier, created_at, updated_at)
          VALUES (?, ?, FALSE, 'free', NOW(), NOW())
        `, [uuidv4(), userId]);
        
        // 初始化邀请码
        const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        await connection.execute(`
          INSERT IGNORE INTO user_invites (id, user_id, invite_code, created_at, updated_at)
          VALUES (?, ?, ?, NOW(), NOW())
        `, [uuidv4(), userId, inviteCode]);
        
        await connection.commit();
        connection.release();
        
        console.log(`[BalanceService] 用户 ${userId} 初始化完成`);
        
        // 重新查询
        rows = await query(sql, [userId]);
      } catch (error) {
        await connection.rollback();
        connection.release();
        console.error(`[BalanceService] 初始化用户 ${userId} 失败:`, error);
        
        // 安全修复：初始化失败时抛出异常，而不是返回默认值
        // 这样可以防止攻击者通过触发初始化失败来绕过余额限制
        throw new Error(`用户初始化失败，请稍后重试: ${error.message}`);
      }
    }
    
    // 构建余额对象
    const balances = {};
    rows.forEach(row => {
      balances[row.balance_type] = row.amount;
    });
    
    // 获取付费信息
    const paymentSql = `
      SELECT has_ever_paid, current_tier
      FROM user_payments
      WHERE user_id = ?
    `;
    
    const paymentRows = await query(paymentSql, [userId]);
    const paymentInfo = paymentRows[0] || { has_ever_paid: false, current_tier: 'free' };
    
    // 构建返回结构
    const result = {
      puzzle: {
        free_count: balances[BALANCE_TYPES.PUZZLE_FREE] || 0,
        remaining: balances[BALANCE_TYPES.PUZZLE_FREE] || 0
      },
      transform: {
        free_count: balances[BALANCE_TYPES.TRANSFORM_FREE] || 0,
        remaining: balances[BALANCE_TYPES.TRANSFORM_FREE] || 0
      },
      paid: {
        count: balances[BALANCE_TYPES.PAID] || 0,
        remaining: balances[BALANCE_TYPES.PAID] || 0,
        package_type: paymentInfo.current_tier
      },
      // 向后兼容
      usage_count: (balances[BALANCE_TYPES.PUZZLE_FREE] || 0) + 
                   (balances[BALANCE_TYPES.TRANSFORM_FREE] || 0) + 
                   (balances[BALANCE_TYPES.PAID] || 0),
      can_generate: Object.values(balances).some(amount => amount > 0),
      user_type: paymentInfo.has_ever_paid ? 'paid' : 'free',
      has_ever_paid: paymentInfo.has_ever_paid,
      can_generate_mode: false // 默认值
    };
    
    // ✅ 修复：如果指定了 mode，检查该模式是否可以生成
    if (mode) {
      const freeBalance = balances[getBalanceType(mode, false)] || 0;
      const paidBalance = balances[BALANCE_TYPES.PAID] || 0;
      result.can_generate_mode = freeBalance > 0 || paidBalance > 0;
    }
    
    return result;
  } catch (error) {
    // ✅ 添加重试机制
    if (retryCount < 2 && error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      console.warn(`[BalanceService] 检查余额失败，重试 ${retryCount + 1}/2:`, error.message);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return checkBalance(userId, mode, retryCount + 1);
    }
    
    console.error('检查用户余额失败:', error);
    throw new Error(`检查用户余额失败: ${error.message}`);
  }
}

/**
 * 扣减余额（原子操作，含并发控制）
 * @param {string} userId - 用户ID
 * @param {string} generationId - 生成记录ID
 * @param {string} mode - 生成模式 ('puzzle' | 'transform')
 * @returns {Promise<Object>} { success, remaining }
 * @throws {Error} 如果余额不足
 */
async function decrementBalance(userId, generationId, mode = 'puzzle') {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 确定余额类型
    const freeBalanceType = getBalanceType(mode, false);
    const paidBalanceType = BALANCE_TYPES.PAID;
    
    // 使用 SELECT ... FOR UPDATE 锁定行
    const selectSql = `
      SELECT balance_type, amount
      FROM user_balances
      WHERE user_id = ? AND balance_type IN (?, ?)
      FOR UPDATE
    `;
    
    const [rows] = await connection.execute(selectSql, [userId, freeBalanceType, paidBalanceType]);
    
    if (rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }
    
    // 构建余额映射
    const balances = {};
    rows.forEach(row => {
      balances[row.balance_type] = row.amount;
    });
    
    const freeBalance = balances[freeBalanceType] || 0;
    const paidBalance = balances[paidBalanceType] || 0;
    
    let usedBalanceType;
    let remainingAmount;
    
    // 优先扣减免费余额
    if (freeBalance > 0) {
      await connection.execute(
        'UPDATE user_balances SET amount = amount - 1, updated_at = NOW() WHERE user_id = ? AND balance_type = ?',
        [userId, freeBalanceType]
      );
      usedBalanceType = freeBalanceType;
      remainingAmount = freeBalance - 1;
    } else if (paidBalance > 0) {
      await connection.execute(
        'UPDATE user_balances SET amount = amount - 1, updated_at = NOW() WHERE user_id = ? AND balance_type = ?',
        [userId, paidBalanceType]
      );
      usedBalanceType = paidBalanceType;
      remainingAmount = paidBalance - 1;
    } else {
      throw new Error('INSUFFICIENT_BALANCE');
    }
    
    // 获取更新后的所有余额
    const [updatedRows] = await connection.execute(
      'SELECT balance_type, amount FROM user_balances WHERE user_id = ?',
      [userId]
    );
    
    const updatedBalances = {};
    updatedRows.forEach(row => {
      updatedBalances[row.balance_type] = row.amount;
    });
    
    // 插入 usage_logs 记录
    const logId = uuidv4();
    const totalRemaining = Object.values(updatedBalances).reduce((sum, amount) => sum + amount, 0);
    
    await connection.execute(
      `INSERT INTO usage_logs (id, user_id, action_type, amount, remaining_count, reason, reference_id, mode, created_at)
       VALUES (?, ?, 'decrement', -1, ?, 'generation', ?, ?, NOW())`,
      [logId, userId, totalRemaining, generationId, usedBalanceType]
    );
    
    await connection.commit();
    
    return {
      success: true,
      remaining: {
        puzzle: updatedBalances[BALANCE_TYPES.PUZZLE_FREE] || 0,
        transform: updatedBalances[BALANCE_TYPES.TRANSFORM_FREE] || 0,
        paid: updatedBalances[BALANCE_TYPES.PAID] || 0,
        usage_count: totalRemaining
      }
    };
  } catch (error) {
    await connection.rollback();
    
    if (error.message === 'INSUFFICIENT_BALANCE') {
      throw new Error('余额不足');
    } else if (error.message === 'USER_NOT_FOUND') {
      throw new Error('用户不存在');
    } else {
      console.error('扣减余额失败:', error);
      throw new Error(`扣减余额失败: ${error.message}`);
    }
  } finally {
    connection.release();
  }
}

/**
 * 恢复余额（生成失败时回滚扣减）
 * @param {string} userId - 用户ID
 * @param {string} generationId - 生成记录ID
 * @param {string} mode - 生成模式
 * @returns {Promise<Object>} { success, remaining }
 */
async function restoreBalance(userId, generationId, mode = 'puzzle') {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 🔒 安全检查1：检查是否已经恢复过
    const restoreCheckSql = `
      SELECT id FROM usage_logs
      WHERE user_id = ? AND reference_id = ? AND action_type = 'restore'
      LIMIT 1
    `;
    
    const [restoreRows] = await connection.execute(restoreCheckSql, [userId, generationId]);
    
    if (restoreRows.length > 0) {
      console.warn(`[RestoreBalance] 该任务已经恢复过，拒绝重复恢复: userId=${userId}, generationId=${generationId}`);
      await connection.rollback();
      return {
        success: false,
        error: 'ALREADY_RESTORED',
        message: '该任务已经恢复过次数，不能重复恢复'
      };
    }
    
    // 🔒 安全检查2：查询最后一条该 generationId 的 decrement 日志
    const logSql = `
      SELECT mode FROM usage_logs
      WHERE user_id = ? AND reference_id = ? AND action_type = 'decrement'
      ORDER BY created_at DESC LIMIT 1
    `;
    
    const [logRows] = await connection.execute(logSql, [userId, generationId]);
    
    if (logRows.length === 0) {
      console.warn(`[RestoreBalance] 未找到扣减记录，拒绝恢复: userId=${userId}, generationId=${generationId}`);
      await connection.rollback();
      return {
        success: false,
        error: 'NO_DECREMENT_FOUND',
        message: '未找到对应的扣减记录，无法恢复'
      };
    }
    
    const usedBalanceType = logRows[0].mode;
    
    // 恢复余额（增加1）
    await connection.execute(
      'UPDATE user_balances SET amount = amount + 1, updated_at = NOW() WHERE user_id = ? AND balance_type = ?',
      [userId, usedBalanceType]
    );
    
    // 获取更新后的所有余额
    const [updatedRows] = await connection.execute(
      'SELECT balance_type, amount FROM user_balances WHERE user_id = ?',
      [userId]
    );
    
    const updatedBalances = {};
    updatedRows.forEach(row => {
      updatedBalances[row.balance_type] = row.amount;
    });
    
    // 插入 usage_logs 记录
    const logId = uuidv4();
    const totalRemaining = Object.values(updatedBalances).reduce((sum, amount) => sum + amount, 0);
    
    await connection.execute(
      `INSERT INTO usage_logs (id, user_id, action_type, amount, remaining_count, reason, reference_id, mode, created_at)
       VALUES (?, ?, 'restore', 1, ?, 'restore', ?, ?, NOW())`,
      [logId, userId, totalRemaining, generationId, usedBalanceType]
    );
    
    await connection.commit();
    
    console.log(`[RestoreBalance] 恢复成功: userId=${userId}, generationId=${generationId}, balanceType=${usedBalanceType}`);
    
    return {
      success: true,
      remaining: {
        puzzle: updatedBalances[BALANCE_TYPES.PUZZLE_FREE] || 0,
        transform: updatedBalances[BALANCE_TYPES.TRANSFORM_FREE] || 0,
        paid: updatedBalances[BALANCE_TYPES.PAID] || 0,
        usage_count: totalRemaining
      }
    };
  } catch (error) {
    await connection.rollback();
    console.error('恢复余额失败:', error);
    throw new Error(`恢复余额失败: ${error.message}`);
  } finally {
    connection.release();
  }
}

/**
 * 增加余额
 * @param {string} userId - 用户ID
 * @param {number} amount - 增加数量
 * @param {string} reason - 原因 ('payment', 'invite_reward', 'admin_grant')
 * @param {string} referenceId - 关联ID
 * @param {string} balanceType - 余额类型 ('paid' | 'free_puzzle' | 'free_transform')
 * @returns {Promise<Object>} { success, new_count }
 */
async function addBalance(userId, amount, reason, referenceId = null, balanceType = BALANCE_TYPES.PAID) {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    if (!userId || amount <= 0) {
      throw new Error('参数无效');
    }
    
    const validReasons = ['payment', 'invite_reward', 'admin_grant'];
    if (!validReasons.includes(reason)) {
      throw new Error(`原因必须是以下之一: ${validReasons.join(', ')}`);
    }
    
    await connection.beginTransaction();
    
    // 使用 INSERT ... ON DUPLICATE KEY UPDATE 保证原子性
    // 依赖 UNIQUE(user_id, balance_type) 约束
    const balanceId = uuidv4();
    
    await connection.execute(
      `INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE 
         amount = amount + VALUES(amount),
         updated_at = NOW()`,
      [balanceId, userId, balanceType, amount]
    );
    
    // 获取更新后的余额
    const [rows] = await connection.execute(
      'SELECT amount FROM user_balances WHERE user_id = ? AND balance_type = ?',
      [userId, balanceType]
    );
    
    const newCount = rows[0]?.amount || 0;
  
    // 记录日志
    const logId = uuidv4();
    await connection.execute(
      `INSERT INTO usage_logs (id, user_id, action_type, amount, remaining_count, reason, reference_id, mode, created_at)
       VALUES (?, ?, 'increment', ?, ?, ?, ?, ?, NOW())`,
      [logId, userId, amount, newCount, reason, referenceId, balanceType]
    );
    
    await connection.commit();
    
    return {
      success: true,
      new_count: newCount
    };
  } catch (error) {
    await connection.rollback();
    console.error('增加余额失败:', error);
    throw new Error(`增加余额失败: ${error.message}`);
  } finally {
    connection.release();
  }
}

/**
 * 获取使用历史
 * @param {string} userId - 用户ID
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @returns {Promise<Object>} { logs, total, page, pageSize }
 */
async function getUsageHistory(userId, page = 1, pageSize = 20) {
  try {
    const validPage = Math.max(1, parseInt(page) || 1);
    const validPageSize = Math.min(100, Math.max(1, parseInt(pageSize) || 20));
    const offset = (validPage - 1) * validPageSize;
    
    const countSql = 'SELECT COUNT(*) as total FROM usage_logs WHERE user_id = ?';
    const countRows = await query(countSql, [userId]);
    const total = countRows[0]?.total || 0;
    
    const logsSql = `
      SELECT id, action_type, amount, remaining_count, reason, reference_id, mode, created_at
      FROM usage_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const logs = await query(logsSql, [userId, validPageSize, offset]);
    
    const { convertArrayTimesToCST } = require('../utils/timezone');
    const logsWithCST = convertArrayTimesToCST(logs || []);
    
    return {
      logs: logsWithCST,
      total,
      page: validPage,
      pageSize: validPageSize
    };
  } catch (error) {
    console.error('获取使用历史失败:', error);
    throw new Error(`获取使用历史失败: ${error.message}`);
  }
}

/**
 * 设置余额（开发模式专用）
 * @param {string} userId - 用户ID
 * @param {string} mode - 模式 ('puzzle' | 'transform' | 'paid')
 * @param {number} amount - 新余额数量
 * @param {string} reason - 原因
 * @returns {Promise<Object>} { success, new_count }
 */
async function setBalance(userId, mode, amount, reason = 'admin_set') {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    if (!userId || amount < 0) {
      throw new Error('参数无效');
    }
    
    // 确定余额类型
    const balanceType = mode === 'puzzle' ? BALANCE_TYPES.PUZZLE_FREE :
                        mode === 'transform' ? BALANCE_TYPES.TRANSFORM_FREE :
                        BALANCE_TYPES.PAID;
    
    await connection.beginTransaction();
    
    // 获取当前余额
    const [currentRows] = await connection.execute(
      'SELECT amount FROM user_balances WHERE user_id = ? AND balance_type = ? FOR UPDATE',
      [userId, balanceType]
    );
    
    const currentAmount = currentRows[0]?.amount || 0;
    const difference = amount - currentAmount;
    
    // 更新余额
    const balanceId = `${userId}-${mode === 'paid' ? 'paid' : mode}`;
    await connection.execute(
      `INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE amount = ?, updated_at = NOW()`,
      [balanceId, userId, balanceType, amount, amount]
    );
    
    // 记录日志
    const logId = uuidv4();
    const actionType = difference > 0 ? 'increment' : difference < 0 ? 'decrement' : 'set';
    
    await connection.execute(
      `INSERT INTO usage_logs (id, user_id, action_type, amount, remaining_count, reason, mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [logId, userId, actionType, difference, amount, reason, balanceType]
    );
    
    await connection.commit();
    
    return {
      success: true,
      new_count: amount,
      old_count: currentAmount,
      difference
    };
  } catch (error) {
    await connection.rollback();
    console.error('设置余额失败:', error);
    throw new Error(`设置余额失败: ${error.message}`);
  } finally {
    connection.release();
  }
}

module.exports = {
  BALANCE_TYPES,
  getBalanceType,
  checkBalance,
  getUserBalances: checkBalance,  // 别名，向后兼容
  decrementBalance,
  restoreBalance,
  addBalance,
  setBalance,
  getUsageHistory
};
