# Design Document: 财神变身 (Caishen Video Mode)

## 1. Architecture Overview

### 1.1 System Architecture

财神变身功能完全复用现有项目架构，采用三层架构设计：

```
┌─────────────────────────────────────────────────────────────┐
│                    微信小程序前端                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Launch  │→ │  Upload  │→ │ Template │→ │Generating│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                ↓             │
│                                         ┌──────────┐        │
│                                         │  Result  │        │
│                                         └──────────┘        │
└─────────────────────────────────────────────────────────────┘
                          ↓ HTTP/HTTPS
┌─────────────────────────────────────────────────────────────┐
│                    Node.js 后端服务                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Video Routes │→ │Video Service │→ │Volcengine API│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │Balance Service│  │Generation Svc│  │Watermark Svc │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    数据存储层                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │    MySQL     │  │  Aliyun OSS  │  │  Redis Cache │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

**前端（微信小程序）：**
- 框架：微信小程序原生框架
- 视频播放：wx.createVideoContext
- 存储：wx.setStorageSync / wx.getStorageSync
- 网络：wx.request / wx.uploadFile / wx.downloadFile

**后端（Node.js）：**
- 运行时：Node.js 16+
- 框架：Express.js
- 数据库：MySQL 8.0
- ORM：原生 mysql2
- 视频处理：FFmpeg（用于添加水印）
- AI服务：火山引擎（即梦AI）

**存储：**
- 对象存储：阿里云 OSS
- 数据库：MySQL
- 缓存：Redis（可选）

## 2. Data Model Design

### 2.1 Database Schema

复用现有 `generation_history` 表，无需新建表：

```sql
-- generation_history 表已支持 mode 字段
-- 字段说明：
-- mode: 'caishen' 表示财神变身模式
-- generated_image_urls: JSON数组，存储视频URL
-- template_url: 存储模板缩略图URL
```

### 2.2 Data Flow

```
用户上传照片 → OSS存储 → 获取URL
     ↓
调用生成API → 扣减使用次数 → 调用火山引擎API
     ↓
保存生成记录(status='pending') → 返回taskId
     ↓
轮询任务状态 → 更新进度
     ↓
生成完成 → 添加水印(免费用户) → 上传OSS
     ↓
更新记录(status='completed', video_url) → 返回结果
```

## 3. Component Design

### 3.1 Frontend Components (小程序页面)

#### 3.1.1 Launch Page (启动页)
**文件：** `miniprogram/pages/caishen/launch/`
**功能：**
- 展示财神变身介绍
- 显示使用次数
- 立即制作按钮
- 查看历史记录入口

**复用：** 已实现 ✅

#### 3.1.2 Upload Page (上传页)
**文件：** `miniprogram/pages/caishen/upload/`
**功能：**
- 单张照片上传
- 人脸检测（只允许单人）
- 照片预览和删除
- 使用次数检查

**参考：** 复制 `puzzle/upload`，修改为单图上传

#### 3.1.3 Template Page (模板选择页)
**文件：** `miniprogram/pages/caishen/template/`
**功能：**
- 展示财神模板列表（从后端获取）
- 模板分类和筛选
- 模板预览
- 选择模板并开始生成

**参考：** 复制 `puzzle/template`

#### 3.1.4 Generating Page (生成中页面)
**文件：** `miniprogram/pages/caishen/generating/`
**功能：**
- 显示生成进度（0-100%）
- 进度阶段提示（"人脸识别"、"视频合成"等）
- 任务轮询（每2秒查询一次）
- 错误处理和重试

**参考：** 复制 `puzzle/generating`，修改进度文案

#### 3.1.5 Result Page (结果展示页)
**文件：** `miniprogram/pages/caishen/result/`
**功能：**
- 视频播放（使用 video 组件）
- 保存视频到相册
- 分享功能
- 重新生成按钮
- 付费下载（免费用户需付费才能保存无水印版本）

**关键修改：**
- 使用 `<video>` 替代 `<image>`
- 保存使用 `wx.saveVideoToPhotosAlbum`
- 视频自动播放和循环

#### 3.1.6 History Page (历史记录页)
**文件：** `miniprogram/pages/caishen/history/`
**功能：**
- 展示用户的生成历史（mode='caishen'）
- 视频缩略图展示
- 点击查看详情
- 分页加载

**参考：** 复制 `puzzle/history`

### 3.2 Backend Services

#### 3.2.1 Video Generation Service
**文件：** `backend/services/videoGenerationService.js`

**核心方法：**

```javascript
/**
 * 生成财神变身视频
 * @param {string} userImageUrl - 用户照片URL
 * @param {string} templateId - 模板ID
 * @param {string} userId - 用户ID
 * @returns {Promise<string>} taskId
 */
async function generateCaishenVideo(userImageUrl, templateId, userId)

/**
 * 查询视频生成任务状态
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>} 任务状态
 */
async function getVideoTaskStatus(taskId)

/**
 * 为视频添加水印
 * @param {string} videoUrl - 视频URL
 * @param {string} watermarkText - 水印文本
 * @returns {Promise<string>} 带水印的视频URL
 */
async function addVideoWatermark(videoUrl, watermarkText)
```

**技术实现：**
- 调用火山引擎视频生成API
- 使用FFmpeg添加视频水印
- 上传处理后的视频到OSS

#### 3.2.2 Balance Service (复用)
**文件：** `backend/services/balanceService.js`

**使用方法：**
```javascript
// 检查并扣减使用次数
await balanceService.checkAndDecrementUsage(userId, 'caishen');
```

#### 3.2.3 Generation Service (复用)
**文件：** `backend/services/generationService.js`

**使用方法：**
```javascript
// 保存生成记录
await generationService.saveGenerationHistory({
  userId,
  taskIds: [taskId],
  originalImageUrls: [userImageUrl],
  templateUrl: template.imageUrl,
  status: 'pending',
  mode: 'caishen'
});
```

#### 3.2.4 Watermark Service (扩展)
**文件：** `backend/services/watermarkService.js`

**新增方法：**
```javascript
/**
 * 为视频添加水印
 * @param {string} videoUrl - 视频URL
 * @param {string} userId - 用户ID
 * @returns {Promise<string>} 带水印的视频URL
 */
async function addWatermarkToVideo(videoUrl, userId)
```

**实现方式：**
使用FFmpeg命令：
```bash
ffmpeg -i input.mp4 -vf "drawtext=text='团圆照相馆':x=10:y=10:fontsize=24:fontcolor=white@0.5" output.mp4
```

### 3.3 API Routes

#### 3.3.1 Video Generation Routes
**文件：** `backend/routes/caishenRoutes.js`

**路由定义：**

```javascript
// 生成财神视频
POST /api/caishen/generate
Request Body: {
  imageUrl: string,
  templateId: string,
  userId: string
}
Response: {
  success: boolean,
  data: {
    taskId: string,
    recordId: string
  }
}

// 查询任务状态
GET /api/caishen/task/:taskId
Response: {
  success: boolean,
  data: {
    status: 'pending' | 'processing' | 'completed' | 'failed',
    progress: number,
    videoUrl?: string,
    message?: string
  }
}

// 获取模板列表
GET /api/caishen/templates
Response: {
  success: boolean,
  data: Array<{
    id: string,
    name: string,
    imageUrl: string,
    category: string
  }>
}

// 获取历史记录
GET /api/caishen/history?page=1&limit=20
Response: {
  success: boolean,
  data: {
    records: Array<Object>,
    total: number,
    page: number,
    totalPages: number
  }
}
```

## 4. Integration Design

### 4.1 火山引擎视频API集成

**API调研结果：**
需要确认火山引擎是否支持以下功能：
1. 视频生成API
2. 人脸替换功能
3. 视频模板支持

**备选方案：**
如果火山引擎不支持视频生成，考虑：
1. 使用D-ID API（支持人脸替换视频）
2. 使用Runway Gen-2（AI视频生成）
3. 降级为动态图片（GIF）

### 4.2 使用次数系统集成

**流程：**
1. 用户点击生成前，检查使用次数
2. 次数不足，显示支付弹窗
3. 生成时扣减次数（优先扣减免费次数）
4. 生成失败，恢复已扣减的次数

**代码示例：**
```javascript
// 检查使用次数
const balance = await balanceService.getUserBalance(userId);
if (balance.usageCount === 0) {
  return res.json({ success: false, error: 'INSUFFICIENT_USAGE' });
}

// 扣减次数
await balanceService.decrementUsage(userId, 'caishen');

try {
  // 调用AI服务生成视频
  const taskId = await videoService.generate(...);
} catch (error) {
  // 失败时恢复次数
  await balanceService.incrementUsage(userId, 'caishen');
  throw error;
}
```

### 4.3 支付系统集成

**流程：**
1. 用户选择套餐（基础包/尊享包）
2. 调用微信支付API
3. 支付成功后，后端回调增加使用次数
4. 前端刷新使用次数并继续生成

**复用现有支付流程：**
- 支付组件：`payment-modal`
- 支付服务：`cloudbase-payment.js`
- 后端路由：`paymentRoutes.js`

### 4.4 水印系统集成

**免费用户：**
- 视频生成后，后端自动添加水印
- 水印位置：右下角
- 水印内容："团圆照相馆"

**付费用户：**
- 直接返回无水印视频
- 或提供"去除水印"选项

**实现方式：**
```javascript
// 检查用户付费状态
const user = await userService.getUserById(userId);
const needWatermark = user.payment_status === 'free';

if (needWatermark) {
  // 添加水印
  videoUrl = await watermarkService.addWatermarkToVideo(videoUrl, userId);
}
```

### 4.5 历史记录系统集成

**存储：**
- 复用 `generation_history` 表
- mode 字段设为 'caishen'
- generated_image_urls 存储视频URL

**查询：**
```javascript
// 获取财神模式的历史记录
const history = await generationService.getGenerationHistoryByUserId(
  userId,
  20, // limit
  'caishen', // mode
  1 // page
);
```

## 5. UI/UX Design

### 5.1 页面流程

```
Launch → Upload → Template → Generating → Result
  ↓                                          ↓
History ←──────────────────────────────────┘
```

### 5.2 视觉设计

**主题色：**
- 主色：金色 (#FFD700) - 代表财富
- 辅色：红色 (#DC143C) - 代表喜庆
- 背景：渐变金色背景

**图标：**
- 财神图标：💰
- 金币动画
- 祥云装饰

### 5.3 交互设计

**视频播放：**
- 自动播放
- 循环播放
- 点击暂停/播放
- 进度条控制

**保存按钮：**
- 免费用户：显示"付费保存无水印版本"
- 付费用户：直接保存

## 6. Performance Optimization

### 6.1 视频优化

**压缩策略：**
- 分辨率：720p（免费）/ 1080p（付费）
- 码率：2Mbps
- 格式：MP4 (H.264)
- 时长：5秒

**CDN加速：**
- 使用阿里云CDN
- 就近节点分发
- 减少加载时间

### 6.2 缓存策略

**前端缓存：**
- 模板列表缓存（1小时）
- 历史记录缓存（5分钟）

**后端缓存：**
- 任务状态缓存（Redis，30秒）
- 模板配置缓存（内存，永久）

### 6.3 异步处理

**任务队列：**
- 使用消息队列（可选）
- 异步处理视频生成
- 避免阻塞主线程

## 7. Error Handling

### 7.1 错误类型

**前端错误：**
- 网络超时
- 照片上传失败
- 视频加载失败

**后端错误：**
- AI服务调用失败
- 数据库操作失败
- OSS上传失败

### 7.2 错误处理策略

**重试机制：**
- 网络请求：最多重试3次
- AI服务调用：最多重试1次
- OSS上传：最多重试3次

**降级方案：**
- AI服务失败：返回友好提示，恢复使用次数
- 视频加载失败：显示占位图
- 水印添加失败：使用原视频（记录日志）

**用户提示：**
- 友好的错误提示
- 提供解决方案
- 联系客服入口

## 8. Security Considerations

### 8.1 数据安全

**照片安全：**
- HTTPS传输
- OSS私有读写
- 定期清理（免费用户30天）

**视频安全：**
- 防盗链
- 访问令牌
- 水印保护

### 8.2 接口安全

**鉴权：**
- 用户登录验证
- Token验证
- 请求签名

**防刷：**
- 频率限制（每分钟最多3次）
- IP黑名单
- 异常检测

## 9. Testing Strategy

### 9.1 单元测试

**测试覆盖：**
- 视频生成服务
- 水印添加功能
- 使用次数扣减

### 9.2 集成测试

**测试场景：**
- 完整生成流程
- 支付流程
- 历史记录查询

### 9.3 性能测试

**测试指标：**
- 视频生成时间：< 60秒
- 接口响应时间：< 2秒
- 并发处理能力：100 QPS

## 10. Deployment Plan

### 10.1 部署环境

**开发环境：**
- 本地开发
- 测试数据库

**生产环境：**
- 阿里云ECS
- 生产数据库
- OSS存储

### 10.2 部署步骤

1. 数据库迁移（无需新建表）
2. 后端服务部署
3. 小程序代码上传
4. 配置CDN
5. 测试验证

### 10.3 监控告警

**监控指标：**
- API成功率
- 视频生成成功率
- 平均生成时间
- 错误日志

**告警规则：**
- 成功率 < 95%
- 生成时间 > 120秒
- 错误率 > 5%

## 11. Correctness Properties

### Property 1: 使用次数一致性
**描述：** 生成失败时，用户的使用次数必须恢复
**验证：** 
- 生成前次数 = 生成失败后次数
- 生成成功后次数 = 生成前次数 - 1

### Property 2: 水印正确性
**描述：** 免费用户的视频必须包含水印
**验证：**
- IF user.payment_status === 'free' THEN video.hasWatermark === true

### Property 3: 数据完整性
**描述：** 每次生成必须有对应的历史记录
**验证：**
- 生成成功 → generation_history 表中存在对应记录
- 记录包含：userId, taskId, videoUrl, mode='caishen'

### Property 4: 视频可访问性
**描述：** 生成的视频URL必须可访问
**验证：**
- HTTP GET videoUrl → 返回 200 状态码
- 视频文件大小 > 0

### Property 5: 任务状态一致性
**描述：** 任务状态转换必须符合状态机
**验证：**
- pending → processing → completed
- pending → processing → failed
- 不允许：completed → pending

## 12. Future Enhancements

### 12.1 功能扩展

**多模板支持：**
- 更多财神风格（豪华版、Q版等）
- 自定义文字祝福
- 背景音乐选择

**社交功能：**
- 视频分享到朋友圈
- 生成海报
- 排行榜

### 12.2 技术优化

**AI能力提升：**
- 更高清的视频（4K）
- 更长的视频（10秒）
- 更多动作（招手、撒钱等）

**性能优化：**
- 视频预加载
- 智能缓存
- 边缘计算
