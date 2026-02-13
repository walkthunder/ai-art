/**
 * 异步任务队列服务
 * 
 * 设计思路：
 * 1. 任务提交后立即返回 taskId，不阻塞前端
 * 2. 后台异步执行任务，更新任务状态
 * 3. 前端通过轮询获取任务状态和结果
 * 4. 支持任务重试、超时处理、错误恢复
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const db = require('../db/connection');

// 任务状态枚举
const TaskStatus = {
  PENDING: 'pending',      // 等待处理
  PROCESSING: 'processing', // 处理中
  COMPLETED: 'completed',   // 已完成
  FAILED: 'failed',        // 失败
  TIMEOUT: 'timeout',      // 超时
  CANCELLED: 'cancelled'   // 已取消
};

// 内存任务队列（生产环境建议使用 Redis）
const taskQueue = new Map();

// 任务持久化目录
const TASK_STORAGE_DIR = path.join(__dirname, '../db/tasks');

// 写入锁，防止并发写入导致文件损坏
const writeLocks = new Map();

/**
 * 日志工具函数
 */
function logQueue(taskId, operation, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[TaskQueue][${timestamp}][${taskId || 'SYSTEM'}][${operation}]`;
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// 确保存储目录存在
async function ensureStorageDir() {
  try {
    await fs.mkdir(TASK_STORAGE_DIR, { recursive: true });
    logQueue(null, '初始化', `✅ 任务存储目录已创建: ${TASK_STORAGE_DIR}`);
  } catch (error) {
    logQueue(null, '初始化', `❌ 创建任务存储目录失败: ${error.message}`);
  }
}

// 初始化
ensureStorageDir();

/**
 * 创建新任务
 * @param {Object} params 任务参数
 * @returns {Object} 任务信息
 */
function createTask(params) {
  const taskId = uuidv4();
  const now = new Date().toISOString();
  
  logQueue(taskId, '创建', '========== 开始创建新任务 ==========');
  logQueue(taskId, '创建', '任务参数', {
    mode: params.mode || 'unknown',
    userId: params.userId || '',
    templateId: params.templateId || '',
    imageCount: params.imageUrls?.length || 0,
    hasPrompt: !!params.finalPrompt,
    hasFacePositions: !!params.facePositions
  });
  
  const task = {
    id: taskId,
    status: TaskStatus.PENDING,
    progress: 0,
    message: '任务已创建，等待处理',
    params: params,
    result: null,
    error: null,
    retryCount: 0,
    maxRetries: 2,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    // 任务元数据
    meta: {
      mode: params.mode || 'unknown',
      userId: params.userId || '',
      templateId: params.templateId || '',
      imageCount: params.imageUrls?.length || 0
    }
  };
  
  taskQueue.set(taskId, task);
  logQueue(taskId, '创建', '✅ 任务已添加到内存队列');
  
  // 异步持久化（不阻塞）
  persistTask(task)
    .then(() => logQueue(taskId, '持久化', '✅ 任务已持久化到文件'))
    .catch(err => logQueue(taskId, '持久化', `❌ 持久化失败: ${err.message}`));
  
  logQueue(taskId, '创建', '========== 任务创建完成 ==========');
  return task;
}

/**
 * 更新任务状态
 * @param {string} taskId 任务ID
 * @param {Object} updates 更新内容
 */
function updateTask(taskId, updates) {
  const task = taskQueue.get(taskId);
  if (!task) {
    logQueue(taskId, '更新', '⚠️ 任务不存在，无法更新');
    return null;
  }
  
  const oldStatus = task.status;
  const oldProgress = task.progress;
  
  Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  
  // 记录状态变化
  const changes = [];
  if (updates.status && updates.status !== oldStatus) {
    changes.push(`状态: ${oldStatus} → ${updates.status}`);
  }
  if (updates.progress !== undefined && updates.progress !== oldProgress) {
    changes.push(`进度: ${oldProgress}% → ${updates.progress}%`);
  }
  if (updates.message) {
    changes.push(`消息: ${updates.message}`);
  }
  if (updates.error) {
    changes.push(`错误: ${updates.error}`);
  }
  
  logQueue(taskId, '更新', `任务状态更新: ${changes.join(', ')}`);
  
  // 异步持久化
  persistTask(task)
    .then(() => logQueue(taskId, '持久化', '✅ 更新已持久化'))
    .catch(err => logQueue(taskId, '持久化', `❌ 持久化失败: ${err.message}`));
  
  return task;
}

/**
 * 获取任务信息
 * @param {string} taskId 任务ID
 * @returns {Object|null} 任务信息
 */
async function getTask(taskId) {
  logQueue(taskId, '查询', '正在获取任务信息...');
  
  // 先从内存获取
  let task = taskQueue.get(taskId);
  
  if (task) {
    logQueue(taskId, '查询', '✅ 从内存获取成功', {
      status: task.status,
      progress: task.progress
    });
    return task;
  }
  
  // 如果内存中没有，尝试从数据库加载
  logQueue(taskId, '查询', '内存中未找到，尝试从数据库加载...');
  task = await loadTaskFromDatabase(taskId);
  
  if (task) {
    taskQueue.set(taskId, task);
    logQueue(taskId, '查询', '✅ 从数据库加载成功', {
      status: task.status,
      progress: task.progress
    });
    return task;
  }
  
  // 如果数据库中也没有，尝试从文件加载
  logQueue(taskId, '查询', '数据库中未找到，尝试从文件加载...');
  task = await loadTask(taskId);
  if (task) {
    taskQueue.set(taskId, task);
    logQueue(taskId, '查询', '✅ 从文件加载成功', {
      status: task.status,
      progress: task.progress
    });
  } else {
    logQueue(taskId, '查询', '⚠️ 任务不存在');
  }
  
  return task;
}

/**
 * 从数据库加载任务
 * @param {string} taskId 任务ID
 * @returns {Object|null} 任务对象
 */
async function loadTaskFromDatabase(taskId) {
  let connection;
  try {
    connection = await db.pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT * FROM tasks WHERE id = ?',
      [taskId]
    );
    
    if (rows.length === 0) {
      return null;
    }
    
    const row = rows[0];
    
    // 转换数据库记录为任务对象
    return {
      id: row.id,
      status: row.status,
      progress: row.progress,
      message: row.message,
      params: JSON.parse(row.params),
      result: row.result ? JSON.parse(row.result) : null,
      error: row.error,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      meta: {
        mode: row.mode,
        userId: row.user_id,
        templateId: JSON.parse(row.params).templateId || '',
        imageCount: JSON.parse(row.params).imageUrls?.length || 0
      }
    };
  } catch (error) {
    logQueue(taskId, '数据库加载', `⚠️ 从数据库加载失败: ${error.message}`);
    return null;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 持久化任务到数据库和文件
 * @param {Object} task 任务对象
 */
async function persistTask(task) {
  const taskId = task.id;
  
  // 等待之前的写入完成
  const existingLock = writeLocks.get(taskId);
  if (existingLock) {
    await existingLock;
  }
  
  // 创建新的写入锁
  const writePromise = (async () => {
    try {
      // 1. 持久化到数据库（优先）
      await persistTaskToDatabase(task);
      
      // 2. 持久化到文件（备份）
      await persistTaskToFile(task);
    } catch (error) {
      logQueue(taskId, '持久化', `❌ 持久化失败: ${error.message}`);
      throw error;
    } finally {
      writeLocks.delete(taskId);
    }
  })();
  
  writeLocks.set(taskId, writePromise);
  await writePromise;
}

/**
 * 将 ISO 8601 时间戳转换为 MySQL datetime 格式
 * @param {string|null} isoString ISO 8601 格式时间戳
 * @returns {string|null} MySQL datetime 格式 (YYYY-MM-DD HH:MM:SS)
 */
function toMySQLDatetime(isoString) {
  if (!isoString) return null;
  
  try {
    const date = new Date(isoString);
    // 格式化为 MySQL datetime: YYYY-MM-DD HH:MM:SS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    return null;
  }
}

/**
 * 持久化任务到数据库
 * @param {Object} task 任务对象
 */
async function persistTaskToDatabase(task) {
  let connection;
  try {
    connection = await db.pool.getConnection();
    
    // 转换时间格式为 MySQL datetime
    const createdAt = toMySQLDatetime(task.createdAt);
    const updatedAt = toMySQLDatetime(task.updatedAt);
    const startedAt = toMySQLDatetime(task.startedAt);
    const completedAt = toMySQLDatetime(task.completedAt);
    
    // 使用 INSERT ... ON DUPLICATE KEY UPDATE 实现 upsert
    await connection.execute(
      `INSERT INTO tasks 
       (id, user_id, mode, status, progress, message, params, result, error, 
        retry_count, max_retries, created_at, updated_at, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         progress = VALUES(progress),
         message = VALUES(message),
         result = VALUES(result),
         error = VALUES(error),
         retry_count = VALUES(retry_count),
         updated_at = VALUES(updated_at),
         started_at = VALUES(started_at),
         completed_at = VALUES(completed_at)`,
      [
        task.id,
        task.meta?.userId || '',
        task.meta?.mode || 'unknown',
        task.status,
        task.progress,
        task.message,
        JSON.stringify(task.params),
        task.result ? JSON.stringify(task.result) : null,
        task.error,
        task.retryCount,
        task.maxRetries,
        createdAt,
        updatedAt,
        startedAt,
        completedAt
      ]
    );
  } catch (error) {
    logQueue(task.id, '数据库持久化', `⚠️ 数据库持久化失败: ${error.message}`);
    // 数据库失败不抛出异常，继续使用文件存储
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 持久化任务到文件（备份）
 * @param {Object} task 任务对象
 */
async function persistTaskToFile(task) {
  const taskId = task.id;
  const filePath = path.join(TASK_STORAGE_DIR, `${taskId}.json`);
  const tempFilePath = path.join(TASK_STORAGE_DIR, `${taskId}.json.tmp`);
  
  try {
    const jsonStr = JSON.stringify(task, null, 2);
    // 原子写入：先写入临时文件，再重命名
    await fs.writeFile(tempFilePath, jsonStr, 'utf-8');
    await fs.rename(tempFilePath, filePath);
  } catch (error) {
    // 清理临时文件
    try {
      await fs.unlink(tempFilePath);
    } catch (e) {
      // 忽略清理错误
    }
    throw error;
  }
}

/**
 * 从文件加载任务（带 JSON 解析容错）
 * @param {string} taskId 任务ID
 * @returns {Object|null} 任务对象
 */
async function loadTask(taskId) {
  try {
    const filePath = path.join(TASK_STORAGE_DIR, `${taskId}.json`);
    let data = await fs.readFile(filePath, 'utf-8');
    
    // 检查文件是否为空或内容不完整
    data = data.trim();
    if (!data || data.length < 2) {
      logQueue(taskId, '加载', '⚠️ 文件内容为空或不完整，删除损坏文件');
      await fs.unlink(filePath).catch(() => {});
      return null;
    }
    
    // 尝试解析 JSON
    try {
      return JSON.parse(data);
    } catch (parseError) {
      // JSON 解析失败，尝试修复常见问题
      logQueue(taskId, '加载', `⚠️ JSON 解析失败，尝试修复: ${parseError.message}`);
      
      // 修复末尾多余的 } 问题
      while (data.endsWith('}}') && !data.endsWith('"}}')) {
        data = data.slice(0, -1);
      }
      
      // 修复末尾截断问题（尝试补全）
      if (!data.endsWith('}')) {
        // 文件被截断，无法修复
        logQueue(taskId, '加载', `❌ 文件被截断，无法修复，删除损坏文件`);
        await fs.unlink(filePath).catch(() => {});
        return null;
      }
      
      try {
        const task = JSON.parse(data);
        // 修复成功，重新保存正确的文件
        await fs.writeFile(filePath, JSON.stringify(task, null, 2), 'utf-8');
        logQueue(taskId, '加载', '✅ JSON 修复成功');
        return task;
      } catch (retryError) {
        logQueue(taskId, '加载', `❌ JSON 修复失败: ${retryError.message}，删除损坏文件`);
        await fs.unlink(filePath).catch(() => {});
        return null;
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logQueue(taskId, '加载', `❌ 加载任务失败: ${error.message}`);
    }
    return null;
  }
}

/**
 * 删除任务（清理）
 * @param {string} taskId 任务ID
 */
async function deleteTask(taskId) {
  logQueue(taskId, '删除', '正在删除任务...');
  
  // 从内存删除
  taskQueue.delete(taskId);
  
  // 从数据库删除
  let connection;
  try {
    connection = await db.pool.getConnection();
    await connection.execute('DELETE FROM tasks WHERE id = ?', [taskId]);
    logQueue(taskId, '删除', '✅ 从数据库删除成功');
  } catch (error) {
    logQueue(taskId, '删除', `⚠️ 从数据库删除失败: ${error.message}`);
  } finally {
    if (connection) {
      connection.release();
    }
  }
  
  // 从文件删除
  try {
    const filePath = path.join(TASK_STORAGE_DIR, `${taskId}.json`);
    await fs.unlink(filePath);
    logQueue(taskId, '删除', '✅ 从文件删除成功');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logQueue(taskId, '删除', `⚠️ 从文件删除失败: ${error.message}`);
    }
  }
}

/**
 * 获取用户的所有任务
 * @param {string} userId 用户ID
 * @returns {Array} 任务列表
 */
async function getUserTasks(userId) {
  logQueue(null, '查询用户任务', `正在获取用户 ${userId} 的任务列表...`);
  const tasks = [];
  
  // 从内存中筛选
  for (const task of taskQueue.values()) {
    if (task.meta.userId === userId) {
      tasks.push(task);
    }
  }
  
  logQueue(null, '查询用户任务', `✅ 找到 ${tasks.length} 个任务`);
  return tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * 清理过期任务（超过24小时的已完成/失败任务）
 */
async function cleanupExpiredTasks() {
  const now = Date.now();
  const expireTime = 24 * 60 * 60 * 1000; // 24小时
  let cleanedCount = 0;
  
  logQueue(null, '清理', '========== 开始清理过期任务 ==========');
  
  for (const [taskId, task] of taskQueue.entries()) {
    const taskAge = now - new Date(task.createdAt).getTime();
    
    if (taskAge > expireTime && 
        (task.status === TaskStatus.COMPLETED || 
         task.status === TaskStatus.FAILED ||
         task.status === TaskStatus.CANCELLED)) {
      await deleteTask(taskId);
      cleanedCount++;
    }
  }
  
  logQueue(null, '清理', `✅ 清理完成，共清理 ${cleanedCount} 个过期任务`);
}

// 每小时清理一次过期任务
setInterval(cleanupExpiredTasks, 60 * 60 * 1000);

/**
 * 恢复未完成的任务（服务器重启后调用）
 * @param {Function} executeTaskFn 任务执行函数
 * @returns {Promise<Array>} 恢复的任务列表
 */
async function recoverPendingTasks(executeTaskFn) {
  logQueue(null, '恢复', '========== 开始恢复未完成任务 ==========');
  
  const recoveredTasks = [];
  
  try {
    // 确保存储目录存在
    await ensureStorageDir();
    
    // 读取所有任务文件
    const files = await fs.readdir(TASK_STORAGE_DIR);
    const taskFiles = files.filter(f => f.endsWith('.json'));
    
    logQueue(null, '恢复', `发现 ${taskFiles.length} 个任务文件`);
    
    for (const file of taskFiles) {
      const taskId = file.replace('.json', '');
      
      // 跳过临时文件
      if (file.endsWith('.tmp')) {
        logQueue(null, '恢复', `跳过临时文件: ${file}`);
        continue;
      }
      
      // 使用 loadTask 函数加载任务（带容错处理）
      const task = await loadTask(taskId);
      
      if (!task) {
        logQueue(null, '恢复', `⚠️ 无法加载任务文件: ${file}，已跳过`);
        continue;
      }
        
      // 检查是否是需要恢复的任务（pending 或 processing 状态）
      if (task.status === TaskStatus.PENDING || task.status === TaskStatus.PROCESSING) {
        logQueue(task.id, '恢复', `发现未完成任务`, {
          status: task.status,
          mode: task.meta?.mode,
          createdAt: task.createdAt
        });
        
        // ⚠️ 跳过财神模式任务 - 财神任务由火山引擎管理，不需要本地恢复
        // 财神任务应该存储在 generation_history 表中，由 cleanupService 轮询处理
        if (task.meta?.mode === 'caishen') {
          logQueue(task.id, '恢复', '⚠️ 财神模式任务由火山引擎管理，跳过本地恢复');
          logQueue(task.id, '恢复', '💡 提示：财神任务应该在 generation_history 表中查询，不应该在本地任务队列');
          // 不加载到内存，让它自然过期
          continue;
        }
        
        // 检查任务是否过期（超过1小时的任务标记为超时）
        const taskAge = Date.now() - new Date(task.createdAt).getTime();
        const maxAge = 60 * 60 * 1000; // 1小时
        
        if (taskAge > maxAge) {
          logQueue(task.id, '恢复', `任务已过期 (${Math.round(taskAge / 60000)} 分钟)，标记为超时`);
          task.status = TaskStatus.TIMEOUT;
          task.message = '任务超时，服务器重启后未能恢复';
          task.updatedAt = new Date().toISOString();
          task.completedAt = new Date().toISOString();
          await persistTask(task);
          taskQueue.set(task.id, task);
          
          // ✅ 恢复用户余额
          try {
            const balanceService = require('./balanceService');
            const result = await balanceService.restoreBalance(
              task.meta.userId,
              task.id,
              task.meta.mode
            );
            
            if (result.success) {
              logQueue(task.id, '恢复', '✅ 超时任务余额已恢复');
            } else {
              logQueue(task.id, '恢复', `⚠️ 余额恢复被拒绝: ${result.error} - ${result.message}`);
            }
          } catch (restoreError) {
            logQueue(task.id, '恢复', `⚠️ 恢复余额失败: ${restoreError.message}`);
          }
          
          continue;
        }
        
        // 将任务加载到内存队列
        taskQueue.set(task.id, task);
        
        // 重置为 pending 状态（如果是 processing 状态）
        if (task.status === TaskStatus.PROCESSING) {
            task.status = TaskStatus.PENDING;
            task.progress = 0;
            task.message = '任务恢复中，准备重新执行...';
            task.updatedAt = new Date().toISOString();
            await persistTask(task);
          }
          
        recoveredTasks.push(task);
        logQueue(task.id, '恢复', `✅ 任务已加入恢复队列`);
      } else {
        // 已完成/失败的任务也加载到内存（用于查询）
        taskQueue.set(task.id, task);
      }
    }
    
    logQueue(null, '恢复', `共恢复 ${recoveredTasks.length} 个未完成任务`);
    
    // 如果有执行函数，异步执行恢复的任务
    if (executeTaskFn && recoveredTasks.length > 0) {
      logQueue(null, '恢复', '开始异步执行恢复的任务...');
      
      // 延迟执行，避免服务器启动时负载过高
      for (let i = 0; i < recoveredTasks.length; i++) {
        const task = recoveredTasks[i];
        const delay = i * 2000; // 每个任务间隔2秒
        
        setTimeout(() => {
          logQueue(task.id, '恢复执行', `开始执行恢复的任务 (${i + 1}/${recoveredTasks.length})`);
          executeTaskFn(task.id);
        }, delay);
      }
    }
    
    logQueue(null, '恢复', '========== 任务恢复完成 ==========');
    
  } catch (error) {
    logQueue(null, '恢复', `❌ 恢复任务失败: ${error.message}`);
  }
  
  return recoveredTasks;
}

/**
 * 获取所有 pending 状态的任务
 * @returns {Array} pending 任务列表
 */
function getPendingTasks() {
  const pendingTasks = [];
  for (const task of taskQueue.values()) {
    if (task.status === TaskStatus.PENDING) {
      pendingTasks.push(task);
    }
  }
  return pendingTasks;
}

/**
 * 获取任务队列统计信息
 * @returns {Object} 统计信息
 */
function getQueueStats() {
  const stats = {
    total: taskQueue.size,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    timeout: 0,
    cancelled: 0
  };
  
  for (const task of taskQueue.values()) {
    switch (task.status) {
      case TaskStatus.PENDING:
        stats.pending++;
        break;
      case TaskStatus.PROCESSING:
        stats.processing++;
        break;
      case TaskStatus.COMPLETED:
        stats.completed++;
        break;
      case TaskStatus.FAILED:
        stats.failed++;
        break;
      case TaskStatus.TIMEOUT:
        stats.timeout++;
        break;
      case TaskStatus.CANCELLED:
        stats.cancelled++;
        break;
    }
  }
  
  return stats;
}

module.exports = {
  TaskStatus,
  createTask,
  updateTask,
  getTask,
  deleteTask,
  getUserTasks,
  cleanupExpiredTasks,
  recoverPendingTasks,
  getPendingTasks,
  getQueueStats
};
