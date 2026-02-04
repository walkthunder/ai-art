/**
 * 导航栏辅助函数
 * 用于初始化页面的导航栏高度和大小字按钮位置
 */

/**
 * 初始化导航栏数据
 * @param {Object} page - 页面实例
 */
function initNavigation(page) {
  const app = getApp();
  const { statusBarHeight, navBarHeight, menuButtonInfo } = app.globalData;
  
  // 计算大小字按钮的右边距（与胶囊按钮右边距一致）
  const systemInfo = wx.getSystemInfoSync();
  const menuRight = systemInfo.windowWidth - menuButtonInfo.right;
  
  // 计算底部安全区域高度
  const safeAreaBottom = systemInfo.safeArea 
    ? systemInfo.screenHeight - systemInfo.safeArea.bottom 
    : 0;
  
  page.setData({
    statusBarHeight: statusBarHeight,
    navBarHeight: navBarHeight,
    menuRight: menuRight,
    safeAreaBottom: safeAreaBottom
  });
  
  console.log('[NavigationHelper] 导航栏初始化:', {
    statusBarHeight,
    navBarHeight,
    menuRight,
    safeAreaBottom
  });
}

module.exports = {
  initNavigation
};
