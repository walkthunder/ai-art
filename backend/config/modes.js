/**
 * 后端模式配置
 * 与前端模式配置对应，用于验证和处理不同模式的请求
 */

const PUZZLE_MODE_CONFIG = {
  id: 'puzzle',
  name: '时空拼图',
  
  // 模型参数
  modelParams: {
    mode: 'puzzle',
    sequential_image_generation: 'auto',
    max_images: 4,
    force_single: false,
    scale: 0.8
  },
  
  // 验证规则
  validation: {
    minImages: 2,
    maxImages: 5,
    requireFaceDetection: true,
    supportMultipleFaces: true
  },
  
  // 提示词模板
  promptTemplates: {
    default: '生成中国风全家福艺术照，多人合影',
    festive: '生成节日主题的中国风全家福，喜庆氛围',
    traditional: '生成传统中国风全家福'
  }
};

const TRANSFORM_MODE_CONFIG = {
  id: 'transform',
  name: '富贵变身',
  
  // 模型参数
  modelParams: {
    mode: 'transform',
    background_replacement: true,
    preserve_people: true,
    force_single: false,
    scale: 0.8
  },
  
  // 验证规则
  // 注意：transform模式需要1张用户照片 + 1张模板图片 = 2张
  validation: {
    minImages: 1,
    maxImages: 2, // 允许用户照片+模板图片
    requireFaceDetection: true,
    supportMultipleFaces: true
  }
  
  // 注意：富贵变身的 prompt 统一在 templates.js 中管理
  // 每个模板有独立的 prompt，不在此处定义
};

const CAISHEN_MODE_CONFIG = {
  id: 'caishen',
  name: '财神变身',
  
  // 模型参数
  modelParams: {
    mode: 'caishen',
    video_generation: true,
    face_swap: true,
    preserve_face: true,
    duration: 5 // 视频时长（秒）
  },
  
  // 验证规则
  validation: {
    minImages: 1,
    maxImages: 1, // 只需要1张用户照片
    requireFaceDetection: true,
    supportMultipleFaces: false // 只支持单人照片
  },
  
  // 提示词模板
  promptTemplates: {
    default: '财神爷发钱视频，喜庆热闹，金币飞舞，财源滚滚'
  }
};

// 所有模式配置
const MODES = {
  puzzle: PUZZLE_MODE_CONFIG,
  transform: TRANSFORM_MODE_CONFIG,
  caishen: CAISHEN_MODE_CONFIG
};

/**
 * 根据ID获取模式配置
 */
function getModeConfig(modeId) {
  return MODES[modeId] || null;
}

/**
 * 验证模式请求参数
 */
function validateModeRequest(modeId, imageUrls) {
  const config = getModeConfig(modeId);
  
  if (!config) {
    return { valid: false, error: '无效的模式' };
  }
  
  if (!imageUrls || !Array.isArray(imageUrls)) {
    return { valid: false, error: '图片URL必须是数组' };
  }
  
  if (imageUrls.length < config.validation.minImages) {
    return { 
      valid: false, 
      error: `${config.name}至少需要${config.validation.minImages}张图片` 
    };
  }
  
  if (imageUrls.length > config.validation.maxImages) {
    return { 
      valid: false, 
      error: `${config.name}最多支持${config.validation.maxImages}张图片` 
    };
  }
  
  return { valid: true };
}

/**
 * 获取模式的模型参数
 */
function getModeModelParams(modeId) {
  const config = getModeConfig(modeId);
  return config ? config.modelParams : {};
}

/**
 * 获取模式的提示词模板
 */
function getModePromptTemplate(modeId, templateId = 'default') {
  const config = getModeConfig(modeId);
  if (!config) return '';
  
  return config.promptTemplates[templateId] || config.promptTemplates.default || '';
}

module.exports = {
  MODES,
  getModeConfig,
  validateModeRequest,
  getModeModelParams,
  getModePromptTemplate
};
