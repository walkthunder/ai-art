# AI全家福管理后台

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置后端地址

复制环境变量模板：

```bash
cp .env.example .env.development
```

编辑 `.env.development` 文件，配置后端API地址：

```env
# 使用线上后端（默认）
VITE_BACKEND_URL=https://express-215695-6-1317586939.sh.run.tcloudbase.com

# 或使用本地后端（开发时）
# VITE_BACKEND_URL=http://localhost:3001
```

### 3. 启动开发服务器

```bash
pnpm run dev
```

访问：http://localhost:3002

### 4. 构建生产版本

```bash
pnpm run build
```

构建产物在 `dist` 目录。

## 功能模块

- **数据看板** - 实时统计数据展示
- **系统监控** - 监控指标、告警、健康状态
- **用户管理** - 用户列表、详情、筛选
- **订单管理** - 订单查询、状态管理
- **价格配置** - 套餐价格管理
- **模板管理** - 模板上传、编辑
- **系统配置** - 系统参数配置
- **日志查询** - 错误日志、使用日志查询

## 默认管理员账号

- 用户名：`admin`
- 密码：`admin123`

**⚠️ 生产环境请立即修改默认密码！**

## 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| VITE_BACKEND_URL | 后端API地址 | 线上地址 |

## 技术栈

- React 18
- TypeScript
- Ant Design
- Vite
- ECharts
- Axios

## 开发说明

### 目录结构

```
admin/
├── src/
│   ├── components/     # 公共组件
│   ├── pages/          # 页面组件
│   ├── services/       # API服务
│   ├── types/          # TypeScript类型
│   └── utils/          # 工具函数
├── .env.example        # 环境变量模板
├── .env.development    # 开发环境配置
└── vite.config.ts      # Vite配置
```

### 添加新页面

1. 在 `src/pages/` 创建页面组件
2. 在 `src/App.tsx` 添加路由
3. 在 `src/components/AdminLayout.tsx` 添加菜单项

### API调用

所有API调用通过 `src/services/` 中的服务模块：

```typescript
import { getUsers } from '@/services/user';

const users = await getUsers({ page: 1, pageSize: 20 });
```

## 部署

### 使用Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    root /path/to/admin/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API代理（可选）
    location /admin-api {
        proxy_pass https://express-215695-6-1317586939.sh.run.tcloudbase.com;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 使用Docker

```dockerfile
FROM nginx:alpine
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## 故障排查

### 无法连接后端

1. 检查 `.env.development` 中的 `VITE_BACKEND_URL` 配置
2. 确认后端服务正常运行
3. 检查浏览器控制台的网络请求

### 登录失败

1. 确认管理员账号已创建（后端执行 `pnpm run create-admin`）
2. 检查后端日志
3. 清除浏览器缓存和localStorage

### 页面空白

1. 检查浏览器控制台错误
2. 确认构建成功（`pnpm run build`）
3. 检查路由配置

## 许可证

MIT
