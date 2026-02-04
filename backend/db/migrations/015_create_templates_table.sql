-- 创建模板管理表
-- 用于管理时空拼图和富贵变身的模板

CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR(36) PRIMARY KEY COMMENT '模板ID',
  mode ENUM('puzzle', 'transform') NOT NULL COMMENT '模式类型',
  code VARCHAR(50) NOT NULL COMMENT '模板代码（如 transform-custom-1）',
  name VARCHAR(100) NOT NULL COMMENT '模板名称',
  image_url VARCHAR(500) NOT NULL COMMENT '模板图片URL',
  prompt TEXT COMMENT 'AI生成提示词',
  category VARCHAR(50) DEFAULT 'default' COMMENT '分类（chinese/luxury/modern等）',
  sort_order INT DEFAULT 0 COMMENT '排序顺序',
  status ENUM('active', 'inactive') DEFAULT 'active' COMMENT '状态',
  created_by VARCHAR(36) COMMENT '创建人ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  
  UNIQUE KEY uk_mode_code (mode, code),
  KEY idx_mode (mode),
  KEY idx_status (status),
  KEY idx_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模板管理表';

-- 插入现有的富贵变身模板数据
INSERT INTO templates (id, mode, code, name, image_url, prompt, category, sort_order, status) VALUES
(REPLACE(UUID(), '-', ''), 'transform', 'transform-custom-1', '富贵团圆', 'https://wms.webinfra.cloud/miniprogram-assets/templates/transform/fugui-tuanyuan.jpg', 
'参考图分工：图1为用户上传的人物照片，图2为背景参考图。

【核心要求】
1. 完整保留图1中所有人物的面部特征、表情神态、肢体姿势和原始服装，不做任何修改
2. 将图2的背景场景自然融入图1，替换原有背景
3. 保持人物与新背景的光影协调一致，色彩过渡自然柔和
4. 【重要】如果原图是半身照或特写，必须保持原有构图比例，确保人物完整呈现，绝对禁止出现人物下半身被截断、腿部缺失或身体不完整的情况，这在中国文化中是大忌

【画面效果】
将背景替换为图2所示的富贵团圆场景，营造温馨祥和的家庭氛围，背景与人物自然融合，光线柔和均匀，整体画面和谐统一，呈现真实自然的合影效果，高清画质，细节清晰', 
'chinese', 1, 'active'),

(REPLACE(UUID(), '-', ''), 'transform', 'transform-custom-2', '豪门盛宴', 'https://wms.webinfra.cloud/miniprogram-assets/templates/transform/haomen-shengyan.jpg',
'参考图分工：图1为用户上传的人物照片，图2为背景参考图。

【核心要求】
1. 完整保留图1中所有人物的面部特征、表情神态、肢体姿势和原始服装，不做任何修改
2. 将图2的背景场景自然融入图1，替换原有背景
3. 保持人物与新背景的光影协调一致，色彩过渡自然柔和
4. 【重要】如果原图是半身照或特写，必须保持原有构图比例，确保人物完整呈现，绝对禁止出现人物下半身被截断、腿部缺失或身体不完整的情况，这在中国文化中是大忌

【画面效果】
将背景替换为图2所示的豪门宴会场景，呈现高雅尊贵的氛围，背景与人物自然融合，室内光线温暖柔和，整体画面协调统一，呈现真实自然的合影效果，高清画质，细节清晰',
'luxury', 2, 'active'),

(REPLACE(UUID(), '-', ''), 'transform', 'transform-custom-3', '雅致居所', 'https://wms.webinfra.cloud/miniprogram-assets/templates/transform/yazhi-jusuo.jpg',
'参考图分工：图1为用户上传的人物照片，图2为背景参考图。

【核心要求】
1. 完整保留图1中所有人物的面部特征、表情神态、肢体姿势和原始服装，不做任何修改
2. 将图2的背景场景自然融入图1，替换原有背景
3. 保持人物与新背景的光影协调一致，色彩过渡自然柔和
4. 【重要】如果原图是半身照或特写，必须保持原有构图比例，确保人物完整呈现，绝对禁止出现人物下半身被截断、腿部缺失或身体不完整的情况，这在中国文化中是大忌

【画面效果】
将背景替换为图2所示的雅致居所场景，呈现简约大方的现代风格，背景与人物自然融合，自然光线柔和通透，整体画面清新舒适，呈现真实自然的居家合影效果，高清画质，细节清晰',
'modern', 3, 'active'),

(REPLACE(UUID(), '-', ''), 'puzzle', 'puzzle-1', '中国风全家福', 'https://wms.webinfra.cloud/art-photos/template1.jpeg',
'参考图分工：图1-N为人物参考图，最后一张为风格参考图。要求：1:1还原每个人物的面部特征，严格复刻风格参考图的姿势、风格、场景氛围和光影逻辑，生成中国风全家福艺术照，色彩过渡均匀，背景禁用高饱和色，分辨率超高清，确保细节清晰',
'chinese', 1, 'active'),

(REPLACE(UUID(), '-', ''), 'puzzle', 'puzzle-2', '节日喜庆', 'https://wms.webinfra.cloud/art-photos/template2.jpeg',
'参考图分工：图1-N为人物参考图，最后一张为风格参考图。要求：1:1还原每个人物的面部特征，严格复刻风格参考图的节日喜庆氛围，生成春节主题全家福艺术照，红色喜庆基调，分辨率超高清，确保细节清晰',
'festive', 2, 'active');
