# 后端 API 接口列表

## 概述
本项目是一个基于 React 的前端应用，用于生成艺术照。项目中目前使用了一些外部 API 来获取示例图片，并已集成 Coze AI API 来实现真实的艺术照生成功能。

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

### 2. Coze AI 聊天机器人 API (已集成)
用于生成艺术照的核心功能。

**SDK**: [@coze/api](https://github.com/coze-dev/coze-js)

**环境变量配置**:
- `VITE_COZE_API_TOKEN`: Coze API Token
- `VITE_COZE_BASE_URL`: Coze API 基础 URL (默认: https://api.coze.cn)
- `VITE_COZE_BOT_ID`: Coze 机器人 ID

**核心方法**:
- `cozeClient.chat.create`: 创建聊天会话
- `cozeClient.chat.stream`: 流式聊天

**集成文件**:
- [/src/lib/cozeAPI.ts](file:///Users/aaronzheng/Downloads/283465596418/src/lib/cozeAPI.ts): Coze API 封装
- [/src/pages/GeneratorPage.tsx](file:///Users/aaronzheng/Downloads/283465596418/src/pages/GeneratorPage.tsx): 页面组件中的API调用
- [/src/hooks/useArtPhotoGenerator.ts](file:///Users/aaronzheng/Downloads/283465596418/src/hooks/useArtPhotoGenerator.ts): Hook中的API调用

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
1. Coze AI API 已集成到项目中，但需要根据实际的API文档调整参数和响应处理逻辑
2. 环境变量配置文件 (.env) 不应提交到代码仓库，已添加到 .gitignore 中
3. 所有 API 接口应考虑安全性，添加身份验证和授权机制
4. 图片上传和生成接口需要考虑文件大小限制和格式验证
5. 支付接口需要集成第三方支付服务（如微信支付、支付宝等）