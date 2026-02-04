-- Migration: 014_fix_premium_package_pricing
-- Description: 修复尊享包定价问题 - 尊享包单价应该低于尝鲜包
-- Created: 2026-02-04
-- Priority: P0 (Critical)

-- 问题分析：
-- 尝鲜包：¥9.9 / 10次 = ¥0.99/次
-- 尊享包：¥29.9 / 20次 = ¥1.495/次 ← 单价更高！
--
-- 解决方案：
-- 尊享包：¥29.9 / 35次 = ¥0.85/次 ← 14%折扣，符合用户预期

-- 更新尊享包充值次数
UPDATE price_configs 
SET recharge_amount = 35 
WHERE code = 'premium_package' AND category = 'package';

-- 验证更新结果
-- 预期结果：
-- basic_package: recharge_amount = 10
-- premium_package: recharge_amount = 35
