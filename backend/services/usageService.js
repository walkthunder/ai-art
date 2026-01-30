/**
 * 使用次数服务
 * 负责用户使用次数的查询、扣减、恢复和增加
 */

const { query } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

/**
 * 检查用户使用次数
 * @param {string} userId - 用户ID
 * @param {string} mode - 生成模式 ('puzzle' | 'transform')，可选
 * @returns {Promise<Object>} 返回详细的使用次数信息（支持模式隔离）
 */
async function checkUsageCount(userId, mode = null) {
  try {
    const sql = `
      SELECT 
        usage_count,
        usage_count_puzzle,
        usage_count_transform,
        usage_count_paid,
        usage_limit,
        has_ever_paid,
        payment_status
      FROM users
      WHERE id = ?
    `;
    
    const rows = await query(sql, [userId]);
    
    if (rows.length === 0) {
      throw new Error(`用户 ${userId} 不存在`);
    }
    
    const user = rows[0];
    
    // 新的返回结构（支持模式隔离）
    // 注意：使用 ?? 而不是 || 来处理 0 值
    const puzzleCount = user.usage_count_puzzle ?? 3;
    const transformCount = user.usage_count_transform ?? 3;
    const paidCount = user.usage_count_paid ?? 0;
    
    const result = {
      puzzle: {
        free_count: puzzleCount,
        remaining: puzzleCount
      },
      transform: {
        free_count: transformCount,
        remaining: transformCount
      },
      paid: {
        count: paidCount,
        remaining: paidCount,
        package_type: user.payment_status || 'free'
      },
      // 向后兼容字段
      usage_count: puzzleCount + transformCount + paidCount,
      usage_limit: user.usage_limit ?? 3,
      can_generate: puzzleCount > 0 || transformCount > 0 || paidCount > 0,
      user_type: user.has_ever_paid ? 'paid' : 'free'
    };
    
    // 如果指定了 mode，检查该模式是否可以生成
    if (mode) {
      if (mode === 'puzzle') {
        result.can_generate_mode = result.puzzle.remaining > 0 || result.paid.remaining > 0;
      } else if (mode === 'transform') {
        result.can_generate_mode = result.transform.remaining > 0 || result.paid.remaining > 0;
      }
    }
    
    return result;
  } catch (error) {
    console.error('检查用户使用次数失败:', error);
    throw new Error(`检查用户使用次数失败: ${error.message}`);
  }
}

/**
 * 获取使用历史
 * @param {string} userId - 用户ID
 * @param {number} page - 页码（从1开始）
 * @param {number} pageSize - 每页数量
 * @returns {Promise<Object>} { logs, total, page, pageSize }
 */
async function getUsageHistory(userId, page = 1, pageSize = 20) {
  try {
    // 验证分页参数
    const validPage = Math.max(1, parseInt(page) || 1);
    const validPageSize = Math.min(100, Math.max(1, parseInt(pageSize) || 20));
    const offset = (validPage - 1) * validPageSize;
    
    // 查询总数
    const countSql = `
      SELECT COUNT(*) as total
      FROM usage_logs
      WHERE user_id = ?
    `;
    
    const countRows = await query(countSql, [userId]);
    const total = countRows[0]?.total || 0;
    
    // 查询日志记录
    const logsSql = `
      SELECT 
        id,
        action_type,
        amount,
        remaining_count,
        reason,
        reference_id,
        created_at
      FROM usage_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const logs = await query(logsSql, [userId, validPageSize, offset]);
    
    return {
      logs: logs || [],
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
 * 扣减使用次数（原子操作，含并发控制）
 * @param {string} userId - 用户ID
 * @param {string} generationId - 生成记录ID
 * @param {string} mode - 生成模式 ('puzzle' | 'transform')，可选，默认 'puzzle'
 * @returns {Promise<Object>} { success, remaining }
 * @throws {Error} 如果usage_count不足
 */
async function decrementUsageCount(userId, generationId, mode = 'puzzle') {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 使用 SELECT ... FOR UPDATE 锁定行，防止并发问题
    const selectSql = `
      SELECT 
        usage_count,
        usage_count_puzzle,
        usage_count_transform,
        usage_count_paid,
        payment_status
      FROM users 
      WHERE id = ? 
      FOR UPDATE
    `;
    
    const [rows] = await connection.execute(selectSql, [userId]);
    
    if (rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }
    
    const user = rows[0];
    const modeField = `usage_count_${mode}`;
    const currentModeCount = user[modeField] || 0;
    const currentPaidCount = user.usage_count_paid || 0;
    
    // 检查是否有可用次数（优先使用模式次数，再使用付费次数）
    let usedMode = mode;
    if (currentModeCount > 0) {
      // 使用模式次数
      await connection.execute(
        `UPDATE users SET ${modeField} = ${modeField} - 1 WHERE id = ?`,
        [userId]
      );
    } else if (currentPaidCount > 0) {
      // 使用付费次数
      usedMode = 'paid';
      await connection.execute(
        'UPDATE users SET usage_count_paid = usage_count_paid - 1 WHERE id = ?',
        [userId]
      );
    } else {
      // 无可用次数
      throw new Error('INSUFFICIENT_USAGE');
    }
    
    // 获取更新后的值
    const [updatedRows] = await connection.execute(
      `SELECT usage_count_puzzle, usage_count_transform, usage_count_paid FROM users WHERE id = ?`,
      [userId]
    );
    
    const updatedUser = updatedRows[0];
    
    // 插入 usage_logs 记录
    const logId = require('uuid').v4();
    const logSql = `
      INSERT INTO usage_logs 
      (id, user_id, action_type, amount, remaining_count, reason, reference_id, mode, created_at)
      VALUES (?, ?, 'decrement', -1, ?, 'generation', ?, ?, NOW())
    `;
    
    const remainingCount = (updatedUser.usage_count_puzzle || 0) + 
                          (updatedUser.usage_count_transform || 0) + 
                          (updatedUser.usage_count_paid || 0);
    
    await connection.execute(logSql, [
      logId,
      userId,
      remainingCount,
      generationId,
      usedMode
    ]);
    
    // 提交事务
    await connection.commit();
    
    return {
      success: true,
      remaining: {
        puzzle: updatedUser.usage_count_puzzle || 0,
        transform: updatedUser.usage_count_transform || 0,
        paid: updatedUser.usage_count_paid || 0,
        // 向后兼容
        usage_count: remainingCount
      }
    };
  } catch (error) {
    // 回滚事务
    await connection.rollback();
    
    // 重新抛出错误
    if (error.message === 'INSUFFICIENT_USAGE') {
      throw new Error('使用次数不足');
    } else if (error.message === 'USER_NOT_FOUND') {
      throw new Error('用户不存在');
    } else {
      console.error('扣减使用次数失败:', error);
      throw new Error(`扣减使用次数失败: ${error.message}`);
    }
  } finally {
    connection.release();
  }
}

/**
 * 恢复使用次数（生成失败时回滚扣减）
 * @param {string} userId - 用户ID
 * @param {string} generationId - 生成记录ID
 * @param {string} mode - 生成模式 ('puzzle' | 'transform')，可选，默认 'puzzle'
 * @returns {Promise<Object>} { success, remaining }
 */
async function restoreUsageCount(userId, generationId, mode = 'puzzle') {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 查询最后一条该 generationId 的 decrement 日志，确定使用的是哪种次数
    const logSql = `
      SELECT mode FROM usage_logs 
      WHERE user_id = ? AND reference_id = ? AND action_type = 'decrement'
      ORDER BY created_at DESC LIMIT 1
    `;
    
    const [logRows] = await connection.execute(logSql, [userId, generationId]);
    const usedMode = logRows.length > 0 ? logRows[0].mode : mode;
    
    // 使用 SELECT ... FOR UPDATE 锁定行，防止并发问题
    const selectSql = `
      SELECT 
        usage_count_puzzle,
        usage_count_transform,
        usage_count_paid
      FROM users 
      WHERE id = ? 
      FOR UPDATE
    `;
    
    const [rows] = await connection.execute(selectSql, [userId]);
    
    if (rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }
    
    const user = rows[0];
    const modeField = `usage_count_${usedMode}`;
    
    // 恢复使用次数（增加1）
    await connection.execute(
      `UPDATE users SET ${modeField} = ${modeField} + 1 WHERE id = ?`,
      [userId]
    );
    
    // 获取更新后的值
    const [updatedRows] = await connection.execute(
      `SELECT usage_count_puzzle, usage_count_transform, usage_count_paid FROM users WHERE id = ?`,
      [userId]
    );
    
    const updatedUser = updatedRows[0];
    
    // 插入 usage_logs 记录（action_type='restore'）
    const logId = require('uuid').v4();
    const insertLogSql = `
      INSERT INTO usage_logs 
      (id, user_id, action_type, amount, remaining_count, reason, reference_id, mode, created_at)
      VALUES (?, ?, 'restore', 1, ?, 'restore', ?, ?, NOW())
    `;
    
    const remainingCount = (updatedUser.usage_count_puzzle || 0) + 
                          (updatedUser.usage_count_transform || 0) + 
                          (updatedUser.usage_count_paid || 0);
    
    await connection.execute(insertLogSql, [
      logId,
      userId,
      remainingCount,
      generationId,
      usedMode
    ]);
    
    // 提交事务
    await connection.commit();
    
    return {
      success: true,
      remaining: {
        puzzle: updatedUser.usage_count_puzzle || 0,
        transform: updatedUser.usage_count_transform || 0,
        paid: updatedUser.usage_count_paid || 0,
        // 向后兼容
        usage_count: remainingCount
      }
    };
  } catch (error) {
    // 回滚事务
    await connection.rollback();
    
    // 重新抛出错误
    if (error.message === 'USER_NOT_FOUND') {
      throw new Error('用户不存在');
    } else {
      console.error('恢复使用次数失败:', error);
      throw new Error(`恢复使用次数失败: ${error.message}`);
    }
  } finally {
    connection.release();
  }
}

/**
 * 增加使用次数
 * @param {string} userId - 用户ID
 * @param {number} amount - 增加数量
 * @param {string} reason - 原因 ('payment', 'invite_reward', 'admin_grant')
 * @param {string} referenceId - 关联ID（订单ID或邀请记录ID）
 * @param {string} mode - 模式 ('puzzle', 'transform', 'paid')，可选，默认 'paid'
 * @returns {Promise<Object>} { success, new_count }
 */
async function addUsageCount(userId, amount, reason, referenceId = null, mode = 'paid') {
  const pool = require('../db/connection').pool;
  const connection = await pool.getConnection();
  
  try {
    // 验证参数
    if (!userId) {
      throw new Error('用户ID不能为空');
    }
    
    if (!amount || amount <= 0) {
      throw new Error('增加数量必须大于0');
    }
    
    const validReasons = ['payment', 'invite_reward', 'admin_grant'];
    if (!reason || !validReasons.includes(reason)) {
      throw new Error(`原因必须是以下之一: ${validReasons.join(', ')}`);
    }
    
    const validModes = ['puzzle', 'transform', 'paid'];
    if (!validModes.includes(mode)) {
      throw new Error(`模式必须是以下之一: ${validModes.join(', ')}`);
    }
    
    await connection.beginTransaction();
    
    // 使用 SELECT ... FOR UPDATE 锁定行，防止并发问题
    const modeField = `usage_count_${mode}`;
    const [rows] = await connection.execute(
      `SELECT ${modeField} FROM users WHERE id = ? FOR UPDATE`,
      [userId]
    );
    
    if (rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }
    
    const currentCount = rows[0][modeField] || 0;
    
    // 增加使用次数
    await connection.execute(
      `UPDATE users SET ${modeField} = ${modeField} + ? WHERE id = ?`,
      [amount, userId]
    );
    
    const newCount = currentCount + amount;
    
    // 插入 usage_logs 记录
    const logId = uuidv4();
    await connection.execute(
      `INSERT INTO usage_logs (id, user_id, action_type, amount, remaining_count, reason, reference_id, mode, created_at)
       VALUES (?, ?, 'increment', ?, ?, ?, ?, ?, NOW())`,
      [logId, userId, amount, newCount, reason, referenceId, mode]
    );
    
    // 提交事务
    await connection.commit();
    
    return {
      success: true,
      new_count: newCount
    };
  } catch (error) {
    // 回滚事务
    await connection.rollback();
    
    // 重新抛出错误
    if (error.message === 'USER_NOT_FOUND') {
      throw new Error('用户不存在');
    } else {
      console.error('增加使用次数失败:', error);
      throw new Error(`增加使用次数失败: ${error.message}`);
    }
  } finally {
    connection.release();
  }
}

/**
 * 获取指定模式的历史记录
 * @param {string} userId - 用户ID
 * @param {string} mode - 生成模式 ('puzzle' | 'transform' | null)，null 表示全部
 * @param {number} page - 页码（从1开始）
 * @param {number} pageSize - 每页数量
 * @returns {Promise<Object>} { items, total, page, pageSize }
 */
async function getHistoryByMode(userId, mode = null, page = 1, pageSize = 20) {
  try {
    // 验证分页参数
    const validPage = Math.max(1, parseInt(page) || 1);
    const validPageSize = Math.min(100, Math.max(1, parseInt(pageSize) || 20));
    const offset = (validPage - 1) * validPageSize;
    
    // 构建查询条件
    let countSql = 'SELECT COUNT(*) as total FROM generation_history WHERE user_id = ?';
    let itemsSql = `
      SELECT 
        id,
        mode,
        original_images,
        generated_image,
        template_id,
        created_at
      FROM generation_history
      WHERE user_id = ?
    `;
    
    const params = [userId];
    
    // 如果指定了 mode，添加过滤条件
    if (mode && ['puzzle', 'transform'].includes(mode)) {
      countSql += ' AND mode = ?';
      itemsSql += ' AND mode = ?';
      params.push(mode);
    }
    
    // 查询总数
    const countRows = await query(countSql, params);
    const total = countRows[0]?.total || 0;
    
    // 查询历史记录
    itemsSql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const items = await query(itemsSql, [...params, validPageSize, offset]);
    
    return {
      items: items || [],
      total,
      page: validPage,
      pageSize: validPageSize
    };
  } catch (error) {
    console.error('获取模式历史记录失败:', error);
    throw new Error(`获取模式历史记录失败: ${error.message}`);
  }
}

module.exports = {
  checkUsageCount,
  getUsageHistory,
  decrementUsageCount,
  restoreUsageCount,
  addUsageCount,
  getHistoryByMode
};
