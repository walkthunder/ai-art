-- AI全家福数据库Schema
-- 创建时间: 2026-01-03

-- 创建数据库
CREATE DATABASE IF NOT EXISTS ai_family_photo DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE ai_family_photo;

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY COMMENT '用户唯一标识UUID',
  openid VARCHAR(64) DEFAULT NULL COMMENT '微信小程序openid',
  unionid VARCHAR(64) DEFAULT NULL COMMENT '微信 UnionID，用于跨小程序用户识别',
  nickname VARCHAR(100) DEFAULT NULL COMMENT '用户昵称',
  avatar_url TEXT COMMENT '用户头像URL',
  phone VARCHAR(20) DEFAULT NULL COMMENT '手机号',
  level ENUM('free','pro','enterprise') NOT NULL DEFAULT 'free' COMMENT '用户等级',
  status ENUM('active','banned','pending') NOT NULL DEFAULT 'active' COMMENT '账号状态',
  daily_limit INT NOT NULL DEFAULT 10 COMMENT '每日部署限额',
  used_today INT NOT NULL DEFAULT 0 COMMENT '今日已使用',
  total_quota INT NOT NULL DEFAULT 100 COMMENT '总配额',
  used_quota INT NOT NULL DEFAULT 0 COMMENT '已使用配额',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  payment_status ENUM('free','basic','premium') DEFAULT 'free' COMMENT '付费状态: free-免费, basic-基础包, premium-尊享包',
  regenerate_count INT DEFAULT 3 COMMENT '剩余重生成次数',
  last_login_at TIMESTAMP NULL DEFAULT NULL COMMENT '最后登录时间',
  PRIMARY KEY (id),
  UNIQUE KEY openid (openid),
  UNIQUE KEY unionid (unionid),
  UNIQUE KEY uk_openid (openid),
  KEY idx_payment_status (payment_status),
  KEY idx_created_at (created_at),
  KEY idx_openid (openid),
  KEY idx_unionid (unionid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 2. 生成历史记录表
CREATE TABLE IF NOT EXISTS generation_history (
  id VARCHAR(36) PRIMARY KEY COMMENT '生成记录唯一标识UUID',
  user_id VARCHAR(36) NOT NULL COMMENT '用户ID',
  task_ids JSON NOT NULL COMMENT '4个任务ID的数组',
  original_image_urls JSON NOT NULL COMMENT '原始图片URL数组',
  template_url VARCHAR(500) NOT NULL COMMENT '模板图片URL',
  generated_image_urls JSON DEFAULT NULL COMMENT '4张生成结果的URL数组',
  selected_image_url VARCHAR(500) DEFAULT NULL COMMENT '用户选中的图片URL',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  status ENUM('pending','processing','completed','failed') DEFAULT 'pending' COMMENT '生成状态',
  mode VARCHAR(20) DEFAULT 'transform' COMMENT '生成模式：transform/puzzle',
  PRIMARY KEY (id),
  KEY idx_user_id (user_id),
  KEY idx_status (status),
  KEY idx_created_at (created_at),
  KEY idx_mode (mode),
  KEY idx_user_mode (user_id, mode, created_at),
  CONSTRAINT generation_history_ibfk_1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生成历史表';

-- 3. 支付订单表
CREATE TABLE IF NOT EXISTS payment_orders (
  id VARCHAR(36) PRIMARY KEY COMMENT '订单唯一标识UUID',
  user_id VARCHAR(36) NOT NULL COMMENT '用户ID',
  generation_id VARCHAR(36) NOT NULL COMMENT '生成记录ID',
  amount DECIMAL(10,2) NOT NULL COMMENT '支付金额',
  package_type ENUM('free','basic','premium') NOT NULL COMMENT '套餐类型',
  payment_method VARCHAR(50) DEFAULT 'wechat' COMMENT '支付方式',
  trade_type VARCHAR(20) DEFAULT 'JSAPI' COMMENT '支付类型: JSAPI-小程序, NATIVE-扫码支付, H5-H5支付, APP-APP支付',
  transaction_id VARCHAR(100) DEFAULT NULL COMMENT '第三方支付交易ID',
  out_trade_no VARCHAR(64) DEFAULT NULL COMMENT '商户订单号，用于查询订单状态',
  status ENUM('pending','paid','failed','refunded') DEFAULT 'pending' COMMENT '支付状态',
  paid_at TIMESTAMP NULL DEFAULT NULL COMMENT '实际支付完成时间',
  refund_reason VARCHAR(500) DEFAULT NULL COMMENT '退款原因',
  remark TEXT COMMENT '订单备注信息',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  _openid VARCHAR(256) NOT NULL COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (id),
  UNIQUE KEY out_trade_no (out_trade_no),
  KEY idx_user_id (user_id),
  KEY idx_generation_id (generation_id),
  KEY idx_status (status),
  KEY idx_created_at (created_at),
  KEY idx_transaction_id (transaction_id),
  KEY idx_trade_type (trade_type),
  KEY idx_out_trade_no (out_trade_no),
  CONSTRAINT payment_orders_ibfk_1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT payment_orders_ibfk_2 FOREIGN KEY (generation_id) REFERENCES generation_history(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='支付订单表';

-- 4. 产品订单表
CREATE TABLE IF NOT EXISTS product_orders (
  id VARCHAR(36) PRIMARY KEY COMMENT '订单唯一标识UUID',
  user_id VARCHAR(36) NOT NULL COMMENT '用户ID',
  generation_id VARCHAR(36) NOT NULL COMMENT '生成记录ID',
  product_type ENUM('crystal','scroll') NOT NULL COMMENT '产品类型: crystal-晶瓷画, scroll-卷轴',
  product_price DECIMAL(10,2) NOT NULL COMMENT '产品价格',
  shipping_name VARCHAR(100) NOT NULL COMMENT '收货人姓名',
  shipping_phone VARCHAR(20) NOT NULL COMMENT '收货人电话',
  shipping_address TEXT NOT NULL COMMENT '收货地址',
  status ENUM('pending','paid','exported','shipped','delivered','cancelled') DEFAULT 'pending' COMMENT '订单状态',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_user_id (user_id),
  KEY idx_generation_id (generation_id),
  KEY idx_status (status),
  KEY idx_created_at (created_at),
  CONSTRAINT product_orders_ibfk_1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT product_orders_ibfk_2 FOREIGN KEY (generation_id) REFERENCES generation_history(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实体产品订单表';

-- 5. 贺卡表
CREATE TABLE IF NOT EXISTS greeting_cards (
  id VARCHAR(36) PRIMARY KEY COMMENT '贺卡唯一标识UUID',
  user_id VARCHAR(36) NOT NULL COMMENT '用户ID',
  image_url VARCHAR(500) NOT NULL COMMENT '贺卡图片URL',
  greeting_text TEXT NOT NULL COMMENT '祝福语文本',
  template_style VARCHAR(50) DEFAULT 'classic' COMMENT '模板样式: classic-经典, modern-现代, festive-节日',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_user_id (user_id),
  KEY idx_created_at (created_at),
  CONSTRAINT greeting_cards_ibfk_1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='贺卡表';

-- 6. 退款记录表
CREATE TABLE IF NOT EXISTS refunds (
  id INT NOT NULL AUTO_INCREMENT COMMENT '退款记录ID',
  out_refund_no VARCHAR(64) NOT NULL COMMENT '商户退款单号',
  refund_id VARCHAR(64) DEFAULT NULL COMMENT '微信退款单号',
  out_trade_no VARCHAR(64) NOT NULL COMMENT '原商户订单号',
  transaction_id VARCHAR(64) DEFAULT NULL COMMENT '微信支付订单号',
  refund_amount INT NOT NULL COMMENT '退款金额（分）',
  total_amount INT NOT NULL COMMENT '订单总金额（分）',
  status VARCHAR(32) NOT NULL DEFAULT 'processing' COMMENT '退款状态',
  reason VARCHAR(256) DEFAULT NULL COMMENT '退款原因',
  refunded_at DATETIME DEFAULT NULL COMMENT '退款完成时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_out_refund_no (out_refund_no),
  KEY idx_out_trade_no (out_trade_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='退款记录表';

-- 7. 错误日志表
CREATE TABLE IF NOT EXISTS error_logs (
  id VARCHAR(36) NOT NULL COMMENT '日志ID',
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '时间戳',
  level VARCHAR(20) NOT NULL COMMENT '日志级别',
  error_code VARCHAR(100) DEFAULT NULL COMMENT '错误代码',
  error_message TEXT COMMENT '错误信息',
  context JSON DEFAULT NULL COMMENT '上下文信息',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_timestamp (timestamp),
  KEY idx_level (level),
  KEY idx_error_code (error_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='错误日志表';
