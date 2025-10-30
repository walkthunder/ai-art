# 后端 API 接口列表

## 概述
本项目是一个基于 React 的前端应用，用于生成艺术照。项目采用前后端分离架构，前端通过后端代理服务调用火山引擎 API 来实现真实的艺术照生成功能。

## 现有的外部 API 接口

### 1. Coze AI API (已集成)
用于生成艺术照的核心功能。

**基础 URL**: `https://api.coze.cn`

**环境变量配置**:
- `VITE_COZE_API_TOKEN`: Coze API的访问令牌
- `VITE_COZE_BASE_URL`: Coze API的基础URL
- `VITE_COZE_BOT_ID`: Coze机器人的ID

**核心方法**:
- `streamGenerateArtPhoto`: 流式调用Coze API生成艺术照
- `processStreamResponse`: 处理流式响应数据

**集成文件**:
- [/src/lib/cozeAPI.ts](file:///Users/aaronzheng/Downloads/283465596418/src/lib/cozeAPI.ts): Coze API 封装
- [/src/pages/GeneratorPage.tsx](file:///Users/aaronzheng/Downloads/283465596418/src/pages/GeneratorPage.tsx): 页面组件中的API调用
- [/src/hooks/useArtPhotoGenerator.ts](file:///Users/aaronzheng/Downloads/283465596418/src/hooks/useArtPhotoGenerator.ts): Hook中的API调用

### 2. 火山引擎API代理服务 (已集成)
由于火山引擎API存在CORS限制，前端无法直接调用，因此通过后端代理服务来转发请求。

**基础 URL**: `http://localhost:3001` (开发环境)

**核心方法**:
- `generateArtPhoto`: 通过后端代理提交艺术照生成任务
- `getTaskStatus`: 通过后端代理查询任务状态

**集成文件**:
- [/src/lib/volcengineAPI.ts](file:///Users/aaronzheng/Downloads/283465596418/src/lib/volcengineAPI.ts): 火山引擎 API 代理封装
- [/src/pages/GeneratorPage.tsx](file:///Users/aaronzheng/Downloads/283465596418/src/pages/GeneratorPage.tsx): 页面组件中的API调用
- [/src/hooks/useArtPhotoGenerator.ts](file:///Users/aaronzheng/Downloads/283465596418/src/hooks/useArtPhotoGenerator.ts): Hook中的API调用

**后端服务文件**:
- [/backend/server.js](file:///Users/aaronzheng/Downloads/283465596418/backend/server.js): 后端代理服务主文件
- [/backend/package.json](file:///Users/aaronzheng/Downloads/283465596418/backend/package.json): 后端依赖配置
- [/backend/.env](file:///Users/aaronzheng/Downloads/283465596418/backend/.env): 后端环境变量配置

## 后端代理服务 API 接口

### 1. 生成艺术照接口
**接口路径**: `/api/generate-art-photo`
**请求方法**: POST
**请求参数**:
- prompt: 艺术照生成提示词
- imageUrls: 图片URL数组

**响应数据**:
```json
{
  "success": true,
  "data": {
    "taskId": "string"
  }
}
```

### 2. 查询任务状态接口
**接口路径**: `/api/task-status/{taskId}`
**请求方法**: GET

**响应数据**:
```json
{
  "success": true,
  "data": {
    "status": "processing|completed|failed",
    "progress": "number", // 生成进度 0-100
    "artPhotoUrl": "string" // 生成完成时返回
  }
}
```

### 3. 上传图片接口
**接口路径**: `/api/upload-image`
**请求方法**: POST
**请求参数**:
- image: Base64编码的图片数据

**响应数据**:
```json
{
  "success": true,
  "data": {
    "imageUrl": "string"
  }
}
```

## 需要实现的后端 API 接口

### 3. 重生成接口
**接口路径**: `/api/regenerate`
**请求方法**: POST
**请求参数**:
- artPhotoId: 已生成的艺术照 ID

**响应数据**:
```json
{
  "success": true,
  "data": {
    "newArtPhotoId": "string",
    "newArtPhotoUrl": "string",
    "taskId": "string"
  }
}
```

### 4. 支付接口
**接口路径**: `/api/pay`
**请求方法**: POST
**请求参数**:
- artPhotoId: 艺术照 ID
- amount: 支付金额

**响应数据**:
```json
{
  "success": true,
  "data": {
    "paymentId": "string",
    "paymentUrl": "string" // 支付页面链接
  }
}
```

### 5. 支付状态查询接口
**接口路径**: `/api/payment-status/{paymentId}`
**请求方法**: GET

**响应数据**:
```json
{
  "success": true,
  "data": {
    "status": "pending|completed|failed",
    "artPhotoId": "string"
  }
}
```

### 6. 历史记录接口
**接口路径**: `/api/history`
**请求方法**: GET

**响应数据**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "string",
        "originalImage": "string",
        "generatedImage": "string",
        "createdAt": "string",
        "isPaid": "boolean",
        "regenerateCount": "number"
      }
    ]
  }
}
```

## 注意事项
1. 火山引擎 API 通过后端代理服务调用，解决了浏览器环境中的 CORS 问题
2. 火山引擎的访问密钥仅在后端服务中配置，不会暴露给前端，提高了安全性
3. 腾讯云OSS的访问密钥也仅在后端服务中配置，前端通过后端代理上传图片
4. 环境变量配置文件 (.env) 不应提交到代码仓库，已添加到 .gitignore 中
5. 所有 API 接口应考虑安全性，添加身份验证和授权机制
6. 图片上传和生成接口需要考虑文件大小限制和格式验证
7. 支付接口需要集成第三方支付服务（如微信支付、支付宝等）