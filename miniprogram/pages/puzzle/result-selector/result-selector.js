/**
 * 时空拼图模式结果选择页
 * Requirements: 2.2, 15.1-15.4
 * 
 * 功能：
 * - 复用原网页 ResultSelectorPage 样式
 * - 以四宫格形式展示生成的图片
 * - 支持点击图片放大预览
 * - 高亮显示选中的图片
 */

const { initNavigation } = require('../../../utils/navigation-helper');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    images: [],
    selectedImage: '',
    // OSS 资源
    commonBgUrl: getAssetUrl('bg/puzzle-result-bg.jpg'),
  },

  onLoad() {
    const app = getApp();
    
    initNavigation(this);
    
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
    
    // 获取生成的图片
    const puzzleData = app.globalData.puzzleData || {};
    const generatedImages = puzzleData.generatedImages || [];
    
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
    
    console.log('[PuzzleResultSelector] 加载图片:', generatedImages.length);
    
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
    console.log('[PuzzleResultSelector] 选择图片:', url);
    this.setData({ selectedImage: url });
    
    wx.vibrateShort({ type: 'light' });
  },

  /**
   * 确认选择
   * Requirements: 15.4
   */
  handleConfirm(e) {
    const { url } = e.detail;
    console.log('[PuzzleResultSelector] 确认选择:', url);
    
    // 从 globalData 获取 recordId
    const app = getApp();
    const puzzleData = app.globalData.puzzleData || {};
    const generationId = puzzleData.recordId || puzzleData.taskId || '';
    
    wx.redirectTo({
      url: `/pages/puzzle/result/result?image=${encodeURIComponent(url)}&generationId=${generationId}`,
      fail: (err) => {
        console.error('[PuzzleResultSelector] 跳转失败:', err);
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
          url: '/pages/puzzle/launch/launch'
        });
      }
    });
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '时空拼图 - 看看我的全家福！',
      path: '/pages/puzzle/launch/launch',
      imageUrl: this.data.selectedImage || '/assets/images/share-puzzle.png'
    };
  }
});
