/**
 * 模板配置管理
 * 集中管理所有模板的图片URL和对应的prompt
 * 
 * 注意：模板图片必须是可公开访问的URL，供火山方舟API下载
 * 模板图片已上传到OSS: https://wms.webinfra.cloud/art-photos/templates/
 * 
 * 【重要】富贵变身 Prompt 设计原则：
 * 1. 图1为用户上传的人物照片，图2为模板背景图
 * 2. 完整保留人物的面部、表情、姿态、服装
 * 3. 将模板背景自然融入人物照片，光影协调
 * 4. 避免"专业影棚打光"等不自然的效果
 * 5. 【关键】如果人物是半身照，必须保持完整构图，绝不能出现下半身被截断的效果
 */

// OSS域名配置
const OSS_DOMAIN = 'wms.webinfra.cloud';

/**
 * 通用的背景融合 Prompt 前缀
 * 用于确保所有模板都遵循相同的基础规则
 */
const TRANSFORM_PROMPT_PREFIX = `参考图分工：图1为用户上传的人物照片，图2为背景参考图。

【核心要求】
1. 完整保留图1中所有人物的面部特征、表情神态、肢体姿势和原始服装，不做任何修改
2. 将图2的背景场景自然融入图1，替换原有背景
3. 保持人物与新背景的光影协调一致，色彩过渡自然柔和
4. 【重要】如果原图是半身照或特写，必须保持原有构图比例，确保人物完整呈现，绝对禁止出现人物下半身被截断、腿部缺失或身体不完整的情况，这在中国文化中是大忌

【画面效果】`;

/**
 * Transform模式（富贵变身）模板配置
 * 每个模板包含：
 * - id: 模板唯一标识（与前端模板ID对应）
 * - name: 模板名称
 * - imageUrl: 模板图片的完整URL（已上传到OSS）
 * - prompt: 与该模板匹配的prompt描述
 * - category: 分类
 */
const TRANSFORM_TEMPLATES = {
  // 优先模板
  'transform-custom-1': {
    id: 'transform-custom-1',
    name: '富贵团圆',
    imageUrl: `https://${OSS_DOMAIN}/miniprogram-assets/templates/transform/fugui-tuanyuan.jpg`,
    prompt: `${TRANSFORM_PROMPT_PREFIX}
将背景替换为图2所示的富贵团圆场景，营造温馨祥和的家庭氛围，背景与人物自然融合，光线柔和均匀，整体画面和谐统一，呈现真实自然的合影效果，高清画质，细节清晰`,
    category: 'chinese'
  },
  'transform-custom-2': {
    id: 'transform-custom-2',
    name: '豪门盛宴',
    imageUrl: `https://${OSS_DOMAIN}/miniprogram-assets/templates/transform/haomen-shengyan.jpg`,
    prompt: `${TRANSFORM_PROMPT_PREFIX}
将背景替换为图2所示的豪门宴会场景，呈现高雅尊贵的氛围，背景与人物自然融合，室内光线温暖柔和，整体画面协调统一，呈现真实自然的合影效果，高清画质，细节清晰`,
    category: 'luxury'
  },
  'transform-custom-3': {
    id: 'transform-custom-3',
    name: '雅致居所',
    imageUrl: `https://${OSS_DOMAIN}/miniprogram-assets/templates/transform/yazhi-jusuo.jpg`,
    prompt: `${TRANSFORM_PROMPT_PREFIX}
将背景替换为图2所示的雅致居所场景，呈现简约大方的现代风格，背景与人物自然融合，自然光线柔和通透，整体画面清新舒适，呈现真实自然的居家合影效果，高清画质，细节清晰`,
    category: 'modern'
  },
  // 备选模板
  'transform-1': {
    id: 'transform-1',
    name: '欧式豪华客厅',
    imageUrl: `https://${OSS_DOMAIN}/miniprogram-assets/templates/transform/luxury-european.jpg`,
    prompt: `${TRANSFORM_PROMPT_PREFIX}
将背景替换为图2所示的欧式豪华客厅场景，水晶吊灯璀璨，呈现奢华典雅的氛围，背景与人物自然融合，室内光线温暖柔和，整体画面协调统一，呈现真实自然的合影效果，高清画质，细节清晰`,
    category: 'luxury'
  },
  'transform-2': {
    id: 'transform-2',
    name: '中式豪宅大厅',
    imageUrl: `https://${OSS_DOMAIN}/miniprogram-assets/templates/transform/luxury-chinese.jpg`,
    prompt: `${TRANSFORM_PROMPT_PREFIX}
将背景替换为图2所示的中式豪宅大厅场景，红木家具陈设，呈现富贵大气的中式风格，背景与人物自然融合，室内光线温暖柔和，整体画面协调统一，呈现真实自然的合影效果，高清画质，细节清晰`,
    category: 'chinese'
  },
  'transform-3': {
    id: 'transform-3',
    name: '现代轻奢客厅',
    imageUrl: `https://${OSS_DOMAIN}/miniprogram-assets/templates/transform/modern-luxury.jpg`,
    prompt: `${TRANSFORM_PROMPT_PREFIX}
将背景替换为图2所示的现代轻奢客厅场景，简约时尚风格，背景与人物自然融合，自然光线柔和通透，整体画面清新大方，呈现真实自然的居家合影效果，高清画质，细节清晰`,
    category: 'modern'
  },
  'transform-4': {
    id: 'transform-4',
    name: '古典宫廷',
    imageUrl: `https://${OSS_DOMAIN}/miniprogram-assets/templates/transform/classical-palace.jpg`,
    prompt: `${TRANSFORM_PROMPT_PREFIX}
将背景替换为图2所示的古典宫廷场景，呈现皇家气派庄严的氛围，背景与人物自然融合，室内光线温暖柔和，整体画面协调统一，呈现真实自然的合影效果，高清画质，细节清晰`,
    category: 'luxury'
  }
};

/**
 * Puzzle模式（时空拼图）模板配置
 * 
 * Puzzle 模式特点：
 * - 不使用模板图片，纯粹基于用户上传的多张照片进行合成
 * - 第一张照片作为背景基准，其他人物合并到第一张照片中
 * - 保持每个人的面部特征和自然姿态
 */
const PUZZLE_TEMPLATES = {
  'puzzle-default': {
    id: 'puzzle-default',
    name: '智能合成全家福',
    imageUrl: null, // puzzle 模式不需要模板图片
    prompt: `你将收到2-5张不同人物的照片，请按照以下规则将这些人物智能合成为一张温馨和谐的全家福照片。

【图片分工说明】
- 图1（第一张照片）：作为背景基准图，保留其完整的场景、环境、光线和构图
- 图2-图N（后续照片）：提取其中的人物，将这些人物自然地合并到图1的场景中

【核心要求】
1. 【关键】以图1作为背景基准，完整保留图1的场景环境、背景元素、光线氛围和整体构图
2. 从图2-图N中提取人物，将这些人物自然地融入到图1的场景中
3. 完整保留每个人物的面部特征、表情神态、肢体姿势和原始服装，不做任何修改
4. 确保所有人物的光影效果与图1的环境光线保持一致（光线方向、强度、色温）
5. 合理安排人物在图1场景中的位置，确保大小比例协调，前后景深自然
6. 人物与图1背景的边缘过渡要自然柔和，避免生硬的拼接感
7. 保持画面整体色调和谐统一，所有元素自然融合

【画面效果】
生成一张真实自然的全家福合影，以图1的场景为基础，所有人物完整呈现在图1的环境中，姿态自然，表情温馨，光影协调，整体画面和谐统一，呈现温馨团圆的家庭氛围，高清画质，细节清晰`,
    category: 'default'
  }
};

/**
 * 根据模式和模板ID获取模板配置
 * @param {string} mode 模式ID (transform/puzzle)
 * @param {string} templateId 模板ID
 * @returns {Object|null} 模板配置
 */
function getTemplateConfig(mode, templateId) {
  if (mode === 'transform') {
    return TRANSFORM_TEMPLATES[templateId] || null;
  } else if (mode === 'puzzle') {
    return PUZZLE_TEMPLATES[templateId] || null;
  }
  return null;
}

/**
 * 获取模式的所有模板列表
 * @param {string} mode 模式ID
 * @returns {Array} 模板列表
 */
function getTemplateList(mode) {
  if (mode === 'transform') {
    return Object.values(TRANSFORM_TEMPLATES);
  } else if (mode === 'puzzle') {
    return Object.values(PUZZLE_TEMPLATES);
  }
  return [];
}

/**
 * 获取默认模板
 * @param {string} mode 模式ID
 * @returns {Object|null} 默认模板配置
 */
function getDefaultTemplate(mode) {
  if (mode === 'transform') {
    return TRANSFORM_TEMPLATES['transform-custom-1'];
  } else if (mode === 'puzzle') {
    return PUZZLE_TEMPLATES['puzzle-default'];
  }
  return null;
}

module.exports = {
  TRANSFORM_TEMPLATES,
  PUZZLE_TEMPLATES,
  getTemplateConfig,
  getTemplateList,
  getDefaultTemplate
};
