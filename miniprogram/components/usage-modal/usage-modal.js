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
    isLoadingConfig: false
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
     * 点击支付按钮
     */
    onPayment() {
      console.log('[UsageModal] 触发支付事件');
      this.triggerEvent('payment');
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
