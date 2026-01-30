/**
 * 开发者模式面板组件
 * 用于调试和测试，允许随意修改使用次数
 */

const { post } = require('../../utils/cloudbase-request');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    usageCount: {
      type: Number,
      value: 0
    }
  },

  data: {
    inputValue: '',
    loginUserId: '',
    loading: false,
    message: '',
    messageType: 'info' // 'info', 'success', 'error'
  },

  methods: {
    /**
     * 关闭面板
     */
    close() {
      this.triggerEvent('close');
    },

    /**
     * 输入框变化
     */
    onInput(e) {
      this.setData({
        inputValue: e.detail.value
      });
    },

    /**
     * 登录输入框变化
     */
    onLoginInput(e) {
      this.setData({
        loginUserId: e.detail.value
      });
    },

    /**
     * 开发者快速登录
     */
    async handleDevLogin() {
      this.setData({ loading: true });

      try {
        const devMode = require('../../utils/devMode');
        const userId = this.data.loginUserId.trim() || null;
        
        const result = await devMode.devLogin(userId);
        
        if (result.success) {
          this.showMessage(
            `✅ 登录成功\n` +
            `用户ID: ${result.data.userId}\n` +
            `使用次数: ${result.data.usageCount}\n` +
            `用户类型: ${result.data.hasEverPaid ? 'VIP' : '免费'}`,
            'success'
          );
          
          // 清空输入
          this.setData({ loginUserId: '' });
          
          // 触发更新事件
          this.triggerEvent('update', {
            usageCount: result.data.usageCount,
            hasEverPaid: result.data.hasEverPaid,
            paymentStatus: result.data.paymentStatus
          });
          
          // 提示刷新
          setTimeout(() => {
            wx.showModal({
              title: '登录成功',
              content: '建议返回首页重新进入',
              confirmText: '返回首页',
              cancelText: '稍后',
              success: (res) => {
                if (res.confirm) {
                  wx.reLaunch({ url: '/pages/launch/launch' });
                }
              }
            });
          }, 1500);
        } else {
          this.showMessage(`❌ ${result.error || '登录失败'}`, 'error');
        }
      } catch (error) {
        console.error('开发者登录失败:', error);
        this.showMessage(`❌ ${error.message || '登录失败'}`, 'error');
      } finally {
        this.setData({ loading: false });
      }
    },

    /**
     * 设置使用次数
     */
    async setUsageCount() {
      const count = parseInt(this.data.inputValue);
      
      if (isNaN(count) || count < 0) {
        this.showMessage('请输入有效的非负整数', 'error');
        return;
      }

      await this.callDevAPI('set', { count });
    },

    /**
     * 增加使用次数
     */
    async addUsageCount() {
      const amount = parseInt(this.data.inputValue);
      
      if (isNaN(amount) || amount === 0) {
        this.showMessage('请输入非零数字', 'error');
        return;
      }

      await this.callDevAPI('add', { amount });
    },

    /**
     * 快速设置
     */
    async quickSet(e) {
      const count = parseInt(e.currentTarget.dataset.count);
      await this.callDevAPI('set', { count });
    },

    /**
     * 切换为免费用户
     */
    async switchToFree() {
      wx.showModal({
        title: '切换为免费用户',
        content: '将清除充值记录，设置为免费用户状态\n• has_ever_paid = false\n• usage_count = 3\n• payment_status = free',
        confirmText: '确认切换',
        cancelText: '取消',
        success: async (res) => {
          if (res.confirm) {
            await this.switchUserStatus('free', 3);
          }
        }
      });
    },

    /**
     * 切换为VIP用户
     */
    async switchToVIP() {
      wx.showModal({
        title: '切换为VIP用户',
        content: '将设置为已付费VIP用户状态\n• has_ever_paid = true\n• usage_count = 20\n• payment_status = premium',
        confirmText: '确认切换',
        cancelText: '取消',
        success: async (res) => {
          if (res.confirm) {
            await this.switchUserStatus('vip', 20);
          }
        }
      });
    },

    /**
     * 切换用户状态
     */
    async switchUserStatus(status, usageCount) {
      this.setData({ loading: true });

      try {
        const app = getApp();
        const userId = app.globalData.userId;

        if (!userId) {
          this.showMessage('用户ID不存在', 'error');
          return;
        }

        const response = await post('/api/dev/usage/switch-status', {
          userId,
          status,
          usageCount
        }, {
          showError: false
        });

        // 清除本地缓存
        wx.removeStorageSync('hasEverPaid');
        wx.removeStorageSync('paymentStatus');
        
        // 更新本地缓存
        const hasEverPaid = status === 'vip';
        const paymentStatus = status === 'vip' ? 'premium' : 'free';
        
        wx.setStorageSync('hasEverPaid', hasEverPaid);
        wx.setStorageSync('paymentStatus', paymentStatus);

        // 更新全局状态
        app.globalData.usageCount = response.data.newData.usage_count;
        app.globalData.userType = hasEverPaid ? 'paid' : 'free';

        this.showMessage(
          `✅ ${response.message}\n` +
          `新状态: ${hasEverPaid ? 'VIP用户' : '免费用户'}\n` +
          `使用次数: ${response.data.newData.usage_count}`,
          'success'
        );

        // 触发更新事件
        this.triggerEvent('update', {
          usageCount: response.data.newData.usage_count,
          hasEverPaid: hasEverPaid,
          paymentStatus: paymentStatus
        });

        // 提示刷新页面
        setTimeout(() => {
          wx.showModal({
            title: '状态已更新',
            content: '建议返回首页重新进入以刷新所有状态',
            confirmText: '返回首页',
            cancelText: '稍后',
            success: (res) => {
              if (res.confirm) {
                wx.reLaunch({ url: '/pages/launch/launch' });
              }
            }
          });
        }, 1500);

      } catch (error) {
        console.error('切换用户状态失败:', error);
        this.showMessage(`❌ ${error.message || '切换失败'}`, 'error');
      } finally {
        this.setData({ loading: false });
      }
    },

    /**
     * 调用开发者 API
     */
    async callDevAPI(action, params) {
      this.setData({ loading: true });

      try {
        const app = getApp();
        const userId = app.globalData.userId;

        if (!userId) {
          this.showMessage('用户ID不存在', 'error');
          return;
        }

        const response = await post(`/api/dev/usage/${action}`, {
          userId,
          ...params
        }, {
          showError: false
        });

        this.showMessage(
          `✅ ${response.message}\n新次数: ${response.data.newCount ?? response.data.count ?? 0}`,
          'success'
        );

        // 更新父组件
        const usageCount = response.data.newCount ?? response.data.count ?? 0;
        this.triggerEvent('update', {
          usageCount: usageCount
        });

        // 清空输入框
        this.setData({ inputValue: '' });
      } catch (error) {
        console.error('开发者API调用失败:', error);
        this.showMessage(`❌ ${error.message || '设置失败'}`, 'error');
      } finally {
        this.setData({ loading: false });
      }
    },

    /**
     * 显示消息
     */
    showMessage(message, type = 'info') {
      this.setData({
        message,
        messageType: type
      });

      // 3秒后自动隐藏
      setTimeout(() => {
        this.setData({
          message: ''
        });
      }, 3000);
    }
  }
});
