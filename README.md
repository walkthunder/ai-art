# AI艺术照生成系统

项目编号: 7566534120810807558

本项目是由 [网站开发专家](https://space.coze.cn/) 创建.

[**项目地址**](https://space.coze.cn/task/7566534120810807558)

## 本地开发

### 环境准备

- 安装 [Node.js](https://nodejs.org/en)
- 安装 [pnpm](https://pnpm.io/installation)

### 环境变量配置

项目使用环境变量来存储敏感信息和配置，需要正确配置 `.env` 文件：

1. 复制 `.env.example` 文件为 `.env`：
   ```sh
   cp .env.example .env
   ```

2. 编辑 `.env` 文件，填入实际的配置值：
   - `VITE_COZE_API_TOKEN`: Coze API的访问令牌
   - `VITE_COZE_BASE_URL`: Coze API的基础URL
   - `VITE_COZE_BOT_ID`: Coze机器人的ID
   - `VITE_VOLCENGINE_ACCESS_KEY_ID`: 火山引擎访问密钥ID
   - `VITE_VOLCENGINE_SECRET_ACCESS_KEY`: 火山引擎私有访问密钥
   - `VITE_COS_SECRET_ID`: 腾讯云COS的Secret ID
   - `VITE_COS_SECRET_KEY`: 腾讯云COS的Secret Key
   - `VITE_COS_REGION`: 腾讯云COS的区域
   - `VITE_COS_BUCKET`: 腾讯云COS的存储桶名称
   - `VITE_COS_DOMAIN`: 腾讯云COS的域名

### 操作步骤

- 安装依赖

```sh
pnpm install
```

- 启动 Dev Server

```sh
pnpm run dev
```

- 在浏览器访问 http://localhost:3000