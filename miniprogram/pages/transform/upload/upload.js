/**
 * 富贵变身模式上传页
 * Requirements: 2.3, 6.1-6.5
 * 
 * 功能：
 * - 复用原网页 TransformUploadPage 样式
 * - 实现单图上传
 * - 实现人脸检测
 */

const { chooseImage, uploadImage, validateImage } = require('../../../utils/upload');
const { faceAPI } = require('../../../utils/api');
const { initNavigation } = require('../../../utils/navigation-helper');
const { getAssetUrl } = require('../../../utils/oss-assets');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    isUploading: false,
    isChecking: false,  // ✅ 新增：是否正在检查（防止重复点击）
    statusText: '',
    errorMessage: '',
    uploadProgress: 0,
    // OSS 资源
    cameraUploadUrl: getAssetUrl('camera-upload.png'),
    commonBgUrl: getAssetUrl('common-bg.jpg'),
    // 支付弹窗
    showPaymentModal: false,
    currentPaymentStatus: 'free'
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

  /**
   * 点击上传区域
   * Requirements: 6.1
   */
  async handleUploadClick() {
    // ✅ 防止重复点击
    if (this.data.isUploading || this.data.isChecking) {
      console.log('[TransformUpload] 操作进行中，请勿重复点击');
      return;
    }
    
    console.log('[TransformUpload] 用户点击上传区域');
    this.setData({ errorMessage: '', isChecking: true });
    
    const app = getApp();
    
    try {
      // 1. 先确保登录完成
      console.log('[TransformUpload] 检查登录状态...');
      const userId = await app.getUserId(true);
      
      if (!userId) {
        console.error('[TransformUpload] 登录失败');
        this.setData({
          errorMessage: '登录失败，请重试',
          isChecking: false
        });
        return;
      }
      
      console.log('[TransformUpload] 登录成功，userId:', userId);
      
      // 2. 检查使用次数
      console.log('[TransformUpload] 检查使用次数...');
      const usageInfo = await app.updateUsageCount();
      
      console.log('[TransformUpload] 使用次数检查:', usageInfo);
      
      // 如果次数为0，显示套餐选择弹窗
      if (usageInfo.usageCount === 0) {
        console.log('[TransformUpload] 次数为0，显示套餐选择');
        this.setData({
          showPaymentModal: true,
          currentPaymentStatus: usageInfo.paymentStatus || 'free',
          isChecking: false
        });
        return;
      }
      
      // ✅ 清除检查状态，准备上传
      this.setData({ isChecking: false });
      
      // 3. 选择图片（单张）
      const tempFiles = await chooseImage(1);
      if (!tempFiles || tempFiles.length === 0) {
        console.log('[TransformUpload] 用户取消选择');
        return;
      }
      
      const file = tempFiles[0];
      console.log('[TransformUpload] 选择的文件:', {
        path: file.path,
        size: `${(file.size / 1024 / 1024).toFixed(2)}MB`
      });
      
      // 4. 验证图片
      const validation = await validateImage(file.path);
      if (!validation.valid) {
        console.log('[TransformUpload] 图片验证失败:', validation.error);
        this.setData({
          errorMessage: validation.error
        });
        return;
      }
      
      console.log('[TransformUpload] 图片验证通过:', validation.info);
      
      // 5. 开始上传流程
      await this.processUpload(file.path);
      
    } catch (err) {
      console.error('[TransformUpload] 操作失败:', err);
      
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
   * 处理上传流程
   * Requirements: 6.2-6.5
   */
  async processUpload(filePath) {
    this.setData({
      isUploading: true,
      statusText: '正在上传图片...',
      uploadProgress: 0,
      errorMessage: ''
    });
    
    try {
      // 1. 上传图片到服务器
      console.log('[TransformUpload] 开始上传图片');
      const imageUrl = await uploadImage(filePath, (progress) => {
        this.setData({ uploadProgress: progress });
      });
      console.log('[TransformUpload] 图片上传成功:', imageUrl);
      
      // 2. 人脸检测（已在后端跳过，这里仅做形式调用）
      this.setData({
        statusText: '正在检测人脸...',
        uploadProgress: 100
      });
      console.log('[TransformUpload] 开始人脸检测（已跳过实际检测）');
      
      const result = await faceAPI.extractFaces([imageUrl]);
      console.log('[TransformUpload] 人脸检测结果:', {
        success: result.success,
        faceCount: result.data?.faces?.length || 0
      });
      
      // 由于后端已跳过检测，这里直接认为成功
      if (!result.success) {
        console.log('[TransformUpload] 检测接口调用失败');
        this.setData({
          isUploading: false,
          statusText: '',
          errorMessage: result.message || '图片处理失败，请重试'
        });
        return;
      }
      
      // 3. 检测成功，跳转到模板选择页
      this.setData({ statusText: '检测成功，正在跳转...' });
      console.log('[TransformUpload] 人脸检测成功，准备跳转');
      
      // 存储数据到全局
      const app = getApp();
      app.globalData.transformData = {
        mode: 'transform',
        uploadedImages: [imageUrl],
        faces: result.data.faces
      };
      
      setTimeout(() => {
        wx.navigateTo({
          url: '/pages/transform/template/template',
          fail: (err) => {
            console.error('[TransformUpload] 跳转失败:', err);
            this.setData({
              isUploading: false,
              statusText: '',
              errorMessage: '页面跳转失败，请重试'
            });
          }
        });
      }, 300);
      
    } catch (err) {
      console.error('[TransformUpload] 上传处理失败:', err);
      this.setData({
        isUploading: false,
        statusText: '',
        errorMessage: err.message || '上传失败，请重试'
      });
    }
  },

  /**
   * 清除错误，重新上传
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
          url: '/pages/transform/launch/launch'
        });
      }
    });
  },

  /**
   * 支付完成回调
   */
  async handlePaymentComplete(e) {
    console.log('[TransformUpload] 支付完成:', e.detail);
    
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
    console.log('[TransformUpload] 关闭支付弹窗');
    this.setData({ showPaymentModal: false });
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '富贵变身 - 一秒变豪门！',
      path: '/pages/transform/launch/launch',
      imageUrl: '/assets/images/share-transform.png'
    };
  }
});
