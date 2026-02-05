-- 添加水印小程序码图片URL配置
-- 用于替代动态生成的二维码，使用预先上传的小程序码

INSERT INTO app_config (id, config_key, config_value, config_type, category, description, is_public) VALUES
(UUID(), 'watermark.qrImageUrl', '""', 'string', 'watermark', '水印小程序码图片URL（优先使用，为空则生成二维码）', FALSE)
ON DUPLICATE KEY UPDATE config_key=config_key;
