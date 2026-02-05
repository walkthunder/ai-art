-- 迁移文件：添加 transaction_id 唯一索引
-- 创建时间：2026-02-05
-- 说明：确保微信交易号的唯一性，防止重复订单

-- 添加唯一索引
-- 注意：MySQL 允许多个 NULL 值存在于唯一索引中
-- 所以 transaction_id 为 NULL 的订单（未支付）不会冲突
ALTER TABLE payment_orders
ADD UNIQUE KEY uk_transaction_id (transaction_id)
COMMENT '微信交易号唯一索引';

