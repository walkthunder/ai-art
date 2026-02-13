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
    taskId: '',
    recordId: '',
    isSharedView: false, // 是否是分享视图
    // 使用通用背景
    commonBgUrl: getAssetUrl('common-bg.jpg')
  },

  async onLoad(options) {
    const app = getApp();
    const paymentStatus = wx.getStorageSync('paymentStatus') || 'free';
    const hasEverPaid = wx.getStorageSync('hasEverPaid') || false;
    
    initNavigation(this);
    
    // 检查是否从分享进入
    const isFromShare = options.from === 'share';
    const shareId = options.shareId || options.recordId;
    
    this.setData({
      isElderMode: app.globalData.isElderMode,
      paymentStatus: paymentStatus,
      hasEverPaid: hasEverPaid,
      taskId: options.taskId || '',
      recordId: options.recordId || '',
      isSharedView: isFromShare
    });
    
    // 如果是分享进入，优先通过 recordId 从历史记录加载
    if (isFromShare && shareId) {
      console.log('[CaishenResult] 从分享进入，shareId:', shareId);
      await this.loadSharedResult(shareId);
      return;
    }
    
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
        const cloudbaseRequest = require('../../../utils/cloudbase-request');
        const response = await cloudbaseRequest.get(`/api/caishen/task/${options.taskId}`);
        
        wx.hideLoading();
        
        if (response && response.success && response.data) {
          videoUrl = response.data.videoUrl || '';
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
    
    // 设置超时保护，如果5秒后视频还没加载完成，强制显示视频
    setTimeout(() => {
      if (!this.data.videoLoaded) {
        console.warn('[CaishenResult] 视频加载超时，强制显示视频');
        this.setData({ videoLoaded: true });
      }
    }, 5000);
  },

  /**
   * 加载分享的作品
   * @param {string} shareId - 分享的生成记录ID
   */
  async loadSharedResult(shareId) {
    try {
      wx.showLoading({ title: '加载中...', mask: true });
      
      const cloudbaseRequest = require('../../../utils/cloudbase-request');
      
      // 从历史记录中获取
      const historyRes = await cloudbaseRequest.get(`/api/history/${shareId}`);
      
      wx.hideLoading();
      
      if (historyRes && historyRes.success && historyRes.data) {
        const result = historyRes.data;
        
        // 优先使用 selectedImageUrl，如果没有则使用 generatedImageUrls 的第一张
        let videoUrl = result.selectedImageUrl;
        if (!videoUrl && result.generatedImageUrls && result.generatedImageUrls.length > 0) {
          videoUrl = result.generatedImageUrls[0];
        }
        
        if (!videoUrl) {
          throw new Error('未找到视频');
        }
        
        console.log('[CaishenResult] 从分享加载视频成功:', videoUrl);
        this.setData({ 
          videoUrl,
          videoLoaded: true, // 标记视频已加载，显示视频组件
          recordId: shareId,
          taskId: result.taskIds?.[0] || ''
        });
        
      } else {
        throw new Error('分享内容已失效或不存在');
      }
      
    } catch (err) {
      wx.hideLoading();
      console.error('[CaishenResult] 加载分享内容失败:', err);
      
      wx.showModal({
        title: '提示',
        content: err.message || '分享内容加载失败',
        showCancel: false,
        success: () => {
          wx.redirectTo({
            url: '/pages/caishen/launch/launch',
            fail: () => wx.navigateBack()
          });
        }
      });
    }
  },

  onShow() {
    const app = getApp();
    const paymentStatus = wx.getStorageSync('paymentStatus') || 'free';
    const hasEverPaid = wx.getStorageSync('hasEverPaid') || false;
    
    this.setData({
      isElderMode: app.globalData.isElderMode,
      paymentStatus: paymentStatus,
      hasEverPaid: hasEverPaid
    });
  },

  onVideoLoad() {
    console.log('[CaishenResult] 视频加载完成');
    this.setData({ videoLoaded: true });
  },

  onVideoError(e) {
    console.error('[CaishenResult] 视频加载失败:', e.detail);
    
    // 检查是否是 Mock 数据（图片URL）
    const { videoUrl } = this.data;
    if (videoUrl && (videoUrl.endsWith('.jpg') || videoUrl.endsWith('.png') || videoUrl.endsWith('.jpeg'))) {
      wx.showModal({
        title: '开发模式提示',
        content: '当前为 Mock 模式，返回的是图片而非视频。生产环境将返回真实视频。\n\n图片URL: ' + videoUrl,
        showCancel: false,
        confirmText: '知道了'
      });
    } else {
      wx.showToast({
        title: '视频加载失败',
        icon: 'none'
      });
    }
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
      // 1. 先检查授权状态
      const settingRes = await new Promise((resolve) => {
        wx.getSetting({
          success: resolve,
          fail: () => resolve({ authSetting: {} })
        });
      });
      
      // 2. 如果未授权，先请求授权
      if (!settingRes.authSetting['scope.writePhotosAlbum']) {
        try {
          await new Promise((resolve, reject) => {
            wx.authorize({
              scope: 'scope.writePhotosAlbum',
              success: resolve,
              fail: reject
            });
          });
        } catch (authErr) {
          // 用户拒绝授权，引导去设置
          wx.showModal({
            title: '需要相册权限',
            content: '保存视频需要您授权访问相册',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting();
              }
            }
          });
          this.setData({ isSaving: false });
          return;
        }
      }
      
      wx.showLoading({ title: '保存中...', mask: true });
      
      console.log('[CaishenResult] 开始下载视频:', videoUrl);
      
      // 3. 下载视频到本地
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
      
      // 4. 保存到相册
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
    console.log('[CaishenResult] 点击分享按钮');
    // 显示分享提示
    wx.showModal({
      title: '分享财神视频',
      content: '点击右上角"..."按钮，选择"转发"或"分享到朋友圈"，让更多朋友看到你的财神变身视频！',
      showCancel: false,
      confirmText: '知道了'
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
    const { recordId, videoUrl } = this.data;
    console.log('[CaishenResult] 分享到好友, recordId:', recordId);
    
    if (!recordId) {
      console.warn('[CaishenResult] 警告：缺少 recordId，分享功能可能无法正常工作');
    }
    
    // 构建分享路径，使用 shareId 参数
    const sharePath = recordId 
      ? `/pages/caishen/result/result?shareId=${recordId}&from=share`
      : '/pages/caishen/launch/launch';
    
    // 尝试生成视频封面作为分享图
    let shareImageUrl = '';
    if (videoUrl) {
      // 如果有视频URL，尝试使用视频的第一帧作为封面
      // 注意：微信小程序不支持直接从视频生成封面，需要后端支持
      // 这里先使用默认图，后续可以优化为后端生成封面
      shareImageUrl = '';
    }
    
    return {
      title: '我的财神变身视频，财运亨通！🧧💰',
      path: sharePath,
      imageUrl: shareImageUrl || '' // 空字符串会使用默认截图
    };
  },

  onShareTimeline() {
    const { recordId } = this.data;
    console.log('[CaishenResult] 分享到朋友圈, recordId:', recordId);
    
    return {
      title: '财神变身 - AI生成财神发钱视频，财运滚滚来！',
      query: recordId ? `shareId=${recordId}&from=share` : '',
      imageUrl: '' // 空字符串会使用默认截图
    };
  }
});
