-- 添加充值次数字段到价格配置表
-- 用于配置套餐充值的次数，避免硬编码

ALTER TABLE price_configs 
ADD COLUMN recharge_amount INT DEFAULT 0 COMMENT '充值次数（仅用于package类别）' 
AFTER price;

-- 更新现有套餐的充值次数
UPDATE price_configs 
SET recharge_amount = 10 
WHERE code = 'basic_package' AND category = 'package';

UPDATE price_configs 
SET recharge_amount = 20 
WHERE code = 'premium_package' AND category = 'package';

-- 添加索引
CREATE INDEX idx_recharge_amount ON price_configs(recharge_amount);
