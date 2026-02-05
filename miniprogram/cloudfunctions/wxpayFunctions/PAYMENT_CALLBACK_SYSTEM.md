# 支付回调系统完整文档

## 系统概述

本文档涵盖微信支付回调的完整流程，包括：
1. 回调解密与验证
2. 订单处理与充值
3. 回调日志监控系统
4. 问题排查与补单方案

---

## 一、回调解密问题修复

### 问题描述

支付回调中出现以下错误：
```
[wxpay_order_callback] 签名验证异常: pem: invalid BEGIN line
[wxpay_order_callback] 数据解密失败: Unsupported state or unable to authenticate data
```

### 问题原因

1. **错误配置了 `WECHAT_PUBLIC_KEY`**：SDK 会自动从微信服务器获取平台证书，不应手动配置
2. **APIv3 密钥配置错误**：导致 AES-256-GCM 解密失败
3. **数据未解密**：无法获取订单号和支付信息

### 解决方案

#### 1. 移除错误的环境变量

在微信云开发控制台中，删除 `WECHAT_PUBLIC_KEY` 环境变量（如果存在）

**重要**：不要手动配置平台证书，SDK 会自动获取！

#### 2. 验证 APIv3 密钥

确保 `WECHAT_APIV3_KEY` 配置正确：
- 长度必须是 32 字节
- 不包含空格、换行符、引号
- 与微信商户平台设置的密钥一致

#### 3. 使用原生解密实现

代码已改为使用 Node.js 原生 `crypto` 模块进行 AES-256-GCM 解密：

```javascript
function decryptCallback(ciphertext, associatedData, nonce, key) {
  const buffer = Buffer.from(ciphertext, 'base64');
  const authTag = buffer.slice(buffer.length - 16);
  const data = buffer.slice(0, buffer.length - 16);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associatedData));
  
  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final()
  ]);
  
  return JSON.parse(decrypted.toString('utf8'));
}
```

---

## 二、回调日志监控系统

### 系统架构

```
微信支付回调
  ↓
云函数处理
  ├─ 解密数据
  ├─ 处理订单
  ├─ 通知后端
  └─ 记录日志 → payment_callback_logs 表
      ↓
管理后台查询
  ├─ 日志列表（筛选、分页）
  ├─ 统计数据（成功/失败/未解决）
  ├─ 详情查看
  └─ 重试/标记解决
```

### 数据库表结构

```sql
CREATE TABLE payment_callback_logs (
  id VARCHAR(36) PRIMARY KEY,
  out_trade_no VARCHAR(64),
  transaction_id VARCHAR(64),
  event_type VARCHAR(50),
  status ENUM('success', 'decrypt_failed', 'process_failed') NOT NULL,
  error_message TEXT,
  error_code VARCHAR(50),
  request_data JSON,
  response_data JSON,
  retry_count INT DEFAULT 0,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_out_trade_no (out_trade_no),
  INDEX idx_created_at (created_at)
);
```

### 日志记录场景

#### 1. 解密失败
```javascript
await logCallback('decrypt_failed', {
  eventType: event.event_type,
  errorMessage: error.message,
  errorCode: 'DECRYPT_ERROR',
  requestData: { event_type, algorithm, ciphertext_length }
});
```

#### 2. 处理失败
```javascript
await logCallback('process_failed', {
  errorMessage: error.message,
  errorCode: 'PROCESS_ERROR',
  requestData: { event_type }
});
```

#### 3. 处理成功
```javascript
await logCallback('success', {
  outTradeNo,
  transactionId,
  eventType,
  responseData: { 
    code: 'SUCCESS', 
    message: '处理成功', 
    notifyResult,
    backendNotified: notifyResult.success 
  }
});
```

### 管理后台功能

#### 访问路径
```
http://your-admin-domain/callback-logs
```

#### 功能列表

1. **统计卡片**
   - 今日成功数
   - 今日解密失败数
   - 今日处理失败数
   - 未解决问题数

2. **日志列表**
   - 按状态筛选（成功/解密失败/处理失败）
   - 按日期范围筛选
   - 分页显示
   - 查看详情

3. **操作功能**
   - 查看详情（请求/响应数据）
   - 重试失败的回调
   - 标记为已解决

#### API 接口

```javascript
// 获取日志列表
GET /admin-api/callback-logs/logs?status=decrypt_failed&page=1&pageSize=20

// 获取统计数据
GET /admin-api/callback-logs/stats

// 标记为已解决
POST /admin-api/callback-logs/resolve/:id

// 重试失败的回调
POST /admin-api/callback-logs/retry/:id
```

---

## 三、环境变量配置

### 必需配置

```bash
# 微信支付配置
WECHAT_APPID=your_appid
WECHAT_MCHID=your_mchid
WECHAT_SERIAL_NO=your_serial_no
WECHAT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
WECHAT_APIV3_KEY=your_apiv3_key_32_bytes
WECHAT_NOTIFY_URL=https://your-env.api.tcloudbasegateway.com/wxpayFunctions

# 后端服务配置
API_BASE_URL=https://your-api-domain.com
INTERNAL_API_SECRET=your-secret-key

# 调试模式（生产环境设为 false）
DEBUG_MODE=false
```

### 不要配置

- ❌ `WECHAT_PUBLIC_KEY` - SDK 会自动获取平台证书

---

## 四、完整回调流程

```
用户完成支付
  ↓
微信服务器发送回调 → 云函数 HTTP 触发器
  ↓
wxpay_order_callback 处理
  ├─ 1. 解密回调数据（AES-256-GCM）
  │    ├─ 成功 → 继续
  │    └─ 失败 → 记录日志 → 返回 SUCCESS（避免重复回调）
  │
  ├─ 2. 验证事件类型（TRANSACTION.SUCCESS）
  │
  ├─ 3. 查询订单
  │    ├─ 订单存在 → 更新状态
  │    └─ 订单不存在 → 补录订单
  │
  ├─ 4. 通知后端充值
  │    └─ POST /api/payment/internal/notify
  │
  └─ 5. 记录成功日志
       └─ 返回 SUCCESS
```

---

## 五、问题排查指南

### 问题1：解密失败

**症状**：
```
[wxpay_order_callback] ❌ 解密失败: Unsupported state or unable to authenticate data
```

**排查步骤**：

1. 检查 APIv3 密钥长度
```javascript
console.log('密钥长度:', process.env.WECHAT_APIV3_KEY.length); // 必须是 32
```

2. 验证密钥配置
   - 登录微信商户平台
   - 账户中心 → API安全 → APIv3密钥
   - 对比云函数环境变量中的密钥

3. 检查密钥格式
   - 不包含空格
   - 不包含换行符
   - 不包含引号

4. 查看管理后台日志
   - 访问 `/callback-logs`
   - 筛选 `decrypt_failed` 状态
   - 查看详细错误信息

**解决方案**：
- 重新设置 APIv3 密钥
- 更新云函数环境变量
- 重新部署云函数

### 问题2：后端通知失败

**症状**：
```
[wxpay_order_callback] 后端通知失败: ECONNREFUSED
```

**排查步骤**：

1. 检查 `API_BASE_URL` 配置
2. 测试后端服务是否运行
```bash
curl ${API_BASE_URL}/api/payment/internal/notify \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: your-secret" \
  -d '{"outTradeNo": "test", "status": "paid"}'
```

3. 查看回调日志中的 `backendNotified` 字段
```javascript
// response_data 中会包含
{
  "backendNotified": false,  // 后端通知失败
  "notifyResult": {
    "success": false,
    "message": "ECONNREFUSED"
  }
}
```

**解决方案**：
- 确保后端服务运行正常
- 检查网络连接
- 验证 `INTERNAL_API_SECRET` 配置

### 问题3：订单已支付但未充值

**症状**：
- 订单状态为 `paid`
- 用户余额未增加
- 回调日志显示成功

**排查步骤**：

1. 查询订单状态
```sql
SELECT * FROM payment_orders WHERE out_trade_no = 'xxx';
```

2. 查询充值记录
```sql
SELECT * FROM usage_logs 
WHERE reference_id = 'order_id' AND action_type = 'increment';
```

3. 检查回调日志
```sql
SELECT * FROM payment_callback_logs 
WHERE out_trade_no = 'xxx' 
ORDER BY created_at DESC;
```

**解决方案**：
使用管理后台的"重试"功能，或手动补单（见下文）

---

## 六、紧急补单方案

### 方案1：使用管理后台重试

1. 访问 `/callback-logs`
2. 找到失败的回调记录
3. 点击"重试"按钮
4. 系统会自动检查订单状态并处理

### 方案2：手动调用后端接口

```bash
curl -X POST ${API_BASE_URL}/api/payment/internal/notify \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: your-secret" \
  -d '{
    "outTradeNo": "商户订单号",
    "transactionId": "微信支付订单号",
    "status": "paid",
    "packageType": "basic",
    "generationId": null,
    "openid": "用户openid"
  }'
```

### 方案3：使用补单脚本

```bash
cd backend
node scripts/manual-recharge.js \
  --userId USER_ID \
  --amount 10 \
  --reason "支付回调失败补单"
```

---

## 七、部署清单

### 1. 云函数部署

```bash
cd miniprogram/cloudfunctions/wxpayFunctions
pnpm install
# 使用微信开发者工具右键上传并部署
```

### 2. 数据库迁移

```bash
cd backend
pnpm run migrate
```

### 3. 后端部署

```bash
cd backend
pnpm install
pnpm run dev  # 开发环境
# 或
pm2 restart ecosystem.config.js  # 生产环境
```

### 4. 管理后台部署

```bash
cd admin
pnpm install
pnpm run build
# 部署到静态托管或服务器
```

---

## 八、监控建议

### 1. 设置告警

在管理后台设置告警规则：
- 解密失败数 > 5 次/小时 → 发送通知
- 未解决问题数 > 10 → 发送通知
- 后端通知失败率 > 10% → 发送通知

### 2. 定期检查

每日检查：
- 访问 `/callback-logs`
- 查看"未解决问题"数量
- 处理失败的回调

### 3. 日志保留

建议保留策略：
- 成功日志：保留 7 天
- 失败日志：保留 30 天
- 已解决日志：保留 30 天

---

## 九、相关文档

- [微信支付开发文档](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)
- [AES-256-GCM 加密算法](https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_2.shtml)
- [云函数 HTTP 触发器](https://cloud.tencent.com/document/product/876/41773)

---

## 十、更新日志

### 2026-02-06
- ✅ 修复解密失败问题（移除错误的 WECHAT_PUBLIC_KEY 配置）
- ✅ 实现原生 AES-256-GCM 解密
- ✅ 创建回调日志监控系统
- ✅ 添加管理后台日志查询功能
- ✅ 实现失败重试和标记解决功能
- ✅ 优化错误处理和日志记录
