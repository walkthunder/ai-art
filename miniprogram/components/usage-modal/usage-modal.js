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
    // 模态框类型: 'free_reminder' | 'free_exhausted' | 'paid_renewal'
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
  data: {},

  /**
   * 组件方法
   */
  methods: {
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
    }
  }
});
