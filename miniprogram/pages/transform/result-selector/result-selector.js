/**
 * 富贵变身模式结果选择页
 * Requirements: 2.3, 15.1-15.4
 * 
 * 功能：
 * - 复用 puzzle/result-selector 页面逻辑
 * - 以四宫格形式展示生成的图片
 * - 支持点击图片放大预览
 * - 高亮显示选中的图片
 */

const { initNavigation } = require('../../../utils/navigation-helper');
const { getAssetUrl } = require('../../../utils/oss-assets');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    images: [],
    selectedImage: '',
    commonBgUrl: getAssetUrl('common-bg.jpg')
  },

  onLoad() {
    const app = getApp();
    
    initNavigation(this);
    
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
    
    // 获取生成的图片
    const transformData = app.globalData.transformData || {};
    const generatedImages = transformData.generatedImages || [];
    
    if (generatedImages.length === 0) {
      wx.showToast({
        title: '没有找到生成的图片',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    console.log('[TransformResultSelector] 加载图片:', generatedImages.length);
    
    // 默认选中第一张
    this.setData({
      images: generatedImages,
      selectedImage: generatedImages[0]
    });
  },

  onShow() {
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
  },

  /**
   * 选择图片
   * Requirements: 15.3
   */
  handleSelect(e) {
    const { url } = e.detail;
    console.log('[TransformResultSelector] 选择图片:', url);
    this.setData({ selectedImage: url });
    
    // 震动反馈
    wx.vibrateShort({ type: 'light' });
  },

  /**
   * 确认选择
   * Requirements: 15.4
   */
  handleConfirm(e) {
    const { url } = e.detail;
    console.log('[TransformResultSelector] 确认选择:', url);
    
    // 从 globalData 获取 recordId
    const app = getApp();
    const transformData = app.globalData.transformData || {};
    const generationId = transformData.recordId || transformData.taskId || '';
    
    // 跳转到结果详情页
    wx.redirectTo({
      url: `/pages/transform/result/result?image=${encodeURIComponent(url)}&generationId=${generationId}`,
      fail: (err) => {
        console.error('[TransformResultSelector] 跳转失败:', err);
        wx.showToast({
          title: '页面跳转失败',
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
          url: '/pages/transform/launch/launch'
        });
      }
    });
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '富贵变身 - 看看我的豪门背景！',
      path: '/pages/transform/launch/launch',
      imageUrl: this.data.selectedImage || '/assets/images/share-transform.png'
    };
  }
});
