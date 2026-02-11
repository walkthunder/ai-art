/**
 * 财神变身模式上传页 - 单张照片上传
 * 
 * 功能：
 * - 单张照片上传
 * - 人脸检测验证
 * - 直接生成（无需模板选择）
 */

const { chooseImage, uploadImage, validateImage } = require('../../../utils/upload');
const pageMixin = require('../../../utils/page-mixin');
const { initNavigation } = require('../../../utils/navigation-helper');
const { getAssetUrl } = require('../../../utils/oss-assets');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    selectedImage: null,
    isProcessing: false,
    isChecking: false,
    statusText: '',
    errorMessage: '',
    uploadProgress: 0,
    // OSS 资源
    commonBgUrl: getAssetUrl('bg/caishen-upload-bg.jpg'),
    cameraUploadUrl: getAssetUrl('caishen-upload.png'),
    // 支付弹窗
    showPaymentModal: false,
    currentPaymentStatus: 'free'
  },

  onLoad() {
    const app = getApp();
    initNavigation(this);
    pageMixin.onLoad.call(this);
  },

  onShow() {
    pageMixin.onShow.call(this);
  },

  onElderModeChange(isElderMode) {
    pageMixin.onElderModeChange.call(this, isElderMode);
  },

  async handleUploadClick() {
    if (this.data.isProcessing || this.data.isChecking) {
      console.log('[CaishenUpload] 操作进行中，请勿重复点击');
      return;
    }
    
    this.setData({ errorMessage: '' });
    const app = getApp();
    
    try {
      // 检查使用次数（仅在第一次上传时检查）
      if (!this.data.selectedImage) {
        this.setData({ isChecking: true });
        
        console.log('[CaishenUpload] 检查登录状态...');
        const userId = await app.getUserId(true);
        
        if (!userId) {
          console.error('[CaishenUpload] 登录失败');
          this.setData({
            errorMessage: '登录失败，请重试',
            isChecking: false
          });
          return;
        }
        
        console.log('[CaishenUpload] 检查使用次数...');
        const usageInfo = await app.updateUsageCount();
        
        if (usageInfo.usageCount === 0) {
          console.log('[CaishenUpload] 次数为0，显示套餐选择');
          this.setData({
            showPaymentModal: true,
            currentPaymentStatus: usageInfo.paymentStatus || 'free',
            isChecking: false
          });
          return;
        }
        
        this.setData({ isChecking: false });
      }
      
      // 选择图片
      const tempFiles = await chooseImage({ count: 1 });
      
      if (!tempFiles || tempFiles.length === 0) {
        console.log('[CaishenUpload] 用户取消选择');
        return;
      }
      
      const file = tempFiles[0];
      
      // 验证图片
      const validation = await validateImage(file.path);
      if (!validation.valid) {
        console.log('[CaishenUpload] 图片验证失败:', validation.error);
        this.setData({
          errorMessage: validation.error
        });
        return;
      }
      
      console.log('[CaishenUpload] 图片验证通过:', validation.info);
      
      this.setData({
        selectedImage: file.path
      });
      
    } catch (err) {
      console.error('[CaishenUpload] 操作失败:', err);
      
      if (err.errMsg && err.errMsg.includes('cancel')) {
        this.setData({ isChecking: false });
        return;
      }
      
      let errorMessage = '操作失败，请重试';
      if (err.message) {
        if (err.message.includes('登录')) {
          errorMessage = '登录失败，请重试';
        } else if (err.message.includes('次数')) {
          errorMessage = '获取使用次数失败，请重试';
        } else {
          errorMessage = err.message;
        }
      }
      
      this.setData({
        errorMessage: errorMessage,
        isChecking: false
      });
    }
  },

  removeImage() {
    console.log('[CaishenUpload] 删除图片');
    this.setData({
      selectedImage: null
    });
  },

  async startGeneration() {
    if (this.data.isProcessing) return;
    
    if (!this.data.selectedImage) {
      wx.showToast({
        title: '请先上传照片',
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      isProcessing: true,
      statusText: '正在上传图片...',
      uploadProgress: 0,
      errorMessage: ''
    });
    
    try {
      const app = getApp();
      
      // 上传图片
      this.setData({
        statusText: '正在上传图片...',
        uploadProgress: 20
      });
      
      const uploadedUrl = await uploadImage(this.data.selectedImage);
      console.log('[CaishenUpload] 图片上传成功:', uploadedUrl);
      
      // 确保获取到有效的 userId
      this.setData({
        statusText: '正在启动生成...',
        uploadProgress: 50
      });
      
      const userId = await app.getUserId(true);
      
      if (!userId) {
        throw new Error('用户未登录，请先登录');
      }
      
      console.log('[CaishenUpload] 开始生成请求:', {
        mode: 'caishen',
        userId
      });
      
      // 调用生成API
      const { generationAPI } = require('../../../utils/api');
      const result = await generationAPI.generateArtPhoto({
        imageUrls: [uploadedUrl],
        templateId: 'caishen-default',
        mode: 'caishen',
        userId: userId,
        facePositions: null
      });
      
      console.log('[CaishenUpload] 生成API响应:', result);
      
      if (!result.success || !result.data?.taskId) {
        throw new Error(result.message || '未获取到任务ID');
      }
      
      const taskId = result.data.taskId;
      const recordId = result.data.recordId;
      
      // 刷新使用次数
      this.setData({
        statusText: '生成已启动...',
        uploadProgress: 80
      });
      
      try {
        await app.updateUsageCount(true);
        console.log('[CaishenUpload] 使用次数已刷新');
      } catch (err) {
        console.error('[CaishenUpload] 刷新使用次数失败:', err);
      }
      
      // 存储数据到全局
      app.globalData.caishenData = {
        mode: 'caishen',
        uploadedImage: uploadedUrl,
        taskId,
        recordId
      };
      
      this.setData({
        statusText: '跳转中...',
        uploadProgress: 100
      });
      
      // 跳转到生成页面
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/caishen/generating/generating?taskId=${taskId}&recordId=${recordId || ''}`,
          fail: (err) => {
            console.error('[CaishenUpload] 跳转失败:', err);
            this.setData({
              isProcessing: false,
              statusText: '',
              errorMessage: '页面跳转失败，请重试'
            });
          }
        });
      }, 300);
      
    } catch (err) {
      console.error('[CaishenUpload] 处理失败:', err);
      
      // 检查是否是余额不足错误
      if (err.errorCode === 'INSUFFICIENT_USAGE' || 
          err.errorCode === 'INSUFFICIENT_MODE_USAGE' || 
          err.errorCode === 'DECREMENT_FAILED' || 
          err.errorCode === 'BALANCE_CHECK_FAILED') {
        console.log('[CaishenUpload] 余额不足，显示充值引导');
        
        wx.showModal({
          title: '使用次数不足',
          content: '请购买套餐或邀请好友获取次数',
          confirmText: '去充值',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              this.setData({
                showPaymentModal: true,
                isProcessing: false,
                statusText: '',
                uploadProgress: 0
              });
            } else {
              this.setData({
                isProcessing: false,
                statusText: '',
                uploadProgress: 0
              });
            }
          }
        });
        return;
      }
      
      this.setData({
        isProcessing: false,
        statusText: '',
        uploadProgress: 0,
        errorMessage: err.message || '处理失败，请重试'
      });
    }
  },

  clearError() {
    this.setData({ errorMessage: '' });
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/caishen/launch/launch'
        });
      }
    });
  },

  async handlePaymentComplete(e) {
    console.log('[CaishenUpload] 支付完成:', e.detail);
    this.setData({ showPaymentModal: false });
    
    const app = getApp();
    await app.updateUsageCount(true);
    
    wx.showToast({
      title: '购买成功',
      icon: 'success'
    });
  },

  handlePaymentClose() {
    console.log('[CaishenUpload] 关闭支付弹窗');
    this.setData({ showPaymentModal: false });
  },

  onShareAppMessage() {
    return {
      title: '财神变身 - 财神附体，财运亨通！',
      path: '/pages/caishen/launch/launch',
      imageUrl: '/assets/images/share-caishen.png'
    };
  }
});
