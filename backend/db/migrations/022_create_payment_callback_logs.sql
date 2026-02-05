-- 创建支付回调日志表
-- 用于记录所有支付回调（成功和失败）
-- 创建时间: 2026-02-06

CREATE TABLE IF NOT EXISTS payment_callback_logs (
  id VARCHAR(36) PRIMARY KEY COMMENT '日志ID',
  out_trade_no VARCHAR(100) NOT NULL COMMENT '商户订单号',
  transaction_id VARCHAR(100) COMMENT '微信支付订单号',
  event_type VARCHAR(50) COMMENT '事件类型',
  status ENUM('success', 'decrypt_failed', 'process_failed') NOT NULL COMMENT '处理状态',
  error_message TEXT COMMENT '错误信息',
  error_code VARCHAR(50) COMMENT '错误代码',
  request_data JSON COMMENT '请求数据（脱敏）',
  response_data JSON COMMENT '响应数据',
  retry_count INT DEFAULT 0 COMMENT '重试次数',
  resolved_at TIMESTAMP NULL COMMENT '解决时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  
  INDEX idx_out_trade_no (out_trade_no),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付回调日志表';
