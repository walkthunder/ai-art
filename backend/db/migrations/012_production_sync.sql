-- ============================================
-- Migration: 012_production_sync
-- Description: 同步线上数据库到最新结构
-- Created: 2026-02-03
-- 
-- 重要说明：
-- 1. 本迁移基于线上数据库当前状态
-- 2. 执行前请务必备份数据库
-- 3. 建议在低峰期执行
-- ============================================

-- ============================================
-- 第一部分：创建新表（用量系统重构）
-- ============================================

-- 1.1 创建用户余额表
CREATE TABLE IF NOT EXISTS user_balances (
  id VARCHAR(36) PRIMARY KEY COMMENT '余额记录ID',
  user_id VARCHAR(36) NOT NULL COMMENT '用户ID',
  balance_type ENUM('free_puzzle', 'free_transform', 'paid') NOT NULL COMMENT '余额类型',
  amount INT NOT NULL DEFAULT 0 COMMENT '余额数量',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  
  UNIQUE KEY uk_user_balance (user_id, balance_type),
  KEY idx_user_id (user_id),
  KEY idx_balance_type (balance_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户余额表';

-- 1.2 创建用户付费信息表
CREATE TABLE IF NOT EXISTS user_payments (
  id VARCHAR(36) PRIMARY KEY COMMENT '记录ID',
  user_id VARCHAR(36) NOT NULL UNIQUE COMMENT '用户ID',
  has_ever_paid BOOLEAN DEFAULT FALSE COMMENT '是否曾经付费',
  first_payment_at TIMESTAMP NULL COMMENT '首次付费时间',
  last_payment_at TIMESTAMP NULL COMMENT '最后付费时间',
  total_paid_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '累计付费金额',
  payment_count INT DEFAULT 0 COMMENT '付费次数',
  current_tier ENUM('free', 'basic', 'premium') DEFAULT 'free' COMMENT '当前套餐',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  
  KEY idx_user_id (user_id),
  KEY idx_has_ever_paid (has_ever_paid),
  KEY idx_current_tier (current_tier),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户付费信息表';

-- 1.3 创建邀请信息表
CREATE TABLE IF NOT EXISTS user_invites (
  id VARCHAR(36) PRIMARY KEY COMMENT '记录ID',
  user_id VARCHAR(36) NOT NULL UNIQUE COMMENT '用户ID',
  invite_code VARCHAR(8) NOT NULL UNIQUE COMMENT '邀请码',
  invited_by VARCHAR(36) NULL COMMENT '邀请人ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  
  KEY idx_user_id (user_id),
  KEY idx_invite_code (invite_code),
  KEY idx_invited_by (invited_by),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户邀请信息表';

-- ============================================
-- 第二部分：数据迁移
-- ============================================

-- 2.1 迁移余额数据 - free_puzzle（从 usage_count 迁移）
INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
SELECT 
  UUID() as id,
  id as user_id,
  'free_puzzle' as balance_type,
  COALESCE(usage_count, 3) as amount,
  created_at,
  updated_at
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_balances ub 
  WHERE ub.user_id = users.id AND ub.balance_type = 'free_puzzle'
);

-- 2.2 迁移余额数据 - free_transform（初始值为3）
INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
SELECT 
  UUID() as id,
  id as user_id,
  'free_transform' as balance_type,
  3 as amount,
  created_at,
  updated_at
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_balances ub 
  WHERE ub.user_id = users.id AND ub.balance_type = 'free_transform'
);

-- 2.3 迁移余额数据 - paid（初始值为0）
INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
SELECT 
  UUID() as id,
  id as user_id,
  'paid' as balance_type,
  0 as amount,
  created_at,
  updated_at
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_balances ub 
  WHERE ub.user_id = users.id AND ub.balance_type = 'paid'
);

-- 2.4 迁移付费信息
INSERT INTO user_payments (id, user_id, has_ever_paid, first_payment_at, last_payment_at, current_tier, created_at, updated_at)
SELECT 
  UUID() as id,
  id as user_id,
  COALESCE(has_ever_paid, FALSE) as has_ever_paid,
  first_payment_at,
  last_payment_at,
  COALESCE(payment_status, 'free') as current_tier,
  created_at,
  updated_at
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_payments up 
  WHERE up.user_id = users.id
);

-- 2.5 迁移邀请信息（从 users 表的 invite_code 字段）
INSERT INTO user_invites (id, user_id, invite_code, created_at, updated_at)
SELECT 
  UUID() as id,
  id as user_id,
  COALESCE(
    invite_code,
    UPPER(SUBSTRING(MD5(CONCAT(id, UNIX_TIMESTAMP(), RAND())), 1, 8))
  ) as invite_code,
  created_at,
  updated_at
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_invites ui 
  WHERE ui.user_id = users.id
);

-- 2.6 根据 invite_records 表建立邀请关系
UPDATE user_invites ui
INNER JOIN invite_records ir ON ui.user_id = ir.invitee_id
SET ui.invited_by = ir.inviter_id
WHERE ui.invited_by IS NULL;

-- ============================================
-- 第三部分：更新 usage_logs 表
-- ============================================

-- 3.1 添加 mode 字段（如果不存在）
-- 检查字段是否存在
SET @column_exists = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'usage_logs' 
    AND column_name = 'mode'
);

-- 如果不存在则添加
SET @sql = IF(@column_exists = 0,
  'ALTER TABLE usage_logs ADD COLUMN mode VARCHAR(20) DEFAULT ''free_puzzle'' COMMENT ''余额类型：free_puzzle/free_transform/paid'' AFTER reference_id',
  'SELECT ''Column mode already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3.2 更新现有记录的 mode 字段（根据 reason 推断）
UPDATE usage_logs 
SET mode = 'free_puzzle' 
WHERE mode IS NULL OR mode = '';

-- 3.3 添加索引
SET @index_exists = (
  SELECT COUNT(*) 
  FROM information_schema.statistics 
  WHERE table_schema = DATABASE() 
    AND table_name = 'usage_logs' 
    AND index_name = 'idx_user_mode'
);

SET @sql = IF(@index_exists = 0,
  'ALTER TABLE usage_logs ADD INDEX idx_user_mode (user_id, mode)',
  'SELECT ''Index idx_user_mode already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 第四部分：更新 generation_history 表
-- ============================================

-- 4.1 添加 mode 字段（如果不存在）
SET @column_exists = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'generation_history' 
    AND column_name = 'mode'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE generation_history ADD COLUMN mode VARCHAR(20) DEFAULT ''transform'' COMMENT ''生成模式：transform/puzzle'' AFTER status',
  'SELECT ''Column mode already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4.2 添加索引
SET @index_exists = (
  SELECT COUNT(*) 
  FROM information_schema.statistics 
  WHERE table_schema = DATABASE() 
    AND table_name = 'generation_history' 
    AND index_name = 'idx_mode'
);

SET @sql = IF(@index_exists = 0,
  'ALTER TABLE generation_history ADD INDEX idx_mode (mode)',
  'SELECT ''Index idx_mode already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 第五部分：清理 users 表的冗余字段
-- ============================================

-- 注意：保留以下字段用于向后兼容和快速查询
-- - payment_status: 用于快速查询用户套餐，避免 JOIN
-- - invite_code: 保留用于兼容性（已迁移到 user_invites）
-- - has_ever_paid: 保留用于兼容性（已迁移到 user_payments）
-- - first_payment_at: 保留用于兼容性（已迁移到 user_payments）
-- - last_payment_at: 保留用于兼容性（已迁移到 user_payments）

-- 删除不再使用的字段
-- 注意：如果字段不存在会报错，但不影响整体迁移

-- 尝试删除 usage_limit
SET @sql = 'ALTER TABLE users DROP COLUMN usage_limit';
SET @check = (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'usage_limit');
SET @sql = IF(@check > 0, @sql, 'SELECT "Column usage_limit does not exist"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 尝试删除 regenerate_count
SET @sql = 'ALTER TABLE users DROP COLUMN regenerate_count';
SET @check = (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'regenerate_count');
SET @sql = IF(@check > 0, @sql, 'SELECT "Column regenerate_count does not exist"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 尝试删除 daily_limit
SET @sql = 'ALTER TABLE users DROP COLUMN daily_limit';
SET @check = (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'daily_limit');
SET @sql = IF(@check > 0, @sql, 'SELECT "Column daily_limit does not exist"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 尝试删除 used_today
SET @sql = 'ALTER TABLE users DROP COLUMN used_today';
SET @check = (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'used_today');
SET @sql = IF(@check > 0, @sql, 'SELECT "Column used_today does not exist"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 尝试删除 total_quota
SET @sql = 'ALTER TABLE users DROP COLUMN total_quota';
SET @check = (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'total_quota');
SET @sql = IF(@check > 0, @sql, 'SELECT "Column total_quota does not exist"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 尝试删除 used_quota
SET @sql = 'ALTER TABLE users DROP COLUMN used_quota';
SET @check = (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'used_quota');
SET @sql = IF(@check > 0, @sql, 'SELECT "Column used_quota does not exist"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 尝试删除 level
SET @sql = 'ALTER TABLE users DROP COLUMN level';
SET @check = (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'level');
SET @sql = IF(@check > 0, @sql, 'SELECT "Column level does not exist"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 第六部分：创建视图
-- ============================================

DROP VIEW IF EXISTS v_user_full_info;

CREATE VIEW v_user_full_info AS
SELECT 
  u.id,
  u.openid,
  u.unionid,
  u.nickname,
  u.avatar_url,
  u.payment_status,
  u.status,
  u.created_at,
  u.updated_at,
  u.last_login_at,
  -- 余额信息
  COALESCE(b_puzzle.amount, 0) as puzzle_balance,
  COALESCE(b_transform.amount, 0) as transform_balance,
  COALESCE(b_paid.amount, 0) as paid_balance,
  COALESCE(b_puzzle.amount, 0) + COALESCE(b_transform.amount, 0) + COALESCE(b_paid.amount, 0) as total_balance,
  -- 付费信息
  COALESCE(p.has_ever_paid, FALSE) as has_ever_paid,
  p.first_payment_at,
  p.last_payment_at,
  COALESCE(p.total_paid_amount, 0) as total_paid_amount,
  COALESCE(p.payment_count, 0) as payment_count,
  COALESCE(p.current_tier, 'free') as current_tier,
  -- 邀请信息
  i.invite_code,
  i.invited_by,
  -- 邀请统计
  COALESCE(s.total_invites, 0) as total_invites,
  COALESCE(s.successful_invites, 0) as successful_invites
FROM users u
LEFT JOIN user_balances b_puzzle ON u.id = b_puzzle.user_id AND b_puzzle.balance_type = 'free_puzzle'
LEFT JOIN user_balances b_transform ON u.id = b_transform.user_id AND b_transform.balance_type = 'free_transform'
LEFT JOIN user_balances b_paid ON u.id = b_paid.user_id AND b_paid.balance_type = 'paid'
LEFT JOIN user_payments p ON u.id = p.user_id
LEFT JOIN user_invites i ON u.id = i.user_id
LEFT JOIN invite_stats s ON u.id = s.user_id;

-- ============================================
-- 第七部分：数据验证
-- ============================================

-- 7.1 验证余额记录完整性
SELECT 
  '✅ 余额记录验证' as check_name,
  COUNT(DISTINCT u.id) as total_users,
  COUNT(DISTINCT CASE WHEN ub.balance_type = 'free_puzzle' THEN ub.user_id END) as users_with_puzzle,
  COUNT(DISTINCT CASE WHEN ub.balance_type = 'free_transform' THEN ub.user_id END) as users_with_transform,
  COUNT(DISTINCT CASE WHEN ub.balance_type = 'paid' THEN ub.user_id END) as users_with_paid
FROM users u
LEFT JOIN user_balances ub ON u.id = ub.user_id;

-- 7.2 验证付费信息完整性
SELECT 
  '✅ 付费信息验证' as check_name,
  COUNT(DISTINCT u.id) as total_users,
  COUNT(DISTINCT up.user_id) as users_with_payments,
  COUNT(DISTINCT u.id) - COUNT(DISTINCT up.user_id) as missing_users
FROM users u
LEFT JOIN user_payments up ON u.id = up.user_id;

-- 7.3 验证邀请码完整性
SELECT 
  '✅ 邀请码验证' as check_name,
  COUNT(DISTINCT u.id) as total_users,
  COUNT(DISTINCT ui.user_id) as users_with_invites,
  COUNT(DISTINCT u.id) - COUNT(DISTINCT ui.user_id) as missing_users
FROM users u
LEFT JOIN user_invites ui ON u.id = ui.user_id;

-- 7.4 显示余额分布
SELECT 
  '✅ 余额分布' as check_name,
  balance_type,
  COUNT(*) as record_count,
  SUM(amount) as total_amount,
  ROUND(AVG(amount), 2) as avg_amount,
  MIN(amount) as min_amount,
  MAX(amount) as max_amount
FROM user_balances
GROUP BY balance_type;

-- 7.5 显示付费用户统计
SELECT 
  '✅ 付费用户统计' as check_name,
  current_tier,
  COUNT(*) as user_count,
  SUM(has_ever_paid) as paid_users,
  SUM(total_paid_amount) as total_revenue
FROM user_payments
GROUP BY current_tier;

-- ============================================
-- 迁移完成说明
-- ============================================

/*
✅ 迁移完成检查清单：

1. 新表创建
   ✓ user_balances: 管理所有余额（free_puzzle, free_transform, paid）
   ✓ user_payments: 管理付费信息
   ✓ user_invites: 管理邀请关系

2. 数据迁移
   ✓ 所有用户的余额数据已迁移
   ✓ 所有用户的付费信息已迁移
   ✓ 所有用户的邀请码已迁移或生成
   ✓ 邀请关系已建立

3. 表结构更新
   ✓ usage_logs 表添加 mode 字段
   ✓ generation_history 表添加 mode 字段
   ✓ users 表清理冗余字段

4. 视图创建
   ✓ v_user_full_info: 便于查询用户完整信息

核心优势：
- 扩展性：新增模式只需 INSERT，无需 ALTER TABLE
- 清晰性：数据职责分明，易于维护
- 性能：合理的索引，支持高并发
- 一致性：balance_type 统一使用 free_puzzle, free_transform, paid

下一步：
1. 重启后端服务
2. 测试所有功能
3. 监控错误日志
4. 验证数据一致性
*/
