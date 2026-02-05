/**
 * 订单工具函数
 * 提供订单相关的通用功能
 */

/**
 * 判断订单类型
 * @param {string} generationId - 生成记录ID
 * @returns {string} 'generation' | 'recharge'
 */
function determineOrderType(generationId) {
  return generationId ? 'generation' : 'recharge';
}

/**
 * 验证充值次数是否合理
 * @param {number} rechargeAmount - 充值次数
 * @param {number} min - 最小值（默认1）
 * @param {number} max - 最大值（默认1000）
 * @throws {Error} 如果充值次数不合理
 */
function validateRechargeAmount(rechargeAmount, min = 1, max = 1000) {
  if (typeof rechargeAmount !== 'number' || isNaN(rechargeAmount)) {
    throw new Error(`充值次数必须是数字: ${rechargeAmount}`);
  }
  
  if (rechargeAmount < min || rechargeAmount > max) {
    throw new Error(`充值次数超出合理范围 [${min}, ${max}]: ${rechargeAmount}`);
  }
  
  return true;
}

/**
 * 格式化订单金额（元转分）
 * @param {number} yuan - 金额（元）
 * @returns {number} 金额（分）
 */
function yuanToFen(yuan) {
  return Math.round(parseFloat(yuan) * 100);
}

/**
 * 格式化订单金额（分转元）
 * @param {number} fen - 金额（分）
 * @returns {number} 金额（元）
 */
function fenToYuan(fen) {
  return (parseInt(fen) / 100).toFixed(2);
}

/**
 * 生成订单描述
 * @param {string} packageType - 套餐类型
 * @returns {string} 订单描述
 */
function generateOrderDescription(packageType) {
  const descriptions = {
    basic: 'AI全家福-尝鲜包',
    premium: 'AI全家福-尊享包',
    free: 'AI全家福-免费体验'
  };
  
  return descriptions[packageType] || 'AI全家福';
}

module.exports = {
  determineOrderType,
  validateRechargeAmount,
  yuanToFen,
  fenToYuan,
  generateOrderDescription
};
