/**
 * 时空拼图模式模板选择页
 * Requirements: 2.2
 * 
 * 功能：
 * - 复用原网页 TemplateSelector 样式
 * - 实现模板分类和选择
 * - 实现生成按钮
 */

const { generationAPI, templateAPI } = require('../../../utils/api');
const { initNavigation } = require('../../../utils/navigation-helper');
const { getAssetUrl } = require('../../../utils/oss-assets');

// 默认模板配置（作为后备）
const DEFAULT_PUZZLE_TEMPLATES = [
  {
    id: 'puzzle-1',
    name: '时光全家福',
    url: getAssetUrl('templates/puzzle/time-family.jpg'),
    category: 'classic',
    tags: ['经典', '全家福', '温馨'],
    description: '经典全家福风格，温馨团圆',
    isDefault: true,
    isPremium: false
  },
  {
    id: 'puzzle-2',
    name: '岁月如歌',
    url: getAssetUrl('templates/puzzle/years-song.jpg'),
    category: 'classic',
    tags: ['怀旧', '岁月', '回忆'],
    description: '怀旧风格，记录岁月变迁',
    isPremium: false
  },
  {
    id: 'puzzle-3',
    name: '春节团圆',
    url: getAssetUrl('templates/puzzle/spring-reunion.jpg'),
    category: 'festival',
    tags: ['春节', '团圆', '喜庆'],
    description: '春节主题，喜庆团圆',
    isPremium: false
  },
  {
    id: 'puzzle-4',
    name: '中秋月圆',
    url: getAssetUrl('templates/puzzle/mid-autumn.jpg'),
    category: 'festival',
    tags: ['中秋', '月圆', '团聚'],
    description: '中秋主题，月圆人团圆',
    isPremium: false
  },
  {
    id: 'puzzle-5',
    name: '现代简约',
    url: getAssetUrl('templates/puzzle/modern-simple.jpg'),
    category: 'modern',
    tags: ['现代', '简约', '时尚'],
    description: '现代简约风格，时尚大气',
    isPremium: false
  },
  {
    id: 'puzzle-6',
    name: '复古怀旧',
    url: getAssetUrl('templates/puzzle/vintage.jpg'),
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
    templates: [],
    categories: PUZZLE_CATEGORIES,
    selectedCategory: 'all',
    selectedTemplate: null,
    filteredTemplates: [],
    isLoading: true,
    showPreview: false,
    previewTemplate: null,
    isGenerating: false,
    // 使用次数相关
    usageCount: 0,
    userType: 'free',
    paymentStatus: 'free',
    showUsageModal: false,
    usageModalType: null
  },

  async onLoad() {
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
    
    // 加载模板列表
    await this.loadTemplates();
  },

  /**
   * 从服务端加载模板列表
   */
  async loadTemplates() {
    try {
      this.setData({ isLoading: true });
      
      console.log('[PuzzleTemplate] 开始加载模板列表');
      
      // 调用 API 获取模板列表
      const result = await templateAPI.getTemplateList('puzzle');
      
      if (result.success && result.data && result.data.length > 0) {
        // 将服务端返回的数据转换为小程序需要的格式
        const templates = result.data.map(t => ({
          id: t.id,
          name: t.name,
          url: t.imageUrl,
          category: t.category,
          tags: [],
          description: '',
          isDefault: t.id === 'puzzle-1',
          isPremium: false
        }));
        
        console.log('[PuzzleTemplate] 从服务端加载了', templates.length, '个模板');
        
        this.setData({
          templates,
          filteredTemplates: templates,
          selectedTemplate: templates.find(t => t.isDefault) || templates[0]
        });
      } else {
        throw new Error('服务端返回数据为空');
      }
    } catch (error) {
      console.error('[PuzzleTemplate] 加载模板失败，使用默认模板:', error);
      
      // 使用默认模板作为后备
      this.setData({
        templates: DEFAULT_PUZZLE_TEMPLATES,
        filteredTemplates: DEFAULT_PUZZLE_TEMPLATES,
        selectedTemplate: DEFAULT_PUZZLE_TEMPLATES[0]
      });
    } finally {
      this.setData({ isLoading: false });
    }
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
    const { templates } = this.data;
    const filteredTemplates = id === 'all' 
      ? templates 
      : templates.filter(t => t.category === id);
    
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
      // 确保获取到有效的 userId
      const userId = await app.getUserId(true);
      
      if (!userId) {
        throw new Error('用户未登录，请先登录');
      }
      
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
      const recordId = result.data.recordId; // 获取历史记录ID用于分享
      
      // ✅ 后端已经扣减次数，前端只需刷新显示
      try {
        await app.updateUsageCount(true); // 强制刷新
        console.log('[PuzzleTemplate] 使用次数已刷新');
      } catch (err) {
        console.error('[PuzzleTemplate] 刷新使用次数失败:', err);
      }
      
      // 存储任务信息
      app.globalData.puzzleData = {
        ...puzzleData,
        taskId,
        recordId, // 保存历史记录ID
        selectedTemplate: selectedTemplate.url
      };
      
      wx.hideLoading();
      
      // 跳转到生成等待页
      wx.navigateTo({
        url: `/pages/puzzle/generating/generating?taskId=${taskId}&recordId=${recordId || ''}`,
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
      
      // 检查是否是余额不足错误
      if (err.errorCode === 'INSUFFICIENT_USAGE' || 
          err.errorCode === 'INSUFFICIENT_MODE_USAGE' || 
          err.errorCode === 'DECREMENT_FAILED' || 
          err.errorCode === 'BALANCE_CHECK_FAILED') {
        console.log('[PuzzleTemplate] 余额不足，显示充值引导弹窗');
        
        // 获取最新的使用次数信息
        const app = getApp();
        const result = await app.updateUsageCount();
        
        // 统一显示次数用尽弹窗，引导用户充值或邀请好友
        // 不区分用户类型，因为此时都是次数不足
        this.setData({
          usageCount: result ? result.usageCount : 0,
          userType: result ? result.userType : 'free',
          paymentStatus: result ? (result.paymentStatus || 'free') : 'free',
          showUsageModal: true,
          usageModalType: 'free_exhausted' // 统一使用次数用尽弹窗
        });
        return;
      }
      
      wx.showToast({
        title: err.message || '启动生成失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ isGenerating: false });
    }
  },

  /**
   * 关闭使用次数模态框
   */
  onUsageModalClose() {
    this.setData({ showUsageModal: false });
  },

  /**
   * 支付成功回调 - 自动继续生成流程
   */
  async onPaymentSuccess() {
    console.log('[PuzzleTemplate] 支付成功，自动继续生成');
    
    this.setData({ showUsageModal: false });
    
    wx.showLoading({
      title: '支付成功，处理中...',
      mask: true
    });
    
    // 轮询查询用户次数，等待后端回调处理完成
    const app = getApp();
    const maxRetries = 10; // 最多重试10次
    const retryInterval = 1000; // 每次间隔1秒
    let retryCount = 0;
    let usageIncreased = false;
    
    // 记录支付前的次数
    const beforeUsageCount = app.globalData.usageCount || 0;
    
    while (retryCount < maxRetries && !usageIncreased) {
      await new Promise(resolve => setTimeout(resolve, retryInterval));
      
      try {
        const result = await app.updateUsageCount(true); // 强制刷新
        const currentUsageCount = result ? result.usageCount : 0;
        
        console.log('[PuzzleTemplate] 轮询次数:', {
          retry: retryCount + 1,
          before: beforeUsageCount,
          current: currentUsageCount
        });
        
        // 检查次数是否增加
        if (currentUsageCount > beforeUsageCount) {
          usageIncreased = true;
          console.log('[PuzzleTemplate] 次数已增加，继续生成');
          break;
        }
      } catch (err) {
        console.error('[PuzzleTemplate] 查询次数失败:', err);
      }
      
      retryCount++;
    }
    
    wx.hideLoading();
    
    if (usageIncreased) {
      // 次数已增加，显示成功提示并继续生成
      wx.showToast({
        title: '支付成功，开始生成',
        icon: 'success',
        duration: 1500
      });
      
      setTimeout(() => {
        this.handleGenerate();
      }, 1500);
    } else {
      // 超时未增加，提示用户手动刷新
      wx.showModal({
        title: '支付成功',
        content: '支付处理中，请稍后刷新页面查看次数',
        showCancel: false,
        confirmText: '知道了'
      });
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
