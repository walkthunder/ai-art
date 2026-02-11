-- 添加财神变身模式的余额类型
-- 为所有现有用户添加 free_caishen 余额记录

-- 首先扩展 balance_type 字段长度（安全地扩展到50字符）
ALTER TABLE user_balances 
MODIFY COLUMN balance_type VARCHAR(50) NOT NULL 
COMMENT '余额类型：free_puzzle/free_transform/free_caishen/paid';

-- 为现有用户添加 free_caishen 余额（初始3次）
INSERT INTO user_balances (id, user_id, balance_type, amount, created_at, updated_at)
SELECT 
  UUID() as id,
  u.id as user_id,
  'free_caishen' as balance_type,
  3 as amount,
  NOW() as created_at,
  NOW() as updated_at
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_balances ub 
  WHERE ub.user_id = u.id AND ub.balance_type = 'free_caishen'
);

-- 更新 generation_history 表，确保 mode 字段支持 caishen
ALTER TABLE generation_history 
MODIFY COLUMN mode VARCHAR(20) DEFAULT 'transform' 
COMMENT '生成模式：transform/puzzle/caishen';

-- 更新 usage_logs 表，确保 mode 字段支持 caishen
ALTER TABLE usage_logs 
MODIFY COLUMN mode VARCHAR(30) DEFAULT NULL 
COMMENT '余额类型：free_puzzle/free_transform/free_caishen/paid';
