/**
 * 隐私政策页面
 */

const { initNavigation } = require('../../utils/navigation-helper');
const appConfig = require('../../config/app');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    appName: appConfig.getAppName(),
    companyName: appConfig.legal.companyName
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
