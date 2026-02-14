/**
 * 财神变身模式结果页
 * 
 * 功能：
 * - 显示生成的财神视频
 * - 视频播放控制
 * - 保存视频功能
 * - 分享功能
 * - 背景音乐播放
 */

const { initNavigation } = require('../../../utils/navigation-helper');
const { getAssetUrl } = require('../../../utils/oss-assets');
const { getInstance: getMusicManager } = require('../../../utils/backgroundMusicManager');
const musicConfig = require('../../../config/music');

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
    originalImageUrl: '', // 用户上传的原始图片，用于分享封面
    // 使用通用背景
    commonBgUrl: getAssetUrl('common-bg.jpg'),
    // 背景音乐相关
    isMusicMuted: false,
    musicManager: null
  },

  async onLoad(options) {
    const app = getApp();
    const paymentStatus = wx.getStorageSync('paymentStatus') || 'free';
    const hasEverPaid = wx.getStorageSync('hasEverPaid') || false;
    
    initNavigation(this);
    
    // 检查是否从分享进入
    const isFromShare = options.from === 'share';
    const shareId = options.shareId || options.recordId;
    
    // 获取用户上传的原始图片 - 三级fallback机制
    let originalImageUrl = '';
    
    // 1. 优先从URL参数读取（从历史记录进入）
    if (options.originalImage) {
      originalImageUrl = decodeURIComponent(options.originalImage);
      console.log('[CaishenResult] 从URL参数获取原始图片:', originalImageUrl);
    }
    // 2. 其次从 globalData 获取（正常生成流程）
    else if (app.globalData.caishenData?.uploadedImage) {
      originalImageUrl = app.globalData.caishenData.uploadedImage;
      console.log('[CaishenResult] 从 globalData 获取原始图片:', originalImageUrl);
    }
    
    this.setData({
      isElderMode: app.globalData.isElderMode,
      paymentStatus: paymentStatus,
      hasEverPaid: hasEverPaid,
      taskId: options.taskId || '',
      recordId: options.recordId || '',
      isSharedView: isFromShare,
      originalImageUrl: originalImageUrl // 保存原始图片用于分享
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
    
    // 初始化背景音乐
    this.initBackgroundMusic();
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
        
        // 获取用户上传的原始图片作为分享封面
        let originalImageUrl = '';
        if (result.originalImageUrls && result.originalImageUrls.length > 0) {
          originalImageUrl = result.originalImageUrls[0];
        }
        
        console.log('[CaishenResult] 从分享加载视频成功:', videoUrl);
        console.log('[CaishenResult] 原始图片URL:', originalImageUrl);
        
        this.setData({ 
          videoUrl,
          videoLoaded: true, // 标记视频已加载，显示视频组件
          recordId: shareId,
          taskId: result.taskIds?.[0] || '',
          originalImageUrl: originalImageUrl // 保存原始图片用于分享
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
      wx.showLoading({ title: '下载中...', mask: true });
      
      console.log('[CaishenResult] 开始下载视频:', videoUrl);
      
      // 1. 先下载视频到本地（不需要权限）
      const downloadRes = await new Promise((resolve, reject) => {
        wx.downloadFile({
          url: videoUrl,
          success: resolve,
          fail: reject
        });
      });
      
      console.log('[CaishenResult] 下载结果:', downloadRes);
      console.log('[CaishenResult] 临时文件路径:', downloadRes.tempFilePath);
      
      if (downloadRes.statusCode !== 200) {
        throw new Error('下载视频失败');
      }
      
      wx.hideLoading();
      
      // 2. 下载成功后，检查相册权限
      const settingRes = await new Promise((resolve) => {
        wx.getSetting({
          success: resolve,
          fail: () => resolve({ authSetting: {} })
        });
      });
      
      // 3. 如果未授权，请求授权
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
            content: '保存视频到相册需要您的授权',
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
      console.error('[CaishenResult] 错误详情:', {
        errMsg: err.errMsg,
        errCode: err.errCode,
        message: err.message
      });
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
      } else if (err.errMsg && err.errMsg.includes('file not exist')) {
        wx.showModal({
          title: '保存失败',
          content: '临时文件不存在，请重新生成视频后再试',
          showCancel: false
        });
      } else {
        const errorMsg = err.errMsg || err.message || '未知错误';
        wx.showModal({
          title: '保存失败',
          content: `错误：${errorMsg}\n\n如持续失败，请联系客服`,
          showCancel: false
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
    const { recordId, originalImageUrl } = this.data;
    console.log('[CaishenResult] 分享到好友, recordId:', recordId, 'originalImageUrl:', originalImageUrl);
    
    if (!recordId) {
      console.warn('[CaishenResult] 警告：缺少 recordId，分享功能可能无法正常工作');
    }
    
    // 构建分享路径，使用 shareId 参数
    const sharePath = recordId 
      ? `/pages/caishen/result/result?shareId=${recordId}&from=share`
      : '/pages/caishen/launch/launch';
    
    // 使用用户上传的原始图片作为分享封面
    // 如果没有原始图片，则留空让微信自动截取页面
    const shareImageUrl = originalImageUrl || '';
    
    return {
      title: '我的财神变身视频，财运亨通！🧧💰',
      path: sharePath,
      imageUrl: shareImageUrl
    };
  },

  onShareTimeline() {
    const { recordId, originalImageUrl } = this.data;
    console.log('[CaishenResult] 分享到朋友圈, recordId:', recordId, 'originalImageUrl:', originalImageUrl);
    
    return {
      title: '财神变身 - AI生成财神发钱视频，财运滚滚来！',
      query: recordId ? `shareId=${recordId}&from=share` : '',
      imageUrl: originalImageUrl || '' // 使用原始图片或页面截图
    };
  },

  /**
   * 初始化背景音乐
   */
  initBackgroundMusic() {
    try {
      const musicManager = getMusicManager();
      const musicData = musicConfig.caishen[0];
      const defaultConfig = musicConfig.defaultConfig;
      
      if (!musicData || !musicData.url) {
        console.warn('[CaishenResult] 音乐配置不存在');
        return;
      }
      
      // 初始化音乐管理器
      musicManager.init(musicData.url, {
        volume: defaultConfig.volume,
        loop: defaultConfig.loop,
        autoplay: false
      });
      
      // 获取静音状态
      const isMuted = musicManager.getMuted();
      
      this.setData({
        musicManager: musicManager,
        isMusicMuted: isMuted
      });
      
      console.log('[CaishenResult] 背景音乐初始化成功');
      
    } catch (error) {
      console.error('[CaishenResult] 背景音乐初始化失败:', error);
      // 静默失败，不影响视频播放
    }
  },

  /**
   * 视频开始播放
   */
  onVideoPlay() {
    console.log('[CaishenResult] 视频开始播放');
    const { musicManager } = this.data;
    if (musicManager) {
      musicManager.play();
    }
  },

  /**
   * 视频暂停
   */
  onVideoPause() {
    console.log('[CaishenResult] 视频暂停');
    const { musicManager } = this.data;
    if (musicManager) {
      musicManager.pause();
    }
  },

  /**
   * 视频播放结束
   */
  onVideoEnded() {
    console.log('[CaishenResult] 视频播放结束');
    const { musicManager } = this.data;
    if (musicManager) {
      musicManager.stop();
    }
  },

  /**
   * 切换音乐静音状态
   */
  toggleMusicMute() {
    const { musicManager } = this.data;
    if (!musicManager) {
      return;
    }
    
    const isMuted = musicManager.toggleMute();
    this.setData({ isMusicMuted: isMuted });
    
    console.log('[CaishenResult] 音乐静音状态:', isMuted);
  },

  /**
   * 页面卸载
   */
  onUnload() {
    const { musicManager } = this.data;
    if (musicManager) {
      musicManager.destroy();
    }
  }
});
