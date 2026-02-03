/**
 * 时空拼图模式上传页 - 5个独立图片框
 * Requirements: 2.2, 6.1-6.5
 * 
 * 功能：
 * - 5个独立图片框，可单独上传和删除
 * - 实现多图上传（最多5张）
 * - 实现人脸检测
 */

const { chooseImage, uploadImage, validateImage } = require('../../../utils/upload');
const { faceAPI } = require('../../../utils/api');
const pageMixin = require('../../../utils/page-mixin');
const { initNavigation } = require('../../../utils/navigation-helper');
const { getAssetUrl } = require('../../../utils/oss-assets');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    selectedImages: [null, null, null, null, null], // 5个图片框
    uploadedCount: 0,
    isProcessing: false,
    isChecking: false,  // ✅ 新增：是否正在检查（防止重复点击）
    statusText: '',
    errorMessage: '',
    uploadProgress: 0,
    // OSS 资源
    cameraUploadUrl: getAssetUrl('camera-upload.png'),
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

  /**
   * 点击上传框
   * Requirements: 6.1
   */
  async handleUploadClick(e) {
    // ✅ 防止重复点击
    if (this.data.isProcessing || this.data.isChecking) {
      console.log('[PuzzleUpload] 操作进行中，请勿重复点击');
      return;
    }
    
    const index = e.currentTarget.dataset.index;
    console.log('[PuzzleUpload] 点击上传框:', index);
    
    this.setData({ errorMessage: '' });
    
    const app = getApp();
    
    try {
      // 检查使用次数（仅在第一次上传时检查）
      if (this.data.uploadedCount === 0) {
        // ✅ 设置检查状态
        this.setData({ isChecking: true });
        
        // 1. 先确保登录完成
        console.log('[PuzzleUpload] 检查登录状态...');
        const userId = await app.getUserId(true);
        
        if (!userId) {
          console.error('[PuzzleUpload] 登录失败');
          this.setData({
            errorMessage: '登录失败，请重试',
            isChecking: false
          });
          return;
        }
        
        console.log('[PuzzleUpload] 登录成功，userId:', userId);
        
        // 2. 检查使用次数
        console.log('[PuzzleUpload] 检查使用次数...');
        const usageInfo = await app.updateUsageCount();
        
        console.log('[PuzzleUpload] 使用次数检查:', usageInfo);
        
        // 如果次数为0，显示套餐选择弹窗
        if (usageInfo.usageCount === 0) {
          console.log('[PuzzleUpload] 次数为0，显示套餐选择');
          this.setData({
            showPaymentModal: true,
            currentPaymentStatus: usageInfo.paymentStatus || 'free',
            isChecking: false
          });
          return;
        }
        
        // ✅ 清除检查状态
        this.setData({ isChecking: false });
      }
      
      // 3. 选择单张图片
      const tempFiles = await chooseImage(1);
      if (!tempFiles || tempFiles.length === 0) {
        console.log('[PuzzleUpload] 用户取消选择');
        return;
      }
      
      const file = tempFiles[0];
      console.log('[PuzzleUpload] 选择的文件:', file);
      
      // 4. 验证图片
      const validation = await validateImage(file.path);
      if (!validation.valid) {
        console.log('[PuzzleUpload] 图片验证失败:', validation.error);
        this.setData({
          errorMessage: validation.error
        });
        return;
      }
      
      console.log('[PuzzleUpload] 图片验证通过:', validation.info);
      
      // 5. 显示临时图片
      const selectedImages = [...this.data.selectedImages];
      selectedImages[index] = file.path;
      
      // 计算已上传数量
      const uploadedCount = selectedImages.filter(img => img !== null).length;
      
      this.setData({
        selectedImages,
        uploadedCount
      });
      
    } catch (err) {
      console.error('[PuzzleUpload] 操作失败:', err);
      
      // 用户取消选择图片
      if (err.errMsg && err.errMsg.includes('cancel')) {
        this.setData({ isChecking: false });
        return;
      }
      
      // 显示友好的错误提示
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

  /**
   * 删除图片
   */
  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    console.log('[PuzzleUpload] 删除图片:', index);
    
    const selectedImages = [...this.data.selectedImages];
    selectedImages[index] = null;
    
    // 计算已上传数量
    const uploadedCount = selectedImages.filter(img => img !== null).length;
    
    this.setData({
      selectedImages,
      uploadedCount
    });
  },

  /**
   * 进入模板选择页
   * Requirements: 6.2-6.5
   */
  async goToTemplate() {
    if (this.data.isProcessing) return;
    
    const validImages = this.data.selectedImages.filter(img => img !== null);
    
    console.log('[PuzzleUpload] 进入模板选择，图片数量:', validImages.length);
    
    // 如果没有上传图片，直接跳转到模板选择页
    if (validImages.length === 0) {
      console.log('[PuzzleUpload] 无图片，直接跳转模板选择');
      wx.navigateTo({
        url: '/pages/puzzle/template/template'
      });
      return;
    }
    
    // 如果有图片，先上传和检测人脸
    this.setData({
      isProcessing: true,
      statusText: '正在上传图片...',
      uploadProgress: 0,
      errorMessage: ''
    });
    
    try {
      // 1. 上传所有图片
      const uploadedUrls = [];
      for (let i = 0; i < validImages.length; i++) {
        const imagePath = validImages[i];
        this.setData({
          statusText: `正在上传第 ${i + 1}/${validImages.length} 张...`,
          uploadProgress: Math.round((i / validImages.length) * 50)
        });
        
        const url = await uploadImage(imagePath);
        uploadedUrls.push(url);
      }
      
      console.log('[PuzzleUpload] 所有图片上传成功:', uploadedUrls.length);
      
      // 2. 人脸检测（已在后端跳过，这里仅做形式调用）
      this.setData({
        statusText: '正在检测人脸...',
        uploadProgress: 75
      });
      
      const result = await faceAPI.extractFaces(uploadedUrls);
      console.log('[PuzzleUpload] 人脸检测结果:', {
        success: result.success,
        faceCount: result.data?.faces?.length || 0
      });
      
      if (!result.success || !result.data?.faces || result.data.faces.length === 0) {
        this.setData({
          isProcessing: false,
          statusText: '',
          errorMessage: result.message || '未检测到人脸，请上传包含清晰人脸的照片'
        });
        return;
      }
      
      // 3. 检测成功，跳转到模板选择页
      this.setData({
        statusText: '检测成功，正在跳转...',
        uploadProgress: 100
      });
      
      // 存储数据到全局
      const app = getApp();
      app.globalData.puzzleData = {
        mode: 'puzzle',
        uploadedImages: uploadedUrls,
        faces: result.data.faces
      };
      
      setTimeout(() => {
        wx.navigateTo({
          url: '/pages/puzzle/template/template',
          fail: (err) => {
            console.error('[PuzzleUpload] 跳转失败:', err);
            this.setData({
              isProcessing: false,
              statusText: '',
              errorMessage: '页面跳转失败，请重试'
            });
          }
        });
      }, 300);
      
    } catch (err) {
      console.error('[PuzzleUpload] 处理失败:', err);
      this.setData({
        isProcessing: false,
        statusText: '',
        errorMessage: err.message || '处理失败，请重试'
      });
    }
  },

  /**
   * 清除错误
   */
  clearError() {
    this.setData({ errorMessage: '' });
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/puzzle/launch/launch'
        });
      }
    });
  },

  /**
   * 支付完成回调
   */
  async handlePaymentComplete(e) {
    console.log('[PuzzleUpload] 支付完成:', e.detail);
    
    // 关闭支付弹窗
    this.setData({ showPaymentModal: false });
    
    // 强制刷新使用次数（跳过缓存）
    const app = getApp();
    await app.updateUsageCount(true);
    
    // 显示成功提示
    wx.showToast({
      title: '购买成功',
      icon: 'success'
    });
  },

  /**
   * 关闭支付弹窗
   */
  handlePaymentClose() {
    console.log('[PuzzleUpload] 关闭支付弹窗');
    this.setData({ showPaymentModal: false });
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '时空拼图 - 穿越时空的全家福！',
      path: '/pages/puzzle/launch/launch',
      imageUrl: '/assets/images/share-puzzle.png'
    };
  }
});
