/**
 * 富贵变身模式生成中页面
 * Requirements: 2.3, 14.1-14.5
 * 
 * 功能：
 * - 复用 puzzle/generating 页面逻辑
 * - 实现任务轮询和进度展示
 * - 实现灯笼动画
 */

const { generationAPI } = require('../../../utils/api');
const { getAssetUrl } = require('../../../utils/oss-assets');

// 进度阶段配置
const PROGRESS_STAGES = [
  { progress: 10, text: '任务已创建', blessing: '福气满满' },
  { progress: 30, text: '连接AI服务', blessing: '好运连连' },
  { progress: 50, text: '生成艺术照', blessing: '喜气洋洋' },
  { progress: 70, text: '处理图片', blessing: '光彩照人' },
  { progress: 90, text: '优化细节', blessing: '精雕细琢' },
  { progress: 100, text: '完成', blessing: '恭喜发财' }
];

// 根据进度获取阶段信息
function getStageInfo(progress) {
  for (let i = PROGRESS_STAGES.length - 1; i >= 0; i--) {
    if (progress >= PROGRESS_STAGES[i].progress) {
      return PROGRESS_STAGES[i];
    }
  }
  return PROGRESS_STAGES[0];
}

Page({
  data: {
    isElderMode: false,
    taskId: '',
    recordId: '', // 历史记录ID，用于分享
    progress: 0,
    currentStage: '任务已创建',
    blessing: '福气满满',
    taskMessage: '',
    error: null,
    isRetrying: false,
    canRetry: true,
    retryCount: 0,
    lanternImageUrl: getAssetUrl('lantern.png')
  },

  // 轮询定时器
  pollTimer: null,
  // 进度动画定时器
  progressTimer: null,
  // 目标进度
  targetProgress: 0,

  onLoad(options) {
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode,
      taskId: options.taskId || '',
      recordId: options.recordId || '' // 接收历史记录ID
    });
    
    if (!options.taskId) {
      this.setData({
        error: '缺少任务ID，无法查询生成状态'
      });
      return;
    }
    
    console.log('[TransformGenerating] 页面加载，任务ID:', options.taskId, '历史记录ID:', options.recordId);
    
    // 开始轮询任务状态
    this.startPolling();
  },

  onShow() {
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
  },

  onUnload() {
    // 清理定时器
    this.stopPolling();
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
    }
  },

  /**
   * 开始轮询任务状态
   * Requirements: 14.1
   */
  startPolling() {
    console.log('[TransformGenerating] 开始轮询任务状态');
    
    // 立即查询一次
    this.checkTaskStatus();
    
    // 每2秒轮询一次
    this.pollTimer = setInterval(() => {
      this.checkTaskStatus();
    }, 2000);
  },

  /**
   * 停止轮询
   */
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  /**
   * 查询任务状态
   * Requirements: 14.1, 14.2
   */
  async checkTaskStatus() {
    const { taskId } = this.data;
    if (!taskId) return;
    
    try {
      // 使用新版任务状态接口，返回标准化格式
      const result = await generationAPI.getTask(taskId);
      console.log('[TransformGenerating] 任务状态:', result);
      
      if (!result.success) {
        throw new Error(result.message || '查询任务状态失败');
      }
      
      const task = result.data;
      
      // 更新进度
      this.updateProgress(task.progress || 0);
      
      // 更新消息
      if (task.message) {
        this.setData({ taskMessage: task.message });
      }
      
      // 更新重试信息
      if (task.retryCount !== undefined) {
        this.setData({
          retryCount: task.retryCount,
          canRetry: task.retryCount < (task.maxRetries || 3)
        });
      }
      
      // 检查任务状态
      if (task.status === 'completed') {
        console.log('[TransformGenerating] 任务完成！');
        this.stopPolling();
        this.handleTaskComplete(task);
      } else if (task.status === 'failed') {
        console.log('[TransformGenerating] 任务失败:', task.message);
        this.stopPolling();
        this.setData({
          error: task.message || '生成失败，请重试'
        });
      }
      
    } catch (err) {
      console.error('[TransformGenerating] 查询状态失败:', err);
      // 不立即显示错误，继续轮询
    }
  },

  /**
   * 更新进度（平滑动画）
   * Requirements: 14.2
   */
  updateProgress(targetProgress) {
    this.targetProgress = targetProgress;
    
    // 如果已有动画定时器，不重复创建
    if (this.progressTimer) return;
    
    this.progressTimer = setInterval(() => {
      const { progress } = this.data;
      
      if (progress >= this.targetProgress) {
        clearInterval(this.progressTimer);
        this.progressTimer = null;
        return;
      }
      
      // 平滑增加进度
      const increment = Math.max(1, (this.targetProgress - progress) * 0.1);
      const newProgress = Math.min(progress + increment, this.targetProgress);
      
      // 获取阶段信息
      const stageInfo = getStageInfo(newProgress);
      
      this.setData({
        progress: Math.round(newProgress),
        currentStage: stageInfo.text,
        blessing: stageInfo.blessing
      });
    }, 100);
  },

  /**
   * 任务完成处理
   * Requirements: 14.4
   */
  handleTaskComplete(task) {
    const app = getApp();
    const transformData = app.globalData.transformData || {};
    
    // 更新进度到100%
    this.setData({
      progress: 100,
      currentStage: '完成',
      blessing: '恭喜发财'
    });
    
    // 获取生成的图片
    const generatedImages = task.result?.images || [];
    console.log('[TransformGenerating] 生成图片数量:', generatedImages.length);
    
    // 保存到历史记录（仅在生成完成时保存一次）
    const { saveHistory } = require('../../../utils/storage');
    const { recordId, taskId } = this.data;
    const historyItem = {
      id: recordId || taskId, // 优先使用 recordId 作为 ID
      taskId: taskId, // 保留 taskId 用于兼容
      recordId: recordId, // 保存 recordId 用于分享
      originalImages: transformData.uploadedImages || [],
      generatedImage: generatedImages[0] || '',
      generatedImages: generatedImages,
      createdAt: new Date().toISOString(),
      isPaid: false,
      mode: 'transform'
    };
    saveHistory(historyItem);
    console.log('[TransformGenerating] 已保存到历史记录, recordId:', recordId, 'taskId:', taskId);
    
    // 存储结果
    app.globalData.transformData = {
      ...transformData,
      generatedImages,
      taskId: this.data.taskId
    };
    
    // 延迟跳转
    setTimeout(() => {
      const { recordId } = this.data;
      const generationId = recordId || this.data.taskId; // 优先使用 recordId，否则使用 taskId
      
      if (generatedImages.length === 1) {
        // 只有一张图片，直接跳转到结果页
        wx.redirectTo({
          url: `/pages/transform/result/result?image=${encodeURIComponent(generatedImages[0])}&generationId=${generationId}`
        });
      } else {
        // 多张图片，跳转到选择页
        wx.redirectTo({
          url: '/pages/transform/result-selector/result-selector'
        });
      }
    }, 1000);
  },

  /**
   * 重试生成
   * Requirements: 14.5
   */
  async handleRetry() {
    const { taskId, isRetrying, canRetry } = this.data;
    
    if (!taskId || isRetrying || !canRetry) return;
    
    console.log('[TransformGenerating] 用户点击重试');
    
    this.setData({
      isRetrying: true,
      error: null,
      progress: 0,
      currentStage: '任务已创建',
      blessing: '福气满满'
    });
    
    try {
      const result = await generationAPI.retryTask(taskId);
      console.log('[TransformGenerating] 重试结果:', result);
      
      if (!result.success) {
        throw new Error(result.message || '重试失败');
      }
      
      // 重新开始轮询
      this.startPolling();
      
    } catch (err) {
      console.error('[TransformGenerating] 重试失败:', err);
      this.setData({
        error: err.message || '重试失败，请稍后再试'
      });
    } finally {
      this.setData({ isRetrying: false });
    }
  },

  /**
   * 返回首页
   */
  goHome() {
    wx.redirectTo({
      url: '/pages/launch/launch'
    });
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '富贵变身 - AI正在为我生成豪门背景！',
      path: '/pages/transform/launch/launch',
      imageUrl: '/assets/images/share-transform.png'
    };
  }
});
