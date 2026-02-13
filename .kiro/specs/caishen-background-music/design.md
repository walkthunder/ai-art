# 财神视频背景音乐功能设计文档

## 1. 架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    小程序前端                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         result.js (财神结果页)                     │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │  视频播放器 (video component)               │  │  │
│  │  │  - onPlay / onPause / onEnded              │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  │                      ↕                            │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │  音乐管理器 (BackgroundMusicManager)       │  │  │
│  │  │  - play() / pause() / stop()               │  │  │
│  │  │  - setVolume() / toggleMute()              │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  │                      ↕                            │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │  音频上下文 (InnerAudioContext)            │  │  │
│  │  │  - wx.createInnerAudioContext()            │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────┐
│                    OSS 存储                               │
├─────────────────────────────────────────────────────────┤
│  - caishen-bgm-1.mp3 (恭喜发财)                          │
│  - caishen-bgm-2.mp3 (财神到)                            │
│  - caishen-bgm-3.mp3 (招财进宝)                          │
└─────────────────────────────────────────────────────────┘
```

### 1.2 模块划分

#### 1.2.1 BackgroundMusicManager (音乐管理器)
- **职责**: 管理背景音乐的播放、暂停、停止
- **位置**: `miniprogram/utils/backgroundMusicManager.js`
- **接口**:
  - `init(musicUrl, options)`: 初始化音乐
  - `play()`: 播放音乐
  - `pause()`: 暂停音乐
  - `stop()`: 停止音乐
  - `destroy()`: 销毁音乐实例
  - `toggleMute()`: 切换静音状态
  - `setVolume(volume)`: 设置音量
  - `isMuted()`: 获取静音状态

#### 1.2.2 MusicConfig (音乐配置)
- **职责**: 管理音乐资源配置
- **位置**: `miniprogram/config/music.js`
- **内容**:
  - 音乐文件 URL 列表
  - 默认音量配置
  - 音乐元数据（名称、时长等）

#### 1.2.3 Result Page (结果页面)
- **职责**: 集成音乐管理器，处理视频与音乐同步
- **位置**: `miniprogram/pages/caishen/result/result.js`
- **功能**:
  - 监听视频播放事件
  - 调用音乐管理器 API
  - 处理用户交互（静音按钮）

## 2. 数据流设计

### 2.1 音乐播放流程

```
用户进入结果页
    ↓
加载音乐配置
    ↓
初始化 BackgroundMusicManager
    ↓
预加载音乐文件
    ↓
用户点击播放视频
    ↓
触发 onPlay 事件
    ↓
调用 musicManager.play()
    ↓
音乐开始播放
    ↓
视频播放中...
    ↓
用户暂停视频 / 视频播放结束
    ↓
触发 onPause / onEnded 事件
    ↓
调用 musicManager.pause() / stop()
    ↓
音乐暂停 / 停止
```

### 2.2 静音控制流程

```
用户点击静音按钮
    ↓
调用 musicManager.toggleMute()
    ↓
更新静音状态到 Storage
    ↓
更新 UI 显示（图标切换）
    ↓
如果当前正在播放
    ↓
应用静音状态（音量设为 0 或恢复）
```

## 3. 接口设计

### 3.1 BackgroundMusicManager API

```javascript
class BackgroundMusicManager {
  /**
   * 初始化音乐管理器
   * @param {string} musicUrl - 音乐文件 URL
   * @param {Object} options - 配置选项
   * @param {number} options.volume - 音量 (0-1)
   * @param {boolean} options.loop - 是否循环
   * @param {boolean} options.autoplay - 是否自动播放
   */
  init(musicUrl, options = {}) {}

  /**
   * 播放音乐
   * @returns {Promise<void>}
   */
  async play() {}

  /**
   * 暂停音乐
   */
  pause() {}

  /**
   * 停止音乐
   */
  stop() {}

  /**
   * 销毁音乐实例
   */
  destroy() {}

  /**
   * 切换静音状态
   * @returns {boolean} 新的静音状态
   */
  toggleMute() {}

  /**
   * 设置音量
   * @param {number} volume - 音量 (0-1)
   */
  setVolume(volume) {}

  /**
   * 获取静音状态
   * @returns {boolean}
   */
  isMuted() {}

  /**
   * 获取播放状态
   * @returns {boolean}
   */
  isPlaying() {}
}
```

### 3.2 音乐配置接口

```javascript
// miniprogram/config/music.js
module.exports = {
  // 财神模式音乐列表
  caishen: [
    {
      id: 'caishen-bgm-1',
      name: '恭喜发财',
      url: 'https://wms.webinfra.cloud/music/caishen-bgm-1.mp3',
      duration: 45, // 秒
      loop: true
    },
    {
      id: 'caishen-bgm-2',
      name: '财神到',
      url: 'https://wms.webinfra.cloud/music/caishen-bgm-2.mp3',
      duration: 50,
      loop: true
    }
  ],
  
  // 默认配置
  defaultConfig: {
    volume: 0.6,
    loop: true,
    autoplay: false
  }
};
```

## 4. UI 设计

### 4.1 静音按钮位置（最小侵入式）

**方案：复用现有导航栏的 nav-right 区域**

```
┌─────────────────────────────────────┐
│  [<]  财神变身         [🔊/🔇]      │  ← 复用 nav-right
├─────────────────────────────────────┤
│                                      │
│         ┌─────────────────┐         │
│         │   视频播放器     │         │
│         └─────────────────┘         │
│                                      │
│         [保存视频] [分享]            │
└─────────────────────────────────────┘
```

**优势**：
- 不需要修改 WXML 结构，只需在现有的 `<view class="nav-right"></view>` 中添加内容
- 不影响现有布局和样式
- 与返回按钮对称，符合用户习惯

### 4.2 静音按钮样式

- **开启音乐**: 🔊 图标，颜色为 #FFD700（金色）
- **静音状态**: 🔇 图标，颜色为 #999（灰色）
- **按钮大小**: 44x44 rpx（符合小程序点击区域规范）
- **位置**: nav-right 内，右对齐
- **样式**: 复用 back-btn 的样式，保持一致性

## 5. 状态管理

### 5.1 音乐状态

```javascript
{
  // 音乐实例
  audioContext: null,
  
  // 播放状态
  isPlaying: false,
  isPaused: false,
  
  // 静音状态
  isMuted: false,
  
  // 音量
  volume: 0.6,
  
  // 当前音乐
  currentMusic: {
    id: 'caishen-bgm-1',
    name: '恭喜发财',
    url: 'https://...'
  }
}
```

### 5.2 持久化存储

使用 `wx.setStorageSync` 存储用户偏好：

```javascript
{
  'caishen_music_muted': false,  // 静音状态
  'caishen_music_volume': 0.6    // 音量（可选）
}
```

## 6. 错误处理

### 6.1 音乐加载失败

```javascript
try {
  await musicManager.init(musicUrl);
} catch (error) {
  console.error('[音乐] 加载失败:', error);
  // 不影响视频播放，静默失败
  // 可选：显示提示"背景音乐加载失败"
}
```

### 6.2 播放失败

```javascript
audioContext.onError((error) => {
  console.error('[音乐] 播放失败:', error);
  // 自动重试一次
  if (retryCount < 1) {
    retryCount++;
    setTimeout(() => {
      audioContext.play();
    }, 1000);
  }
});
```

### 6.3 网络异常

```javascript
// 监听网络状态
wx.onNetworkStatusChange((res) => {
  if (!res.isConnected && musicManager.isPlaying()) {
    // 网络断开，暂停音乐
    musicManager.pause();
  }
});
```

## 7. 性能优化

### 7.1 预加载策略

```javascript
// 在页面 onLoad 时预加载音乐
onLoad() {
  // 预加载音乐（不播放）
  musicManager.init(musicUrl, { autoplay: false });
}
```

### 7.2 资源释放

```javascript
// 页面卸载时释放资源
onUnload() {
  if (musicManager) {
    musicManager.destroy();
  }
}
```

### 7.3 音乐文件优化

- 使用 MP3 格式，128kbps 码率
- 文件大小控制在 300-500KB
- 使用 CDN 加速
- 启用 HTTP/2

## 8. 测试计划

### 8.1 单元测试

- BackgroundMusicManager 各方法测试
- 静音状态持久化测试
- 音量控制测试

### 8.2 集成测试

- 视频与音乐同步测试
- 页面切换音乐状态测试
- 网络异常恢复测试

### 8.3 兼容性测试

- iOS 不同版本测试
- Android 不同版本测试
- 不同网络环境测试

### 8.4 性能测试

- 音乐加载时间测试
- 内存占用测试
- CPU 占用测试

## 9. 部署计划

### 9.1 阶段一：开发环境（1天）
- 实现 BackgroundMusicManager
- 集成到结果页面
- 本地测试

### 9.2 阶段二：测试环境（1天）
- 上传音乐文件到 OSS
- 配置 CDN
- 完整功能测试

### 9.3 阶段三：生产环境（1天）
- 小程序代码审核
- 灰度发布
- 监控数据

## 10. 监控指标

### 10.1 功能指标
- 音乐播放成功率
- 音乐加载时间
- 静音按钮点击率

### 10.2 性能指标
- 页面加载时间
- 内存占用
- CPU 占用

### 10.3 用户行为指标
- 音乐开启率
- 音乐关闭率
- 平均播放时长

## 11. 风险与缓解

### 11.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 音乐与视频不同步 | 中 | 中 | 使用视频事件精确控制 |
| 音乐加载失败 | 低 | 低 | 静默失败，不影响视频 |
| 内存泄漏 | 高 | 低 | 页面卸载时释放资源 |

### 11.2 用户体验风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 用户不喜欢音乐 | 中 | 中 | 提供明显的静音按钮 |
| 音乐太吵 | 低 | 低 | 默认音量 60% |
| 音乐不匹配 | 低 | 低 | 选择喜庆的传统音乐 |

## 12. 后续优化

### 12.1 短期优化
- 支持多首音乐随机播放
- 添加音量调节滑块
- 优化音乐加载速度

### 12.2 中期优化
- 扩展到其他模式
- 支持音乐淡入淡出
- 添加音乐可视化效果

### 12.3 长期优化
- AI 生成个性化音乐
- 音乐与视频内容智能匹配
- 用户自定义音乐上传
