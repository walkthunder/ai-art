# 后端 API 接口列表

## 概述
本项目是一个基于 React 的前端应用，用于生成艺术照。项目中目前使用了一些外部 API 来获取示例图片，并已集成火山引擎 API 来实现真实的艺术照生成功能。

## 现有的外部 API 接口

### 1. 火山引擎艺术照生成 API (已集成)
用于生成艺术照的核心功能。

**基础 URL**: `https://open.volcengineapi.com`

**环境变量配置**:
- `VITE_VOLCENGINE_ACCESS_KEY_ID`: 火山引擎访问密钥ID
- `VITE_VOLCENGINE_SECRET_ACCESS_KEY`: 火山引擎私有访问密钥
- `VITE_VOLCENGINE_SECURITY_TOKEN`: 火山引擎安全令牌

**核心方法**:
- `generateArtPhoto`: 提交艺术照生成任务
- `getTaskStatus`: 查询任务状态

**集成文件**:
- [/src/lib/volcengineAPI.ts](file:///Users/penghuizheng/Projects/ai-art/src/lib/volcengineAPI.ts): 火山引擎 API 封装
- [/src/pages/GeneratorPage.tsx](file:///Users/penghuizheng/Projects/ai-art/src/pages/GeneratorPage.tsx): 页面组件中的API调用
- [/src/hooks/useArtPhotoGenerator.ts](file:///Users/penghuizheng/Projects/ai-art/src/hooks/useArtPhotoGenerator.ts): Hook中的API调用

## 需要实现的后端 API 接口

### 1. 图片上传接口
**接口路径**: `/api/upload`
**请求方法**: POST
**请求参数**:
- image: 图片文件

**响应数据**:
```json
{
  "success": true,
  "data": {
    "imageId": "string",
    "imageUrl": "string"
  }
}
```

### 2. AI 艺术照生成接口
**接口路径**: `/api/generate-art-photo`
**请求方法**: POST
**请求参数**:
- imageId: 原始图片 ID
- style: 艺术风格类型

**响应数据**:
```json
{
  "success": true,
  "data": {
    "artPhotoId": "string",
    "artPhotoUrl": "string",
    "taskId": "string" // 用于查询生成状态
  }
}
```

### 3. 生成状态查询接口
**接口路径**: `/api/generate-status/{taskId}`
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

### 4. 重生成接口
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

### 5. 支付接口
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

### 6. 支付状态查询接口
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

### 7. 历史记录接口
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
1. 火山引擎 API 已集成到项目中，但需要根据实际的API文档调整参数和响应处理逻辑
2. 环境变量配置文件 (.env) 不应提交到代码仓库，已添加到 .gitignore 中
3. 所有 API 接口应考虑安全性，添加身份验证和授权机制
4. 图片上传和生成接口需要考虑文件大小限制和格式验证
5. 支付接口需要集成第三方支付服务（如微信支付、支付宝等）