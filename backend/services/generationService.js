/**
 * 生成历史服务
 * 负责管理艺术照生成历史记录的CRUD操作
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { convertToCST } = require('../utils/timezone');

/**
 * 保存生成历史记录
 * @param {Object} data 生成历史数据
 * @param {string} data.userId 用户ID
 * @param {Array<string>} data.taskIds 任务ID数组
 * @param {Array<string>} data.originalImageUrls 原始图片URL数组
 * @param {string} data.templateUrl 模板URL
 * @param {Array<string>} data.generatedImageUrls 生成的图片URL数组(可选)
 * @param {string} data.selectedImageUrl 选中的图片URL(可选)
 * @param {string} data.status 状态(pending/processing/completed/failed)
 * @param {string} data.mode 生成模式(transform/puzzle，默认transform)
 * @returns {Promise<Object>} 保存的记录
 */
async function saveGenerationHistory(data) {
  const {
    userId,
    taskIds,
    originalImageUrls,
    templateUrl,
    generatedImageUrls = null,
    selectedImageUrl = null,
    status = 'pending',
    mode = 'transform'
  } = data;

  // 参数校验
  if (!userId || !taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
    throw new Error('缺少必要参数: userId 和 taskIds 是必需的');
  }

  if (!originalImageUrls || !Array.isArray(originalImageUrls)) {
    throw new Error('缺少必要参数: originalImageUrls 必须是数组');
  }

  if (!templateUrl) {
    throw new Error('缺少必要参数: templateUrl 是必需的');
  }

  // 生成记录ID
  const recordId = uuidv4();

  // 将数组转换为JSON字符串
  const taskIdsJson = JSON.stringify(taskIds);
  const originalImageUrlsJson = JSON.stringify(originalImageUrls);
  const generatedImageUrlsJson = generatedImageUrls ? JSON.stringify(generatedImageUrls) : null;

  // 插入数据库
  const connection = await db.pool.getConnection();
  try {
    await connection.execute(
      `INSERT INTO generation_history 
      (id, user_id, task_ids, original_image_urls, template_url, generated_image_urls, selected_image_url, status, mode, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [recordId, userId, taskIdsJson, originalImageUrlsJson, templateUrl, generatedImageUrlsJson, selectedImageUrl, status, mode]
    );

    console.log(`生成历史记录已保存: ${recordId}, 用户: ${userId}, 模式: ${mode}, 任务数: ${taskIds.length}`);

    // 返回保存的记录
    return {
      id: recordId,
      userId,
      taskIds,
      originalImageUrls,
      templateUrl,
      generatedImageUrls,
      selectedImageUrl,
      status,
      mode,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  } finally {
    connection.release();
  }
}

/**
 * 更新生成历史记录
 * @param {string} recordId 记录ID
 * @param {Object} updates 更新的字段
 * @param {Array<string>} updates.generatedImageUrls 生成的图片URL数组
 * @param {string} updates.selectedImageUrl 选中的图片URL
 * @param {string} updates.status 状态
 * @returns {Promise<Object>} 更新后的记录
 */
async function updateGenerationHistory(recordId, updates) {
  if (!recordId) {
    throw new Error('缺少必要参数: recordId 是必需的');
  }

  const connection = await db.pool.getConnection();
  try {
    // 构建更新语句
    const updateFields = [];
    const updateValues = [];

    if (updates.generatedImageUrls !== undefined) {
      updateFields.push('generated_image_urls = ?');
      updateValues.push(JSON.stringify(updates.generatedImageUrls));
    }

    if (updates.selectedImageUrl !== undefined) {
      updateFields.push('selected_image_url = ?');
      updateValues.push(updates.selectedImageUrl);
    }

    if (updates.status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(updates.status);
    }

    if (updateFields.length === 0) {
      throw new Error('没有需要更新的字段');
    }

    // 添加updated_at字段
    updateFields.push('updated_at = NOW()');

    // 添加recordId到参数数组
    updateValues.push(recordId);

    // 执行更新
    const sql = `UPDATE generation_history SET ${updateFields.join(', ')} WHERE id = ?`;
    const [result] = await connection.execute(sql, updateValues);

    if (result.affectedRows === 0) {
      throw new Error(`未找到记录: ${recordId}`);
    }

    console.log(`生成历史记录已更新: ${recordId}`);

    // 查询并返回更新后的记录
    return await getGenerationHistoryById(recordId);
  } finally {
    connection.release();
  }
}

/**
 * 根据ID获取生成历史记录
 * @param {string} recordId 记录ID
 * @returns {Promise<Object|null>} 生成历史记录
 */
async function getGenerationHistoryById(recordId) {
  if (!recordId) {
    throw new Error('缺少必要参数: recordId 是必需的');
  }

  const connection = await db.pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT * FROM generation_history WHERE id = ?',
      [recordId]
    );

    if (rows.length === 0) {
      return null;
    }

    const record = rows[0];

    // 解析JSON字段 - 处理可能是字符串或已解析的JSON
    const parseJsonField = (field) => {
      if (!field) return null;
      if (typeof field === 'string') {
        return JSON.parse(field);
      }
      return field;
    };

    return {
      id: record.id,
      userId: record.user_id,
      taskIds: parseJsonField(record.task_ids),
      originalImageUrls: parseJsonField(record.original_image_urls),
      templateUrl: record.template_url,
      generatedImageUrls: parseJsonField(record.generated_image_urls),
      selectedImageUrl: record.selected_image_url,
      status: record.status,
      mode: record.mode || 'transform',
      createdAt: record.created_at,
      updatedAt: record.updated_at
    };
  } finally {
    connection.release();
  }
}

/**
 * 根据任务ID获取生成历史记录
 * @param {string} taskId 任务ID
 * @returns {Promise<Object|null>} 生成历史记录
 */
async function getGenerationHistoryByTaskId(taskId) {
  if (!taskId) {
    throw new Error('缺少必要参数: taskId 是必需的');
  }

  const connection = await db.pool.getConnection();
  try {
    // 使用JSON_CONTAINS查询包含指定taskId的记录
    const [rows] = await connection.execute(
      `SELECT * FROM generation_history WHERE JSON_CONTAINS(task_ids, ?)`,
      [JSON.stringify(taskId)]
    );

    if (rows.length === 0) {
      return null;
    }

    const record = rows[0];

    // 解析JSON字段 - 处理可能是字符串或已解析的JSON
    const parseJsonField = (field) => {
      if (!field) return null;
      if (typeof field === 'string') {
        return JSON.parse(field);
      }
      return field;
    };

    return {
      id: record.id,
      userId: record.user_id,
      taskIds: parseJsonField(record.task_ids),
      originalImageUrls: parseJsonField(record.original_image_urls),
      templateUrl: record.template_url,
      generatedImageUrls: parseJsonField(record.generated_image_urls),
      selectedImageUrl: record.selected_image_url,
      status: record.status,
      createdAt: convertToCST(record.created_at),
      updatedAt: convertToCST(record.updated_at)
    };
  } finally {
    connection.release();
  }
}

/**
 * 根据用户ID获取生成历史记录列表
 * @param {string} userId 用户ID
 * @param {number} limit 返回记录数量限制(默认20)
 * @param {string} mode 生成模式(可选: 'transform'/'puzzle')
 * @param {number} page 页码(从1开始，默认1)
 * @returns {Promise<Object>} { records: Array, total: number, page: number, pageSize: number, totalPages: number }
 */
async function getGenerationHistoryByUserId(userId, limit = 20, mode = null, page = 1) {
  if (!userId) {
    throw new Error('缺少必要参数: userId 是必需的');
  }

  const connection = await db.pool.getConnection();
  try {
    // 验证分页参数
    const validPage = Math.max(1, parseInt(page) || 1);
    const validPageSize = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (validPage - 1) * validPageSize;
    
    // 构建查询条件
    let whereClause = 'WHERE user_id = ?';
    const params = [userId];
    
    // 如果指定了 mode，添加过滤条件
    if (mode) {
      whereClause += ' AND mode = ?';
      params.push(mode);
    }
    
    // 查询总记录数
    const countQuery = `SELECT COUNT(*) as total FROM generation_history ${whereClause}`;
    const [countRows] = await connection.execute(countQuery, params);
    const total = countRows[0].total;
    
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
    
    // 查询分页数据 - 使用参数化查询避免 SQL 注入
    const dataQuery = `SELECT * FROM generation_history ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const dataParams = [...params, validPageSize, offset];
    const [rows] = await connection.execute(dataQuery, dataParams);

    // 解析JSON字段 - 处理可能是字符串或已解析的JSON
    const parseJsonField = (field) => {
      if (!field) return null;
      if (typeof field === 'string') {
        return JSON.parse(field);
      }
      return field;
    };

    const records = rows.map(record => ({
      id: record.id,
      userId: record.user_id,
      taskIds: parseJsonField(record.task_ids),
      originalImageUrls: parseJsonField(record.original_image_urls),
      templateUrl: record.template_url,
      generatedImageUrls: parseJsonField(record.generated_image_urls),
      selectedImageUrl: record.selected_image_url,
      status: record.status,
      mode: record.mode || 'transform', // 默认为 transform
      createdAt: convertToCST(record.created_at),
      updatedAt: convertToCST(record.updated_at)
    }));
    
    return {
      records,
      total,
      page: validPage,
      pageSize: validPageSize,
      totalPages: Math.ceil(total / validPageSize)
    };
  } finally {
    connection.release();
  }
}

/**
 * 更新生成记录的任务ID列表
 * @param {string} recordId 记录ID
 * @param {Array<string>} taskIds 任务ID数组
 * @returns {Promise<Object>} 更新后的记录
 */
async function updateTaskIds(recordId, taskIds) {
  if (!recordId) {
    throw new Error('缺少必要参数: recordId 是必需的');
  }

  if (!taskIds || !Array.isArray(taskIds)) {
    throw new Error('taskIds 必须是数组');
  }

  const connection = await db.pool.getConnection();
  try {
    const [result] = await connection.execute(
      'UPDATE generation_history SET task_ids = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(taskIds), recordId]
    );

    if (result.affectedRows === 0) {
      throw new Error(`未找到记录: ${recordId}`);
    }

    console.log(`生成记录的任务ID已更新: ${recordId}`);

    // 查询并返回更新后的记录
    return await getGenerationHistoryById(recordId);
  } finally {
    connection.release();
  }
}

/**
 * 删除超过指定天数的未付费记录
 * @param {number} days 天数(默认30天)
 * @returns {Promise<number>} 删除的记录数
 */
async function deleteOldUnpaidRecords(days = 30) {
  const connection = await db.pool.getConnection();
  try {
    // 查找超过指定天数的未付费用户的生成记录
    const [result] = await connection.execute(
      `DELETE gh FROM generation_history gh
       INNER JOIN users u ON gh.user_id = u.id
       WHERE u.payment_status = 'free' 
       AND gh.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    const deletedCount = result.affectedRows;
    console.log(`已删除 ${deletedCount} 条超过 ${days} 天的未付费记录`);

    return deletedCount;
  } finally {
    connection.release();
  }
}

module.exports = {
  saveGenerationHistory,
  updateGenerationHistory,
  getGenerationHistoryById,
  getGenerationHistoryByTaskId,
  getGenerationHistoryByUserId,
  updateTaskIds,
  deleteOldUnpaidRecords
};
