/**
 * 时空拼图模式启动页
 * Requirements: 2.2
 * 
 * 功能：
 * - 展示模式介绍和立即制作按钮
 * - 复用原网页 PuzzleLaunchScreen 样式
 * - 集成使用次数限制系统
 */

const usageModal = require('../../../utils/usageModal');
const { initNavigation } = require('../../../utils/navigation-helper');
const devMode = require('../../../utils/devMode');
const { getAssetUrl } = require('../../../utils/oss-assets');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    // 模式配置
    modeConfig: {
      name: '时空拼图',
      icon: '🧩',
      slogan: '跨越时空，团圆相聚',
      description: '多张照片 → AI合成全家福',
      uploadGuide: '上传2-5张家人照片，AI将为您合成一张完美全家福',
      buttonText: '立即制作全家福'
    },
    // OSS 资源
    commonBgUrl: getAssetUrl('common-bg.jpg'),
    // 使用次数相关
    usageCount: 0,
    userType: 'free',
    paymentStatus: 'free',
    hasEverPaid: false, // 是否曾经付费
    buttonDisabled: false,
    buttonText: '立即制作全家福',
    showModal: false,
    modalType: null,
    // 支付模态框
    showPaymentModal: false,
    // 开发者模式
    devModeActive: false,
    showDevPanel: false
  },

  async onLoad() {
    const app = getApp();
    
    initNavigation(this);
    
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
    
    // 加载使用次数
    await this.loadUsageCount();
  },

  async onShow() {
    console.log('[PuzzleLaunch] onShow 触发');
    // 页面显示时更新老年模式状态和使用次数
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
    
    // 刷新使用次数
    console.log('[PuzzleLaunch] 开始刷新使用次数');
    await this.loadUsageCount();
    console.log('[PuzzleLaunch] 使用次数刷新完成，当前:', this.data.usageCount);
  },

  /**
   * 加载使用次数
   */
  async loadUsageCount() {
    try {
      const app = getApp();
      
      // 确保已登录
      await app.ensureLogin();
      
      // 更新使用次数
      const result = await app.updateUsageCount();
      
      if (result) {
        // 从后端API获取用户的has_ever_paid状态
        const cloudbaseRequest = require('../../../utils/cloudbase-request');
        let hasEverPaid = wx.getStorageSync('hasEverPaid') || false; // 优先使用缓存
        
        try {
          const userRes = await cloudbaseRequest.get(`/api/user/${app.globalData.userId}`);
          if (userRes && userRes.success && userRes.data) {
            hasEverPaid = userRes.data.has_ever_paid || false;
            // 更新缓存
            wx.setStorageSync('hasEverPaid', hasEverPaid);
          }
        } catch (err) {
          console.warn('[PuzzleLaunch] 获取用户付费状态失败，使用缓存:', err);
          // API调用失败时，使用缓存值，如果缓存也没有，则根据paymentStatus判断
          if (!wx.getStorageSync('hasEverPaid')) {
            hasEverPaid = result.paymentStatus !== 'free';
          }
        }
        
        this.setData({
          usageCount: result.usageCount,
          userType: result.userType,
          paymentStatus: result.paymentStatus || 'free',
          hasEverPaid: hasEverPaid
        });
        
        // 更新按钮状态
        this.updateButtonState();
        
        // 检查是否需要显示模态框
        this.checkAndShowModal();
      }
    } catch (err) {
      console.error('[PuzzleLaunch] 加载使用次数失败:', err);
      // 失败时使用缓存和默认值
      this.setData({
        usageCount: 0,
        userType: 'free',
        paymentStatus: wx.getStorageSync('paymentStatus') || 'free',
        hasEverPaid: wx.getStorageSync('hasEverPaid') || false
      });
      this.updateButtonState();
    }
  },

  /**
   * 更新按钮状态
   */
  updateButtonState() {
    const { usageCount } = this.data;
    const disabled = usageModal.shouldDisableButton(usageCount);
    const buttonText = usageModal.getButtonText(usageCount, this.data.modeConfig.buttonText);
    
    this.setData({
      buttonDisabled: disabled,
      buttonText: buttonText
    });
  },

  /**
   * 检查并显示模态框
   */
  checkAndShowModal() {
    const { usageCount, userType, paymentStatus } = this.data;
    const modalCheck = usageModal.checkModalOnPageLoad(usageCount, userType, 'launch', paymentStatus);
    
    if (modalCheck.show) {
      this.setData({
        showModal: true,
        modalType: modalCheck.modalType
      });
    }
  },

  /**
   * 使用次数更新回调（由app.js调用）
   */
  onUsageCountUpdate(data) {
    console.log('[PuzzleLaunch] 使用次数已更新:', data);
    this.setData({
      usageCount: data.usageCount,
      userType: data.userType,
      paymentStatus: data.paymentStatus || 'free'
    });
    this.updateButtonState();
  },

  /**
   * 开始制作 - 跳转到上传页
   * Requirements: 2.2
   */
  handleStart() {
    const { buttonDisabled, usageCount, userType, paymentStatus } = this.data;
    
    // 检查使用次数是否为0
    if (usageCount === 0) {
      console.log('[PuzzleLaunch] 使用次数为0，显示支付弹窗');
      this.setData({
        showPaymentModal: true
      });
      return;
    }
    
    // 如果按钮被禁用，显示支付弹窗
    if (buttonDisabled) {
      console.log('[PuzzleLaunch] 按钮被禁用，显示支付弹窗');
      this.setData({
        showPaymentModal: true
      });
      return;
    }
    
    // 跳转到上传页
    console.log('[PuzzleLaunch] 跳转到上传页，剩余次数:', usageCount);
    wx.navigateTo({
      url: '/pages/puzzle/upload/upload',
      fail: (err) => {
        console.error('跳转上传页失败:', err);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 查看历史记录
   * Requirements: 11.1-11.4
   */
  viewHistory() {
    wx.navigateTo({
      url: '/pages/puzzle/history/history',
      fail: (err) => {
        console.error('跳转历史记录失败:', err);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 模态框关闭
   */
  onModalClose() {
    this.setData({
      showModal: false
    });
  },

  /**
   * 模态框支付按钮点击
   */
  onModalPayment() {
    console.log('[PuzzleLaunch] 触发支付');
    // 关闭使用次数模态框，打开支付模态框
    this.setData({
      showModal: false,
      showPaymentModal: true
    });
  },

  /**
   * 支付完成回调
   */
  onPaymentComplete(e) {
    const { packageType } = e.detail;
    console.log('[PuzzleLaunch] 支付完成:', packageType);
    
    const newPaymentStatus = packageType;
    wx.setStorageSync('paymentStatus', newPaymentStatus);
    
    this.setData({
      showPaymentModal: false,
      paymentStatus: newPaymentStatus,
      hasEverPaid: true // 付费后立即更新状态
    });
    
    // 缓存到本地存储
    wx.setStorageSync('hasEverPaid', true);
    
    // 刷新使用次数
    this.loadUsageCount();
    
    wx.showToast({
      title: '购买成功',
      icon: 'success'
    });
  },

  /**
   * 关闭支付模态框
   */
  closePaymentModal() {
    this.setData({ showPaymentModal: false });
  },

  /**
   * 模态框分享按钮点击
   */
  onModalShare() {
    console.log('[PuzzleLaunch] 触发分享');
    // 跳转到邀请页面
    wx.navigateTo({
      url: '/pages/invite/invite',
      fail: (err) => {
        console.error('跳转邀请页面失败:', err);
        wx.showToast({
          title: '功能开发中',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 返回首页
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
   * Requirements: 8.1
   */
  onShareAppMessage() {
    return {
      title: '时空拼图 - 跨越时空，团圆相聚！',
      path: '/pages/puzzle/launch/launch',
      imageUrl: '/assets/images/share-puzzle.png'
    };
  },

  /**
   * 分享到朋友圈
   * Requirements: 8.1
   */
  onShareTimeline() {
    return {
      title: '时空拼图 - 多人合成全家福',
      imageUrl: '/assets/images/share-puzzle.png'
    };
  },

  /**
   * 导航栏点击 - 用于激活开发者模式
   */
  onNavBarTap() {
    devMode.handleTap(() => {
      this.setData({ devModeActive: true });
      this.showDevPanel();
    });
  },

  /**
   * 显示开发者面板
   */
  showDevPanel() {
    this.setData({ showDevPanel: true });
  },

  /**
   * 关闭开发者面板
   */
  closeDevPanel() {
    this.setData({ showDevPanel: false });
  },

  /**
   * 开发者面板更新使用次数
   */
  onDevPanelUpdate(e) {
    const { usageCount } = e.detail;
    console.log('[PuzzleLaunch] 开发者面板更新使用次数:', usageCount);
    this.setData({ usageCount });
    this.updateButtonState();
  }
});
