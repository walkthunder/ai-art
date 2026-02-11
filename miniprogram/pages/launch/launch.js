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
    userCount: '15,430', // 已生成家庭数量
    commonBgUrl: getAssetUrl('common-bg.jpg'),
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0
  },

  onLoad(options) {
    const app = getApp();
    const menuButtonInfo = app.globalData.menuButtonInfo;
    
    // 计算胶囊按钮右侧位置（屏幕宽度 - 胶囊右边距）
    const systemInfo = wx.getSystemInfoSync();
    const menuRight = systemInfo.windowWidth - menuButtonInfo.right;
    
    // 计算底部安全区域高度
    const safeAreaBottom = systemInfo.safeArea 
      ? systemInfo.screenHeight - systemInfo.safeArea.bottom 
      : 0;
    
    this.setData({
      isElderMode: app.globalData.isElderMode,
      statusBarHeight: app.globalData.statusBarHeight || 0,
      navBarHeight: app.globalData.navBarHeight || 44,
      menuRight: menuRight,
      safeAreaBottom: safeAreaBottom
    });
    
    // 获取统计数据（可从后端获取）
    this.fetchStats();

    // 处理邀请码（如果有）
    this.handleInviteCode(options);
  },

  /**
   * 处理邀请码
   * 从 URL 参数中获取邀请码并保存到本地存储
   */
  handleInviteCode(options) {
    try {
      // 从 URL 参数获取邀请码
      const inviteCode = options?.invite_code;
      
      if (inviteCode) {
        console.log('[Launch] 收到邀请码:', inviteCode);
        // 保存到本地存储，等待用户登录后处理
        wx.setStorageSync('pending_invite_code', inviteCode);
        
        // 显示提示
        wx.showToast({
          title: '已接受邀请',
          icon: 'success',
          duration: 2000
        });
      }
    } catch (err) {
      console.error('[Launch] 处理邀请码失败:', err);
    }
  },

  onShow() {
    // 页面显示时更新老年模式状态
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode
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
   * 进入财神变身模式
   */
  goToCaishen() {
    wx.navigateTo({
      url: '/pages/caishen/launch/launch',
      fail: (err) => {
        console.error('跳转财神变身失败:', err);
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
    // 获取当前用户的邀请码
    const app = getApp();
    const userId = app.globalData.userId;
    
    // 如果有用户ID，尝试从本地存储获取邀请码
    let inviteCode = '';
    if (userId) {
      try {
        inviteCode = wx.getStorageSync(`invite_code_${userId}`) || '';
      } catch (err) {
        console.error('[Launch] 获取邀请码失败:', err);
      }
    }
    
    // 如果没有邀请码，异步加载（不阻塞分享）
    if (!inviteCode && userId) {
      this.loadInviteCodeForShare(userId);
    }
    
    const path = inviteCode 
      ? `/pages/launch/launch?invite_code=${inviteCode}`
      : '/pages/launch/launch';
    
    return {
      title: 'AI全家福·团圆照相馆 - 这个春节，让爱没有距离',
      path: path,
      imageUrl: '/assets/images/share-default.png'
    };
  },

  /**
   * 分享到朋友圈
   * Requirements: 8.1
   */
  onShareTimeline() {
    // 获取当前用户的邀请码
    const app = getApp();
    const userId = app.globalData.userId;
    
    let inviteCode = '';
    if (userId) {
      try {
        inviteCode = wx.getStorageSync(`invite_code_${userId}`) || '';
      } catch (err) {
        console.error('[Launch] 获取邀请码失败:', err);
      }
    }
    
    // 如果没有邀请码，异步加载（不阻塞分享）
    if (!inviteCode && userId) {
      this.loadInviteCodeForShare(userId);
    }
    
    const query = inviteCode ? `invite_code=${inviteCode}` : '';
    
    return {
      title: 'AI全家福·团圆照相馆',
      query: query,
      imageUrl: '/assets/images/share-default.png'
    };
  },

  /**
   * 异步加载邀请码（用于分享）
   * @param {string} userId - 用户ID
   */
  async loadInviteCodeForShare(userId) {
    try {
      const cloudbaseRequest = require('../../utils/cloudbase-request');
      const res = await cloudbaseRequest.get(`/api/invite/code/${userId}`);
      
      if (res && res.success && res.data && res.data.invite_code) {
        wx.setStorageSync(`invite_code_${userId}`, res.data.invite_code);
        console.log('[Launch] 邀请码已加载，下次分享将包含邀请码');
      }
    } catch (err) {
      console.error('[Launch] 加载邀请码失败:', err);
    }
  }
});
