# 后端 API 接口列表

## 概述
本项目是一个基于 React 的前端应用，用于生成艺术照。项目中目前使用了一些外部 API 来获取示例图片，但核心的 AI 图片生成功能在代码中是模拟实现的，尚未接入真实的后端 API。

## 现有的外部 API 接口

### 1. Coze AI 图片生成 API
用于获取示例图片和加载动画图片。

**基础 URL**: `https://space.coze.cn/api/coze_space/gen_image`

**请求参数**:
- `image_size`: 图片尺寸 (如: square)
- `prompt`: 图片生成提示词
- `sign`: 签名参数

**示例请求**:
```
GET https://space.coze.cn/api/coze_space/gen_image?image_size=square&prompt=Oil%20painting%20style%20portrait%20artwork%2C%20soft%20colors%2C%20morandi%20style&sign=287f9f3f8b1d889fc32f5e758ae99be7
```

**使用场景**:
1. LandingPage.tsx - 获取艺术照风格示例图片
2. GeneratorPage.tsx - 获取加载动画图片

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
1. 当前后端功能是模拟实现的，需要开发真实的后端 API 来替换模拟逻辑
2. 所有 API 接口应考虑安全性，添加身份验证和授权机制
3. 图片上传和生成接口需要考虑文件大小限制和格式验证
4. 支付接口需要集成第三方支付服务（如微信支付、支付宝等）