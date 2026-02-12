/**
 * 财神变身模式生成中页面
 * 
 * 功能：
 * - 轮询查询生成状态
 * - 显示生成进度
 * - 完成后跳转结果页
 */

Page({
  // 常量配置
  POLLING_INTERVAL: 3000,        // 轮询间隔 3秒
  REQUEST_TIMEOUT: 10000,        // 请求超时 10秒
  REDIRECT_DELAY: 500,           // 跳转延迟 0.5秒
  MAX_SUCCESSFUL_POLLS: 180,     // 最大成功轮询次数 (9分钟)
  MAX_CONSECUTIVE_ERRORS: 5,     // 最大连续错误次数
  MIN_BACKOFF_DELAY: 3000,       // 最小退避延迟 3秒
  MAX_BACKOFF_DELAY: 30000,      // 最大退避延迟 30秒

  data: {
    taskId: '',
    recordId: '',
    status: 'processing',
    progress: 0,
    statusText: '正在生成财神视频...',
    errorMessage: '',
    pollingTimer: null,
    redirectTimer: null,           // 跳转定时器
    successfulPolls: 0,            // 成功轮询次数
    consecutiveErrors: 0,          // 连续错误计数
    canRetry: false                // 是否可以重试
  },

  onLoad(options) {
    const { taskId, recordId } = options;
    
    if (!taskId) {
      wx.showToast({
        title: '缺少任务ID',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    this.setData({
      taskId,
      recordId: recordId || ''
    });
    
    this.startPolling();
  },

  onUnload() {
    this.clearAllTimers();
  },

  startPolling() {
    this.pollTaskStatus();
  },

  async pollTaskStatus() {
    const { taskId, successfulPolls, consecutiveErrors } = this.data;
    
    // 检查成功轮询次数
    if (successfulPolls >= this.MAX_SUCCESSFUL_POLLS) {
      this.handleTimeout();
      return;
    }
    
    // 检查连续错误次数
    if (consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
      this.handleNetworkError();
      return;
    }
    
    try {
      // 调用财神视频任务状态查询API
      const API_BASE_URL = require('../../../config/api').API_BASE_URL;
      const response = await wx.request({
        url: `${API_BASE_URL}/api/caishen/task/${taskId}`,
        method: 'GET',
        timeout: this.REQUEST_TIMEOUT
      });
      
      // 处理 HTTP 错误
      if (response.statusCode !== 200) {
        throw new Error(`HTTP ${response.statusCode}: ${response.data?.message || '服务器错误'}`);
      }
      
      // 处理业务错误
      if (!response.data.success) {
        const errorMsg = response.data.message || '查询失败';
        
        // 业务错误（如任务不存在）不应重试
        if (response.statusCode === 404 || errorMsg.includes('不存在')) {
          this.clearPollingTimer();
          this.setData({
            status: 'failed',
            errorMessage: errorMsg,
            canRetry: false
          });
          return;
        }
        
        throw new Error(errorMsg);
      }
      
      const taskStatus = response.data.data;
      const { status, videoUrl } = taskStatus;
      
      // 请求成功，重置连续错误计数，增加成功轮询计数
      const newSuccessfulPolls = successfulPolls + 1;
      this.setData({
        consecutiveErrors: 0,
        successfulPolls: newSuccessfulPolls
      });
      
      // 更新进度：优先使用后端进度，否则根据轮询次数估算
      let newProgress = 10;
      if (taskStatus.progress !== undefined && taskStatus.progress !== null) {
        // 验证进度范围 0-100
        newProgress = Math.max(0, Math.min(100, taskStatus.progress));
      } else {
        // 前端估算：10% 起步，每次增加 0.4%，最高到 85%
        newProgress = Math.min(85, 10 + newSuccessfulPolls * 0.4);
      }
      
      this.setData({
        progress: newProgress,
        statusText: taskStatus.message || '正在生成财神视频...'
      });
      
      if (status === 'succeeded' && videoUrl) {
        // 生成成功
        this.handleSuccess(videoUrl);
        
      } else if (status === 'failed' || status === 'expired') {
        // 生成失败，清理定时器
        this.clearPollingTimer();
        
        this.setData({
          status: 'failed',
          errorMessage: taskStatus.message || '生成失败，请重试',
          canRetry: true
        });
        
      } else {
        // 继续轮询
        const timer = setTimeout(() => {
          this.pollTaskStatus();
        }, this.POLLING_INTERVAL);
        
        this.setData({ pollingTimer: timer });
      }
      
    } catch (err) {
      console.error('[CaishenGenerating] 查询状态失败:', err);
      
      const newConsecutiveErrors = consecutiveErrors + 1;
      
      this.setData({
        consecutiveErrors: newConsecutiveErrors
      });
      
      // 指数退避: 3s, 6s, 12s, 24s, 30s(max)
      const delay = Math.min(
        this.MAX_BACKOFF_DELAY, 
        this.MIN_BACKOFF_DELAY * Math.pow(2, newConsecutiveErrors - 1)
      );
      
      console.log(`[CaishenGenerating] 第${newConsecutiveErrors}次连续错误，${delay/1000}秒后重试`);
      
      const timer = setTimeout(() => {
        this.pollTaskStatus();
      }, delay);
      
      this.setData({ pollingTimer: timer });
    }
  },

  handleSuccess(videoUrl) {
    // 清理轮询定时器
    this.clearPollingTimer();
    
    this.setData({
      status: 'completed',
      progress: 100,
      statusText: '生成完成！'
    });
    
    // 将视频URL存储到globalData，避免URL过长
    const app = getApp();
    app.globalData.caishenData = {
      videoUrl: videoUrl,
      taskId: this.data.taskId,
      recordId: this.data.recordId
    };
    
    // 延迟跳转，保存定时器引用以便清理
    const redirectTimer = setTimeout(() => {
      wx.redirectTo({
        url: `/pages/caishen/result/result?taskId=${this.data.taskId}&recordId=${this.data.recordId}`,
        fail: () => {
          wx.showToast({
            title: '跳转失败',
            icon: 'none'
          });
        }
      });
    }, this.REDIRECT_DELAY);
    
    this.setData({ redirectTimer });
  },

  clearPollingTimer() {
    if (this.data.pollingTimer) {
      clearTimeout(this.data.pollingTimer);
      this.setData({ pollingTimer: null });
    }
  },

  clearRedirectTimer() {
    if (this.data.redirectTimer) {
      clearTimeout(this.data.redirectTimer);
      this.setData({ redirectTimer: null });
    }
  },

  clearAllTimers() {
    this.clearPollingTimer();
    this.clearRedirectTimer();
  },

  handleTimeout() {
    console.error('[CaishenGenerating] 生成超时');
    this.clearPollingTimer();
    
    this.setData({
      status: 'failed',
      errorMessage: '生成时间较长，请稍后在"我的"页面查看历史记录',
      canRetry: true
    });
  },

  handleNetworkError() {
    console.error('[CaishenGenerating] 网络连接失败');
    this.clearPollingTimer();
    
    this.setData({
      status: 'failed',
      errorMessage: '网络连接不稳定，请检查网络后重试',
      canRetry: true
    });
  },

  // 重试生成
  handleRetry() {
    if (!this.data.canRetry) {
      return;
    }
    
    this.setData({
      status: 'processing',
      progress: 0,
      statusText: '正在生成财神视频...',
      errorMessage: '',
      successfulPolls: 0,
      consecutiveErrors: 0,
      canRetry: false
    });
    
    this.startPolling();
  },

  // 返回首页
  goHome() {
    wx.redirectTo({
      url: '/pages/caishen/launch/launch',
      fail: () => {
        wx.navigateBack();
      }
    });
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/caishen/launch/launch'
        });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '财神变身 - 正在生成中',
      path: '/pages/caishen/launch/launch',
      imageUrl: '/assets/images/share-caishen.png'
    };
  }
});
