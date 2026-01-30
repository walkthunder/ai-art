/**
 * 使用次数显示组件
 * 显示用户剩余的生成次数
 */

Component({
  /**
   * 组件属性
   */
  properties: {
    // 剩余使用次数
    usageCount: {
      type: Number,
      value: 0
    },
    // 用户类型 ('free' | 'paid')
    userType: {
      type: String,
      value: 'free'
    },
    // 是否为老年模式
    isElderMode: {
      type: Boolean,
      value: false
    },
    // 是否曾经付费（用于控制显示）
    hasEverPaid: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件数据
   */
  data: {
    displayText: '',
    isLowCount: false
  },

  /**
   * 数据监听器
   */
  observers: {
    'usageCount, userType': function(count, type) {
      // 更新显示文本
      this.setData({
        displayText: `剩余次数: ${count}`
      });

      // 判断是否为低次数（免费用户 <= 2，付费用户 <= 5）
      const isLowCount = type === 'free' ? count <= 2 : count <= 5;
      this.setData({
        isLowCount
      });
    }
  },

  /**
   * 组件方法
   */
  methods: {
    /**
     * 更新使用次数
     * @param {number} count 新的使用次数
     */
    updateCount(count) {
      this.setData({
        usageCount: count
      });
    }
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      console.log('[UsageDisplay] 组件已挂载，当前次数:', this.data.usageCount);
    }
  }
});
