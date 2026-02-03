/**
 * 贺卡编辑页
 * Requirements: 2.4, 13.1-13.5
 * 
 * 功能：
 * - 复用原网页 CardEditor 样式
 * - 实现祝福语编辑
 * - 实现贺卡模板选择
 * - 实现预览和保存
 */

const { savePosterToAlbum } = require('../../utils/share');
const { greetingCardAPI } = require('../../utils/api');
const { initNavigation } = require('../../utils/navigation-helper');

// 贺卡模板配置（使用渐变背景色代替图片）
const CARD_TEMPLATES = [
  {
    id: 'card-1',
    name: '新春祝福',
    bgColor: 'linear-gradient(135deg, #8B0000 0%, #DC143C 100%)',
    textColor: '#FFD700',
    textPosition: 'bottom',
    pattern: 'fireworks' // 烟花图案
  },
  {
    id: 'card-2',
    name: '团圆美满',
    bgColor: 'linear-gradient(135deg, #B8860B 0%, #FFD700 100%)',
    textColor: '#8B0000',
    textPosition: 'bottom',
    pattern: 'lantern' // 灯笼图案
  },
  {
    id: 'card-3',
    name: '福气满满',
    bgColor: 'linear-gradient(135deg, #DC143C 0%, #FF6347 100%)',
    textColor: '#FFD700',
    textPosition: 'center',
    pattern: 'blessing' // 福字图案
  },
  {
    id: 'card-4',
    name: '恭贺新禧',
    bgColor: 'linear-gradient(135deg, #8B4513 0%, #D2691E 100%)',
    textColor: '#FFFFFF',
    textPosition: 'bottom',
    pattern: 'cloud' // 祥云图案
  }
];

// 预设祝福语
const PRESET_BLESSINGS = [
  '新春快乐，阖家幸福！',
  '恭喜发财，万事如意！',
  '龙年大吉，福气满满！',
  '团团圆圆，幸福美满！',
  '身体健康，平安喜乐！'
];

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    imageUrl: '',
    templates: CARD_TEMPLATES,
    presetBlessings: PRESET_BLESSINGS,
    selectedTemplate: null,
    blessing: '新春快乐，阖家幸福！',
    showPreview: false,
    isSaving: false,
    isGenerating: false,
    canvasWidth: 750,
    canvasHeight: 1000,
    generatedCardUrl: '' // 生成的贺卡图片URL
  },

  onLoad(options) {
    const app = getApp();
    
    initNavigation(this);
    
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
    
    // 获取图片URL
    if (options.image) {
      this.setData({
        imageUrl: decodeURIComponent(options.image)
      });
    }
    
    // 默认选中第一个模板
    this.setData({
      selectedTemplate: CARD_TEMPLATES[0]
    });
    
    // 获取系统信息，计算画布尺寸
    this.initCanvas();
  },

  onShow() {
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
  },

  /**
   * 选择模板
   */
  handleTemplateSelect(e) {
    const { template } = e.currentTarget.dataset;
    this.setData({ selectedTemplate: template });
    wx.vibrateShort({ type: 'light' });
  },

  /**
   * 选择预设祝福语
   */
  handleBlessingSelect(e) {
    const { blessing } = e.currentTarget.dataset;
    this.setData({ blessing });
  },

  /**
   * 输入祝福语
   */
  handleBlessingInput(e) {
    this.setData({ blessing: e.detail.value });
  },

  /**
   * 初始化画布
   */
  initCanvas() {
    const systemInfo = wx.getSystemInfoSync();
    const screenWidth = systemInfo.screenWidth;
    const pixelRatio = systemInfo.pixelRatio || 2;
    
    // 计算画布尺寸（3:4比例）
    const canvasWidth = screenWidth * pixelRatio;
    const canvasHeight = canvasWidth * 4 / 3;
    
    this.setData({
      canvasWidth,
      canvasHeight
    });
  },

  /**
   * 预览贺卡
   */
  async handlePreview() {
    const { selectedTemplate, blessing, imageUrl } = this.data;
    
    if (!selectedTemplate) {
      wx.showToast({
        title: '请先选择模板',
        icon: 'none'
      });
      return;
    }
    
    if (!blessing.trim()) {
      wx.showToast({
        title: '请输入祝福语',
        icon: 'none'
      });
      return;
    }
    
    if (!imageUrl) {
      wx.showToast({
        title: '缺少照片',
        icon: 'none'
      });
      return;
    }
    
    // 生成贺卡
    await this.generateCard();
    
    this.setData({ showPreview: true });
  },

  /**
   * 关闭预览
   */
  closePreview() {
    this.setData({ showPreview: false });
  },

  /**
   * 生成贺卡（使用Canvas）
   */
  async generateCard() {
    const { selectedTemplate, blessing, imageUrl, canvasWidth, canvasHeight } = this.data;
    
    return new Promise((resolve, reject) => {
      wx.showLoading({ title: '生成贺卡中...', mask: true });
      
      // 创建离屏Canvas
      const query = wx.createSelectorQuery();
      query.select('#cardCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          if (!res || !res[0]) {
            wx.hideLoading();
            wx.showToast({ title: '画布初始化失败', icon: 'none' });
            reject(new Error('Canvas not found'));
            return;
          }
          
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          
          // 设置画布尺寸
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          
          try {
            // 1. 绘制背景渐变
            await this.drawBackground(ctx, canvas, selectedTemplate);
            
            // 2. 绘制用户照片
            await this.drawUserPhoto(ctx, canvas, imageUrl);
            
            // 3. 绘制装饰图案
            await this.drawPattern(ctx, canvas, selectedTemplate);
            
            // 4. 绘制祝福语
            await this.drawBlessing(ctx, canvas, blessing, selectedTemplate);
            
            // 5. 导出图片
            wx.canvasToTempFilePath({
              canvas,
              success: (res) => {
                console.log('[CardEditor] 贺卡生成成功:', res.tempFilePath);
                this.setData({ generatedCardUrl: res.tempFilePath });
                wx.hideLoading();
                resolve(res.tempFilePath);
              },
              fail: (err) => {
                console.error('[CardEditor] 导出图片失败:', err);
                wx.hideLoading();
                wx.showToast({ title: '生成失败', icon: 'none' });
                reject(err);
              }
            });
          } catch (err) {
            console.error('[CardEditor] 绘制失败:', err);
            wx.hideLoading();
            wx.showToast({ title: '绘制失败', icon: 'none' });
            reject(err);
          }
        });
    });
  },

  /**
   * 绘制背景
   */
  async drawBackground(ctx, canvas, template) {
    // 解析渐变色
    const gradientMatch = template.bgColor.match(/linear-gradient\((\d+)deg,\s*([^,]+),\s*([^)]+)\)/);
    if (gradientMatch) {
      const angle = parseInt(gradientMatch[1]);
      // 提取颜色值，去除百分比部分
      const color1 = gradientMatch[2].trim().split(/\s+/)[0];
      const color2 = gradientMatch[3].trim().split(/\s+/)[0];
      
      // 创建渐变
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);
      
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = '#8B0000';
    }
    
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  },

  /**
   * 绘制用户照片
   */
  async drawUserPhoto(ctx, canvas, imageUrl) {
    return new Promise((resolve, reject) => {
      const img = canvas.createImage();
      img.onload = () => {
        // 计算照片位置和尺寸（居中，占画布70%宽度）
        const photoWidth = canvas.width * 0.7;
        const photoHeight = photoWidth * 0.75; // 3:4比例
        const photoX = (canvas.width - photoWidth) / 2;
        const photoY = canvas.height * 0.15;
        
        // 绘制白色边框
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(photoX - 10, photoY - 10, photoWidth + 20, photoHeight + 20);
        
        // 绘制照片
        ctx.drawImage(img, photoX, photoY, photoWidth, photoHeight);
        
        resolve();
      };
      img.onerror = reject;
      img.src = imageUrl;
    });
  },

  /**
   * 绘制装饰图案
   */
  async drawPattern(ctx, canvas, template) {
    // 简单的装饰元素
    ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
    
    // 绘制圆形装饰
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height * 0.3;
      const radius = 20 + Math.random() * 30;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  /**
   * 绘制祝福语
   */
  async drawBlessing(ctx, canvas, blessing, template) {
    const fontSize = canvas.width * 0.08;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = template.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // 添加文字阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // 计算文字位置
    let textY;
    if (template.textPosition === 'center') {
      textY = canvas.height / 2;
    } else {
      textY = canvas.height * 0.85;
    }
    
    // 绘制文字（支持换行）
    const maxWidth = canvas.width * 0.8;
    const lines = this.wrapText(ctx, blessing, maxWidth);
    const lineHeight = fontSize * 1.3;
    const startY = textY - (lines.length - 1) * lineHeight / 2;
    
    lines.forEach((line, index) => {
      ctx.fillText(line, canvas.width / 2, startY + index * lineHeight);
    });
  },

  /**
   * 文字换行处理
   */
  wrapText(ctx, text, maxWidth) {
    const words = text.split('');
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + words[i];
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  },

  /**
   * 保存贺卡
   */
  async handleSave() {
    const { isSaving, generatedCardUrl, blessing, selectedTemplate } = this.data;
    
    if (isSaving) return;
    
    if (!generatedCardUrl) {
      wx.showToast({
        title: '请先预览贺卡',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ isSaving: true });
    
    try {
      wx.showLoading({ title: '保存中...', mask: true });
      
      // 保存到相册
      await savePosterToAlbum(generatedCardUrl);
      
      // 保存到后端（可选）
      try {
        const app = getApp();
        const userId = await app.getUserId(false); // 不强制登录
        
        if (userId) {
          await greetingCardAPI.createCard({
            userId,
            imageUrl: generatedCardUrl,
            greeting: blessing,
            templateId: selectedTemplate.id
          });
        }
      } catch (apiErr) {
        console.error('[CardEditor] 保存到后端失败:', apiErr);
        // 不影响用户体验，继续
      }
      
      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });
      
      this.setData({ showPreview: false });
      
    } catch (err) {
      console.error('[CardEditor] 保存失败:', err);
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
   * 返回上一页
   */
  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/launch/launch'
        });
      }
    });
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    const { generatedCardUrl, imageUrl } = this.data;
    return {
      title: '我制作了一张拜年贺卡，快来看看！',
      path: '/pages/launch/launch',
      imageUrl: generatedCardUrl || imageUrl || ''
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    const { generatedCardUrl, imageUrl } = this.data;
    return {
      title: '我制作了一张拜年贺卡',
      imageUrl: generatedCardUrl || imageUrl || ''
    };
  }
});
