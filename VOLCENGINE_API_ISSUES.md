# 火山引擎 API 调用问题及解决方案

## 问题描述

在调用火山引擎 API 时，遇到了以下问题：

1. **CORS 错误**：
   ```
   Access to fetch at 'https://open.volcengineapi.com/...' from origin 'http://localhost:3000' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
   ```

2. **401 未授权错误**：
   ```
   POST https://open.volcengineapi.com/... 401 (Unauthorized)
   ```

3. **网络请求失败**：
   ```
   TypeError: Failed to fetch
   ```

## 问题分析

### 1. CORS 问题
火山引擎 API 不支持从浏览器直接调用，因为：
- API 服务器未设置 `Access-Control-Allow-Origin` 响应头
- 浏览器的安全策略阻止了跨域请求

### 2. 认证问题
401 错误可能由以下原因导致：
- 访问密钥（Access Key ID/Secret Access Key）不正确
- 访问密钥没有调用相关 API 的权限
- 签名算法实现有误

### 3. 网络问题
"Failed to fetch" 错误通常由以下原因导致：
- CORS 阻止了请求
- 网络连接问题
- 服务器不可达

## 已实施的解决方案

### 方案一：使用代理服务器（已实施）

由于火山引擎 API 不支持浏览器直接调用，我们已经创建了一个后端代理服务器来转发请求。

1. **创建了独立的后端服务**：
   - 位于 [backend/](file:///Users/aaronzheng/Downloads/283465596418/backend) 目录下
   - 使用 Express 框架实现
   - 包含完整的火山引擎 API 签名实现

2. **前端调用方式变更**：
   - 前端不再直接调用火山引擎 API
   - 前端通过 `http://localhost:3001/api/generate-art-photo` 调用后端代理
   - 后端代理负责与火山引擎 API 通信

3. **安全性提升**：
   - 火山引擎的访问密钥仅在后端服务中配置
   - 腾讯云OSS的访问密钥也仅在后端服务中配置
   - 不会暴露给前端，提高了安全性
   - 解决了 CORS 问题

## 如何使用新的架构

### 启动后端代理服务

1. 进入后端目录并安装依赖：
   ```sh
   cd backend
   pnpm install
   ```

2. 启动后端服务：
   ```sh
   pnpm run dev
   ```

3. 确认服务运行在 http://localhost:3001

### 启动前端开发服务器

1. 回到项目根目录并安装依赖：
   ```sh
   cd ..
   pnpm install
   ```

2. 启动前端开发服务器：
   ```sh
   pnpm run dev
   ```

3. 在浏览器访问 http://localhost:3000

## 最佳实践

1. **不要在前端代码中暴露敏感信息**
   - 通过后端代理服务器来保护密钥
   - 确保 .env 文件不被提交到代码仓库

2. **添加详细的日志记录**
   - 后端服务记录请求和响应的详细信息，便于调试
   - 在生产环境中要避免记录敏感信息

3. **实现重试机制**
   - 对于网络问题，实现适当的重试机制
   - 设置合理的超时时间

4. **提供友好的错误提示**
   - 根据不同的错误类型提供相应的用户提示
   - 避免暴露敏感的系统信息给用户

## 相关文件

- [/src/lib/volcengineAPI.ts](file:///Users/aaronzheng/Downloads/283465596418/src/lib/volcengineAPI.ts): 前端调用后端代理的封装
- [/src/lib/utils.ts](file:///Users/aaronzheng/Downloads/283465596418/src/lib/utils.ts): 图片上传功能封装
- [/src/pages/GeneratorPage.tsx](file:///Users/aaronzheng/Downloads/283465596418/src/pages/GeneratorPage.tsx): 页面组件中的API调用
- [/src/hooks/useArtPhotoGenerator.ts](file:///Users/aaronzheng/Downloads/283465596418/src/hooks/useArtPhotoGenerator.ts): Hook中的API调用
- [/backend/server.js](file:///Users/aaronzheng/Downloads/283465596418/backend/server.js): 后端代理服务主文件
- [/backend/.env](file:///Users/aaronzheng/Downloads/283465596418/backend/.env): 后端环境变量配置文件
- [/backend/.env.example](file:///Users/aaronzheng/Downloads/283465596418/backend/.env.example): 后端环境变量示例文件
- [README.md](file:///Users/aaronzheng/Downloads/283465596418/README.md): 项目使用说明
- [API_ENDPOINTS.md](file:///Users/aaronzheng/Downloads/283465596418/API_ENDPOINTS.md): API接口文档