/**
 * 使用次数模态框组件
 * 根据不同的modalType显示不同的内容
 */

Component({
  /**
   * 组件属性
   */
  properties: {
    // 是否显示模态框
    visible: {
      type: Boolean,
      value: false
    },
    // 模态框类型: 'free_reminder' | 'free_exhausted' | 'paid_renewal_basic' | 'paid_renewal_premium'
    modalType: {
      type: String,
      value: 'free_reminder'
    },
    // 剩余使用次数
    usageCount: {
      type: Number,
      value: 0
    },
    // 是否为老年模式
    isElderMode: {
      type: Boolean,
      value: false
    },
    // 是否允许点击遮罩关闭（exhausted和renewal类型不允许）
    maskClosable: {
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件数据
   */
  data: {
    // 套餐配置（从API获取）
    packageConfig: {
      basic: {
        price: 9.9,
        rechargeAmount: 10,
        name: '尝鲜包'
      },
      premium: {
        price: 29.9,
        rechargeAmount: 35,
        name: '尊享包'
      }
    },
    // 是否正在加载配置
    isLoadingConfig: false,
    // 当前选中的套餐
    selectedPackage: null
  },

  /**
   * 组件方法
   */
  methods: {
    /**
     * 加载套餐配置
     */
    async loadPackageConfig() {
      if (this.data.isLoadingConfig) return;
      
      this.setData({ isLoadingConfig: true });
      
      try {
        const app = getApp();
        const apiBaseUrl = app.globalData.apiBaseUrl;
        
        let result;
        
        // 判断是否使用云托管
        if (apiBaseUrl === 'cloudbase') {
          const cloudbaseRequest = require('../../utils/cloudbase-request');
          result = await cloudbaseRequest.get('/api/prices/current?details=true');
        } else {
          const apiUrl = `${apiBaseUrl}/api/prices/current?details=true`;
          result = await new Promise((resolve, reject) => {
            wx.request({
              url: apiUrl,
              method: 'GET',
              timeout: 5000,
              success: (res) => resolve(res),
              fail: (err) => reject(err)
            });
          });
        }
        
        // 处理响应数据
        let responseData;
        if (apiBaseUrl === 'cloudbase') {
          responseData = result;
        } else {
          responseData = result.data;
        }
        
        if (responseData && responseData.success && responseData.data) {
          const apiData = responseData.data;
          console.log('[UsageModal] 套餐配置加载成功:', apiData);
          
          this.setData({
            packageConfig: {
              basic: apiData.basic || { price: 9.9, rechargeAmount: 10, name: '尝鲜包' },
              premium: apiData.premium || { price: 29.9, rechargeAmount: 35, name: '尊享包' }
            },
            isLoadingConfig: false
          });
        } else {
          throw new Error('API返回数据格式错误');
        }
      } catch (error) {
        console.error('[UsageModal] 加载套餐配置失败，使用默认值:', error);
        // 使用默认值
        this.setData({
          packageConfig: {
            basic: { price: 9.9, rechargeAmount: 10, name: '尝鲜包' },
            premium: { price: 29.9, rechargeAmount: 35, name: '尊享包' }
          },
          isLoadingConfig: false
        });
      }
    },

    /**
     * 关闭模态框
     */
    onClose() {
      // 所有类型都允许关闭
      this.triggerEvent('close');
    },

    /**
     * 点击遮罩
     */
    onMaskTap() {
      // 所有类型都允许点击遮罩关闭
      if (this.data.maskClosable) {
        this.onClose();
      }
    },

    /**
     * 选择套餐（点击套餐卡片）
     */
    onSelectPackage(e) {
      const packageType = e.currentTarget.dataset.package;
      console.log('[UsageModal] 选择套餐:', packageType);
      
      // 设置选中的套餐
      this.setData({
        selectedPackage: packageType
      });
      
      // 直接发起支付
      this.handlePayment(packageType);
    },

    /**
     * 处理支付
     */
    async handlePayment(packageType) {
      console.log('[UsageModal] 开始支付流程，套餐:', packageType);
      
      try {
        const app = getApp();
        const userId = app.globalData.userId;
        const openid = app.globalData.openid;
        
        if (!userId || !openid) {
          wx.showToast({
            title: '请先登录',
            icon: 'none'
          });
          return;
        }
        
        wx.showLoading({
          title: '正在创建订单...',
          mask: true
        });
        
        // 调用支付服务
        const cloudbasePayment = require('../../utils/cloudbase-payment');
        const result = await cloudbasePayment.pay({
          packageType,
          generationId: null, // template 页面没有 generationId
          userId
        });
        
        wx.hideLoading();
        
        if (result.success) {
          console.log('[UsageModal] 支付成功');
          // 关闭弹窗
          this.triggerEvent('close');
          // 触发支付成功事件
          this.triggerEvent('paymentSuccess', { packageType });
        } else if (result.cancelled) {
          console.log('[UsageModal] 用户取消支付');
          // 用户取消支付，不显示错误提示
        } else {
          console.error('[UsageModal] 支付失败:', result.message);
          wx.showToast({
            title: result.message || '支付失败',
            icon: 'none'
          });
        }
      } catch (error) {
        wx.hideLoading();
        console.error('[UsageModal] 支付异常:', error);
        wx.showToast({
          title: error.message || '支付失败，请重试',
          icon: 'none'
        });
      }
    },

    /**
     * 点击分享按钮（跳转到邀请页面）
     */
    onShare() {
      console.log('[UsageModal] 跳转到邀请页面');
      // 关闭模态框
      this.triggerEvent('close');
      // 跳转到邀请页面
      wx.navigateTo({
        url: '/pages/invite/invite',
        fail: (err) => {
          console.error('[UsageModal] 跳转邀请页面失败:', err);
          wx.showToast({
            title: '跳转失败，请重试',
            icon: 'none'
          });
        }
      });
    }
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      console.log('[UsageModal] 组件已挂载，类型:', this.data.modalType);
      // 组件加载时获取套餐配置
      this.loadPackageConfig();
    }
  },

  /**
   * 数据监听器
   */
  observers: {
    'visible': function(visible) {
      if (visible) {
        console.log('[UsageModal] 模态框打开，重新加载套餐配置');
        // 每次打开模态框时重新加载配置（确保最新）
        this.loadPackageConfig();
      }
    }
  }
});
