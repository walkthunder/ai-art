/**
 * 时空拼图模式生成中页面
 * Requirements: 2.2, 14.1-14.5
 * 
 * 功能：
 * - 复用原网页 GeneratingPage 样式
 * - 实现任务轮询和进度展示
 * - 实现灯笼动画
 */

const { generationAPI } = require('../../../utils/api');
const { getAssetUrl } = require('../../../utils/oss-assets');

// 进度阶段配置
const PROGRESS_STAGES = [
  { progress: 10, text: '任务已创建', blessing: '福气满满' },
  { progress: 30, text: '连接AI服务', blessing: '好运连连' },
  { progress: 50, text: '合成全家福', blessing: '阖家欢乐' },
  { progress: 70, text: '处理图片', blessing: '光彩照人' },
  { progress: 90, text: '优化细节', blessing: '精雕细琢' },
  { progress: 100, text: '完成', blessing: '恭喜发财' }
];

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

  pollTimer: null,
  progressTimer: null,
  targetProgress: 0,

  onLoad(options) {
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode,
      taskId: options.taskId || ''
    });
    
    if (!options.taskId) {
      this.setData({ error: '缺少任务ID，无法查询生成状态' });
      return;
    }
    
    console.log('[PuzzleGenerating] 页面加载，任务ID:', options.taskId);
    this.startPolling();
  },

  onShow() {
    const app = getApp();
    this.setData({ isElderMode: app.globalData.isElderMode });
  },

  onUnload() {
    this.stopPolling();
    if (this.progressTimer) clearInterval(this.progressTimer);
  },

  startPolling() {
    console.log('[PuzzleGenerating] 开始轮询任务状态');
    this.checkTaskStatus();
    this.pollTimer = setInterval(() => this.checkTaskStatus(), 2000);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  async checkTaskStatus() {
    const { taskId } = this.data;
    if (!taskId) return;
    
    try {
      // 使用新版任务状态接口，返回标准化格式
      const result = await generationAPI.getTask(taskId);
      console.log('[PuzzleGenerating] 任务状态:', result);
      
      if (!result.success) throw new Error(result.message || '查询任务状态失败');
      
      const task = result.data;
      this.updateProgress(task.progress || 0);
      
      if (task.message) this.setData({ taskMessage: task.message });
      if (task.retryCount !== undefined) {
        this.setData({
          retryCount: task.retryCount,
          canRetry: task.retryCount < (task.maxRetries || 3)
        });
      }
      
      if (task.status === 'completed') {
        console.log('[PuzzleGenerating] 任务完成！');
        this.stopPolling();
        this.handleTaskComplete(task);
      } else if (task.status === 'failed') {
        console.log('[PuzzleGenerating] 任务失败:', task.message);
        this.stopPolling();
        this.setData({ error: task.message || '生成失败，请重试' });
      }
    } catch (err) {
      console.error('[PuzzleGenerating] 查询状态失败:', err);
    }
  },

  updateProgress(targetProgress) {
    this.targetProgress = targetProgress;
    if (this.progressTimer) return;
    
    this.progressTimer = setInterval(() => {
      const { progress } = this.data;
      if (progress >= this.targetProgress) {
        clearInterval(this.progressTimer);
        this.progressTimer = null;
        return;
      }
      
      const increment = Math.max(1, (this.targetProgress - progress) * 0.1);
      const newProgress = Math.min(progress + increment, this.targetProgress);
      const stageInfo = getStageInfo(newProgress);
      
      this.setData({
        progress: Math.round(newProgress),
        currentStage: stageInfo.text,
        blessing: stageInfo.blessing
      });
    }, 100);
  },

  async handleTaskComplete(task) {
    const app = getApp();
    const puzzleData = app.globalData.puzzleData || {};
    
    this.setData({ progress: 100, currentStage: '完成', blessing: '恭喜发财' });
    
    const generatedImages = task.result?.images || [];
    console.log('[PuzzleGenerating] 生成图片数量:', generatedImages.length);
    
    // 保存到历史记录（仅在生成完成时保存一次）
    const { saveHistory } = require('../../../utils/storage');
    const historyItem = {
      id: this.data.taskId,
      originalImages: puzzleData.uploadedImages || [],
      generatedImage: generatedImages[0] || '',
      generatedImages: generatedImages,
      createdAt: new Date().toISOString(),
      isPaid: false,
      mode: 'puzzle'
    };
    saveHistory(historyItem);
    console.log('[PuzzleGenerating] 已保存到历史记录:', this.data.taskId);
    
    app.globalData.puzzleData = { ...puzzleData, generatedImages, taskId: this.data.taskId };
    
    setTimeout(() => {
      if (generatedImages.length === 1) {
        wx.redirectTo({ url: `/pages/puzzle/result/result?image=${encodeURIComponent(generatedImages[0])}&generationId=${this.data.taskId}` });
      } else {
        wx.redirectTo({ url: '/pages/puzzle/result-selector/result-selector' });
      }
    }, 1000);
  },

  async handleRetry() {
    const { taskId, isRetrying, canRetry } = this.data;
    if (!taskId || isRetrying || !canRetry) return;
    
    console.log('[PuzzleGenerating] 用户点击重试');
    this.setData({ isRetrying: true, error: null, progress: 0, currentStage: '任务已创建', blessing: '福气满满' });
    
    try {
      const result = await generationAPI.retryTask(taskId);
      if (!result.success) throw new Error(result.message || '重试失败');
      this.startPolling();
    } catch (err) {
      console.error('[PuzzleGenerating] 重试失败:', err);
      this.setData({ error: err.message || '重试失败，请稍后再试' });
    } finally {
      this.setData({ isRetrying: false });
    }
  },

  goHome() {
    wx.redirectTo({ url: '/pages/launch/launch' });
  },

  onShareAppMessage() {
    return {
      title: '时空拼图 - AI正在为我合成全家福！',
      path: '/pages/puzzle/launch/launch',
      imageUrl: '/assets/images/share-puzzle.png'
    };
  }
});
