/**
 * 模板数据库服务
 * 提供从数据库读取模板配置的功能
 */

const db = require('../db/connection');

/**
 * 根据模式和模板代码获取模板配置
 * @param {string} mode - 模式类型 (puzzle/transform/caishen)
 * @param {string} code - 模板代码
 * @returns {Promise<Object|null>} 模板配置
 */
async function getTemplateByCode(mode, code) {
  const connection = await db.pool.getConnection();
  
  try {
    const [rows] = await connection.execute(
      `SELECT id, mode, code, name, image_url, prompt, category, duration, sort_order, status
       FROM templates
       WHERE mode = ? AND code = ? AND status = 'active'
       LIMIT 1`,
      [mode, code]
    );
    
    if (rows.length === 0) {
      return null;
    }
    
    const row = rows[0];
    return {
      id: row.code,
      name: row.name,
      imageUrl: row.image_url,
      prompt: row.prompt,
      category: row.category,
      duration: row.duration,
      sortOrder: row.sort_order
    };
  } finally {
    connection.release();
  }
}

/**
 * 获取指定模式的所有活跃模板
 * @param {string} mode - 模式类型
 * @returns {Promise<Array>} 模板列表
 */
async function getTemplatesByMode(mode) {
  const connection = await db.pool.getConnection();
  
  try {
    const [rows] = await connection.execute(
      `SELECT id, mode, code, name, image_url, prompt, category, duration, sort_order, status
       FROM templates
       WHERE mode = ? AND status = 'active'
       ORDER BY sort_order ASC, created_at ASC`,
      [mode]
    );
    
    return rows.map(row => ({
      id: row.code,
      name: row.name,
      imageUrl: row.image_url,
      prompt: row.prompt,
      category: row.category,
      duration: row.duration,
      sortOrder: row.sort_order
    }));
  } finally {
    connection.release();
  }
}

module.exports = {
  getTemplateByCode,
  getTemplatesByMode
};
