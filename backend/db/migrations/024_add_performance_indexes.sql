-- 添加性能优化索引
-- 创建时间: 2026-02-06
-- 目的: 优化查询性能，特别是历史记录和回调日志查询

-- 1. generation_history 表索引优化
-- 确保用户历史记录查询有索引
ALTER TABLE generation_history ADD INDEX idx_user_created (user_id, created_at DESC);
ALTER TABLE generation_history ADD INDEX idx_user_mode_created (user_id, mode, created_at DESC);
ALTER TABLE generation_history ADD INDEX idx_gh_status (status);

-- 2. payment_callback_logs 表索引（已在 022 中创建，这里确保存在）
ALTER TABLE payment_callback_logs ADD INDEX idx_pcl_out_trade_no (out_trade_no);
ALTER TABLE payment_callback_logs ADD INDEX idx_pcl_status (status);
ALTER TABLE payment_callback_logs ADD INDEX idx_pcl_created_at (created_at);
ALTER TABLE payment_callback_logs ADD INDEX idx_pcl_transaction_id (transaction_id);

-- 3. invite_records 表索引优化
ALTER TABLE invite_records ADD INDEX idx_inviter_created (inviter_id, created_at DESC);
ALTER TABLE invite_records ADD INDEX idx_invitee (invitee_id);

-- 4. user_balances 表索引优化
ALTER TABLE user_balances ADD INDEX idx_user_balance_type (user_id, balance_type);

-- 5. payment_orders 表索引优化
ALTER TABLE payment_orders ADD INDEX idx_po_user_status (user_id, status);
ALTER TABLE payment_orders ADD INDEX idx_po_created_at (created_at DESC);
