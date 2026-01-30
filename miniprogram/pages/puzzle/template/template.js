/**
 * 时空拼图模式模板选择页
 * Requirements: 2.2
 * 
 * 功能：
 * - 复用原网页 TemplateSelector 样式
 * - 实现模板分类和选择
 * - 实现生成按钮
 */

const { generationAPI } = require('../../../utils/api');
const { initNavigation } = require('../../../utils/navigation-helper');

// 时空拼图模板配置
const PUZZLE_TEMPLATES = [
  {
    id: 'puzzle-1',
    name: '时光全家福',
    url: '/assets/templates/puzzle/time-family.jpg',
    category: 'classic',
    tags: ['经典', '全家福', '温馨'],
    description: '经典全家福风格，温馨团圆',
    isDefault: true,
    isPremium: false
  },
  {
    id: 'puzzle-2',
    name: '岁月如歌',
    url: '/assets/templates/puzzle/years-song.jpg',
    category: 'classic',
    tags: ['怀旧', '岁月', '回忆'],
    description: '怀旧风格，记录岁月变迁',
    isPremium: false
  },
  {
    id: 'puzzle-3',
    name: '春节团圆',
    url: '/assets/templates/puzzle/spring-reunion.jpg',
    category: 'festival',
    tags: ['春节', '团圆', '喜庆'],
    description: '春节主题，喜庆团圆',
    isPremium: false
  },
  {
    id: 'puzzle-4',
    name: '中秋月圆',
    url: '/assets/templates/puzzle/mid-autumn.jpg',
    category: 'festival',
    tags: ['中秋', '月圆', '团聚'],
    description: '中秋主题，月圆人团圆',
    isPremium: false
  },
  {
    id: 'puzzle-5',
    name: '现代简约',
    url: '/assets/templates/puzzle/modern-simple.jpg',
    category: 'modern',
    tags: ['现代', '简约', '时尚'],
    description: '现代简约风格，时尚大气',
    isPremium: false
  },
  {
    id: 'puzzle-6',
    name: '复古怀旧',
    url: '/assets/templates/puzzle/vintage.jpg',
    category: 'classic',
    tags: ['复古', '怀旧', '老照片'],
    description: '复古风格，老照片质感',
    isPremium: true
  }
];

const PUZZLE_CATEGORIES = [
  { id: 'all', name: '全部', icon: '🎨' },
  { id: 'classic', name: '经典', icon: '📷' },
  { id: 'festival', name: '节日', icon: '🎊' },
  { id: 'modern', name: '现代', icon: '✨' }
];

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    templates: PUZZLE_TEMPLATES,
    categories: PUZZLE_CATEGORIES,
    selectedCategory: 'all',
    selectedTemplate: null,
    filteredTemplates: PUZZLE_TEMPLATES,
    isLoading: false,
    showPreview: false,
    previewTemplate: null,
    isGenerating: false
  },

  onLoad() {
    const app = getApp();
    
    initNavigation(this);
    
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
    
    // 检查是否有上传数据
    if (!app.globalData.puzzleData || !app.globalData.puzzleData.uploadedImages) {
      wx.showToast({
        title: '请先上传照片',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    // 默认选中第一个模板
    const defaultTemplate = PUZZLE_TEMPLATES.find(t => t.isDefault) || PUZZLE_TEMPLATES[0];
    this.setData({ selectedTemplate: defaultTemplate });
  },

  onShow() {
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
  },

  /**
   * 切换分类
   */
  handleCategoryChange(e) {
    const { id } = e.currentTarget.dataset;
    const filteredTemplates = id === 'all' 
      ? PUZZLE_TEMPLATES 
      : PUZZLE_TEMPLATES.filter(t => t.category === id);
    
    this.setData({
      selectedCategory: id,
      filteredTemplates
    });
  },

  /**
   * 选择模板
   */
  handleTemplateSelect(e) {
    const { template } = e.currentTarget.dataset;
    this.setData({ selectedTemplate: template });
    
    wx.vibrateShort({ type: 'light' });
    
    wx.showToast({
      title: `已选择：${template.name}`,
      icon: 'none',
      duration: 1500
    });
  },

  /**
   * 预览模板
   */
  handlePreview(e) {
    const { template } = e.currentTarget.dataset;
    this.setData({
      previewTemplate: template,
      showPreview: true
    });
  },

  /**
   * 关闭预览
   */
  closePreview() {
    this.setData({
      showPreview: false,
      previewTemplate: null
    });
  },

  /**
   * 从预览中选择模板
   */
  selectFromPreview() {
    const { previewTemplate } = this.data;
    if (previewTemplate) {
      this.setData({
        selectedTemplate: previewTemplate,
        showPreview: false,
        previewTemplate: null
      });
      
      wx.vibrateShort({ type: 'light' });
    }
  },

  /**
   * 开始生成
   * Requirements: 2.2
   */
  async handleGenerate() {
    const { selectedTemplate, isGenerating } = this.data;
    
    if (!selectedTemplate) {
      wx.showToast({
        title: '请先选择模板',
        icon: 'none'
      });
      return;
    }
    
    if (isGenerating) return;
    
    const app = getApp();
    const puzzleData = app.globalData.puzzleData;
    
    if (!puzzleData || !puzzleData.uploadedImages) {
      wx.showToast({
        title: '缺少上传的图片',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ isGenerating: true });
    
    wx.showLoading({
      title: '正在启动生成...',
      mask: true
    });
    
    try {
      const userId = wx.getStorageSync('userId') || '';
      
      console.log('[PuzzleTemplate] 开始生成请求:', {
        mode: 'puzzle',
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        imageCount: puzzleData.uploadedImages.length,
        userId
      });
      
      // 调用生成API
      const result = await generationAPI.generateArtPhoto({
        imageUrls: puzzleData.uploadedImages,
        templateId: selectedTemplate.id,
        mode: 'puzzle',
        userId: userId,
        facePositions: null
      });
      
      console.log('[PuzzleTemplate] 生成API响应:', result);
      
      if (!result.success || !result.data?.taskId) {
        throw new Error(result.message || '未获取到任务ID');
      }
      
      const taskId = result.data.taskId;
      
      // 扣减使用次数
      try {
        await app.decrementUsageCount(taskId, 'puzzle');
        console.log('[PuzzleTemplate] 使用次数已扣减');
      } catch (err) {
        console.error('[PuzzleTemplate] 扣减使用次数失败:', err);
        
        // 显示错误提示
        wx.hideLoading();
        wx.showModal({
          title: '使用次数不足',
          content: err.message || '您的使用次数已用完，请购买套餐后继续使用',
          showCancel: false,
          confirmText: '我知道了',
          success: () => {
            // 返回上一页
            wx.navigateBack({
              fail: () => {
                wx.redirectTo({
                  url: '/pages/puzzle/launch/launch'
                });
              }
            });
          }
        });
        return; // 阻止继续执行
      }
      
      // 存储任务信息
      app.globalData.puzzleData = {
        ...puzzleData,
        taskId,
        selectedTemplate: selectedTemplate.url
      };
      
      wx.hideLoading();
      
      // 跳转到生成等待页
      wx.navigateTo({
        url: `/pages/puzzle/generating/generating?taskId=${taskId}`,
        fail: (err) => {
          console.error('[PuzzleTemplate] 跳转失败:', err);
          wx.showToast({
            title: '页面跳转失败',
            icon: 'none'
          });
        }
      });
      
    } catch (err) {
      console.error('[PuzzleTemplate] 生成失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: err.message || '启动生成失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ isGenerating: false });
    }
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/puzzle/upload/upload'
        });
      }
    });
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '时空拼图 - 选择你喜欢的模板！',
      path: '/pages/puzzle/launch/launch',
      imageUrl: '/assets/images/share-puzzle.png'
    };
  }
});
