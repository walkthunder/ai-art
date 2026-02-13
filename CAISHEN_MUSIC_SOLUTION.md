# 财神视频背景音乐技术方案

## 📋 方案概述

为财神变身视频添加背景音乐功能，在小程序播放无声视频时同步播放喜庆的背景音乐，提升用户体验。

## 🎯 核心目标

1. **同步播放**: 视频播放时自动播放背景音乐，暂停/停止时同步控制
2. **用户控制**: 提供静音按钮，用户可自主控制音乐开关
3. **性能优化**: 音乐加载快速，不影响视频播放流畅度
4. **良好体验**: 音乐喜庆、音量适中、控制方便

## 🏗️ 技术架构

### 架构图

```
小程序前端
├── result.js (财神结果页)
│   ├── 视频播放器 (video component)
│   │   └── 事件: onPlay / onPause / onEnded
│   ├── 音乐管理器 (BackgroundMusicManager)
│   │   └── API: play() / pause() / stop() / toggleMute()
│   └── 音频上下文 (InnerAudioContext)
│       └── wx.createInnerAudioContext()
└── 配置文件
    └── music.js (音乐资源配置)

OSS 存储
└── 音乐文件 (MP3, <500KB)
```

### 核心模块

#### 1. BackgroundMusicManager (音乐管理器)
**文件**: `miniprogram/utils/backgroundMusicManager.js`

**职责**:
- 管理背景音乐的生命周期
- 提供统一的音乐控制 API
- 处理静音状态持久化

**核心 API**:
```javascript
class BackgroundMusicManager {
  init(musicUrl, options)    // 初始化音乐
  play()                      // 播放音乐
  pause()                     // 暂停音乐
  stop()                      // 停止音乐
  destroy()                   // 销毁实例
  toggleMute()                // 切换静音
  setVolume(volume)           // 设置音量
  isMuted()                   // 获取静音状态
  isPlaying()                 // 获取播放状态
}
```

#### 2. MusicConfig (音乐配置)
**文件**: `miniprogram/config/music.js`

**内容**:
```javascript
module.exports = {
  caishen: [
    {
      id: 'caishen-bgm-1',
      name: '恭喜发财',
      url: 'https://wms.webinfra.cloud/music/caishen-bgm-1.mp3',
      duration: 45,
      loop: true
    }
  ],
  defaultConfig: {
    volume: 0.6,
    loop: true,
    autoplay: false
  }
};
```

#### 3. Result Page Integration (结果页集成)
**文件**: `miniprogram/pages/caishen/result/result.js`

**修改点**:
1. 导入音乐管理器
2. 在 `onLoad` 中初始化音乐
3. 监听视频事件，同步控制音乐
4. 添加静音按钮交互
5. 在 `onUnload` 中销毁音乐

## 🔄 核心流程

### 1. 音乐播放流程

```
用户进入结果页
    ↓
加载音乐配置
    ↓
初始化 BackgroundMusicManager
    ↓
预加载音乐文件（不播放）
    ↓
用户点击播放视频
    ↓
触发 onPlay 事件
    ↓
调用 musicManager.play()
    ↓
音乐开始播放（循环）
    ↓
视频暂停/结束
    ↓
触发 onPause/onEnded 事件
    ↓
调用 musicManager.pause()/stop()
    ↓
音乐暂停/停止
```

### 2. 静音控制流程

```
用户点击静音按钮
    ↓
调用 musicManager.toggleMute()
    ↓
更新静音状态到 Storage
    ↓
更新 UI 图标（🔊 ↔ 🔇）
    ↓
如果正在播放
    ↓
应用静音状态（音量 0 或恢复）
```

## 🎨 UI 设计

### 静音按钮位置

```
┌─────────────────────────────────────┐
│  [<]  财神变身结果         [🔊/🔇]  │  ← 导航栏右侧
├─────────────────────────────────────┤
│                                      │
│         ┌─────────────────┐         │
│         │   视频播放器     │         │
│         └─────────────────┘         │
│                                      │
│         [保存视频] [分享]            │
└─────────────────────────────────────┘
```

### 按钮样式
- **开启音乐**: 🔊 图标，主题色
- **静音状态**: 🔇 图标，灰色
- **按钮大小**: 44x44 rpx
- **位置**: 导航栏右侧

## 💾 数据存储

### 持久化存储
使用 `wx.setStorageSync` 存储用户偏好：

```javascript
{
  'caishen_music_muted': false,  // 静音状态
  'caishen_music_volume': 0.6    // 音量（可选）
}
```

## ⚡ 性能优化

### 1. 预加载策略
```javascript
// 页面 onLoad 时预加载音乐（不播放）
onLoad() {
  musicManager.init(musicUrl, { autoplay: false });
}
```

### 2. 资源释放
```javascript
// 页面卸载时释放资源
onUnload() {
  if (musicManager) {
    musicManager.destroy();
  }
}
```

### 3. 音乐文件优化
- 格式: MP3
- 码率: 128kbps
- 大小: 300-500KB
- 时长: 30-60秒循环
- CDN: 启用加速

## 🛡️ 错误处理

### 1. 音乐加载失败
```javascript
try {
  await musicManager.init(musicUrl);
} catch (error) {
  console.error('[音乐] 加载失败:', error);
  // 静默失败，不影响视频播放
}
```

### 2. 播放失败自动重试
```javascript
audioContext.onError((error) => {
  console.error('[音乐] 播放失败:', error);
  if (retryCount < 1) {
    retryCount++;
    setTimeout(() => audioContext.play(), 1000);
  }
});
```

### 3. 网络异常处理
```javascript
wx.onNetworkStatusChange((res) => {
  if (!res.isConnected && musicManager.isPlaying()) {
    musicManager.pause();
  }
});
```

## 📊 监控指标

### 功能指标
- 音乐播放成功率
- 音乐加载时间
- 静音按钮点击率

### 性能指标
- 页面加载时间
- 内存占用
- CPU 占用

### 用户行为指标
- 音乐开启率
- 音乐关闭率
- 平均播放时长

## 🚀 实施计划

### 阶段一：开发（2天）
- [ ] 实现 BackgroundMusicManager
- [ ] 创建音乐配置文件
- [ ] 集成到结果页面
- [ ] 本地测试

### 阶段二：测试（1天）
- [ ] 上传音乐文件到 OSS
- [ ] 配置 CDN
- [ ] 完整功能测试
- [ ] 兼容性测试

### 阶段三：部署（1天）
- [ ] 小程序代码审核
- [ ] 灰度发布
- [ ] 监控数据
- [ ] 收集反馈

**总工作量**: 3-5 个工作日

## ⚠️ 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 音乐与视频不同步 | 中 | 中 | 使用视频事件精确控制 |
| 音乐加载失败 | 低 | 低 | 静默失败，不影响视频 |
| 用户不喜欢音乐 | 中 | 中 | 提供明显的静音按钮 |
| 内存泄漏 | 高 | 低 | 页面卸载时释放资源 |

## 🔮 后续扩展

### 短期（1-2周）
- 支持多首音乐随机播放
- 添加音量调节滑块

### 中期（1-2月）
- 扩展到其他模式（puzzle、transform）
- 支持音乐淡入淡出效果

### 长期（3-6月）
- AI 生成个性化音乐
- 音乐与视频内容智能匹配

## 📚 参考资料

- [微信小程序音频 API](https://developers.weixin.qq.com/miniprogram/dev/api/media/audio/wx.createInnerAudioContext.html)
- [小程序视频组件](https://developers.weixin.qq.com/miniprogram/dev/component/video.html)
- [音频资源网站](https://www.aigei.com/)

## 📁 相关文档

- 需求文档: `.kiro/specs/caishen-background-music/requirements.md`
- 设计文档: `.kiro/specs/caishen-background-music/design.md`
- 任务列表: `.kiro/specs/caishen-background-music/tasks.md`

---

**创建时间**: 2026-02-13  
**状态**: 待评审  
**优先级**: P1
