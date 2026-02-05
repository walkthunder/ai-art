-- 创建应用配置表
-- 用于存储小程序名称、品牌信息、水印配置等

CREATE TABLE IF NOT EXISTS app_config (
  id VARCHAR(36) PRIMARY KEY,
  config_key VARCHAR(100) NOT NULL UNIQUE COMMENT '配置键',
  config_value TEXT NOT NULL COMMENT '配置值（JSON格式）',
  config_type VARCHAR(50) NOT NULL DEFAULT 'string' COMMENT '配置类型：string, number, boolean, json',
  category VARCHAR(50) NOT NULL DEFAULT 'general' COMMENT '配置分类：app, watermark, brand, legal, features',
  description TEXT COMMENT '配置描述',
  is_public BOOLEAN DEFAULT FALSE COMMENT '是否公开（小程序可访问）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_is_public (is_public)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='应用配置表';

-- 插入默认配置（使用UUID()函数生成唯一ID）
INSERT INTO app_config (id, config_key, config_value, config_type, category, description, is_public) VALUES
-- 应用基本信息
(UUID(), 'app.name', '"WhisperAI"', 'string', 'app', '小程序名称', TRUE),
(UUID(), 'app.alternateName', '"团圆照相馆"', 'string', 'app', '小程序备用名称（审核中）', TRUE),
(UUID(), 'app.description', '"AI智能照片生成"', 'string', 'app', '小程序描述', TRUE),
(UUID(), 'app.version', '"1.0.0"', 'string', 'app', '小程序版本', TRUE),

-- 水印配置
(UUID(), 'watermark.textTemplate', '"{appName}\\n扫码去水印"', 'string', 'watermark', '水印文字模板', FALSE),
(UUID(), 'watermark.qrUrl', '"https://your-domain.com/pay"', 'string', 'watermark', '水印二维码URL', FALSE),
(UUID(), 'watermark.position', '"center"', 'string', 'watermark', '水印位置：center, bottom-right', FALSE),
(UUID(), 'watermark.opacity', '180', 'number', 'watermark', '水印透明度（0-255）', FALSE),

-- 品牌信息
(UUID(), 'brand.slogan', '"AI智能照片生成"', 'string', 'brand', '品牌标语', TRUE),
(UUID(), 'brand.customerServiceEmail', '"support@example.com"', 'string', 'brand', '客服邮箱', TRUE),

-- 法律信息
(UUID(), 'legal.companyName', '"您的公司名称"', 'string', 'legal', '公司名称', TRUE),
(UUID(), 'legal.icpNumber', '""', 'string', 'legal', '备案号', TRUE),

-- 功能开关
(UUID(), 'features.enableInvite', 'true', 'boolean', 'features', '是否启用邀请功能', FALSE),
(UUID(), 'features.enablePayment', 'true', 'boolean', 'features', '是否启用付费功能', FALSE),
(UUID(), 'features.enableWatermark', 'true', 'boolean', 'features', '是否启用水印（免费用户）', FALSE),

-- 系统配置
(UUID(), 'system.initialBalance.freePuzzle', '3', 'number', 'system', '拼图模式初始免费次数', FALSE),
(UUID(), 'system.initialBalance.freeTransform', '3', 'number', 'system', '变身模式初始免费次数', FALSE),
(UUID(), 'system.invite.rewardCount', '1', 'number', 'system', '邀请奖励次数', FALSE),
(UUID(), 'system.task.timeoutMinutes', '60', 'number', 'system', '任务超时时间（分钟）', FALSE),
(UUID(), 'system.task.maxRetries', '2', 'number', 'system', '任务最大重试次数', FALSE),
(UUID(), 'system.order.timeoutHours', '24', 'number', 'system', '订单超时时间（小时）', FALSE)
ON DUPLICATE KEY UPDATE config_key=config_key; -- 如果键已存在则忽略
