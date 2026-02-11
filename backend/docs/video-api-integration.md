# 财神变身视频生成API集成文档

## 概述

本文档记录了财神变身功能的视频生成API调用格式和参数说明。

**测试日期**: 2025-01-XX  
**测试结论**: 
- ✅ VModel.ai 视频换脸API已验证可用
- ❌ 火山引擎Ark API不支持图生视频功能
- 📝 推荐使用VModel.ai作为主要方案

## 推荐方案：VModel.ai 视频换脸API

### API基本信息

- **API端点**: `https://api.vmodel.ai/api/tasks/v1`
- **认证方式**: Bearer Token
- **文档地址**: https://vmodel.ai/docs/api/
- **定价**: $0.02/任务

### 模型版本

- **视频换脸Pro**: `d4f292d1ea72ac4e501e6ac7be938ce2a5c50c6852387b1b64dedee01e623029`
- **图片换脸Pro**: `85e248d268bcc04f5302cf9645663c2c12acd03c953ec1a4bbfdc252a65bddc0`

### API调用流程

#### 1. 创建视频换脸任务

**端点**: `POST https://api.vmodel.ai/api/tasks/v1/create`

**请求头**:
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**请求体**:
```json
{
  "version": "d4f292d1ea72ac4e501e6ac7be938ce2a5c50c6852387b1b64dedee01e623029",
  "input": {
    "swap_image": "https://example.com/user-photo.jpg",
    "target_video": "https://example.com/template-video.mp4"
  },
  "webhook_url": "https://your-domain.com/api/caishen/webhook"
}
```

**参数说明**:
- `version`: 模型版本ID（必填）
- `input.swap_image`: 用户照片URL，要替换的人脸（必填）
- `input.target_video`: 模板视频URL，目标视频（必填）
- `webhook_url`: 回调URL，任务完成时通知（可选）

**响应示例**:
```json
{
  "code": 200,
  "result": {
    "task_id": "d9opjevn1bd48r5czq",
    "status": "starting",
    "create_at": 1746497063
  }
}
```

#### 2. 查询任务状态

**端点**: `GET https://api.vmodel.ai/api/tasks/v1/{task_id}`

**请求头**:
```
Authorization: Bearer YOUR_API_KEY
```

**响应示例**:
```json
{
  "code": 200,
  "result": {
    "task_id": "d9opjevn1bd48r5czq",
    "user_id": 1,
    "version": "d4f292d1ea72ac4e501e6ac7be938ce2a5c50c6852387b1b64dedee01e623029",
    "error": null,
    "total_time": 68.0,
    "predict_time": 68.0,
    "logs": null,
    "output": [
      "https://data.vmodel.ai/datarm/user/result/20250506/video.mp4"
    ],
    "status": "succeeded",
    "create_at": 1746497063,
    "completed_at": 1746497131
  }
}
```

**状态说明**:
- `starting`: 任务启动中
- `processing`: 处理中
- `succeeded`: 成功完成
- `failed`: 失败
- `canceled`: 已取消

### Node.js调用示例

```javascript
const https = require('https');

// 创建任务
async function createFaceSwapTask(userImageUrl, templateVideoUrl) {
  const requestBody = {
    version: 'd4f292d1ea72ac4e501e6ac7be938ce2a5c50c6852387b1b64dedee01e623029',
    input: {
      swap_image: userImageUrl,
      target_video: templateVideoUrl
    }
  };

  const response = await fetch('https://api.vmodel.ai/api/tasks/v1/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VMODEL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const result = await response.json();
  return result.result.task_id;
}

// 查询任务状态
async function getTaskStatus(taskId) {
  const response = await fetch(`https://api.vmodel.ai/api/tasks/v1/${taskId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.VMODEL_API_KEY}`
    }
  });

  const result = await response.json();
  return result.result;
}
```

## 备选方案：火山引擎 Seedance API

### API基本信息

- **API端点**: `https://ark.cn-beijing.volces.com/api/v3`
- **认证方式**: Bearer Token (ARK_API_KEY)
- **文档地址**: https://docs.byteplus.com/api/docs/ModelArk/
- **定价**: 2.5 USD/M Tokens

### 重要说明

⚠️ **Seedance API主要用于文本/图片生成视频，不直接支持人脸替换功能**

适用场景：
- 文本生成视频 (Text-to-Video)
- 图片生成视频 (Image-to-Video)
- 动态效果生成

### 模型版本

- **Seedance 1.0 Pro**: `seedance-1-0-pro-250528`
- **Seedance 1.0 Lite**: `seedance-1-0-lite`

### API调用示例

#### 图片生成视频

**请求体**:
```json
{
  "model": "seedance-1-0-pro-250528",
  "prompt": "一个人在拜年，面带笑容，双手作揖",
  "image": "https://example.com/user-photo.jpg",
  "duration": 5,
  "aspect_ratio": "9:16",
  "resolution": "1080p"
}
```

**参数说明**:
- `model`: 模型名称
- `prompt`: 文本描述
- `image`: 参考图片URL
- `duration`: 视频时长（5-10秒）
- `aspect_ratio`: 宽高比（9:16竖屏，16:9横屏）
- `resolution`: 分辨率（480p, 720p, 1080p）

## 环境变量配置

在 `backend/.env` 文件中添加：

```bash
# VModel.ai API密钥（推荐方案）
VMODEL_API_KEY=your_vmodel_api_key

# 火山引擎API密钥（备选方案）
ARK_API_KEY=your_ark_api_key
```

## 集成建议

### 推荐实现方案

1. **主要使用VModel.ai API**
   - 专门用于视频人脸替换
   - API简单易用，响应快速
   - 支持异步任务和webhook回调
   - 成本可控（$0.02/任务）

2. **实现异步任务处理**
   - 创建任务后立即返回task_id
   - 前端轮询查询任务状态
   - 或使用webhook接收完成通知

3. **错误处理**
   - 任务失败时提供重试机制
   - 记录详细的错误日志
   - 向用户展示友好的错误提示

### 性能优化

1. **视频预处理**
   - 模板视频提前上传到CDN
   - 用户照片压缩后上传

2. **缓存策略**
   - 缓存已生成的视频
   - 避免重复生成相同内容

3. **并发控制**
   - 限制同时处理的任务数
   - 实现任务队列管理

## 测试方法

运行测试脚本：

```bash
cd backend
pnpm run test:caishen-api
```

或直接运行：

```bash
node backend/test-caishen-api.js
```

## 相关文件

- `backend/services/videoGenerationService.js` - 视频生成服务
- `backend/routes/caishenRoutes.js` - API路由
- `backend/test-caishen-api.js` - API测试脚本
