-- ============================================
-- 迁移 023: 确保 generation_history 表有 mode 字段和索引
-- 用途: 修复历史记录模式隔离问题
-- 日期: 2026-02-06
-- ============================================

-- 1. 检查并添加 mode 字段（如果不存在）
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

-- 2. 更新所有没有 mode 值的记录，默认设置为 transform
UPDATE generation_history 
SET mode = 'transform' 
WHERE mode IS NULL OR mode = '';

-- 3. 检查并添加 mode 字段索引（如果不存在）
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

-- 4. 创建复合索引以优化按用户和模式查询（如果不存在）
SET @composite_index_exists = (
  SELECT COUNT(*) 
  FROM information_schema.statistics 
  WHERE table_schema = DATABASE() 
    AND table_name = 'generation_history' 
    AND index_name = 'idx_user_mode'
);

SET @sql = IF(@composite_index_exists = 0,
  'ALTER TABLE generation_history ADD INDEX idx_user_mode (user_id, mode, created_at DESC)',
  'SELECT ''Index idx_user_mode already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 完成
SELECT '迁移 023 完成: mode 字段和索引已确保存在' AS message;
