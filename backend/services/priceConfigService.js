/**
 * 价格配置服务
 * 管理套餐价格配置、历史记录和定时生效逻辑
 */

const db = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

/**
 * 获取所有价格配置（包含历史）
 */
async function getAllPriceConfigs() {
  const connection = await db.pool.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT id, category, code, name, price, recharge_amount, description, effective_date, status, 
              created_by, created_at, updated_at 
       FROM price_configs 
       ORDER BY category, code, effective_date DESC`
    );
    return rows;
  } finally {
    connection.release();
  }
}

/**
 * 获取当前生效的价格配置
 * @param {boolean} useCache - 是否使用缓存（默认true）
 * @param {boolean} includeDetails - 是否包含详细信息（充值次数等）
 */
async function getCurrentPrices(useCache = true, includeDetails = false) {
  // 简单的内存缓存，5分钟过期
  const cacheKey = includeDetails ? 'detailed' : 'simple';
  if (useCache && priceCache[cacheKey] && Date.now() - priceCache.timestamp < 5 * 60 * 1000) {
    return priceCache[cacheKey];
  }
  
  const connection = await db.pool.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT code, name, price, recharge_amount, category, effective_date 
       FROM price_configs 
       WHERE status = 'active' 
         AND effective_date <= NOW()
       ORDER BY code, effective_date DESC`
    );
    
    if (includeDetails) {
      // 返回详细信息格式 { free: { price: 0, rechargeAmount: 0 }, basic: { price: 9.9, rechargeAmount: 10 }, ... }
      const detailMap = {};
      rows.forEach(row => {
        if (row.category === 'package') {
          const packageType = row.code.replace('_package', '');
          if (!detailMap[packageType]) {
            detailMap[packageType] = {
              price: parseFloat(row.price),
              rechargeAmount: row.recharge_amount || 0,
              name: row.name
            };
          }
        }
      });
      
      // 更新缓存
      priceCache.detailed = detailMap;
      priceCache.timestamp = Date.now();
      
      return detailMap;
    } else {
      // 转换为兼容旧格式的对象 { free: 0, basic: 9.9, premium: 29.9 }
      const priceMap = {};
      rows.forEach(row => {
        // 提取套餐类型：free_package -> free
        if (row.category === 'package') {
          const packageType = row.code.replace('_package', '');
          if (!priceMap[packageType]) {
            priceMap[packageType] = parseFloat(row.price);
          }
        }
      });
      
      // 更新缓存
      priceCache.simple = priceMap;
      priceCache.timestamp = Date.now();
      
      return priceMap;
    }
  } finally {
    connection.release();
  }
}

/**
 * 创建价格配置
 */
async function createPriceConfig(data) {
  const { category, code, name, price, rechargeAmount, description, effectiveDate, createdBy } = data;
  
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const newId = uuidv4();
    
    // 插入新价格配置
    await connection.execute(
      `INSERT INTO price_configs 
       (id, category, code, name, price, recharge_amount, description, effective_date, status, created_by, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())`,
      [newId, category, code, name, price, rechargeAmount || 0, description || null, effectiveDate, createdBy]
    );
    
    // 记录价格历史
    const historyId = uuidv4();
    await connection.execute(
      `INSERT INTO price_history 
       (id, price_config_id, old_price, new_price, changed_by, change_reason, changed_at) 
       VALUES (?, ?, NULL, ?, ?, ?, NOW())`,
      [historyId, newId, price, createdBy, '创建新价格配置']
    );
    
    await connection.commit();
    
    // 清除缓存
    clearPriceCache();
    
    return { id: newId, category, code, name, price, rechargeAmount, effectiveDate, status: 'active' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 更新价格配置
 */
async function updatePriceConfig(id, data, updatedBy) {
  const { price, rechargeAmount, effectiveDate, status, description } = data;
  
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();
    
    // 获取旧价格
    const [oldRows] = await connection.execute(
      'SELECT price, code, name FROM price_configs WHERE id = ?',
      [id]
    );
    
    if (oldRows.length === 0) {
      throw new Error('价格配置不存在');
    }
    
    const oldPrice = oldRows[0].price;
    const code = oldRows[0].code;
    
    // 更新价格配置
    const updates = [];
    const values = [];
    
    if (price !== undefined) {
      updates.push('price = ?');
      values.push(price);
    }
    if (rechargeAmount !== undefined) {
      updates.push('recharge_amount = ?');
      values.push(rechargeAmount);
    }
    if (effectiveDate !== undefined) {
      updates.push('effective_date = ?');
      values.push(effectiveDate);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    
    updates.push('updated_at = NOW()');
    values.push(id);
    
    await connection.execute(
      `UPDATE price_configs SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    // 如果价格变化，记录历史
    if (price !== undefined && parseFloat(price) !== parseFloat(oldPrice)) {
      const historyId = uuidv4();
      await connection.execute(
        `INSERT INTO price_history 
         (id, price_config_id, old_price, new_price, changed_by, change_reason, changed_at) 
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [historyId, id, oldPrice, price, updatedBy, '更新价格配置']
      );
    }
    
    await connection.commit();
    
    // 清除缓存
    clearPriceCache();
    
    return { id, code, ...data };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 获取价格历史记录
 */
async function getPriceHistory(priceConfigId) {
  const connection = await db.pool.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT h.*, p.code, p.name 
       FROM price_history h
       JOIN price_configs p ON h.price_config_id = p.id
       WHERE h.price_config_id = ?
       ORDER BY h.changed_at DESC`,
      [priceConfigId]
    );
    return rows;
  } finally {
    connection.release();
  }
}

/**
 * 获取指定代码的价格历史
 */
async function getPriceHistoryByCode(code) {
  const connection = await db.pool.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT h.*, p.code, p.name, p.effective_date 
       FROM price_history h
       JOIN price_configs p ON h.price_config_id = p.id
       WHERE p.code = ?
       ORDER BY h.changed_at DESC`,
      [code]
    );
    return rows;
  } finally {
    connection.release();
  }
}

/**
 * 停用价格配置
 */
async function deactivatePriceConfig(id, deactivatedBy) {
  const connection = await db.pool.getConnection();
  try {
    await connection.execute(
      'UPDATE price_configs SET status = ?, updated_at = NOW() WHERE id = ?',
      ['inactive', id]
    );
    
    // 清除缓存
    clearPriceCache();
    
    return { success: true };
  } finally {
    connection.release();
  }
}

/**
 * 获取充值次数配置
 * @param {string} packageType - 套餐类型 (basic/premium)
 * @param {Object} connection - 数据库连接（可选，用于事务）
 * @returns {Promise<number>} 充值次数
 */
async function getRechargeAmount(packageType, connection = null) {
  const shouldReleaseConnection = !connection;
  
  try {
    if (!connection) {
      const pool = require('../db/connection').pool;
      connection = await pool.getConnection();
    }
    
    const [priceRows] = await connection.execute(
      `SELECT recharge_amount FROM price_configs 
       WHERE code = ? AND category = 'package' AND status = 'active'
       ORDER BY effective_date DESC LIMIT 1`,
      [`${packageType}_package`]
    );
    
    if (priceRows.length > 0 && priceRows[0].recharge_amount) {
      const amount = priceRows[0].recharge_amount;
      console.log(`[PriceConfig] 从数据库读取充值次数: ${packageType} → ${amount}次`);
      return amount;
    }
    
    // 降级方案：使用默认值
    const defaultAmounts = { basic: 10, premium: 35 };
    const defaultAmount = defaultAmounts[packageType] || 10;
    console.warn(`[PriceConfig] 未找到套餐 ${packageType} 的充值次数配置，使用默认值: ${defaultAmount}`);
    return defaultAmount;
  } catch (error) {
    console.error('[PriceConfig] 读取充值次数配置失败，使用默认值:', error);
    const defaultAmounts = { basic: 10, premium: 35 };
    return defaultAmounts[packageType] || 10;
  } finally {
    if (shouldReleaseConnection && connection) {
      connection.release();
    }
  }
}

/**
 * 清除价格缓存
 */
function clearPriceCache() {
  priceCache.simple = null;
  priceCache.detailed = null;
  priceCache.timestamp = 0;
}

// 价格缓存对象
const priceCache = {
  simple: null,
  detailed: null,
  timestamp: 0
};

module.exports = {
  getAllPriceConfigs,
  getCurrentPrices,
  createPriceConfig,
  updatePriceConfig,
  getPriceHistory,
  getPriceHistoryByCode,
  deactivatePriceConfig,
  clearPriceCache,
  getRechargeAmount
};
