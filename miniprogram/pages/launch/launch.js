/**
 * 启动页
 * Requirements: 2.1, 2.5
 * 
 * 功能：
 * - 展示主标题和统计信息
 * - 时空拼图/富贵变身模式选择卡片
 * - 页面跳转逻辑
 */

const { getAssetUrl } = require('../../utils/oss-assets');

Page({
  data: {
    isElderMode: false,
    userCount: 15430, // 当前数字
    digits: [1, 5, 4, 3, 0], // 每位数字的值
    showComma: false,
    commonBgUrl: getAssetUrl('common-bg.jpg'),
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0
  },

  onLoad() {
    const app = getApp();
    const menuButtonInfo = app.globalData.menuButtonInfo;
    
    // 计算胶囊按钮右侧位置（屏幕宽度 - 胶囊右边距）
    const systemInfo = wx.getSystemInfoSync();
    const menuRight = systemInfo.windowWidth - menuButtonInfo.right;
    
    this.setData({
      isElderMode: app.globalData.isElderMode,
      statusBarHeight: app.globalData.statusBarHeight || 0,
      navBarHeight: app.globalData.navBarHeight || 44,
      menuRight: menuRight
    });
    
    // 启动数字翻滚动画
    this.startCounterAnimation();
  },

  onShow() {
    // 页面显示时更新老年模式状态
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
  },

  /**
   * 启动数字翻滚动画
   * 从 15430 开始，每次随机增加 1-9
   */
  startCounterAnimation() {
    let currentCount = 15430;
    const targetCount = currentCount + Math.floor(Math.random() * 50) + 50; // 最终目标
    
    const animate = () => {
      if (currentCount >= targetCount) {
        return;
      }
      
      // 随机增加 1-9
      const increment = Math.floor(Math.random() * 9) + 1;
      currentCount += increment;
      
      // 更新数字显示
      this.updateDigits(currentCount);
      
      // 继续动画
      setTimeout(animate, 100); // 每100ms更新一次
    };
    
    // 初始显示
    this.updateDigits(currentCount);
    
    // 延迟500ms后开始动画
    setTimeout(animate, 500);
  },

  /**
   * 更新数字显示
   * @param {number} count - 当前数字
   */
  updateDigits(count) {
    const countStr = count.toString().padStart(5, '0');
    const digits = countStr.split('').map(d => parseInt(d));
    
    this.setData({
      userCount: count,
      digits: digits
    });
  },

  /**
   * 获取统计数据
   */
  fetchStats() {
    // TODO: 从后端获取真实统计数据
    // const { userAPI } = require('../../utils/api');
    // const stats = await userAPI.getStats();
    // this.setData({ userCount: stats.familyCount.toLocaleString() });
  },

  /**
   * 进入时空拼图模式
   * Requirements: 2.2
   */
  goToPuzzle() {
    wx.navigateTo({
      url: '/pages/puzzle/launch/launch',
      fail: (err) => {
        console.error('跳转时空拼图失败:', err);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 进入富贵变身模式
   * Requirements: 2.3
   */
  goToTransform() {
    wx.navigateTo({
      url: '/pages/transform/launch/launch',
      fail: (err) => {
        console.error('跳转富贵变身失败:', err);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 分享给好友
   * Requirements: 8.1
   */
  onShareAppMessage() {
    return {
      title: 'AI全家福·团圆照相馆 - 这个春节，让爱没有距离',
      path: '/pages/launch/launch',
      imageUrl: '/assets/images/share-default.png'
    };
  },

  /**
   * 分享到朋友圈
   * Requirements: 8.1
   */
  onShareTimeline() {
    return {
      title: 'AI全家福·团圆照相馆',
      imageUrl: '/assets/images/share-default.png'
    };
  }
});
