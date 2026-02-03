/**
 * 时区转换工具
 * 将 UTC 时间转换为中国标准时间 (CST, UTC+8)
 */

/**
 * 将 UTC 时间转换为 CST (UTC+8)
 * @param {Date|string} utcTime - UTC 时间
 * @returns {string} - CST 时间字符串 (YYYY-MM-DD HH:mm:ss)
 */
function convertToCST(utcTime) {
  if (!utcTime) return null;
  
  let date;
  
  // 如果是字符串，需要明确指定为 UTC 时间
  if (typeof utcTime === 'string') {
    // 如果字符串不包含时区信息，添加 'Z' 表示 UTC
    const timeStr = utcTime.includes('Z') || utcTime.includes('+') || utcTime.includes('T') 
      ? utcTime 
      : utcTime.replace(' ', 'T') + 'Z';
    date = new Date(timeStr);
  } else {
    date = new Date(utcTime);
  }
  
  if (isNaN(date.getTime())) return null;
  
  // 获取 UTC 时间戳，然后加上 8 小时（28800000 毫秒）
  const cstTimestamp = date.getTime() + (8 * 60 * 60 * 1000);
  const cstDate = new Date(cstTimestamp);
  
  // 格式化为 YYYY-MM-DD HH:mm:ss
  const year = cstDate.getUTCFullYear();
  const month = String(cstDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(cstDate.getUTCDate()).padStart(2, '0');
  const hours = String(cstDate.getUTCHours()).padStart(2, '0');
  const minutes = String(cstDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(cstDate.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 批量转换对象中的时间字段为 CST
 * @param {Object} obj - 包含时间字段的对象
 * @param {Array<string>} fields - 需要转换的字段名数组，默认为常见时间字段
 * @returns {Object} - 转换后的对象
 */
function convertObjectTimesToCST(obj, fields = ['created_at', 'updated_at', 'last_login_at', 'first_payment_at', 'last_payment_at']) {
  if (!obj) return obj;
  
  const converted = { ...obj };
  fields.forEach(field => {
    if (converted[field]) {
      converted[field] = convertToCST(converted[field]);
    }
  });
  
  return converted;
}

/**
 * 批量转换数组中对象的时间字段为 CST
 * @param {Array<Object>} arr - 对象数组
 * @param {Array<string>} fields - 需要转换的字段名数组
 * @returns {Array<Object>} - 转换后的数组
 */
function convertArrayTimesToCST(arr, fields) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(obj => convertObjectTimesToCST(obj, fields));
}

module.exports = {
  convertToCST,
  convertObjectTimesToCST,
  convertArrayTimesToCST
};
