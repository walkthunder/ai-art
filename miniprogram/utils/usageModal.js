/**
 * 使用次数模态框决策工具
 * 根据用户状态决定是否显示模态框以及显示哪种类型
 */

/**
 * 确定模态框类型
 * @param {number} usageCount - 剩余使用次数
 * @param {string} userType - 用户类型 ('free' | 'paid')
 * @param {string} paymentStatus - 付费状态 ('free' | 'basic' | 'premium')
 * @returns {string|null} 模态框类型或null（不显示）
 */
function determineModalType(usageCount, userType, paymentStatus = 'free') {
  // 次数用尽
  if (usageCount === 0) {
    if (userType === 'free') {
      return 'free_exhausted';
    } else {
      // 付费用户根据套餐类型显示不同的续费弹窗
      if (paymentStatus === 'premium') {
        return 'paid_renewal_premium';
      } else if (paymentStatus === 'basic') {
        return 'paid_renewal_basic';
      }
      return 'paid_renewal_basic'; // 默认
    }
  }
  
  // 免费用户次数不多（<= 2）
  if (userType === 'free' && usageCount <= 2) {
    return 'free_reminder';
  }
  
  // 不显示模态框
  return null;
}

/**
 * 判断是否应该禁用生成按钮
 * @param {number} usageCount - 剩余使用次数
 * @returns {boolean} 是否禁用
 */
function shouldDisableButton(usageCount) {
  return usageCount === 0;
}

/**
 * 判断是否应该显示模态框
 * @param {number} usageCount - 剩余使用次数
 * @param {string} userType - 用户类型 ('free' | 'paid')
 * @param {string} pageType - 页面类型 ('launch' | 'result')
 * @param {string} paymentStatus - 付费状态 ('free' | 'basic' | 'premium')
 * @returns {boolean} 是否显示
 */
function shouldShowModal(usageCount, userType, pageType = 'launch', paymentStatus = 'free') {
  const modalType = determineModalType(usageCount, userType, paymentStatus);
  
  if (!modalType) {
    return false;
  }
  
  // ✅ 统一规则：所有次数不足的情况都在 Result 页面显示
  // 目的：提醒后置，让用户先看到效果再付费（提高转化率）
  if (pageType === 'result') {
    // Result 页面：次数 <= 2 或次数用尽时显示
    return usageCount <= 2;
  }
  
  // Launch 页面：只在次数用尽时显示（阻止生成）
  if (pageType === 'launch') {
    return usageCount === 0;
  }
  
  return false;
}

/**
 * 获取按钮文本
 * @param {number} usageCount - 剩余使用次数
 * @param {string} defaultText - 默认文本
 * @returns {string} 按钮文本
 */
function getButtonText(usageCount, defaultText = '开始生成') {
  if (usageCount === 0) {
    return '次数已用完';
  }
  return defaultText;
}

/**
 * 获取按钮样式类
 * @param {number} usageCount - 剩余使用次数
 * @returns {string} 样式类名
 */
function getButtonClass(usageCount) {
  if (usageCount === 0) {
    return 'btn-disabled';
  }
  if (usageCount <= 2) {
    return 'btn-warning';
  }
  return 'btn-primary';
}

/**
 * 格式化使用次数显示文本
 * @param {number} usageCount - 剩余使用次数
 * @param {string} userType - 用户类型
 * @returns {string} 显示文本
 */
function formatUsageText(usageCount, userType) {
  if (usageCount === 0) {
    return userType === 'free' ? '免费次数已用完' : '次数已用完';
  }
  return `剩余 ${usageCount} 次`;
}

/**
 * 检查是否需要在页面加载时显示模态框
 * @param {number} usageCount - 剩余使用次数
 * @param {string} userType - 用户类型
 * @param {string} pageType - 页面类型
 * @param {string} paymentStatus - 付费状态
 * @returns {Object} { show: boolean, modalType: string|null }
 */
function checkModalOnPageLoad(usageCount, userType, pageType = 'launch', paymentStatus = 'free') {
  const modalType = determineModalType(usageCount, userType, paymentStatus);
  const show = shouldShowModal(usageCount, userType, pageType, paymentStatus);
  
  return {
    show,
    modalType
  };
}

/**
 * 检查并显示模态框（异步版本，从后端获取使用次数）
 * @param {string} userId - 用户ID
 * @param {string} pageType - 页面类型 ('launch' | 'result')
 * @returns {Promise<Object|null>} 模态框配置或null
 */
async function checkAndShowModal(userId, pageType = 'launch') {
  try {
    // 从app.js获取使用次数（已经缓存在全局状态中）
    const app = getApp();
    const result = await app.updateUsageCount();
    
    if (!result) {
      console.error('[UsageModal] 获取使用次数失败');
      return null;
    }
    
    const { usageCount, userType, paymentStatus } = result;
    const modalCheck = checkModalOnPageLoad(usageCount, userType, pageType, paymentStatus || 'free');
    
    if (modalCheck.show) {
      return {
        modalType: modalCheck.modalType,
        usageCount: usageCount
      };
    }
    
    return null;
  } catch (err) {
    console.error('[UsageModal] 检查模态框失败:', err);
    return null;
  }
}

module.exports = {
  determineModalType,
  shouldDisableButton,
  shouldShowModal,
  getButtonText,
  getButtonClass,
  formatUsageText,
  checkModalOnPageLoad,
  checkAndShowModal
};
