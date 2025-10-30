const fs = require('fs');
const path = require('path');

// 历史记录文件路径
const HISTORY_FILE = path.join(__dirname, 'history.json');

/**
 * 读取历史记录
 * @returns {Array} 历史记录数组
 */
function readHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('读取历史记录失败:', error);
  }
  return [];
}

/**
 * 写入历史记录
 * @param {Array} history 历史记录数组
 */
function writeHistory(history) {
  try {
    // 确保目录存在
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 写入文件
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('写入历史记录失败:', error);
  }
}

/**
 * 添加历史记录
 * @param {Object} record 历史记录项
 */
function addHistoryRecord(record) {
  try {
    const history = readHistory();
    history.unshift(record); // 添加到数组开头
    
    // 限制历史记录数量，最多保存100条
    if (history.length > 100) {
      history.splice(100);
    }
    
    writeHistory(history);
  } catch (error) {
    console.error('添加历史记录失败:', error);
  }
}

/**
 * 根据任务ID查找历史记录
 * @param {string} taskId 任务ID
 * @returns {Object|null} 历史记录项或null
 */
function findHistoryRecordByTaskId(taskId) {
  try {
    const history = readHistory();
    return history.find(record => record.taskId === taskId) || null;
  } catch (error) {
    console.error('查找历史记录失败:', error);
    return null;
  }
}

/**
 * 获取所有历史记录
 * @returns {Array} 历史记录数组
 */
function getAllHistoryRecords() {
  try {
    return readHistory();
  } catch (error) {
    console.error('获取历史记录失败:', error);
    return [];
  }
}

module.exports = {
  addHistoryRecord,
  findHistoryRecordByTaskId,
  getAllHistoryRecords
};