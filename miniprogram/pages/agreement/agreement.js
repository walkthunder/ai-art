/**
 * 用户协议页面
 */

const { initNavigation } = require('../../utils/navigation-helper');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0
  },

  onLoad() {
    const app = getApp();
    initNavigation(this);
    
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
  },

  onShow() {
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/launch/launch'
        });
      }
    });
  }
});
