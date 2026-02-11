# AI全家福·团圆照相馆 🏮

> 这个春节,让爱没有距离。

## 项目简介

AI全家福是一个基于AI技术的全家福照片生成应用,支持多种模式:
- **时空拼图**: 将分散各地的家人照片合成为完美全家福
- **富贵变身**: 一键更换照片背景,让普通照片变身豪门大片

---

## 📚 业务接入文档

### 微信扫码登录

**业务接入文档**: [`WECHAT_LOGIN_INTEGRATION_GUIDE.md`](./WECHAT_LOGIN_INTEGRATION_GUIDE.md)

Web 端微信扫码登录接入指南，包含：
- 云函数 API 调用方式
- 前端登录组件实现
- 后端认证中间件
- 用户数据结构说明

### 支付系统

**支付对接文档**: [`miniprogram/cloudfunctions/wxpayFunctions/BACKEND_API_INTEGRATION.md`](./miniprogram/cloudfunctions/wxpayFunctions/BACKEND_API_INTEGRATION.md)

---

## 快速开始

### ✅ 项目已启动成功！

**访问地址：**
- 前端：http://localhost:3000
- 后端：http://localhost:3001

### 🐳 Docker 网络问题解决

如果 `docker-compose up -d` 失败，请配置 Docker 镜像加速：

**Docker Desktop → Settings → Docker Engine**，添加：
```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
```

然后重试：
```bash
docker-compose up -d
cd backend
pnpm run db:init
```

### ⚠️ 无 Docker 也可运行

项目已启用 Mock 模式，无需数据库即可测试所有功能。

### 环境要求
- Node.js >= 18 ✅
- pnpm >= 8 ✅
- Docker（可选）

## 项目架构

### 模式化架构

每个产品模式都是独立的产品线,拥有独立的配置、模板、API和提示词:

```
/puzzle              # 时空拼图落地页
/puzzle/upload       # 上传页面
/puzzle/template     # 模板选择
/puzzle/generating   # 生成中
/puzzle/result-selector  # 4宫格选择
/puzzle/result       # 结果页

/transform           # 富贵变身落地页
/transform/upload    # 上传页面
/transform/template  # 模板选择
/transform/generating # 生成中
/transform/result-selector # 4宫格选择
/transform/result    # 结果页
```

### 目录结构

```
src/config/modes/
├── index.ts              # 模式注册中心
├── types.ts              # 类型定义
├── puzzle/               # 时空拼图模式
│   ├── templates.ts      # 模板列表
│   ├── api.ts            # API配置
│   └── prompts.ts        # 提示词模板
└── transform/            # 富贵变身模式
    ├── templates.ts
    ├── api.ts
    └── prompts.ts

backend/config/
└── modes.js              # 后端模式配置
```

### 添加新模式

1. 在 `src/config/modes/` 创建新模式目录
2. 定义模板、API、提示词配置
3. 在 `src/config/modes/index.ts` 注册模式
4. 在 `backend/config/modes.js` 添加后端配置
5. 创建对应的页面组件和路由

## 商业模式

### 定价策略

| 功能 | 免费版 | 尝鲜包(9.9元) | 尊享包(29.9元) |
|------|--------|---------------|----------------|
| 生成艺术照 | ✓ 标清+水印 | ✓ 高清无水印 | ✓ 超清4K |
| 4选1生成 | ✗ | ✓ | ✓ |
| 合成人数 | 最多2人 | 最多5人 | 无限制 |
| 模板数量 | 基础3个 | 热门10个 | 全部模板 |
| 微动态视频 | ✗ | ✗ | ✓ |
| Live Photo | ✗ | ✗ | ✓ |
| 电子贺卡 | ✗ | ✗ | ✓ |
| 实体产品优惠 | ✗ | 9折 | 8折 |

### 实体产品
- 晶瓷画/亚克力摆台: 68-99元
- 丝绸卷轴挂画: 128元
- 通过淘宝/1688一件代发,无需库存

## 技术方案

### 架构设计

采用 "Node.js调度 + Python Utils" 架构:
- Node.js: 高并发业务调度、API网关、数据库操作
- Python: 图像处理、AI接口调用、人脸检测

### AI能力

**一期方案 (MVP)**: 即梦AI API
- 人像与背景融合
- 背景替换
- 微动态生成
- 服饰替换

**二期方案**: 混合架构
- 普通场景: 继续使用即梦AI
- 高级场景: ComfyUI + 开源模型
- 成本降低60%以上

### 核心技术点

1. **4选1策略**: 批量生成4张结果,用户筛选,规避AI不确定性
2. **人脸检测**: OpenCV预处理,确保照片质量
3. **光线统一**: AI自动调整色温、亮度
4. **边缘融合**: 自然过渡,无明显拼接痕迹
5. **微动态**: 仅背景动态,人物轻微微动

### 数据存储

- **原始图片**: 阿里云OSS私有存储,24小时后自动删除
- **生成结果**: OSS公开存储 + CDN加速
- **业务数据**: MySQL数据库
- **缓存**: Redis (模板、会话、热点数据)

### 安全保障

- HTTPS加密传输
- Token鉴权
- 数据脱敏
- 定期备份
- 符合《个人信息保护法》

## 开发规范

### 包管理器
- ✅ 使用 pnpm
- ❌ 禁止使用 npm

### 服务依赖
- ✅ 本地代码直接运行
- ✅ 数据库等服务通过 Docker 启动
- ❌ 禁止本地安装 PostgreSQL、MySQL、Redis

### 代码规范
- 使用 TypeScript 类型检查
- 遵循 ESLint 规则
- 提交前运行 `pnpm run lint`

### 禁用命令
- ❌ 禁止使用 `cat << 'EOF'` 命令
- ✅ 使用 `fsWrite` 或 `strReplace` 工具

## 落地页

### 文件位置
- 落地页：`ui-ux-pro-max.html`
- Logo图标：`public/logo.png`
- 小程序二维码：`public/mini_icon.jpg`

### 功能特性
- 响应式设计，完全适配移动端、平板和桌面设备
- 二维码弹窗，所有 CTA 按钮都会触发小程序二维码展示
- 中国传统节日风格设计（红金配色）
- 平滑滚动、卡片悬停、渐入动画等交互效果
- 支持无障碍访问（prefers-reduced-motion）

### 使用方法
```bash
# 直接在浏览器中打开
open ui-ux-pro-max.html

# 或使用本地服务器（推荐）
python3 -m http.server 8000
# 访问 http://localhost:8000/ui-ux-pro-max.html
```

### 页面结构
- 浮动导航栏（毛玻璃效果）
- Hero区域（核心价值主张 + 数据展示）
- 功能特色（时空拼图 & 富贵变身）
- 使用流程（三步生成全家福）
- 套餐价格（三档价格展示）
- 用户评价（真实用户反馈）
- FAQ（常见问题解答）
- 页脚（完整导航和法律信息）

## 部署

### 前端构建
```bash
pnpm run build
```

### 后端部署
```bash
cd backend
# 后端直接运行,无需构建
```

### Docker部署
```bash
docker-compose up -d
```

## 测试

### 功能测试
- 核心流程完整性
- API调用稳定性
- 支付与鉴权逻辑

### 性能测试
- 并发100人响应速度
- API调用延迟
- CDN加载速度

### 兼容性测试
- 不同机型/浏览器
- 微信小程序兼容性

## 成本预估 (月度)

| 成本项 | 预估金额 (元) |
|--------|--------------|
| 云服务 (ECS/OSS/CDN/RDS/Redis) | 9,000-11,000 |
| AI API调用 | 8,000-12,000 |
| 模板版权 | 1,000-2,000 |
| 运维与人工 | 15,000-20,000 |
| 其他 (售后/应急) | 2,000-3,000 |
| **总计** | **35,000-48,000** |

## 风险与应对

| 风险类型 | 应对措施 |
|---------|---------|
| 技术风险 | 提前与即梦沟通算力扩容;预埋优质Prompt库;建立人工审核通道 |
| 成本风险 | 付费定价覆盖API成本;限制免费用户调用频率;二期切换开源工作流 |
| 流量风险 | 开启ECS弹性扩容;对免费用户流量限制;优化Redis缓存 |
| 商业风险 | 对接3-5家备选商家;提前告知发货周期;建立售后维权通道 |
| 合规风险 | 严格执行24小时删除机制;购买商用版权;签署隐私协议 |

## License

MIT

---

**开发团队**: AI全家福项目组  
**最后更新**: 2026-01-17
