/**
 * 财神变身模式启动页
 * 
 * 功能：
 * - 展示模式介绍和立即制作按钮
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
      name: '财神变身',
      icon: '💰',
      slogan: '财神附体，财运亨通',
      description: '一张照片 → AI生成财神发钱视频',
      uploadGuide: '上传您的照片，AI将您变身为财神爷，生成喜庆发钱视频',
      buttonText: '立即变身财神'
    },
    // OSS 资源
    commonBgUrl: getAssetUrl('bg/caishen-bg.jpg'),
    // 使用次数相关
    usageCount: 0,
    userType: 'free',
    paymentStatus: 'free',
    hasEverPaid: false,
    buttonDisabled: false,
    buttonText: '立即变身财神',
    showModal: false,
    modalType: null,
    // 支付模态框
    showPaymentModal: false,
    // 开发者模式
    devModeActive: false,
    showDevPanel: false
  },

  isFirstShow: true,

  async onLoad() {
    const app = getApp();
    
    initNavigation(this);
    
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
    
    await this.loadUsageCount();
  },

  async onShow() {
    console.log('[CaishenLaunch] onShow 触发');
    const app = getApp();
    
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
    
    if (!this.isFirstShow) {
      console.log('[CaishenLaunch] 从其他页面返回，刷新使用次数');
      await this.loadUsageCount();
    } else {
      this.isFirstShow = false;
    }
  },

  async loadUsageCount() {
    try {
      const app = getApp();
      await app.ensureLogin();
      const result = await app.updateUsageCount();
      
      if (result) {
        const hasEverPaid = result.has_ever_paid || false;
        
        this.setData({
          usageCount: result.usageCount,
          userType: result.userType,
          paymentStatus: result.paymentStatus || 'free',
          hasEverPaid: hasEverPaid
        });
        
        this.updateButtonState();
        this.checkAndShowModal();
      }
    } catch (err) {
      console.error('[CaishenLaunch] 加载使用次数失败:', err);
      this.setData({
        usageCount: 0,
        userType: 'free',
        paymentStatus: wx.getStorageSync('paymentStatus') || 'free',
        hasEverPaid: wx.getStorageSync('hasEverPaid') || false
      });
      this.updateButtonState();
    }
  },

  updateButtonState() {
    const { usageCount } = this.data;
    const disabled = usageModal.shouldDisableButton(usageCount);
    const buttonText = usageModal.getButtonText(usageCount, this.data.modeConfig.buttonText);
    
    this.setData({
      buttonDisabled: disabled,
      buttonText: buttonText
    });
  },

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

  onUsageCountUpdate(data) {
    console.log('[CaishenLaunch] 使用次数已更新:', data);
    this.setData({
      usageCount: data.usageCount,
      userType: data.userType,
      paymentStatus: data.paymentStatus || 'free'
    });
    this.updateButtonState();
  },

  handleStart() {
    const { buttonDisabled, usageCount } = this.data;
    
    if (usageCount === 0 || buttonDisabled) {
      console.log('[CaishenLaunch] 使用次数不足，显示支付弹窗');
      this.setData({
        showPaymentModal: true
      });
      return;
    }
    
    console.log('[CaishenLaunch] 跳转到上传页，剩余次数:', usageCount);
    wx.navigateTo({
      url: '/pages/caishen/upload/upload',
      fail: (err) => {
        console.error('跳转上传页失败:', err);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  },

  viewHistory() {
    wx.navigateTo({
      url: '/pages/caishen/history/history',
      fail: (err) => {
        console.error('跳转历史记录失败:', err);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  },

  viewInvite() {
    wx.navigateTo({
      url: '/pages/invite/invite',
      fail: (err) => {
        console.error('跳转邀请页面失败:', err);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  },

  handleGetMore() {
    console.log('[CaishenLaunch] 点击获取更多次数');
    const { usageCount, userType, paymentStatus } = this.data;
    const modalType = usageModal.determineModalType(usageCount, userType, paymentStatus);
    
    if (modalType) {
      this.setData({
        showModal: true,
        modalType: modalType
      });
      wx.vibrateShort({ type: 'light' });
    } else {
      this.setData({
        showModal: true,
        modalType: 'free_reminder'
      });
    }
  },

  onModalClose() {
    this.setData({
      showModal: false
    });
  },

  onModalPayment() {
    console.log('[CaishenLaunch] 触发支付');
    this.setData({
      showModal: false,
      showPaymentModal: true
    });
  },

  onPaymentComplete(e) {
    const { packageType } = e.detail;
    console.log('[CaishenLaunch] 支付完成:', packageType);
    
    const newPaymentStatus = packageType;
    wx.setStorageSync('paymentStatus', newPaymentStatus);
    
    this.setData({
      showPaymentModal: false,
      paymentStatus: newPaymentStatus,
      hasEverPaid: true
    });
    
    wx.setStorageSync('hasEverPaid', true);
    
    this.loadUsageCount().then(() => {
      console.log('[CaishenLaunch] 余额刷新成功，准备跳转');
      this.navigateToUpload();
    }).catch((err) => {
      console.error('[CaishenLaunch] 余额刷新失败，但仍然跳转', err);
      this.navigateToUpload();
    });
  },

  navigateToUpload() {
    wx.showToast({
      title: '购买成功，开始制作',
      icon: 'success',
      duration: 1500
    });
    
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/caishen/upload/upload',
        fail: (err) => {
          console.error('[CaishenLaunch] 跳转上传页失败:', err);
          wx.showToast({
            title: '页面跳转失败，请重试',
            icon: 'none',
            duration: 2000
          });
        }
      });
    }, 1500);
  },

  closePaymentModal() {
    this.setData({ showPaymentModal: false });
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/launch/launch'
        });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '财神变身 - 财神附体，财运亨通！',
      path: '/pages/caishen/launch/launch',
      imageUrl: '/assets/images/share-caishen.png'
    };
  },

  onShareTimeline() {
    return {
      title: '财神变身 - AI生成财神发钱视频',
      imageUrl: '/assets/images/share-caishen.png'
    };
  },

  onNavBarTap() {
    devMode.handleTap(() => {
      this.setData({ devModeActive: true });
      this.showDevPanel();
    });
  },

  showDevPanel() {
    this.setData({ showDevPanel: true });
  },

  closeDevPanel() {
    this.setData({ showDevPanel: false });
  },

  onDevPanelUpdate(e) {
    const { usageCount } = e.detail;
    console.log('[CaishenLaunch] 开发者面板更新使用次数:', usageCount);
    this.setData({ usageCount });
    this.updateButtonState();
  }
});
