-- 修复 payment_orders 表的 generation_id 字段
-- 问题：generation_id 是 NOT NULL，但充值订单不应该关联生成记录
-- 解决：将 generation_id 改为 NULLABLE，允许充值订单不关联生成记录

-- 1. 修改 generation_id 字段为 NULLABLE
ALTER TABLE payment_orders 
MODIFY COLUMN generation_id VARCHAR(36) NULL COMMENT '生成记录ID（充值订单可为空）';

-- 2. 删除外键约束（使用兼容性更好的语法）
SET @constraint_name = (
  SELECT CONSTRAINT_NAME 
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'payment_orders' 
    AND COLUMN_NAME = 'generation_id' 
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);

SET @sql = IF(@constraint_name IS NOT NULL, 
  CONCAT('ALTER TABLE payment_orders DROP FOREIGN KEY ', @constraint_name), 
  'SELECT "No foreign key to drop"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 重新添加外键约束（允许NULL）
ALTER TABLE payment_orders 
ADD CONSTRAINT payment_orders_ibfk_2 
FOREIGN KEY (generation_id) REFERENCES generation_history(id) 
ON DELETE SET NULL;

-- 4. 为充值订单添加标识字段
ALTER TABLE payment_orders 
ADD COLUMN order_type ENUM('generation', 'recharge') NOT NULL DEFAULT 'generation' 
COMMENT '订单类型: generation-生成订单, recharge-充值订单' 
AFTER package_type;

-- 5. 添加索引
ALTER TABLE payment_orders 
ADD INDEX idx_order_type (order_type);
