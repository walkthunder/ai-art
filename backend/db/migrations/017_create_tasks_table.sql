-- 创建任务表用于持久化任务状态
-- 问题：任务状态只存储在内存和文件中，服务重启后缺少数据库层面的持久化
-- 解决：创建 tasks 表，同时保留文件存储作为备份

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) PRIMARY KEY COMMENT '任务ID（UUID）',
  user_id VARCHAR(36) NOT NULL COMMENT '用户ID',
  mode VARCHAR(20) NOT NULL COMMENT '模式: puzzle-时空拼图, transform-富贵变身',
  status ENUM('pending', 'processing', 'completed', 'failed', 'timeout', 'cancelled') NOT NULL DEFAULT 'pending' COMMENT '任务状态',
  progress INT NOT NULL DEFAULT 0 COMMENT '进度百分比 0-100',
  message TEXT COMMENT '状态消息',
  
  -- 任务参数（JSON格式）
  params JSON NOT NULL COMMENT '任务参数',
  
  -- 任务结果
  result JSON DEFAULT NULL COMMENT '任务结果',
  error TEXT DEFAULT NULL COMMENT '错误信息',
  
  -- 重试相关
  retry_count INT NOT NULL DEFAULT 0 COMMENT '重试次数',
  max_retries INT NOT NULL DEFAULT 2 COMMENT '最大重试次数',
  
  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  started_at TIMESTAMP NULL DEFAULT NULL COMMENT '开始执行时间',
  completed_at TIMESTAMP NULL DEFAULT NULL COMMENT '完成时间',
  
  -- 索引
  INDEX idx_user_id (user_id),
  INDEX idx_mode (mode),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_user_status (user_id, status),
  
  -- 外键
  CONSTRAINT tasks_ibfk_1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='异步任务表';
