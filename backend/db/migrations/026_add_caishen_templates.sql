-- 扩展模板表支持财神变身模式
-- 添加 caishen 到 mode 枚举类型

-- 修改 mode 字段，添加 caishen 类型
ALTER TABLE templates 
MODIFY COLUMN mode ENUM('puzzle', 'transform', 'caishen') NOT NULL COMMENT '模式类型';

-- 添加视频时长字段（仅用于 caishen 模式）
ALTER TABLE templates 
ADD COLUMN duration INT DEFAULT 5 COMMENT '视频时长（秒，仅用于caishen模式）';

-- 插入财神变身模板数据
INSERT INTO templates (id, mode, code, name, image_url, prompt, category, duration, sort_order, status) VALUES
(REPLACE(UUID(), '-', ''), 'caishen', 'caishen-default', '财神发钱', 
'https://wms.webinfra.cloud/miniprogram-assets/templates/caishen/caishen-default.jpg',
'将用户上传的人物照片转换为财神爷发钱的喜庆视频，生成一个连贯流畅的单镜头场景。

【人物要求】
1. 将用户照片中的人脸特征完整应用到财神爷身上，保持用户的五官、脸型、肤色等面部特征
2. 财神爷穿着传统红色官袍、金色装饰、头戴财神帽
3. 面部不添加胡须等额外装饰，保持用户原本的面容
4. 神态慈祥喜庆，面带笑容

【动作内容】
财神爷手持金元宝向四周撒金币，金币飞舞闪光，动作连贯自然。整个视频是一个完整的连续镜头，不切换场景。

【背景环境】
中国传统喜庆场景：红色背景、金色祥云、福字装饰，营造财源滚滚的喜庆氛围。

【视频效果】
高清画质，单镜头连贯呈现，动作流畅自然，喜庆热闹，寓意吉祥如意、财运亨通。',
'default', 5, 1, 'active'),

(REPLACE(UUID(), '-', ''), 'caishen', 'caishen-luxury', '豪华财神',
'https://wms.webinfra.cloud/miniprogram-assets/templates/caishen/caishen-luxury.jpg',
'将用户上传的人物照片转换为豪华版财神爷发钱的视频，生成一个连贯流畅的单镜头场景。

【人物要求】
1. 将用户照片中的人脸特征完整应用到财神爷身上，保持用户的五官、脸型、肤色等面部特征
2. 豪华财神形象：金色龙袍、珠宝装饰、头戴金冠
3. 神态威严慈祥，面带喜庆笑容

【动作内容】
财神爷坐在金色宝座上，手持如意挥动，金币、钻石、珠宝从天而降。整个视频是一个完整的连续镜头，不切换场景。

【背景环境】
金碧辉煌的宫殿场景，金龙、凤凰等祥瑞元素环绕，金光闪闪，珠光宝气。

【视频效果】
超高清画质，单镜头连贯呈现，动作流畅自然，豪华大气，寓意财运亨通、富贵吉祥。',
'luxury', 5, 2, 'active');
