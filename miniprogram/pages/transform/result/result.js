/**
 * 富贵变身模式结果页
 * Requirements: 2.3, 8.1-8.4
 * 
 * 功能：
 * - 复用 puzzle/result 页面逻辑
 * - 实现保存图片、生成贺卡、定制产品、分享功能
 * - Live Photo 微动态功能（尊享包用户）
 * - 付费下载功能
 */

const { getShareAppMessage, getShareTimeline, savePosterToAlbum } = require('../../../utils/share');
const { saveHistory } = require('../../../utils/storage');
const { videoAPI } = require('../../../utils/api');
const cloudbasePayment = require('../../../utils/cloudbase-payment');
const { initNavigation } = require('../../../utils/navigation-helper');
const { getAssetUrl } = require('../../../utils/oss-assets');
const saveImageHelper = require('../../../utils/saveImageHelper');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    selectedImage: '',
    imageLoaded: false,
    showShareModal: false,
    showProductModal: false,
    showPaymentModal: false,
    isSaving: false,
    hasSavedFreeVersion: false, // 是否已保存过免费版本
    savedStateKey: '', // 用于存储状态的key
    isSharedView: false, // 是否是分享视图
    serverWatermarkApplied: false, // 服务端是否已应用水印（从API响应中获取）
    // Live Photo 相关
    hasLivePhoto: false,
    isPlayingLivePhoto: false,
    livePhotoUrl: '',
    videoTaskId: '',
    isGeneratingVideo: false,
    videoProgress: 0,
    videoProgressText: '',
    isPremiumUser: false,
    // 付费状态
    paymentStatus: 'free',
    hasEverPaid: false, // 是否曾经付费
    generationId: '',
    // 使用次数模态框
    showUsageModal: false,
    usageModalType: '',
    usageCount: 0,
    pictureFrameUrl: getAssetUrl('picture-frame.png'),
    downloadBtnBg: getAssetUrl('download-btn.png'),
    shareBtnBg: getAssetUrl('share-btn.png'),
  },

  // 视频轮询定时器
  videoPollingTimer: null,
  // 标记是否是首次显示
  isFirstShow: true,

  onLoad(options) {
    const app = getApp();
    const paymentStatus = wx.getStorageSync('paymentStatus') || 'free';
    const hasEverPaid = wx.getStorageSync('hasEverPaid') || false;
    const generationId = options.generationId || Date.now().toString();
    
    // 使用工具函数恢复保存状态
    const hasSavedFreeVersion = saveImageHelper.getSaveState(generationId);
    
    initNavigation(this);
    
    this.setData({
      isElderMode: app.globalData.isElderMode,
      isPremiumUser: paymentStatus === 'premium' || paymentStatus === 'basic',
      paymentStatus: paymentStatus,
      hasEverPaid: hasEverPaid,
      hasLivePhoto: options.hasLivePhoto === 'true',
      generationId: generationId,
      hasSavedFreeVersion: hasSavedFreeVersion,
      savedStateKey: saveImageHelper.getSaveStateKey(generationId)
    });
    
    // 检查是否从分享进入
    if (options.shareId && options.from === 'share') {
      console.log('[TransformResult] 从分享进入，shareId:', options.shareId);
      // 分享视图不显示保存按钮状态
      this.setData({ 
        isSharedView: true,
        hasSavedFreeVersion: false // 重置状态，避免污染
      });
      this.loadSharedResult(options.shareId);
      return;
    }
    
    // 获取图片URL
    let imageUrl = '';
    if (options.image) {
      imageUrl = decodeURIComponent(options.image);
    } else {
      // 从全局数据获取
      const transformData = app.globalData.transformData || {};
      if (transformData.generatedImages && transformData.generatedImages.length > 0) {
        imageUrl = transformData.generatedImages[0];
      }
    }
    
    if (!imageUrl) {
      wx.showToast({
        title: '没有找到图片',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    console.log('[TransformResult] 加载图片:', imageUrl);
    this.setData({ selectedImage: imageUrl });
    
    // 如果有 Live Photo，自动播放5秒
    if (options.livePhotoUrl) {
      this.setData({ 
        livePhotoUrl: decodeURIComponent(options.livePhotoUrl),
        hasLivePhoto: true 
      });
      this.autoPlayLivePhoto();
    }
    
    // 在 onLoad 中立即加载使用次数（确保获取最新值）
    this.loadUsageCount();
  },

  async onShow() {
    const app = getApp();
    const paymentStatus = wx.getStorageSync('paymentStatus') || 'free';
    const hasEverPaid = wx.getStorageSync('hasEverPaid') || false;
    
    console.log('[TransformResult] onShow 触发');
    
    // 使用工具函数恢复保存状态
    const generationId = this.data.generationId;
    const hasSavedFreeVersion = generationId ? saveImageHelper.getSaveState(generationId) : false;
    
    this.setData({
      isElderMode: app.globalData.isElderMode,
      isPremiumUser: paymentStatus === 'premium' || paymentStatus === 'basic',
      paymentStatus: paymentStatus,
      hasEverPaid: hasEverPaid,
      hasSavedFreeVersion: hasEverPaid ? false : hasSavedFreeVersion // 已付费用户重置状态
    });
    
    // 只在非首次显示时刷新使用次数（首次显示已在onLoad中加载）
    let usageData = null;
    if (!this.isFirstShow) {
      console.log('[TransformResult] 从其他页面返回，刷新使用次数');
      usageData = await this.loadUsageCount();
      console.log('[TransformResult] onShow - 使用次数已刷新:', {
        usageCount: this.data.usageCount,
        paymentStatus: this.data.paymentStatus
      });
      // 检查并显示使用次数提醒模态框（使用已加载的数据）
      this.checkUsageModal(usageData);
    } else {
      this.isFirstShow = false;
      console.log('[TransformResult] 首次显示，跳过刷新（已在onLoad中加载）');
    }
  },

  /**
   * 加载使用次数
   */
  async loadUsageCount() {
    try {
      const app = getApp();
      const result = await app.updateUsageCount();
      
      if (result) {
        // 直接从 usage check 接口获取 has_ever_paid（后端已返回）
        const hasEverPaid = result.has_ever_paid || false;
        
        // 如果返回的是默认值 3，说明 API 调用失败
        // 此时应该使用全局状态中的值，而不是默认值
        let usageCount = result.usageCount;
        
        // 如果返回的是默认值 3 且全局状态中有不同的值，使用全局值
        if (result.usageCount === 3 && app.globalData.usageCount !== 3) {
          usageCount = app.globalData.usageCount;
          console.log('[TransformResult] API 返回默认值，使用全局状态:', usageCount);
        }
        
        this.setData({
          usageCount: usageCount,
          userType: result.userType,
          paymentStatus: result.paymentStatus || 'free',
          hasEverPaid: hasEverPaid
        });
        
        console.log('[TransformResult] 使用次数已加载:', {
          usageCount: usageCount,
          userType: result.userType,
          paymentStatus: result.paymentStatus,
          hasEverPaid: hasEverPaid
        });
        
        return {
          ...result,
          usageCount: usageCount,
          hasEverPaid: hasEverPaid
        };
      }
    } catch (err) {
      console.error('[TransformResult] 加载使用次数失败:', err);
      // 失败时使用全局状态和缓存中的值
      const app = getApp();
      this.setData({
        usageCount: app.globalData.usageCount,
        userType: app.globalData.userType,
        paymentStatus: wx.getStorageSync('paymentStatus') || 'free',
        hasEverPaid: wx.getStorageSync('hasEverPaid') || false
      });
    }
    
    return null;
  },

  /**
   * 加载分享的作品
   * @param {string} shareId - 分享的生成记录ID
   */
  async loadSharedResult(shareId) {
    try {
      wx.showLoading({ title: '加载中...', mask: true });
      
      // 调用后端API获取分享的作品
      const cloudbaseRequest = require('../../../utils/cloudbase-request');
      
      // 从历史记录中获取
      const historyRes = await cloudbaseRequest.get(`/api/history/${shareId}`);
      
      wx.hideLoading();
      
      if (historyRes && historyRes.success && historyRes.data) {
        const result = historyRes.data;
        
        // 优先使用 selectedImageUrl，如果没有则使用 generatedImageUrls 的第一张
        let imageUrl = result.selectedImageUrl;
        if (!imageUrl && result.generatedImageUrls && result.generatedImageUrls.length > 0) {
          imageUrl = result.generatedImageUrls[0];
        }
        
        if (!imageUrl) {
          throw new Error('未找到图片');
        }
        
        this.setData({
          selectedImage: imageUrl,
          generationId: shareId,
          isSharedView: true // 标记为分享视图
        });
        console.log('[TransformResult] 分享作品加载成功');
      } else {
        throw new Error('未找到分享的作品');
      }
    } catch (err) {
      console.error('[TransformResult] 加载分享作品失败:', err);
      wx.hideLoading();
      wx.showModal({
        title: '提示',
        content: '分享内容已失效或不存在',
        showCancel: false,
        success: () => {
          wx.redirectTo({ url: '/pages/transform/launch/launch' });
        }
      });
    }
  },

  onUnload() {
    // 清理定时器
    if (this.videoPollingTimer) {
      clearInterval(this.videoPollingTimer);
      this.videoPollingTimer = null;
    }
    
    // 使用工具函数清理过期的保存状态
    saveImageHelper.cleanupExpiredSaveStates();
  },

  /**
   * 使用次数更新回调（由app.js调用）
   */
  onUsageCountUpdate(data) {
    console.log('[TransformResult] 使用次数已更新:', data);
    this.setData({
      usageCount: data.usageCount,
      userType: data.userType,
      paymentStatus: data.paymentStatus || 'free'
    });
  },

  /**
   * 检查并显示使用次数提醒模态框
   * @param {Object} usageData - 已加载的使用次数数据
   */
  checkUsageModal(usageData) {
    if (!usageData) {
      console.log('[TransformResult] 使用次数数据为空，跳过模态框检查');
      return;
    }
    
    const { usageCount, userType, paymentStatus } = usageData;
    const usageModal = require('../../../utils/usageModal');
    
    // 使用本地数据检查是否需要显示模态框，不再调用API
    const modalCheck = usageModal.checkModalOnPageLoad(usageCount, userType, 'result', paymentStatus || 'free');
    
    console.log('[TransformResult] 模态框检查结果:', {
      show: modalCheck.show,
      modalType: modalCheck.modalType,
      usageCount: usageCount
    });
    
    if (modalCheck.show) {
      this.setData({
        showUsageModal: true,
        usageModalType: modalCheck.modalType,
        usageCount: usageCount
      });
    }
  },

  /**
   * 关闭使用次数模态框
   */
  onUsageModalClose() {
    this.setData({ showUsageModal: false });
  },

  /**
   * 使用次数模态框 - 分享按钮
   */
  onModalShare() {
    this.setData({ showUsageModal: false });
    // 跳转到邀请页面
    wx.navigateTo({
      url: '/pages/invite/invite'
    });
  },

  /**
   * 使用次数模态框 - 购买按钮
   */
  onModalPayment() {
    this.setData({ 
      showUsageModal: false,
      showPaymentModal: true 
    });
  },

  /**
   * 图片加载完成
   */
  onImageLoad() {
    this.setData({ imageLoaded: true });
  },

  /**
   * 自动播放 Live Photo（5秒）
   */
  autoPlayLivePhoto() {
    if (!this.data.hasLivePhoto || !this.data.livePhotoUrl) return;
    
    setTimeout(() => {
      this.setData({ isPlayingLivePhoto: true });
      
      // 5秒后停止播放
      setTimeout(() => {
        this.setData({ isPlayingLivePhoto: false });
      }, 5000);
    }, 500);
  },

  /**
   * 点击播放/暂停 Live Photo
   */
  toggleLivePhoto() {
    if (!this.data.hasLivePhoto || !this.data.livePhotoUrl) return;
    
    this.setData({ 
      isPlayingLivePhoto: !this.data.isPlayingLivePhoto 
    });
    
    // 震动反馈
    wx.vibrateShort({ type: 'light' });
  },

  /**
   * 生成微动态视频
   * 仅尊享包用户可用
   */
  async handleGenerateLivePhoto() {
    const { selectedImage, isGeneratingVideo, isPremiumUser } = this.data;
    
    if (isGeneratingVideo) return;
    
    // 检查用户权限
    if (!isPremiumUser) {
      wx.showModal({
        title: '尊享功能',
        content: '微动态功能仅对尊享包用户开放，是否升级套餐？',
        confirmText: '立即升级',
        cancelText: '暂不需要',
        success: (res) => {
          if (res.confirm) {
            // 显示支付弹窗
            this.triggerEvent('showPayment');
          }
        }
      });
      return;
    }
    
    // 获取 userId
    const app = getApp();
    const userId = await app.getUserId(true);
    
    if (!userId) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      isGeneratingVideo: true,
      videoProgress: 0,
      videoProgressText: '创建任务中...'
    });
    
    try {
      console.log('[LivePhoto] 开始生成微动态');
      
      // 调用生成视频API
      const result = await videoAPI.generateVideo({
        imageUrl: selectedImage,
        userId: userId,
        motionBucketId: 10,
        fps: 10,
        videoLength: 5,
        dynamicType: 'festival'
      });
      
      if (!result.success || !result.data?.taskId) {
        throw new Error(result.message || '创建任务失败');
      }
      
      const taskId = result.data.taskId;
      console.log('[LivePhoto] 任务创建成功:', taskId);
      
      this.setData({
        videoTaskId: taskId,
        videoProgressText: '生成中...'
      });
      
      // 开始轮询任务状态
      this.startVideoPolling(taskId);
      
    } catch (err) {
      console.error('[LivePhoto] 生成失败:', err);
      this.setData({
        isGeneratingVideo: false,
        videoProgress: 0,
        videoProgressText: ''
      });
      
      wx.showToast({
        title: err.message || '生成失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 轮询视频生成任务状态
   */
  startVideoPolling(taskId) {
    // 清除之前的定时器
    if (this.videoPollingTimer) {
      clearInterval(this.videoPollingTimer);
    }
    
    let pollCount = 0;
    const maxPolls = 60; // 最多轮询60次（2分钟）
    
    this.videoPollingTimer = setInterval(async () => {
      pollCount++;
      
      if (pollCount > maxPolls) {
        clearInterval(this.videoPollingTimer);
        this.videoPollingTimer = null;
        this.setData({
          isGeneratingVideo: false,
          videoProgressText: ''
        });
        wx.showToast({
          title: '生成超时，请重试',
          icon: 'none'
        });
        return;
      }
      
      try {
        const result = await videoAPI.getVideoTaskStatus(taskId);
        
        if (!result.success) {
          console.log('[LivePhoto] 查询状态失败，继续轮询');
          return;
        }
        
        const taskData = result.data?.Result?.data || {};
        const status = taskData.status;
        
        // 更新进度
        if (status === 'running') {
          const progress = Math.min(90, pollCount * 3);
          this.setData({
            videoProgress: progress,
            videoProgressText: `生成中 ${progress}%`
          });
        }
        
        // 任务完成
        if (status === 'done' && taskData.video_url) {
          clearInterval(this.videoPollingTimer);
          this.videoPollingTimer = null;
          
          console.log('[LivePhoto] 视频生成完成:', taskData.video_url);
          
          this.setData({
            videoProgress: 100,
            videoProgressText: '转换中...'
          });
          
          // 转换为 Live Photo 格式
          await this.convertToLivePhoto(taskData.video_url);
        }
        
        // 任务失败
        if (status === 'failed') {
          clearInterval(this.videoPollingTimer);
          this.videoPollingTimer = null;
          
          this.setData({
            isGeneratingVideo: false,
            videoProgress: 0,
            videoProgressText: ''
          });
          
          wx.showToast({
            title: '生成失败，请重试',
            icon: 'none'
          });
        }
        
      } catch (err) {
        console.error('[LivePhoto] 轮询出错:', err);
      }
    }, 2000);
  },

  /**
   * 转换视频为 Live Photo 格式
   */
  async convertToLivePhoto(videoUrl) {
    const app = getApp();
    const userId = await app.getUserId(true);
    
    if (!userId) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    
    try {
      const result = await videoAPI.convertToLivePhoto(videoUrl, userId);
      
      if (!result.success || !result.data?.livePhotoUrl) {
        throw new Error(result.message || '转换失败');
      }
      
      console.log('[LivePhoto] 转换成功:', result.data.livePhotoUrl);
      
      this.setData({
        isGeneratingVideo: false,
        hasLivePhoto: true,
        livePhotoUrl: result.data.livePhotoUrl,
        videoProgress: 0,
        videoProgressText: ''
      });
      
      wx.showToast({
        title: '微动态生成成功',
        icon: 'success'
      });
      
      // 自动播放
      this.autoPlayLivePhoto();
      
    } catch (err) {
      console.error('[LivePhoto] 转换失败:', err);
      this.setData({
        isGeneratingVideo: false,
        videoProgress: 0,
        videoProgressText: ''
      });
      
      wx.showToast({
        title: err.message || '转换失败',
        icon: 'none'
      });
    }
  },

  /**
   * 保存图片到相册
   * Requirements: 8.1
   * 免费用户（从未付费）首次保存免费版本，再次点击弹出套餐选择
   */
  async handleSaveImage() {
    const result = saveImageHelper.handleSaveImageLogic(this.data, 'TransformResult');
    
    if (result.shouldShowPayment) {
      this.setData({ showPaymentModal: true });
      return;
    }
    
    if (result.shouldSave) {
      await this.doSaveImage();
    }
  },

  /**
   * 显示升级弹窗（已付费用户可升级到更高套餐）
   */
  showUpgradeModal() {
    const { paymentStatus } = this.data;
    // 只有非尊享用户可以升级
    if (paymentStatus !== 'premium') {
      this.setData({ showPaymentModal: true });
    }
  },

  /**
   * 执行保存图片
   * 服务端应该根据用户付费状态返回对应版本（免费=带水印，付费=无水印）
   * 前端作为降级方案：如果检测到免费用户但图片无水印，则前端静默添加
   */
  async doSaveImage() {
    const { selectedImage, hasEverPaid } = this.data;
    
    this.setData({ isSaving: true });
    
    try {
      wx.showLoading({ title: '保存中...', mask: true });
      
      console.log('[TransformResult] 开始下载图片:', selectedImage);
      
      // 下载图片到本地
      const downloadRes = await new Promise((resolve, reject) => {
        wx.downloadFile({
          url: selectedImage,
          success: resolve,
          fail: reject
        });
      });
      
      console.log('[TransformResult] 下载结果:', downloadRes);
      
      if (downloadRes.statusCode !== 200) {
        throw new Error('下载图片失败');
      }
      
      // 处理临时文件路径
      let tempFilePath = downloadRes.tempFilePath;
      if (tempFilePath.startsWith('http://tmp/')) {
        tempFilePath = tempFilePath.replace('http://', '');
      } else if (tempFilePath.startsWith('http://usr/')) {
        tempFilePath = tempFilePath.replace('http://', '');
      }
      
      let finalImagePath = tempFilePath;
      
      // 前端降级方案：免费用户且服务端水印失败时，前端静默添加水印
      if (!hasEverPaid) {
        try {
          // 检测图片是否已有水印（通过URL参数或其他标识）
          const hasWatermarkFlag = selectedImage.includes('watermark=true') || 
                                   selectedImage.includes('_wm.') ||
                                   this.data.serverWatermarkApplied;
          
          if (!hasWatermarkFlag) {
            console.log('[TransformResult] 检测到服务端水印可能失败，启用前端降级方案');
            const { addWatermark } = require('../../../utils/watermark');
            finalImagePath = await addWatermark(tempFilePath, '团圆照相馆');
            console.log('[TransformResult] 前端水印添加成功（降级方案）');
          } else {
            console.log('[TransformResult] 服务端水印已应用，跳过前端处理');
          }
        } catch (watermarkErr) {
          console.error('[TransformResult] 前端水印添加失败，使用原图:', watermarkErr);
          // 降级方案失败也不影响保存，继续使用原图
        }
      }
      
      // 保存到相册
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: finalImagePath,
          success: () => {
            wx.hideLoading();
            wx.showToast({
              title: '保存成功',
              icon: 'success'
            });
            
            // 使用工具函数处理保存成功后的逻辑
            const needUpdate = saveImageHelper.handleSaveSuccess(
              this.data.hasEverPaid, 
              this.data.hasSavedFreeVersion, 
              this.data.generationId
            );
            
            if (needUpdate) {
              this.setData({ hasSavedFreeVersion: true });
            }
            
            resolve();
          },
          fail: reject
        });
      });
      
    } catch (err) {
      console.error('[TransformResult] 保存失败:', err);
      wx.hideLoading();
      
      if (err.errMsg && err.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '提示',
          content: '需要您授权保存图片到相册',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting();
            }
          }
        });
      } else if (err.errMsg && err.errMsg.includes('domain list')) {
        // 域名白名单错误
        wx.showModal({
          title: '配置提示',
          content: '图片域名未配置，请在小程序后台添加downloadFile合法域名，或在开发工具中关闭域名校验。\n\n开发工具：详情 > 本地设置 > 不校验合法域名',
          showCancel: false,
          confirmText: '我知道了'
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

  /**
   * 支付完成回调
   */
  onPaymentComplete(e) {
    const { packageType } = e.detail;
    console.log('[TransformResult] 支付完成:', packageType);
    
    // 更新付费状态
    const newPaymentStatus = packageType;
    wx.setStorageSync('paymentStatus', newPaymentStatus);
    wx.setStorageSync('hasEverPaid', true);
    
    // 使用工具函数清除免费版本保存状态
    const generationId = this.data.generationId;
    if (generationId) {
      saveImageHelper.clearSaveState(generationId);
      console.log('[TransformResult] 已清除免费版本保存状态');
    }
    
    this.setData({
      showPaymentModal: false,
      paymentStatus: newPaymentStatus,
      isPremiumUser: newPaymentStatus === 'premium' || newPaymentStatus === 'basic',
      hasEverPaid: true,
      hasSavedFreeVersion: false // 重置状态
    });
    
    // 支付/选择完成后自动保存高清图片
    setTimeout(() => {
      this.doSaveImage();
    }, 500);
  },

  /**
   * 关闭支付弹窗
   */
  closePaymentModal() {
    this.setData({ showPaymentModal: false });
  },

  /**
   * 保存 Live Photo 视频到相册
   */
  async handleSaveLivePhoto() {
    const { livePhotoUrl, isSaving } = this.data;
    if (!livePhotoUrl || isSaving) return;
    
    this.setData({ isSaving: true });
    
    try {
      wx.showLoading({ title: '保存中...', mask: true });
      
      const downloadRes = await new Promise((resolve, reject) => {
        wx.downloadFile({
          url: livePhotoUrl,
          success: resolve,
          fail: reject
        });
      });
      
      if (downloadRes.statusCode !== 200) {
        throw new Error('下载视频失败');
      }
      
      // 保存视频到相册
      await new Promise((resolve, reject) => {
        wx.saveVideoToPhotosAlbum({
          filePath: downloadRes.tempFilePath,
          success: resolve,
          fail: reject
        });
      });
      
      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });
      
    } catch (err) {
      console.error('[TransformResult] 保存Live Photo失败:', err);
      wx.hideLoading();
      
      if (err.errMsg && err.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '提示',
          content: '需要您授权保存视频到相册',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting();
            }
          }
        });
      } else {
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none'
        });
      }
    } finally {
      this.setData({ isSaving: false });
    }
  },

  /**
   * 生成拜年贺卡
   */
  handleGenerateCard() {
    const { selectedImage } = this.data;
    wx.navigateTo({
      url: `/pages/card-editor/card-editor?image=${encodeURIComponent(selectedImage)}`,
      fail: (err) => {
        console.error('[TransformResult] 跳转贺卡编辑失败:', err);
        wx.showToast({
          title: '功能开发中',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 定制产品
   */
  handleOrderProduct() {
    this.setData({ showProductModal: true });
  },

  /**
   * 关闭产品弹窗
   */
  closeProductModal() {
    this.setData({ showProductModal: false });
  },

  /**
   * 显示分享弹窗
   */
  handleShare() {
    this.setData({ showShareModal: true });
  },

  /**
   * 关闭分享弹窗
   */
  closeShareModal() {
    this.setData({ showShareModal: false });
  },

  /**
   * 返回上一页
   */
  goBack() {
    // 手动触发 Launch 页面刷新使用次数
    const pages = getCurrentPages();
    if (pages.length >= 2) {
      const prevPage = pages[pages.length - 2];
      // 检查上一个页面是否是 Launch 页面
      if (prevPage && prevPage.route && prevPage.route.includes('launch')) {
        console.log('[TransformResult] 触发 Launch 页面刷新');
        // 延迟执行，确保页面切换完成后再刷新
        setTimeout(() => {
          if (typeof prevPage.loadUsageCount === 'function') {
            prevPage.loadUsageCount();
          }
        }, 300);
      }
    }
    
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/transform/launch/launch'
        });
      }
    });
  },

  /**
   * 返回首页
   */
  goHome() {
    wx.redirectTo({
      url: '/pages/transform/launch/launch'
    });
  },

  /**
   * 制作同款（分享视图专用）
   * 引导新用户开始使用产品
   */
  handleMakeSame() {
    console.log('[TransformResult] 点击制作同款');
    
    // 跳转到富贵变身的启动页
    wx.redirectTo({
      url: '/pages/transform/launch/launch',
      fail: () => {
        // 如果失败，跳转到主启动页
        wx.redirectTo({
          url: '/pages/launch/launch'
        });
      }
    });
  },

  /**
   * 分享给好友
   * 添加 shareId 参数，让被分享者能看到分享者的作品
   */
  onShareAppMessage() {
    const { generationId, selectedImage } = this.data;
    return getShareAppMessage({
      title: '看看我的富贵变身效果！🎊',
      imageUrl: selectedImage,
      path: `/pages/transform/result/result?shareId=${generationId}&from=share`
    });
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return getShareTimeline({
      title: '富贵变身 - 一秒变豪门！',
      imageUrl: this.data.selectedImage
    });
  }
});
