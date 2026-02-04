/**
 * MySQL数据库连接配置
 * 
 * 云托管环境使用 @cloudbase/node-sdk 的 rdb() 方法访问 MySQL
 * 本地开发使用 mysql2 直连
 */

require('dotenv').config();

// 判断是否使用远程数据库（优先级最高）
const useRemoteDatabase = process.env.USE_REMOTE_DB === 'true' || !!process.env.REMOTE_DB_HOST;

// 判断是否在云托管环境中
const hasCloudBaseConfig = !!(
  process.env.CLOUDBASE_ENV && 
  process.env.TENCENTCLOUD_SECRETID && 
  process.env.TENCENTCLOUD_SECRETKEY
);

const CLOUDBASE_ENV_ID = process.env.CLOUDBASE_ENV || 'prod-9gxl9eb37627e2';

// 启动时打印环境信息
console.log('🔍 数据库环境检测:', {
  useRemoteDatabase,
  hasCloudBaseConfig,
  CLOUDBASE_ENV: process.env.CLOUDBASE_ENV || '未配置',
  TENCENTCLOUD_SECRETID: process.env.TENCENTCLOUD_SECRETID ? '已配置' : '未配置',
  TENCENTCLOUD_SECRETKEY: process.env.TENCENTCLOUD_SECRETKEY ? '已配置' : '未配置',
  DATABASE_URL: process.env.DATABASE_URL ? '已配置' : '未配置',
  REMOTE_DB_HOST: process.env.REMOTE_DB_HOST || '未配置',
  DB_HOST: process.env.DB_HOST || '未配置'
});

let cloudbaseApp = null;
let mysqlPool = null;

/**
 * 初始化 CloudBase SDK
 */
function initCloudBase() {
  if (cloudbaseApp) return cloudbaseApp;
  
  try {
    const cloudbase = require('@cloudbase/node-sdk');
    
    cloudbaseApp = cloudbase.init({
      env: CLOUDBASE_ENV_ID,
      region: 'ap-shanghai',
      secretId: process.env.TENCENTCLOUD_SECRETID,
      secretKey: process.env.TENCENTCLOUD_SECRETKEY
    });
    
    console.log('📡 CloudBase SDK 初始化成功，环境:', CLOUDBASE_ENV_ID);
    return cloudbaseApp;
  } catch (error) {
    console.error('CloudBase SDK 初始化失败:', error);
    throw error;
  }
}

/**
 * 初始化 MySQL 直连
 */
function initMysqlPool() {
  if (mysqlPool) return mysqlPool;
  
  const mysql = require('mysql2/promise');
  
  // 优先使用 DATABASE_URL
  if (process.env.DATABASE_URL) {
    console.log('📡 使用 DATABASE_URL 连接数据库');
    mysqlPool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      timezone: '+08:00' // 设置为中国标准时间
    });
  } 
  // 其次使用远程数据库配置
  else if (useRemoteDatabase && process.env.REMOTE_DB_HOST) {
    console.log('📡 使用远程数据库配置连接');
    mysqlPool = mysql.createPool({
      host: process.env.REMOTE_DB_HOST,
      port: parseInt(process.env.REMOTE_DB_PORT) || 3306,
      user: process.env.REMOTE_DB_USER || 'root',
      password: process.env.REMOTE_DB_PASSWORD || '',
      database: process.env.REMOTE_DB_NAME || process.env.DB_NAME || 'ai_family_photo',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      timezone: '+08:00', // 设置为中国标准时间
      // 远程数据库连接超时设置
      connectTimeout: 10000,
      // SSL 配置（如果远程数据库需要）
      ssl: process.env.REMOTE_DB_SSL === 'true' ? {
        rejectUnauthorized: process.env.REMOTE_DB_SSL_REJECT_UNAUTHORIZED !== 'false'
      } : undefined
    });
  } 
  // 最后使用本地数据库配置
  else {
    console.log('📡 使用本地数据库配置（开发模式）');
    mysqlPool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ai_family_photo',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      timezone: '+08:00' // 设置为中国标准时间
    });
  }
  
  return mysqlPool;
}

/**
 * 测试数据库连接
 */
async function testConnection() {
  try {
    // 优先测试远程数据库或本地数据库（直连模式）
    if (useRemoteDatabase || !hasCloudBaseConfig) {
      const pool = initMysqlPool();
      const connection = await pool.getConnection();
      const dbType = useRemoteDatabase ? '远程数据库' : '本地数据库';
      console.log(`✅ ${dbType} 连接成功`);
      connection.release();
      return true;
    } 
    // CloudBase 模式
    else {
      const app = initCloudBase();
      const db = app.rdb();
      // 简单查询测试
      const { data, error } = await db.from('users').select('id');
      if (error) throw error;
      console.log('✅ CloudBase MySQL 连接成功');
      return true;
    }
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    return false;
  }
}

/**
 * 执行查询（兼容三种模式：远程数据库、CloudBase、本地数据库）
 */
async function query(sql, params = []) {
  try {
    // 优先使用远程数据库或本地数据库（直连模式）
    if (useRemoteDatabase || !hasCloudBaseConfig) {
      const pool = initMysqlPool();
      const [rows] = await pool.execute(sql, params);
      return rows;
    } 
    // CloudBase 模式
    else {
      const app = initCloudBase();
      const db = app.rdb();
      const result = await executeCloudBaseQuery(db, sql, params);
      return result;
    }
  } catch (error) {
    console.error('数据库查询失败:', error);
    console.error('SQL:', sql.substring(0, 200));
    throw error;
  }
}

/**
 * 将 SQL 转换为 CloudBase MySQL RDB 操作
 * 
 * CloudBase RDB API:
 * - SELECT: db.from(table).select().eq(column, value)
 * - INSERT: db.from(table).insert(data)
 * - UPDATE: db.from(table).update(data).eq(column, value)
 * - DELETE: db.from(table).delete().eq(column, value)
 */
async function executeCloudBaseQuery(db, sql, params) {
  const sqlLower = sql.trim().toLowerCase();
  
  let paramIndex = 0;
  const getParam = () => params[paramIndex++];
  
  console.log('[CloudBase RDB] SQL:', sql.substring(0, 150));
  console.log('[CloudBase RDB] Params:', JSON.stringify(params).substring(0, 100));
  
  try {
    if (sqlLower.startsWith('select')) {
      return await handleSelect(db, sql, getParam);
    } else if (sqlLower.startsWith('insert')) {
      return await handleInsert(db, sql, getParam);
    } else if (sqlLower.startsWith('update')) {
      return await handleUpdate(db, sql, getParam);
    } else if (sqlLower.startsWith('delete')) {
      return await handleDelete(db, sql, getParam);
    } else {
      throw new Error(`不支持的 SQL 操作: ${sqlLower.substring(0, 20)}`);
    }
  } catch (error) {
    console.error('[CloudBase RDB] 执行失败:', error);
    throw error;
  }
}

/**
 * 处理 SELECT 查询
 */
async function handleSelect(db, sql, getParam) {
  const tableMatch = sql.match(/from\s+(\w+)/i);
  if (!tableMatch) throw new Error('无法解析表名');
  const tableName = tableMatch[1];
  
  let query = db.from(tableName).select();
  
  // 解析 WHERE 条件（支持单个条件）
  const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\?/i);
  if (whereMatch) {
    const field = whereMatch[1];
    const value = getParam();
    query = query.eq(field, value);
  }
  
  const result = await query;
  
  // CloudBase RDB 返回格式：{ data: [...], error: {...} }
  if (result.error) {
    console.error('[CloudBase RDB] SELECT error:', result.error);
    throw new Error(result.error.message || 'SELECT 查询失败');
  }
  
  console.log('[CloudBase RDB] SELECT result count:', result.data ? result.data.length : 0);
  return result.data || [];
}

/**
 * 处理 INSERT 操作
 * 支持单行和多行 INSERT、INSERT IGNORE、ON DUPLICATE KEY UPDATE
 * 支持混合占位符和字面值的 VALUES
 */
async function handleInsert(db, sql, getParam) {
  const tableMatch = sql.match(/into\s+(\w+)/i);
  if (!tableMatch) throw new Error('无法解析表名');
  const tableName = tableMatch[1];
  
  // 检查是否是 INSERT IGNORE
  const isInsertIgnore = /insert\s+ignore/i.test(sql);
  
  // 检查是否有 ON DUPLICATE KEY UPDATE
  const hasDuplicateKeyUpdate = /on\s+duplicate\s+key\s+update/i.test(sql);
  
  // 解析字段列表
  const fieldsMatch = sql.match(/\(([^)]+)\)\s*values/i);
  if (!fieldsMatch) throw new Error('无法解析字段');
  const fields = fieldsMatch[1].split(',').map(f => f.trim());
  
  // 提取 VALUES 部分（不包括 ON DUPLICATE KEY UPDATE）
  let valuesSection = sql.substring(sql.toLowerCase().indexOf('values') + 6);
  if (hasDuplicateKeyUpdate) {
    const updateIndex = valuesSection.toLowerCase().indexOf('on duplicate key update');
    if (updateIndex > 0) {
      valuesSection = valuesSection.substring(0, updateIndex);
    }
  }
  
  // 解析每一行的值（包括占位符、字面值、函数）
  // 手动提取所有 (...) 组，支持嵌套括号（如 NOW()）
  const valueGroupsMatch = [];
  let depth = 0;
  let currentGroup = '';
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < valuesSection.length; i++) {
    const char = valuesSection[i];
    
    // 处理字符串
    if ((char === "'" || char === '"') && (i === 0 || valuesSection[i-1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      if (depth > 0) currentGroup += char;
    }
    // 处理括号
    else if (char === '(' && !inString) {
      depth++;
      if (depth === 1) {
        currentGroup = '';
      } else {
        currentGroup += char;
      }
    }
    else if (char === ')' && !inString) {
      depth--;
      if (depth === 0) {
        valueGroupsMatch.push('(' + currentGroup + ')');
        currentGroup = '';
      } else {
        currentGroup += char;
      }
    }
    else if (depth > 0) {
      currentGroup += char;
    }
  }
  
  if (!valueGroupsMatch || valueGroupsMatch.length === 0) throw new Error('无法解析 VALUES');
  
  const rowCount = valueGroupsMatch.length;
  
  console.log('[CloudBase RDB] INSERT:', tableName, '字段数:', fields.length, '行数:', rowCount, 'IGNORE:', isInsertIgnore, 'ON DUPLICATE:', hasDuplicateKeyUpdate);
  
  // 解析每一行的值
  const rows = [];
  for (const valueGroup of valueGroupsMatch) {
    // 移除括号
    const valueStr = valueGroup.substring(1, valueGroup.length - 1);
    
    // 分割值（注意：字符串中的逗号和函数调用中的逗号不应分割）
    const values = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let parenDepth = 0; // 括号深度，用于处理函数调用
    
    for (let i = 0; i < valueStr.length; i++) {
      const char = valueStr[i];
      
      // 处理字符串
      if ((char === "'" || char === '"') && (i === 0 || valueStr[i-1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        current += char;
      }
      // 处理括号（函数调用）
      else if (char === '(' && !inString) {
        parenDepth++;
        current += char;
      }
      else if (char === ')' && !inString) {
        parenDepth--;
        current += char;
      }
      // 处理逗号分隔符
      else if (char === ',' && !inString && parenDepth === 0) {
        values.push(current.trim());
        current = '';
      }
      else {
        current += char;
      }
    }
    if (current) {
      values.push(current.trim());
    }
    
    rows.push(values);
  }
  
  console.log('[CloudBase RDB] 解析到', rows.length, '行数据');
  
  // 处理每一行
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const values = rows[i];
    const insertData = {};
    
    for (let j = 0; j < fields.length; j++) {
      const field = fields[j];
      const value = values[j];
      
      if (!value) continue;
      
      // 处理占位符
      if (value === '?') {
        insertData[field] = getParam();
      }
      // 跳过 SQL 函数
      else if (value.toUpperCase() === 'NOW()' || value.toUpperCase() === 'CURRENT_TIMESTAMP' || value.toUpperCase() === 'CURRENT_TIMESTAMP()') {
        // 跳过，CloudBase RDB 会自动处理时间戳
        continue;
      }
      // 处理字符串字面值
      else if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
        insertData[field] = value.substring(1, value.length - 1);
      }
      // 处理布尔值
      else if (value.toUpperCase() === 'TRUE' || value.toUpperCase() === 'FALSE') {
        insertData[field] = value.toUpperCase() === 'TRUE';
      }
      // 处理数字
      else if (/^-?\d+(\.\d+)?$/.test(value)) {
        insertData[field] = parseFloat(value);
      }
      // 其他情况直接使用
      else {
        insertData[field] = value;
      }
    }
    
    console.log(`[CloudBase RDB] INSERT 第 ${i + 1} 行:`, JSON.stringify(insertData).substring(0, 150));
    
    // INSERT IGNORE：如果插入失败则跳过
    if (isInsertIgnore) {
      try {
        const result = await db.from(tableName).insert(insertData);
        if (result.error) {
          console.warn(`[CloudBase RDB] INSERT IGNORE 第 ${i + 1} 行失败（已忽略）:`, result.error.message);
          continue;
        }
        results.push(result.data);
      } catch (err) {
        console.warn(`[CloudBase RDB] INSERT IGNORE 第 ${i + 1} 行异常（已忽略）:`, err.message);
        continue;
      }
    } else {
      const result = await db.from(tableName).insert(insertData);
      
      if (result.error) {
        console.error('[CloudBase RDB] INSERT error:', result.error);
        throw new Error(result.error.message || 'INSERT 操作失败');
      }
      
      results.push(result.data);
    }
  }
  
  console.log('[CloudBase RDB] INSERT 完成，共插入', results.length, '行');
  
  // 处理 ON DUPLICATE KEY UPDATE（消费剩余参数）
  if (hasDuplicateKeyUpdate) {
    const updateSection = sql.substring(sql.toLowerCase().indexOf('on duplicate key update'));
    const updatePlaceholders = (updateSection.match(/\?/g) || []).length;
    for (let i = 0; i < updatePlaceholders; i++) {
      getParam();
    }
    console.log('[CloudBase RDB] ON DUPLICATE KEY UPDATE 已跳过（CloudBase RDB 不支持）');
  }
  
  return results.length > 0 ? results : {};
}

/**
 * 处理 UPDATE 操作
 */
async function handleUpdate(db, sql, getParam) {
  const tableMatch = sql.match(/update\s+(\w+)/i);
  if (!tableMatch) throw new Error('无法解析表名');
  const tableName = tableMatch[1];
  
  // 解析 SET 子句
  const setMatch = sql.match(/set\s+(.+?)\s+where/i);
  if (!setMatch) throw new Error('无法解析 SET 子句');
  
  const setParts = setMatch[1].split(',');
  const updateData = {};
  const expressions = []; // 存储表达式（如 field = field + 1）
  
  console.log('[CloudBase RDB] 解析 SET 子句:', setParts);
  
  setParts.forEach(part => {
    const trimmedPart = part.trim();
    
    console.log('[CloudBase RDB] 处理部分:', trimmedPart);
    
    // 跳过 CURRENT_TIMESTAMP
    if (trimmedPart.includes('CURRENT_TIMESTAMP')) {
      console.log('[CloudBase RDB] 跳过 CURRENT_TIMESTAMP');
      return;
    }
    
    // 检查是否是表达式（如 usage_count = usage_count - 1）
    // 改进的正则表达式，支持空格和数字
    const exprMatch = trimmedPart.match(/^(\w+)\s*=\s*(\w+)\s*([+\-*/])\s*(\d+|[\?])$/);
    if (exprMatch) {
      const [, leftField, rightField, operator, rightValue] = exprMatch;
      
      console.log('[CloudBase RDB] 匹配到表达式:', { leftField, rightField, operator, rightValue });
      
      // 如果是自增/自减表达式（如 usage_count = usage_count - 1）
      if (leftField === rightField) {
        const value = rightValue === '?' ? getParam() : parseInt(rightValue);
        expressions.push({
          field: leftField,
          operator,
          value
        });
        console.log('[CloudBase RDB] 添加表达式:', { field: leftField, operator, value });
        return;
      }
    }
    
    // 普通赋值（field = ?）
    const assignMatch = trimmedPart.match(/^(\w+)\s*=\s*\?$/);
    if (assignMatch) {
      const field = assignMatch[1];
      updateData[field] = getParam();
      console.log('[CloudBase RDB] 添加普通赋值:', field);
    }
  });
  
  // 解析 WHERE 条件
  const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\?/i);
  if (!whereMatch) throw new Error('无法解析 WHERE 条件');
  const whereField = whereMatch[1];
  const whereValue = getParam();
  
  console.log('[CloudBase RDB] UPDATE:', tableName, 'updateData:', updateData, 'expressions:', expressions, 'WHERE', whereField, '=', whereValue);
  
  // CloudBase RDB 不支持表达式更新，需要先查询再更新
  if (expressions.length > 0) {
    console.log('[CloudBase RDB] 检测到表达式，先查询当前值');
    
    // 先查询当前值
    const { data: currentData, error: selectError } = await db.from(tableName).select().eq(whereField, whereValue);
    
    if (selectError) {
      console.error('[CloudBase RDB] 查询当前值失败:', selectError);
      throw new Error('查询当前值失败: ' + selectError.message);
    }
    
    if (!currentData || currentData.length === 0) {
      console.error('[CloudBase RDB] 未找到记录');
      throw new Error('未找到要更新的记录');
    }
    
    const currentRow = currentData[0];
    console.log('[CloudBase RDB] 当前值:', currentRow);
    
    // 计算新值
    expressions.forEach(expr => {
      const currentValue = currentRow[expr.field] || 0;
      let newValue;
      
      switch (expr.operator) {
        case '+':
          newValue = currentValue + expr.value;
          break;
        case '-':
          newValue = currentValue - expr.value;
          break;
        case '*':
          newValue = currentValue * expr.value;
          break;
        case '/':
          newValue = currentValue / expr.value;
          break;
        default:
          newValue = currentValue;
      }
      
      console.log('[CloudBase RDB] 计算:', expr.field, '=', currentValue, expr.operator, expr.value, '->', newValue);
      updateData[expr.field] = newValue;
    });
  }
  
  console.log('[CloudBase RDB] 最终 updateData:', updateData);
  
  // 检查 updateData 是否为空
  if (Object.keys(updateData).length === 0) {
    throw new Error('UPDATE 操作没有要更新的字段');
  }
  
  // 执行更新
  const result = await db.from(tableName).update(updateData).eq(whereField, whereValue);
  
  if (result.error) {
    console.error('[CloudBase RDB] UPDATE error:', result.error);
    throw new Error(result.error.message || 'UPDATE 操作失败');
  }
  
  console.log('[CloudBase RDB] UPDATE result:', JSON.stringify(result.data).substring(0, 200));
  return result.data;
}

/**
 * 处理 DELETE 操作
 */
async function handleDelete(db, sql, getParam) {
  const tableMatch = sql.match(/from\s+(\w+)/i);
  if (!tableMatch) throw new Error('无法解析表名');
  const tableName = tableMatch[1];
  
  // 解析 WHERE 条件
  const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\?/i);
  if (!whereMatch) throw new Error('无法解析 WHERE 条件');
  const whereField = whereMatch[1];
  const whereValue = getParam();
  
  console.log('[CloudBase RDB] DELETE:', tableName, 'WHERE', whereField, '=', whereValue);
  
  const { data, error } = await db.from(tableName).delete().eq(whereField, whereValue);
  
  if (error) {
    console.error('[CloudBase RDB] DELETE error:', error);
    throw new Error(error.message || 'DELETE 操作失败');
  }
  
  return data;
}

/**
 * 执行事务
 */
async function transaction(callback) {
  // CloudBase 模式不支持事务
  if (!useRemoteDatabase && hasCloudBaseConfig) {
    console.warn('CloudBase 模式暂不支持事务，将直接执行');
    return await callback({ execute: async (sql, params) => [await query(sql, params)] });
  }
  
  // 远程数据库或本地数据库支持事务
  const pool = initMysqlPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 关闭连接池
 */
async function closePool() {
  try {
    if (mysqlPool) {
      await mysqlPool.end();
      mysqlPool = null;
      console.log('MySQL 连接池已关闭');
    }
  } catch (error) {
    console.error('关闭连接池失败:', error);
  }
}

module.exports = {
  get pool() {
    // 优先使用远程数据库或本地数据库（直连模式）
    if (useRemoteDatabase || !hasCloudBaseConfig) {
      return initMysqlPool();
    }
    // 在 CloudBase 模式下返回一个模拟的 pool 对象
    return {
      getConnection: async () => {
        // 返回一个模拟的 connection 对象，使用 query 函数
        return {
          execute: async (sql, params) => {
            const result = await query(sql, params);
            // mysql2 返回 [rows, fields]，我们模拟这个格式
            return [result, []];
          },
          query: async (sql, params) => {
            const result = await query(sql, params);
            return [result, []];
          },
          beginTransaction: async () => {
            console.warn('[CloudBase] 事务不支持，跳过 beginTransaction');
          },
          commit: async () => {
            console.warn('[CloudBase] 事务不支持，跳过 commit');
          },
          rollback: async () => {
            console.warn('[CloudBase] 事务不支持，跳过 rollback');
          },
          release: () => {
            // CloudBase 模式不需要释放连接
          }
        };
      },
      end: async () => {
        // CloudBase 模式不需要关闭连接池
      }
    };
  },
  query,
  transaction,
  testConnection,
  closePool,
  hasCloudBaseConfig,
  useRemoteDatabase,
  CLOUDBASE_ENV_ID
};
