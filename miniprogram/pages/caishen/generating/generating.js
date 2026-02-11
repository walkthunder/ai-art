/**
 * 财神变身模式生成中页面
 * 
 * 功能：
 * - 轮询查询生成状态
 * - 显示生成进度
 * - 完成后跳转结果页
 */

const { generationAPI } = require('../../../utils/api');

Page({
  data: {
    taskId: '',
    recordId: '',
    status: 'processing',
    progress: 0,
    statusText: '正在生成财神视频...',
    errorMessage: '',
    pollingTimer: null,
    pollingCount: 0,
    maxPollingCount: 120
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
    if (this.data.pollingTimer) {
      clearTimeout(this.data.pollingTimer);
    }
  },

  startPolling() {
    this.pollTaskStatus();
  },

  async pollTaskStatus() {
    const { taskId, pollingCount, maxPollingCount } = this.data;
    
    if (pollingCount >= maxPollingCount) {
      this.setData({
        status: 'failed',
        errorMessage: '生成超时，请稍后重试'
      });
      return;
    }
    
    try {
      // 调用财神视频任务状态查询API
      const API_BASE_URL = require('../../../config/api').API_BASE_URL;
      const response = await wx.request({
        url: `${API_BASE_URL}/api/caishen/task/${taskId}`,
        method: 'GET'
      });
      
      if (response.statusCode === 200 && response.data.success) {
        const taskStatus = response.data.data;
        const { status, videoUrl } = taskStatus;
        
        // 更新进度
        const newProgress = taskStatus.progress || Math.min(90, 10 + pollingCount * 2);
        this.setData({
          progress: newProgress,
          statusText: taskStatus.message || '正在生成财神视频...'
        });
        
        if (status === 'succeeded' && videoUrl) {
          // 生成成功
          this.setData({
            status: 'completed',
            progress: 100,
            statusText: '生成完成！'
          });
          
          // 将视频URL存储到globalData，避免URL过长
          const app = getApp();
          app.globalData.caishenData = {
            videoUrl: videoUrl,
            taskId: taskId,
            recordId: this.data.recordId
          };
          
          setTimeout(() => {
            wx.redirectTo({
              url: `/pages/caishen/result/result?taskId=${taskId}&recordId=${this.data.recordId}`,
              fail: () => {
                wx.showToast({
                  title: '跳转失败',
                  icon: 'none'
                });
              }
            });
          }, 500);
          
        } else if (status === 'failed' || status === 'expired') {
          // 生成失败
          this.setData({
            status: 'failed',
            errorMessage: taskStatus.message || '生成失败，请重试'
          });
          
        } else {
          // 继续轮询
          this.setData({
            pollingCount: pollingCount + 1
          });
          
          const timer = setTimeout(() => {
            this.pollTaskStatus();
          }, 3000); // 每3秒查询一次
          
          this.setData({ pollingTimer: timer });
        }
      } else {
        throw new Error(response.data?.message || '查询失败');
      }
      
    } catch (err) {
      console.error('[CaishenGenerating] 查询状态失败:', err);
      
      if (pollingCount < maxPollingCount) {
        this.setData({
          pollingCount: pollingCount + 1
        });
        
        const timer = setTimeout(() => {
          this.pollTaskStatus();
        }, 5000); // 出错后等待5秒重试
        
        this.setData({ pollingTimer: timer });
      } else {
        this.setData({
          status: 'failed',
          errorMessage: '网络异常，请稍后重试'
        });
      }
    }
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
