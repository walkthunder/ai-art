-- Migration: 009_create_usage_logs
-- Description: 创建使用次数日志表
-- Created: 2026-02-03

CREATE TABLE IF NOT EXISTS usage_logs (
  id VARCHAR(36) PRIMARY KEY COMMENT '日志ID (UUID)',
  user_id VARCHAR(36) NOT NULL COMMENT '用户ID',
  action_type ENUM('decrement', 'increment', 'restore') NOT NULL COMMENT '操作类型',
  amount INT NOT NULL COMMENT '变更数量（正数为增加，负数为减少）',
  remaining_count INT NOT NULL COMMENT '操作后剩余次数',
  reason VARCHAR(50) NOT NULL COMMENT '原因：generation/payment/invite_reward/admin_grant/restore',
  reference_id VARCHAR(36) COMMENT '关联ID（generation_id/order_id/invite_record_id）',
  mode VARCHAR(20) DEFAULT 'puzzle' COMMENT '模式：puzzle/transform/paid',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  
  INDEX idx_user_id (user_id),
  INDEX idx_action_type (action_type),
  INDEX idx_reason (reason),
  INDEX idx_created_at (created_at),
  INDEX idx_reference_id (reference_id),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='使用次数日志表';
