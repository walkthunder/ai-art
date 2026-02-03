/**
 * 邀请好友页面
 * 显示邀请码、统计信息和邀请记录
 */

const { initNavigation } = require('../../utils/navigation-helper');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    inviteCode: '',
    stats: {
      total_invites: 0,
      successful_invites: 0,
      total_rewards: 0
    },
    records: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false
  },

  async onLoad() {
    const app = getApp();
    
    initNavigation(this);
    
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
    
    // 确保已登录
    try {
      await app.ensureLogin();
      
      // 加载数据
      await this.loadInviteCode();
      await this.loadInviteStats();
      await this.loadInviteRecords();
    } catch (err) {
      console.error('[Invite] 初始化失败:', err);
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
    }
  },

  onShow() {
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
  },

  /**
   * 加载邀请码
   */
  async loadInviteCode() {
    try {
      const app = getApp();
      const userId = await app.getUserId(true);
      
      if (!userId) {
        console.warn('[Invite] 用户未登录');
        return;
      }
      
      const cloudbaseRequest = require('../../utils/cloudbase-request');
      const res = await cloudbaseRequest.request({
        url: `/api/invite/code/${userId}`,
        method: 'GET'
      });
      
      if (res.statusCode === 200 && res.data) {
        this.setData({
          inviteCode: res.data.invite_code
        });
      }
    } catch (err) {
      console.error('[Invite] 加载邀请码失败:', err);
      // 使用模拟数据
      this.setData({
        inviteCode: 'DEMO1234'
      });
    }
  },

  /**
   * 加载邀请统计
   */
  async loadInviteStats() {
    try {
      const app = getApp();
      const userId = await app.getUserId(true);
      
      if (!userId) {
        console.warn('[Invite] 用户未登录');
        return;
      }
      
      const cloudbaseRequest = require('../../utils/cloudbase-request');
      const res = await cloudbaseRequest.request({
        url: `/api/invite/stats/${userId}`,
        method: 'GET'
      });
      
      if (res.statusCode === 200 && res.data) {
        this.setData({
          stats: res.data
        });
      }
    } catch (err) {
      console.error('[Invite] 加载邀请统计失败:', err);
      // 使用默认值
      this.setData({
        stats: {
          total_invites: 0,
          successful_invites: 0,
          total_rewards: 0
        }
      });
    }
  },

  /**
   * 加载邀请记录
   */
  async loadInviteRecords() {
    if (this.data.loading || !this.data.hasMore) {
      return;
    }
    
    this.setData({ loading: true });
    
    try {
      const app = getApp();
      const userId = await app.getUserId(true);
      
      if (!userId) {
        console.warn('[Invite] 用户未登录');
        this.setData({ loading: false });
        return;
      }
      
      const { page, pageSize } = this.data;
      
      const cloudbaseRequest = require('../../utils/cloudbase-request');
      const res = await cloudbaseRequest.request({
        url: `/api/invite/records/${userId}`,
        method: 'GET',
        data: { page, pageSize }
      });
      
      if (res.statusCode === 200 && res.data) {
        const newRecords = res.data.records || [];
        const total = res.data.total || 0;
        
        // 格式化时间
        const formattedRecords = newRecords.map(record => ({
          ...record,
          created_at: this.formatTime(record.created_at)
        }));
        
        this.setData({
          records: [...this.data.records, ...formattedRecords],
          hasMore: this.data.records.length + newRecords.length < total,
          page: page + 1,
          loading: false
        });
      }
    } catch (err) {
      console.error('[Invite] 加载邀请记录失败:', err);
      this.setData({ loading: false });
    }
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // 小于1分钟
    if (diff < 60000) {
      return '刚刚';
    }
    
    // 小于1小时
    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`;
    }
    
    // 小于1天
    if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}小时前`;
    }
    
    // 小于7天
    if (diff < 604800000) {
      return `${Math.floor(diff / 86400000)}天前`;
    }
    
    // 显示日期
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  },

  /**
   * 复制邀请码
   */
  copyInviteCode() {
    const { inviteCode } = this.data;
    
    if (!inviteCode) {
      wx.showToast({
        title: '邀请码加载中',
        icon: 'none'
      });
      return;
    }
    
    wx.setClipboardData({
      data: inviteCode,
      success: () => {
        wx.showToast({
          title: '邀请码已复制',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/launch/launch'
        });
      }
    });
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    const { inviteCode } = this.data;
    
    return {
      title: '邀请你一起使用AI全家福·团圆照相馆',
      path: `/pages/launch/launch?invite_code=${inviteCode}`,
      imageUrl: '/assets/lantern.png'
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    const { inviteCode } = this.data;
    
    return {
      title: 'AI全家福·团圆照相馆 - 邀请你一起制作全家福',
      query: `invite_code=${inviteCode}`,
      imageUrl: '/assets/lantern.png'
    };
  },

  /**
   * 触底加载更多
   */
  onReachBottom() {
    this.loadInviteRecords();
  }
});
