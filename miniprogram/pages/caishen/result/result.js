/**
 * 财神变身模式结果页
 * 
 * 功能：
 * - 显示生成的财神视频
 * - 视频播放控制
 * - 保存视频功能
 * - 分享功能
 */

const { initNavigation } = require('../../../utils/navigation-helper');
const { getAssetUrl } = require('../../../utils/oss-assets');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    videoUrl: '',
    videoLoaded: false,
    isSaving: false,
    paymentStatus: 'free',
    hasEverPaid: false,
    showPaymentModal: false,
    commonBgUrl: getAssetUrl('bg/caishen-result-bg.jpg')
  },

  async onLoad(options) {
    const app = getApp();
    const paymentStatus = wx.getStorageSync('paymentStatus') || 'free';
    const hasEverPaid = wx.getStorageSync('hasEverPaid') || false;
    
    initNavigation(this);
    
    this.setData({
      isElderMode: app.globalData.isElderMode,
      paymentStatus: paymentStatus,
      hasEverPaid: hasEverPaid
    });
    
    // 获取视频URL - 三级fallback机制
    let videoUrl = '';
    
    // 1. 优先从URL参数读取
    if (options.videoUrl) {
      videoUrl = decodeURIComponent(options.videoUrl);
      console.log('[CaishenResult] 从URL参数获取视频:', videoUrl);
    } 
    // 2. 其次从globalData读取
    else if (app.globalData.caishenData?.videoUrl) {
      videoUrl = app.globalData.caishenData.videoUrl;
      console.log('[CaishenResult] 从globalData获取视频:', videoUrl);
    } 
    // 3. 最后从服务器查询
    else if (options.taskId) {
      console.log('[CaishenResult] 从服务器查询视频URL, taskId:', options.taskId);
      wx.showLoading({ title: '加载中...', mask: true });
      
      try {
        const API_BASE_URL = require('../../../config/api').API_BASE_URL;
        const response = await wx.request({
          url: `${API_BASE_URL}/api/caishen/task/${options.taskId}`,
          method: 'GET'
        });
        
        wx.hideLoading();
        
        if (response.statusCode === 200 && response.data.success) {
          videoUrl = response.data.data.videoUrl || '';
          console.log('[CaishenResult] 从服务器获取视频成功:', videoUrl);
        } else {
          throw new Error('查询失败');
        }
      } catch (err) {
        wx.hideLoading();
        console.error('[CaishenResult] 从服务器查询视频失败:', err);
      }
    }
    
    if (!videoUrl) {
      wx.showToast({ title: '没有找到视频', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    
    console.log('[CaishenResult] 最终加载视频:', videoUrl);
    this.setData({ videoUrl });
  },

  onShow() {
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
  },

  onVideoLoad() {
    console.log('[CaishenResult] 视频加载完成');
    this.setData({ videoLoaded: true });
  },

  onVideoError(e) {
    console.error('[CaishenResult] 视频加载失败:', e.detail);
    wx.showToast({
      title: '视频加载失败',
      icon: 'none'
    });
  },

  async handleSaveVideo() {
    const { videoUrl, isSaving, hasEverPaid } = this.data;
    
    if (!videoUrl || isSaving) return;
    
    // 免费用户显示支付弹窗
    if (!hasEverPaid) {
      this.setData({ showPaymentModal: true });
      return;
    }
    
    // 已付费，直接保存
    await this.doSaveVideo();
  },

  async doSaveVideo() {
    const { videoUrl } = this.data;
    
    this.setData({ isSaving: true });
    
    try {
      wx.showLoading({ title: '保存中...', mask: true });
      
      console.log('[CaishenResult] 开始下载视频:', videoUrl);
      
      // 下载视频到本地
      const downloadRes = await new Promise((resolve, reject) => {
        wx.downloadFile({
          url: videoUrl,
          success: resolve,
          fail: reject
        });
      });
      
      console.log('[CaishenResult] 下载结果:', downloadRes);
      
      if (downloadRes.statusCode !== 200) {
        throw new Error('下载视频失败');
      }
      
      // 保存到相册
      await new Promise((resolve, reject) => {
        wx.saveVideoToPhotosAlbum({
          filePath: downloadRes.tempFilePath,
          success: () => {
            wx.hideLoading();
            wx.showToast({ title: '保存成功', icon: 'success' });
            resolve();
          },
          fail: reject
        });
      });
      
    } catch (err) {
      console.error('[CaishenResult] 保存失败:', err);
      wx.hideLoading();
      
      if (err.errMsg && err.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '提示',
          content: '需要您授权保存视频到相册',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) wx.openSetting();
          }
        });
      } else {
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none',
          duration: 2000
        });
      }
    } finally {
      this.setData({ isSaving: false });
    }
  },

  handleShare() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  onPaymentComplete(e) {
    const { packageType } = e.detail;
    console.log('[CaishenResult] 支付完成:', packageType);
    
    const newPaymentStatus = packageType;
    wx.setStorageSync('paymentStatus', newPaymentStatus);
    wx.setStorageSync('hasEverPaid', true);
    
    this.setData({
      showPaymentModal: false,
      paymentStatus: newPaymentStatus,
      hasEverPaid: true
    });
    
    // 支付完成后自动保存视频
    setTimeout(() => {
      this.doSaveVideo();
    }, 500);
  },

  closePaymentModal() {
    this.setData({ showPaymentModal: false });
  },

  goBack() {
    wx.redirectTo({
      url: '/pages/caishen/launch/launch'
    });
  },

  goHome() {
    wx.redirectTo({
      url: '/pages/caishen/launch/launch'
    });
  },

  onShareAppMessage() {
    return {
      title: '财神变身 - 财神附体，财运亨通！',
      path: '/pages/caishen/launch/launch',
      imageUrl: '/assets/images/share-caishen.png'
    };
  },

  onShareTimeline() {
    return {
      title: '财神变身 - AI生成财神发钱视频',
      imageUrl: '/assets/images/share-caishen.png'
    };
  }
});
