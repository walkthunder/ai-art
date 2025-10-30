# AI艺术照生成系统

项目编号: 7566534120810807558

本项目是由 [网站开发专家](https://space.coze.cn/) 创建.

[**项目地址**](https://space.coze.cn/task/7566534120810807558)

## 项目结构

```
.
├── backend/              # 后端代理服务
│   ├── server.js         # 后端服务主文件
│   ├── package.json      # 后端依赖配置
│   ├── .env             # 后端环境变量配置
│   └── .env.example     # 后端环境变量示例
├── src/                 # 前端源代码
│   ├── components/      # React组件
│   ├── contexts/        # React上下文
│   ├── hooks/           # React自定义Hooks
│   ├── lib/             # 工具库和API封装
│   ├── pages/           # 页面组件
│   ├── App.tsx          # 应用根组件
│   ├── index.css        # 全局样式
│   ├── main.tsx         # 应用入口
│   └── vite-env.d.ts    # TypeScript声明文件
├── .env                 # 前端环境变量配置
├── .env.example         # 前端环境变量示例
├── .gitignore           # Git忽略文件配置
├── API_ENDPOINTS.md     # API接口文档
├── index.html           # HTML模板
├── package.json         # 前端依赖配置
├── pnpm-lock.yaml       # 依赖锁定文件
├── postcss.config.js    # PostCSS配置
├── tailwind.config.js   # Tailwind CSS配置
├── tsconfig.json        # TypeScript配置
├── VOLCENGINE_API_ISSUES.md # 火山引擎API问题说明
└── vite.config.ts       # Vite配置
```

## 本地开发

### 环境准备

- 安装 [Node.js](https://nodejs.org/en)
- 安装 [pnpm](https://pnpm.io/installation)

### 环境变量配置

#### 前端环境变量

1. 复制 [.env.example](file:///Users/aaronzheng/Downloads/283465596418/.env.example) 文件为 [.env](file:///Users/aaronzheng/Downloads/283465596418/.env)：
   ```sh
   cp .env.example .env
   ```

2. 编辑 [.env](file:///Users/aaronzheng/Downloads/283465596418/.env) 文件，填入实际的配置值：
   - `VITE_COZE_API_TOKEN`: Coze API的访问令牌
   - `VITE_COZE_BASE_URL`: Coze API的基础URL
   - `VITE_COZE_BOT_ID`: Coze机器人的ID

#### 后端环境变量

1. 进入 [backend](file:///Users/aaronzheng/Downloads/283465596418/backend) 目录并复制 [.env.example](file:///Users/aaronzheng/Downloads/283465596418/backend/.env.example) 文件为 [.env](file:///Users/aaronzheng/Downloads/283465596418/backend/.env)：
   ```sh
   cd backend
   cp .env.example .env
   ```

2. 编辑 [backend/.env](file:///Users/aaronzheng/Downloads/283465596418/backend/.env) 文件，填入实际的配置值：
   - `VOLCENGINE_ACCESS_KEY_ID`: 火山引擎访问密钥ID
   - `VOLCENGINE_SECRET_ACCESS_KEY`: 火山引擎私有访问密钥
   - `COS_SECRET_ID`: 腾讯云COS的Secret ID
   - `COS_SECRET_KEY`: 腾讯云COS的Secret Key
   - `COS_REGION`: 腾讯云COS的区域
   - `COS_BUCKET`: 腾讯云COS的存储桶名称
   - `COS_DOMAIN`: 腾讯云COS的域名
   - `PORT`: 后端服务端口（默认3001）

### 操作步骤

#### 启动后端代理服务

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

#### 启动前端开发服务器

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

## API接口

### 前端调用的后端代理接口

1. **生成艺术照**
   - URL: `http://localhost:3001/api/generate-art-photo`
   - 方法: POST
   - 参数:
     ```json
     {
       "prompt": "艺术照生成提示词",
       "imageUrls": ["图片URL数组"]
     }
     ```

2. **查询任务状态**
   - URL: `http://localhost:3001/api/task-status/{taskId}`
   - 方法: GET

3. **上传图片**
   - URL: `http://localhost:3001/api/upload-image`
   - 方法: POST
   - 参数:
     ```json
     {
       "image": "Base64编码的图片数据"
     }
     ```

## 注意事项

1. 必须先启动后端代理服务，再启动前端开发服务器
2. 火山引擎的访问密钥仅在后端服务中配置，不会暴露给前端
3. 腾讯云OSS的访问密钥也仅在后端服务中配置，前端通过后端代理上传图片
4. 后端服务解决了火山引擎API的CORS问题
5. 生产环境部署时，需要将后端服务部署到服务器上