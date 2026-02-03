-- ============================================
-- Migration: 011_complete_refactor
-- Description: 用量系统完整重构 - 合并版
-- Created: 2026-02-03
-- 
-- 重要说明：
-- 1. 执行前请务必备份数据库
-- 2. 建议先在测试环境验证
-- 3. 本脚本会删除 users 表的旧字段
-- ============================================

-- ============================================
-- 第一部分：创建新表结构
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

-- 2.1 迁移余额数据 - free_puzzle
INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
SELECT 
  CONCAT(id, '-puzzle') as id,
  id as user_id,
  'free_puzzle' as balance_type,
  COALESCE(usage_count_puzzle, 3) as amount,
  created_at,
  updated_at
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_balances ub 
  WHERE ub.user_id = users.id AND ub.balance_type = 'free_puzzle'
);

-- 2.2 迁移余额数据 - free_transform
INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
SELECT 
  CONCAT(id, '-transform') as id,
  id as user_id,
  'free_transform' as balance_type,
  COALESCE(usage_count_transform, 3) as amount,
  created_at,
  updated_at
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_balances ub 
  WHERE ub.user_id = users.id AND ub.balance_type = 'free_transform'
);

-- 2.3 迁移余额数据 - paid
INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
SELECT 
  CONCAT(id, '-paid') as id,
  id as user_id,
  'paid' as balance_type,
  COALESCE(usage_count_paid, 0) as amount,
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
  CONCAT(id, '-payment') as id,
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

-- 2.5 迁移邀请信息
INSERT INTO user_invites (id, user_id, invite_code, created_at, updated_at)
SELECT 
  CONCAT(id, '-invite') as id,
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

-- ============================================
-- 第三部分：数据验证
-- ============================================

-- 3.1 验证余额记录完整性
SELECT 
  '余额记录验证' as check_name,
  COUNT(DISTINCT u.id) as total_users,
  COUNT(DISTINCT CASE WHEN ub.balance_type = 'free_puzzle' THEN ub.user_id END) as users_with_puzzle,
  COUNT(DISTINCT CASE WHEN ub.balance_type = 'free_transform' THEN ub.user_id END) as users_with_transform,
  COUNT(DISTINCT CASE WHEN ub.balance_type = 'paid' THEN ub.user_id END) as users_with_paid
FROM users u
LEFT JOIN user_balances ub ON u.id = ub.user_id;

-- 3.2 验证付费信息完整性
SELECT 
  '付费信息验证' as check_name,
  COUNT(DISTINCT u.id) as total_users,
  COUNT(DISTINCT up.user_id) as users_with_payments,
  COUNT(DISTINCT u.id) - COUNT(DISTINCT up.user_id) as missing_users
FROM users u
LEFT JOIN user_payments up ON u.id = up.user_id;

-- 3.3 验证邀请码完整性
SELECT 
  '邀请码验证' as check_name,
  COUNT(DISTINCT u.id) as total_users,
  COUNT(DISTINCT ui.user_id) as users_with_invites,
  COUNT(DISTINCT u.id) - COUNT(DISTINCT ui.user_id) as missing_users
FROM users u
LEFT JOIN user_invites ui ON u.id = ui.user_id;

-- ============================================
-- 第四部分：更新 usage_logs 表
-- ============================================

-- 4.1 更新 mode 字段的值（如果存在旧值）
UPDATE usage_logs SET mode = 'free_puzzle' WHERE mode = 'puzzle';
UPDATE usage_logs SET mode = 'free_transform' WHERE mode = 'transform';

-- 4.2 修改字段类型和默认值
ALTER TABLE usage_logs 
MODIFY COLUMN mode VARCHAR(20) DEFAULT 'free_puzzle' COMMENT '余额类型：free_puzzle/free_transform/paid';

-- 4.3 添加索引（如果不存在）
ALTER TABLE usage_logs 
ADD INDEX IF NOT EXISTS idx_user_mode (user_id, mode);

-- ============================================
-- 第五部分：删除 users 表的旧字段
-- ============================================

-- ⚠️ 警告：以下操作将永久删除字段，请确保数据已迁移！

-- 5.1 删除用量相关字段
ALTER TABLE users DROP COLUMN IF EXISTS usage_count_puzzle;
ALTER TABLE users DROP COLUMN IF EXISTS usage_count_transform;
ALTER TABLE users DROP COLUMN IF EXISTS usage_count_paid;
ALTER TABLE users DROP COLUMN IF EXISTS usage_count;
ALTER TABLE users DROP COLUMN IF EXISTS usage_limit;
ALTER TABLE users DROP COLUMN IF EXISTS regenerate_count;

-- 5.2 删除付费相关字段
ALTER TABLE users DROP COLUMN IF EXISTS has_ever_paid;
ALTER TABLE users DROP COLUMN IF EXISTS first_payment_at;
ALTER TABLE users DROP COLUMN IF EXISTS last_payment_at;

-- 5.3 删除邀请相关字段
ALTER TABLE users DROP COLUMN IF EXISTS invite_code;

-- 5.4 保留 payment_status 字段（用于快速查询，避免JOIN）
-- 这是一个冗余字段，但对性能有帮助
-- ALTER TABLE users DROP COLUMN IF EXISTS payment_status;

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
  u.created_at,
  u.updated_at,
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
  i.invited_by
FROM users u
LEFT JOIN user_balances b_puzzle ON u.id = b_puzzle.user_id AND b_puzzle.balance_type = 'free_puzzle'
LEFT JOIN user_balances b_transform ON u.id = b_transform.user_id AND b_transform.balance_type = 'free_transform'
LEFT JOIN user_balances b_paid ON u.id = b_paid.user_id AND b_paid.balance_type = 'paid'
LEFT JOIN user_payments p ON u.id = p.user_id
LEFT JOIN user_invites i ON u.id = i.user_id;

-- ============================================
-- 第七部分：最终验证和统计
-- ============================================

-- 7.1 显示迁移结果
SELECT 
  '✅ 迁移完成' as status,
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM user_balances) as total_balances,
  (SELECT COUNT(*) FROM user_payments) as total_payments,
  (SELECT COUNT(*) FROM user_invites) as total_invites;

-- 7.2 显示余额分布
SELECT 
  balance_type,
  COUNT(*) as record_count,
  SUM(amount) as total_amount,
  ROUND(AVG(amount), 2) as avg_amount,
  MIN(amount) as min_amount,
  MAX(amount) as max_amount
FROM user_balances
GROUP BY balance_type;

-- 7.3 显示付费用户统计
SELECT 
  current_tier,
  COUNT(*) as user_count,
  SUM(has_ever_paid) as paid_users,
  SUM(total_paid_amount) as total_revenue
FROM user_payments
GROUP BY current_tier;

-- 7.4 检查是否还有旧字段
SELECT 
  '检查旧字段' as check_name,
  GROUP_CONCAT(COLUMN_NAME) as remaining_old_columns
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME IN (
    'usage_count_puzzle', 
    'usage_count_transform', 
    'usage_count_paid',
    'usage_count',
    'has_ever_paid',
    'first_payment_at',
    'last_payment_at',
    'invite_code'
  );

-- ============================================
-- 迁移完成说明
-- ============================================

/*
✅ 迁移完成检查清单：

1. 新表创建
   - user_balances: 管理所有余额（free_puzzle, free_transform, paid）
   - user_payments: 管理付费信息
   - user_invites: 管理邀请关系

2. 数据迁移
   - 所有用户的余额数据已迁移
   - 所有用户的付费信息已迁移
   - 所有用户的邀请码已迁移或生成

3. 旧字段清理
   - users 表的旧字段已删除
   - usage_logs 表的 mode 字段已更新

4. 视图创建
   - v_user_full_info: 便于查询用户完整信息

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
