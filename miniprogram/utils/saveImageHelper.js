/**
 * 图片保存辅助工具
 * 统一处理免费用户首次保存和高清下载的逻辑
 */

/**
 * 获取保存状态的存储key
 * @param {string} generationId - 生成记录ID
 * @returns {string} 存储key
 */
function getSaveStateKey(generationId) {
  return `hasSavedFreeVersion_${generationId}`;
}

/**
 * 获取保存状态
 * @param {string} generationId - 生成记录ID
 * @returns {boolean} 是否已保存过免费版本
 */
function getSaveState(generationId) {
  const key = getSaveStateKey(generationId);
  return wx.getStorageSync(key) || false;
}

/**
 * 设置保存状态
 * @param {string} generationId - 生成记录ID
 * @param {boolean} value - 状态值
 */
function setSaveState(generationId, value) {
  const key = getSaveStateKey(generationId);
  wx.setStorageSync(key, value);
}

/**
 * 清除保存状态
 * @param {string} generationId - 生成记录ID
 */
function clearSaveState(generationId) {
  const key = getSaveStateKey(generationId);
  wx.removeStorageSync(key);
}

/**
 * 清理过期的保存状态（7天）
 */
function cleanupExpiredSaveStates() {
  try {
    const storageInfo = wx.getStorageInfoSync();
    const keys = storageInfo.keys || [];
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    
    keys.forEach(key => {
      if (key.startsWith('hasSavedFreeVersion_')) {
        const generationId = key.replace('hasSavedFreeVersion_', '');
        const timestamp = parseInt(generationId);
        
        if (!isNaN(timestamp) && (now - timestamp) > SEVEN_DAYS) {
          wx.removeStorageSync(key);
          console.log('[SaveImageHelper] 清理过期状态:', key);
        }
      }
    });
  } catch (err) {
    console.error('[SaveImageHelper] 清理过期状态失败:', err);
  }
}

/**
 * 处理保存图片逻辑
 * @param {Object} context - 页面上下文
 * @param {string} context.selectedImage - 图片URL
 * @param {boolean} context.isSaving - 是否正在保存
 * @param {boolean} context.hasEverPaid - 是否曾经付费
 * @param {boolean} context.hasSavedFreeVersion - 是否已保存过免费版本
 * @param {string} pageName - 页面名称（用于日志）
 * @returns {Object} { shouldShowPayment: boolean, shouldSave: boolean }
 */
function handleSaveImageLogic(context, pageName = 'Result') {
  const { selectedImage, isSaving, hasEverPaid, hasSavedFreeVersion } = context;
  
  console.log(`[${pageName}] handleSaveImage 被调用:`, {
    selectedImage: !!selectedImage,
    isSaving,
    hasEverPaid,
    hasSavedFreeVersion
  });
  
  // 基本检查
  if (!selectedImage || isSaving) {
    console.log(`[${pageName}] 返回：selectedImage=`, !!selectedImage, 'isSaving=', isSaving);
    return { shouldShowPayment: false, shouldSave: false };
  }
  
  // 免费用户（从未付费）
  if (!hasEverPaid) {
    // 如果已经保存过免费版本，显示支付弹窗
    if (hasSavedFreeVersion) {
      console.log(`[${pageName}] 用户已保存过免费版本，显示支付弹窗`);
      return { shouldShowPayment: true, shouldSave: false };
    }
    
    // 首次保存，保存免费版本（带水印）
    console.log(`[${pageName}] 用户首次保存，保存免费版本`);
    return { shouldShowPayment: false, shouldSave: true };
  }
  
  // 已付费，直接保存
  console.log(`[${pageName}] 用户已付费，开始保存`);
  return { shouldShowPayment: false, shouldSave: true };
}

/**
 * 保存成功后的回调处理
 * @param {boolean} hasEverPaid - 是否曾经付费
 * @param {boolean} hasSavedFreeVersion - 当前是否已保存过
 * @param {string} generationId - 生成记录ID
 * @returns {boolean} 是否需要更新状态
 */
function handleSaveSuccess(hasEverPaid, hasSavedFreeVersion, generationId) {
  // 如果是免费用户首次保存，标记已保存并持久化
  if (!hasEverPaid && !hasSavedFreeVersion) {
    setSaveState(generationId, true);
    console.log('[SaveImageHelper] 免费用户首次保存完成，状态已持久化');
    
    // 显示提示，引导用户注意按钮变化
    setTimeout(() => {
      wx.showToast({
        title: '点击"高清下载"获取无水印版本',
        icon: 'none',
        duration: 3000
      });
    }, 1500);
    
    return true; // 需要更新状态
  }
  
  return false; // 不需要更新状态
}

module.exports = {
  getSaveStateKey,
  getSaveState,
  setSaveState,
  clearSaveState,
  cleanupExpiredSaveStates,
  handleSaveImageLogic,
  handleSaveSuccess
};
