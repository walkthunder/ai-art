/**
 * 富贵变身模式模板选择页
 * Requirements: 2.3
 * 
 * 功能：
 * - 复用 puzzle/template 页面逻辑
 * - 使用富贵变身模式模板
 */

const { generationAPI, templateAPI } = require('../../../utils/api');
const { getAssetUrl } = require('../../../utils/oss-assets');
const { initNavigation } = require('../../../utils/navigation-helper');

// 富贵变身模板配置
const TRANSFORM_TEMPLATES = [
  {
    id: 'transform-custom-1',
    name: '富贵团圆',
    url: getAssetUrl('templates/transform/fugui-tuanyuan.jpg'),
    category: 'chinese',
    tags: ['中式', '团圆', '喜庆', '富贵'],
    description: '中国风富贵团圆背景，喜庆大气',
    isDefault: true,
    isPremium: false
  },
  {
    id: 'transform-custom-2',
    name: '豪门盛宴',
    url: getAssetUrl('templates/transform/haomen-shengyan.jpg'),
    category: 'luxury',
    tags: ['豪宅', '奢华', '宴会', '高端'],
    description: '豪门宴会背景，高端大气',
    isPremium: false
  },
  {
    id: 'transform-custom-3',
    name: '雅致居所',
    url: getAssetUrl('templates/transform/yazhi-jusuo.jpg'),
    category: 'modern',
    tags: ['雅致', '温馨', '家庭', '舒适'],
    description: '雅致温馨的家庭背景',
    isPremium: false
  },
  {
    id: 'transform-1',
    name: '欧式豪华客厅',
    url: getAssetUrl('templates/transform/luxury-european.jpg'),
    category: 'luxury',
    tags: ['欧式', '豪宅', '奢华', '客厅'],
    description: '欧式宫廷风格，水晶吊灯，奢华典雅',
    isPremium: false
  },
  {
    id: 'transform-2',
    name: '中式豪宅大厅',
    url: getAssetUrl('templates/transform/luxury-chinese.jpg'),
    category: 'chinese',
    tags: ['中式', '传统', '富贵', '红木'],
    description: '传统中式建筑风格，红木家具，富贵大气',
    isPremium: false
  },
  {
    id: 'transform-3',
    name: '现代轻奢客厅',
    url: getAssetUrl('templates/transform/modern-luxury.jpg'),
    category: 'modern',
    tags: ['现代', '简约', '时尚', '轻奢'],
    description: '现代简约风格，时尚大气',
    isPremium: false
  },
  {
    id: 'transform-4',
    name: '古典宫廷',
    url: getAssetUrl('templates/transform/classical-palace.jpg'),
    category: 'luxury',
    tags: ['宫殿', '古典', '奢华', '皇家'],
    description: '古典宫廷风格，皇家气派',
    isPremium: true
  }
];

const TRANSFORM_CATEGORIES = [
  { id: 'all', name: '全部', icon: '🎨' },
  { id: 'luxury', name: '豪宅', icon: '🏰' },
  { id: 'chinese', name: '中式', icon: '🏯' },
  { id: 'modern', name: '现代', icon: '🏢' }
];

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    templates: TRANSFORM_TEMPLATES,
    categories: TRANSFORM_CATEGORIES,
    selectedCategory: 'all',
    selectedTemplate: null,
    filteredTemplates: TRANSFORM_TEMPLATES,
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
    if (!app.globalData.transformData || !app.globalData.transformData.uploadedImages) {
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
    const defaultTemplate = TRANSFORM_TEMPLATES.find(t => t.isDefault) || TRANSFORM_TEMPLATES[0];
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
      ? TRANSFORM_TEMPLATES
      : TRANSFORM_TEMPLATES.filter(t => t.category === id);
    
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
    
    // 震动反馈
    wx.vibrateShort({ type: 'light' });
    
    // 显示选中提示
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
   * Requirements: 2.3
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
    const transformData = app.globalData.transformData;
    
    if (!transformData || !transformData.uploadedImages) {
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
      // 确保获取到有效的 userId
      const userId = await app.getUserId(true);
      
      if (!userId) {
        throw new Error('用户未登录，请先登录');
      }
      
      console.log('[TransformTemplate] 开始生成请求:', {
        mode: 'transform',
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        imageCount: transformData.uploadedImages.length,
        userId
      });
      
      // 调用生成API
      const result = await generationAPI.generateArtPhoto({
        imageUrls: transformData.uploadedImages,
        templateId: selectedTemplate.id,
        mode: 'transform',
        userId: userId,
        facePositions: null
      });
      
      console.log('[TransformTemplate] 生成API响应:', result);
      
      if (!result.success || !result.data?.taskId) {
        throw new Error(result.message || '未获取到任务ID');
      }
      
      const taskId = result.data.taskId;
      const recordId = result.data.recordId; // 获取历史记录ID用于分享
      
      // 扣减使用次数
      try {
        await app.decrementUsageCount(taskId);
        console.log('[TransformTemplate] 使用次数已扣减');
      } catch (err) {
        console.error('[TransformTemplate] 扣减使用次数失败:', err);
        
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
                  url: '/pages/transform/launch/launch'
                });
              }
            });
          }
        });
        return; // 阻止继续执行
      }
      
      // 存储任务信息
      app.globalData.transformData = {
        ...transformData,
        taskId,
        recordId, // 保存历史记录ID
        selectedTemplate: selectedTemplate.url
      };
      
      wx.hideLoading();
      
      // 跳转到生成等待页
      wx.navigateTo({
        url: `/pages/transform/generating/generating?taskId=${taskId}&recordId=${recordId || ''}`,
        fail: (err) => {
          console.error('[TransformTemplate] 跳转失败:', err);
          wx.showToast({
            title: '页面跳转失败',
            icon: 'none'
          });
        }
      });
      
    } catch (err) {
      console.error('[TransformTemplate] 生成失败:', err);
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
          url: '/pages/transform/upload/upload'
        });
      }
    });
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '富贵变身 - 选择你喜欢的豪门背景！',
      path: '/pages/transform/launch/launch',
      imageUrl: '/assets/images/share-transform.png'
    };
  }
});
