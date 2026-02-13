/**
 * 背景音乐管理器
 * 用于管理小程序背景音乐的播放、暂停、停止等操作
 */

const STORAGE_KEY_MUTED = 'caishen_music_muted';
const STORAGE_KEY_VOLUME = 'caishen_music_volume';

class BackgroundMusicManager {
  constructor() {
    this.audioContext = null;
    this.isInitialized = false;
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 0.6;
    this.retryCount = 0;
    this.maxRetries = 1;
  }

  /**
   * 初始化音乐管理器
   * @param {string} musicUrl - 音乐文件 URL
   * @param {Object} options - 配置选项
   * @param {number} options.volume - 音量 (0-1)
   * @param {boolean} options.loop - 是否循环
   * @param {boolean} options.autoplay - 是否自动播放
   */
  init(musicUrl, options = {}) {
    if (this.isInitialized) {
      console.warn('[BackgroundMusic] 已经初始化，跳过');
      return;
    }

    try {
      // 从存储中读取用户偏好
      const savedMuted = wx.getStorageSync(STORAGE_KEY_MUTED);
      const savedVolume = wx.getStorageSync(STORAGE_KEY_VOLUME);
      
      this.isMuted = savedMuted === true;
      this.volume = savedVolume || options.volume || 0.6;

      // 创建音频上下文
      this.audioContext = wx.createInnerAudioContext();
      this.audioContext.src = musicUrl;
      this.audioContext.loop = options.loop !== false;
      this.audioContext.volume = this.isMuted ? 0 : this.volume;
      this.audioContext.autoplay = false; // 不自动播放，等待视频播放

      // 监听播放事件
      this.audioContext.onPlay(() => {
        console.log('[BackgroundMusic] 开始播放');
        this.isPlaying = true;
        this.retryCount = 0;
      });

      // 监听暂停事件
      this.audioContext.onPause(() => {
        console.log('[BackgroundMusic] 暂停播放');
        this.isPlaying = false;
      });

      // 监听停止事件
      this.audioContext.onStop(() => {
        console.log('[BackgroundMusic] 停止播放');
        this.isPlaying = false;
      });

      // 监听播放结束事件
      this.audioContext.onEnded(() => {
        console.log('[BackgroundMusic] 播放结束');
        this.isPlaying = false;
      });

      // 监听错误事件
      this.audioContext.onError((error) => {
        console.error('[BackgroundMusic] 播放失败:', error);
        this.isPlaying = false;
        
        // 自动重试一次
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          console.log(`[BackgroundMusic] 尝试重新播放 (${this.retryCount}/${this.maxRetries})`);
          setTimeout(() => {
            if (this.audioContext) {
              this.audioContext.play();
            }
          }, 1000);
        }
      });

      this.isInitialized = true;
      console.log('[BackgroundMusic] 初始化成功');
      
    } catch (error) {
      console.error('[BackgroundMusic] 初始化失败:', error);
      // 静默失败，不影响视频播放
    }
  }

  /**
   * 播放音乐
   */
  play() {
    if (!this.audioContext || !this.isInitialized) {
      console.warn('[BackgroundMusic] 未初始化，无法播放');
      return;
    }

    try {
      this.audioContext.play();
    } catch (error) {
      console.error('[BackgroundMusic] 播放失败:', error);
    }
  }

  /**
   * 暂停音乐
   */
  pause() {
    if (!this.audioContext || !this.isInitialized) {
      return;
    }

    try {
      this.audioContext.pause();
    } catch (error) {
      console.error('[BackgroundMusic] 暂停失败:', error);
    }
  }

  /**
   * 停止音乐
   */
  stop() {
    if (!this.audioContext || !this.isInitialized) {
      return;
    }

    try {
      this.audioContext.stop();
    } catch (error) {
      console.error('[BackgroundMusic] 停止失败:', error);
    }
  }

  /**
   * 切换静音状态
   * @returns {boolean} 新的静音状态
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    
    // 保存到存储
    wx.setStorageSync(STORAGE_KEY_MUTED, this.isMuted);
    
    // 应用静音状态
    if (this.audioContext) {
      this.audioContext.volume = this.isMuted ? 0 : this.volume;
    }
    
    console.log('[BackgroundMusic] 静音状态:', this.isMuted);
    return this.isMuted;
  }

  /**
   * 设置音量
   * @param {number} volume - 音量 (0-1)
   */
  setVolume(volume) {
    if (volume < 0 || volume > 1) {
      console.warn('[BackgroundMusic] 音量必须在 0-1 之间');
      return;
    }

    this.volume = volume;
    
    // 保存到存储
    wx.setStorageSync(STORAGE_KEY_VOLUME, volume);
    
    // 应用音量（如果未静音）
    if (this.audioContext && !this.isMuted) {
      this.audioContext.volume = volume;
    }
    
    console.log('[BackgroundMusic] 音量设置为:', volume);
  }

  /**
   * 获取静音状态
   * @returns {boolean}
   */
  getMuted() {
    return this.isMuted;
  }

  /**
   * 获取播放状态
   * @returns {boolean}
   */
  getPlaying() {
    return this.isPlaying;
  }

  /**
   * 销毁音乐实例
   */
  destroy() {
    if (this.audioContext) {
      try {
        this.audioContext.stop();
        this.audioContext.destroy();
        console.log('[BackgroundMusic] 实例已销毁');
      } catch (error) {
        console.error('[BackgroundMusic] 销毁失败:', error);
      }
      
      this.audioContext = null;
      this.isInitialized = false;
      this.isPlaying = false;
    }
  }
}

// 导出单例
let instance = null;

module.exports = {
  /**
   * 获取音乐管理器实例
   * @returns {BackgroundMusicManager}
   */
  getInstance() {
    if (!instance) {
      instance = new BackgroundMusicManager();
    }
    return instance;
  },
  
  /**
   * 重置实例（用于测试）
   */
  resetInstance() {
    if (instance) {
      instance.destroy();
      instance = null;
    }
  }
};
