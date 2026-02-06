/**
 * 支付弹窗组件
 * 复用原网页 PaymentModal 样式
 * 实现套餐选择和微信支付集成
 * 
 * 使用 CloudBase 云函数实现支付
 */
const cloudbasePayment = require('../../utils/cloudbase-payment');

// 套餐价格等级映射
const PACKAGE_LEVEL = {
  'free': 0,
  'basic': 1,
  'premium': 2
};

Component({
  properties: {
    // 是否显示弹窗
    visible: {
      type: Boolean,
      value: false
    },
    // 生成记录ID
    generationId: {
      type: String,
      value: ''
    },
    // 当前付费状态
    currentPaymentStatus: {
      type: String,
      value: 'free'
    },
    // 剩余使用次数
    usageCount: {
      type: Number,
      value: 3
    },
    // 是否曾经付费
    hasEverPaid: {
      type: Boolean,
      value: false
    },
    // 预选的套餐类型
    preselectedPackage: {
      type: String,
      value: ''
    }
  },
  
  data: {
    // 选中的套餐
    selectedPackage: 'free',
    // 套餐列表 - 从 API 动态获取
    packages: [],
    allPackages: [],
    // 支付状态
    isPaying: false,
    paymentStatus: 'idle', // idle, processing, success, failed
    error: null,
    outTradeNo: null,
    // 是否免费次数已用尽
    isFreeExhausted: false,
    // 隐私协议勾选状态（默认勾选）
    privacyAgreed: true,
    // 价格加载状态
    isPriceLoading: true
  },

  lifetimes: {
    attached() {
      // 组件加载时获取最新价格
      this.loadPrices();
    }
  },

  observers: {
    'visible': function(visible) {
      if (visible) {
        console.log('[PaymentModal] visible changed to true, currentPaymentStatus:', this.data.currentPaymentStatus);
        console.log('[PaymentModal] preselectedPackage:', this.data.preselectedPackage);
        // 弹窗打开时重新加载价格（确保最新）
        this.loadPrices().then(() => {
          this.filterPackages(this.data.currentPaymentStatus);
          // 如果有预选的套餐，自动选中
          if (this.data.preselectedPackage) {
            console.log('[PaymentModal] 自动选中预选套餐:', this.data.preselectedPackage);
            this.setData({
              selectedPackage: this.data.preselectedPackage
            });
          }
        });
      }
    },
    'currentPaymentStatus': function(currentPaymentStatus) {
      if (this.data.visible) {
        console.log('[PaymentModal] currentPaymentStatus changed to:', currentPaymentStatus);
        this.filterPackages(currentPaymentStatus);
      }
    },
    'preselectedPackage': function(preselectedPackage) {
      if (this.data.visible && preselectedPackage) {
        console.log('[PaymentModal] preselectedPackage changed to:', preselectedPackage);
        this.setData({
          selectedPackage: preselectedPackage
        });
      }
    }
  },
  
  methods: {
    // 加载最新价格
    async loadPrices() {
      console.log('[PaymentModal] 开始加载价格...');
      this.setData({ isPriceLoading: true });
      
      try {
        // 从 API 获取最新价格
        const packages = await cloudbasePayment.getAllPackages();
        const allPackages = Object.values(packages);
        
        console.log('[PaymentModal] 价格加载成功:', allPackages);
        
        this.setData({
          allPackages: allPackages,
          isPriceLoading: false
        });
        
        return allPackages;
      } catch (error) {
        console.error('[PaymentModal] 价格加载失败，使用降级方案:', error);
        
        // 降级方案：使用硬编码价格
        const fallbackPackages = Object.values(cloudbasePayment.FALLBACK_PACKAGES);
        this.setData({
          allPackages: fallbackPackages,
          isPriceLoading: false
        });
        
        return fallbackPackages;
      }
    },
    
    // 根据当前付费状态过滤可选套餐
    filterPackages(currentStatus) {
      console.log('[PaymentModal] filterPackages called with currentStatus:', currentStatus, 'usageCount:', this.data.usageCount);
      
      const currentLevel = PACKAGE_LEVEL[currentStatus] || 0;
      const allPackages = this.data.allPackages;
      
      console.log('[PaymentModal] currentLevel:', currentLevel, 'allPackages count:', allPackages.length);
      
      // 检查是否免费次数已用尽（剩余次数为0）
      const isFreeExhausted = this.data.usageCount === 0;
      
      console.log('[PaymentModal] isFreeExhausted:', isFreeExhausted, '(usageCount:', this.data.usageCount, ')');
      
      // ✅ 优化过滤逻辑
      let filteredPackages;
      
      if (isFreeExhausted) {
        // 次数为0时，隐藏免费版，只显示付费套餐
        filteredPackages = allPackages.filter(pkg => pkg.id !== 'free');
      } else {
        // 次数 > 0时，显示所有套餐
        filteredPackages = allPackages.filter(pkg => {
          const pkgLevel = PACKAGE_LEVEL[pkg.id] || 0;
          return pkgLevel >= currentLevel;
        });
      }
      
      console.log('[PaymentModal] filteredPackages count:', filteredPackages.length);
      
      // 默认选中第一个付费套餐（如果免费次数已用尽）或第一个可用套餐
      let defaultSelected = 'free';
      if (isFreeExhausted && filteredPackages.length > 0) {
        // 选择第一个付费套餐（basic 或 premium）
        defaultSelected = filteredPackages[0].id;
      } else if (filteredPackages.length > 0) {
        defaultSelected = filteredPackages[0].id;
      }
      
      console.log('[PaymentModal] defaultSelected:', defaultSelected);
      
      this.setData({
        packages: filteredPackages,
        selectedPackage: defaultSelected,
        isFreeExhausted: isFreeExhausted,
        paymentStatus: 'idle',
        error: null,
        privacyAgreed: true // 默认勾选隐私协议
      });
    },

    // 选择套餐
    selectPackage(e) {
      const { id } = e.currentTarget.dataset;
      
      console.log('[PaymentModal] selectPackage:', id, 'usageCount:', this.data.usageCount, 'hasEverPaid:', this.data.hasEverPaid);
      
      // 次数为0时的限制
      if (this.data.usageCount === 0) {
        // 免费用户：不能选择免费版
        if (!this.data.hasEverPaid && id === 'free') {
          console.log('[PaymentModal] 免费用户次数为0，禁止选择免费版');
          wx.showToast({
            title: '次数已用尽，请选择付费套餐',
            icon: 'none'
          });
          return;
        }
        
        // ✅ 移除付费用户的限制，允许选择任何付费套餐
        // 付费用户也不能选择免费版（次数为0时）
        if (this.data.hasEverPaid && id === 'free') {
          console.log('[PaymentModal] 付费用户次数为0，禁止选择免费版');
          wx.showToast({
            title: '次数已用尽，请选择付费套餐',
            icon: 'none'
          });
          return;
        }
      }
      
      this.setData({
        selectedPackage: id,
        error: null
      });
    },
    
    // 隐私协议勾选变化
    onPrivacyChange(e) {
      // checkbox-group 返回的是选中的 value 数组
      const values = e.detail.value;
      const isAgreed = values.includes('agreed');
      
      console.log('[PaymentModal] onPrivacyChange:', values, 'isAgreed:', isAgreed);
      
      this.setData({
        privacyAgreed: isAgreed
      });
    },

    // 查看隐私政策
    viewPrivacy() {
      wx.navigateTo({
        url: '/pages/privacy/privacy'
      });
    },

    // 查看用户协议
    viewAgreement() {
      wx.navigateTo({
        url: '/pages/agreement/agreement'
      });
    },

    // 处理支付
    async handlePay() {
      console.log('[PaymentModal] handlePay called, isPaying:', this.data.isPaying);
      if (this.data.isPaying) return;
      
      const app = getApp();
      const { selectedPackage, privacyAgreed } = this.data;
      
      console.log('[PaymentModal] selectedPackage:', selectedPackage);
      
      // 免费版直接完成
      if (selectedPackage === 'free') {
        console.log('[PaymentModal] 免费版，直接完成');
        this.setData({ paymentStatus: 'success' });
        setTimeout(() => {
          this.triggerEvent('complete', { packageType: 'free' });
        }, 800);
        return;
      }

      // 付费套餐需要勾选隐私协议
      if (!privacyAgreed) {
        wx.showToast({
          title: '请先同意用户协议和隐私政策',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      this.setData({
        isPaying: true,
        paymentStatus: 'processing',
        error: null
      });
      
      try {
        // 使用 cloudbase-payment 模块完成支付流程
        const result = await cloudbasePayment.pay({
          packageType: selectedPackage,
          generationId: this.data.generationId,
          userId: app.globalData.userId
        });
        
        if (result.success) {
          // ✅ 支付成功，显示详细提示
          if (result.warning) {
            // 支付成功但订单确认超时
            wx.showModal({
              title: '支付成功',
              content: '支付已完成，但订单确认需要一些时间。如果次数未更新，请稍后查看历史记录或联系客服。',
              showCancel: false,
              confirmText: '我知道了'
            });
          } else {
            // 支付成功且订单已确认
            wx.showToast({ 
              title: '支付成功', 
              icon: 'success',
              duration: 1500
            });
          }
          
          this.setData({
            isPaying: false,
            paymentStatus: 'success',
            outTradeNo: result.data.outTradeNo
          });
          
          setTimeout(() => {
            this.triggerEvent('complete', { 
              packageType: selectedPackage,
              outTradeNo: result.data.outTradeNo,
              warning: result.warning || false
            });
          }, result.warning ? 2000 : 1000);
        } else if (result.cancelled) {
          // 用户取消支付
          this.setData({
            isPaying: false,
            paymentStatus: 'idle'
          });
        } else {
          throw new Error(result.message || '支付失败');
        }
        
      } catch (err) {
        console.error('支付失败:', err);
        
        // 用户取消支付不显示错误
        if (err.cancelled || (err.errMsg && err.errMsg.includes('cancel'))) {
          this.setData({
            isPaying: false,
            paymentStatus: 'idle'
          });
          return;
        }
        
        this.setData({
          isPaying: false,
          paymentStatus: 'failed',
          error: err.message || '支付失败，请重试'
        });
      }
    },
    
    // 查询订单状态
    async queryOrderStatus() {
      const { outTradeNo } = this.data;
      if (!outTradeNo) return null;
      
      try {
        const result = await cloudbasePayment.queryOrder(outTradeNo);
        return result;
      } catch (err) {
        console.error('查询订单失败:', err);
        return null;
      }
    },
    
    // 重试支付
    handleRetry() {
      this.setData({
        error: null,
        paymentStatus: 'idle'
      });
      this.handlePay();
    },
    
    // 关闭弹窗
    handleClose() {
      console.log('[PaymentModal] handleClose called, isPaying:', this.data.isPaying);
      if (this.data.isPaying) return;
      this.triggerEvent('close');
    },
    
    // 阻止冒泡
    preventBubble() {}
  }
});
