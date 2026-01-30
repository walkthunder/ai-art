/**
 * 参数校验工具模块
 * 用于在关键操作前校验请求参数，确保参数有效性
 */

/**
 * 校验必需字段是否存在
 * @param {Object} data - 待校验的数据对象
 * @param {Array<string>} requiredFields - 必需字段列表
 * @returns {Object} { valid: boolean, missingFields: Array<string> }
 */
function validateRequiredFields(data, requiredFields) {
  const missingFields = [];
  
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missingFields.push(field);
    }
  }
  
  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

/**
 * 校验字符串长度
 * @param {string} value - 待校验的字符串
 * @param {number} minLength - 最小长度
 * @param {number} maxLength - 最大长度
 * @returns {boolean}
 */
function validateStringLength(value, minLength = 0, maxLength = Infinity) {
  if (typeof value !== 'string') return false;
  return value.length >= minLength && value.length <= maxLength;
}

/**
 * 校验URL格式
 * @param {string} url - 待校验的URL
 * @returns {boolean}
 */
function validateUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 校验数组长度
 * @param {Array} arr - 待校验的数组
 * @param {number} minLength - 最小长度
 * @param {number} maxLength - 最大长度
 * @returns {boolean}
 */
function validateArrayLength(arr, minLength = 0, maxLength = Infinity) {
  if (!Array.isArray(arr)) return false;
  return arr.length >= minLength && arr.length <= maxLength;
}

/**
 * 校验枚举值
 * @param {any} value - 待校验的值
 * @param {Array} allowedValues - 允许的值列表
 * @returns {boolean}
 */
function validateEnum(value, allowedValues) {
  return allowedValues.includes(value);
}

/**
 * 校验数字范围
 * @param {number} value - 待校验的数字
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {boolean}
 */
function validateNumberRange(value, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number' || isNaN(value)) return false;
  return value >= min && value <= max;
}

/**
 * 校验UUID格式
 * @param {string} uuid - 待校验的UUID
 * @returns {boolean}
 */
function validateUUID(uuid) {
  if (typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 校验用户ID格式（支持UUID和开发者模式ID）
 * @param {string} userId - 待校验的用户ID
 * @returns {boolean}
 */
function validateUserId(userId) {
  if (typeof userId !== 'string') return false;
  // 支持标准UUID格式
  if (validateUUID(userId)) return true;
  // 支持开发者模式用户ID（dev_user_开头）
  if (userId.startsWith('dev_user_')) return true;
  // 支持简单的测试用户ID（纯数字或字母数字组合）
  if (/^[a-zA-Z0-9_-]+$/.test(userId) && userId.length >= 1 && userId.length <= 100) return true;
  return false;
}

/**
 * 校验手机号格式（中国大陆）
 * @param {string} phone - 待校验的手机号
 * @returns {boolean}
 */
function validatePhone(phone) {
  if (typeof phone !== 'string') return false;
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

/**
 * 校验生成艺术照请求参数
 * @param {Object} params - 请求参数
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateGenerateArtPhotoParams(params) {
  const errors = [];
  
  // 校验必需字段
  // 注意：prompt 改为可选，因为后端会根据 templateId 自动获取 prompt
  const { valid, missingFields } = validateRequiredFields(params, ['imageUrls']);
  if (!valid) {
    errors.push(`缺少必需参数: ${missingFields.join(', ')}`);
  }
  
  // 校验prompt（可选，如果提供则校验长度）
  if (params.prompt && !validateStringLength(params.prompt, 1, 1000)) {
    errors.push('prompt长度必须在1-1000字符之间');
  }
  
  // 校验imageUrls
  if (params.imageUrls) {
    if (!validateArrayLength(params.imageUrls, 1, 14)) {
      errors.push('imageUrls数组长度必须在1-14之间');
    } else {
      // 校验每个图片格式（支持URL或Base64）
      for (let i = 0; i < params.imageUrls.length; i++) {
        const img = params.imageUrls[i];
        // 支持 URL 或 Base64 格式
        const isValidUrl = validateUrl(img);
        const isBase64 = typeof img === 'string' && img.startsWith('data:image/');
        if (!isValidUrl && !isBase64) {
          errors.push(`imageUrls[${i}]不是有效的URL或Base64格式`);
        }
      }
    }
  }
  
  // 校验userId
  if (params.userId && !validateUserId(params.userId)) {
    errors.push('userId格式无效');
  }
  
  // 校验templateUrl（可选）- 允许相对路径
  if (params.templateUrl && typeof params.templateUrl !== 'string') {
    errors.push('templateUrl必须是字符串');
  }
  
  // 校验facePositions（可选）
  if (params.facePositions) {
    if (!Array.isArray(params.facePositions)) {
      errors.push('facePositions必须是数组');
    } else {
      for (let i = 0; i < params.facePositions.length; i++) {
        const pos = params.facePositions[i];
        if (typeof pos !== 'object') {
          errors.push(`facePositions[${i}]必须是对象`);
          continue;
        }
        if (typeof pos.x !== 'number' || typeof pos.y !== 'number') {
          errors.push(`facePositions[${i}]必须包含x和y坐标`);
        }
        if (pos.scale !== undefined && !validateNumberRange(pos.scale, 0.1, 10)) {
          errors.push(`facePositions[${i}].scale必须在0.1-10之间`);
        }
        if (pos.rotation !== undefined && !validateNumberRange(pos.rotation, -360, 360)) {
          errors.push(`facePositions[${i}].rotation必须在-360到360之间`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 校验创建支付订单请求参数
 * @param {Object} params - 请求参数
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateCreatePaymentParams(params) {
  const errors = [];
  
  // 校验必需字段
  const { valid, missingFields } = validateRequiredFields(params, ['userId', 'packageType']);
  if (!valid) {
    errors.push(`缺少必需参数: ${missingFields.join(', ')}`);
  }
  
  // 校验userId
  if (params.userId && !validateUUID(params.userId)) {
    errors.push('userId必须是有效的UUID格式');
  }
  
  // 校验packageType
  if (params.packageType && !validateEnum(params.packageType, ['free', 'basic', 'premium'])) {
    errors.push('packageType必须是free、basic或premium之一');
  }
  
  // 校验generationId（可选）
  if (params.generationId && !validateUUID(params.generationId)) {
    errors.push('generationId必须是有效的UUID格式');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 校验微信支付请求参数
 * @param {Object} params - 请求参数
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateWechatPaymentParams(params) {
  const errors = [];
  
  // 校验必需字段
  const { valid, missingFields } = validateRequiredFields(params, ['orderId', 'openid']);
  if (!valid) {
    errors.push(`缺少必需参数: ${missingFields.join(', ')}`);
  }
  
  // 校验orderId
  if (params.orderId && !validateUUID(params.orderId)) {
    errors.push('orderId必须是有效的UUID格式');
  }
  
  // 校验openid
  if (params.openid && !validateStringLength(params.openid, 1, 128)) {
    errors.push('openid长度必须在1-128字符之间');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 校验上传图片请求参数
 * @param {Object} params - 请求参数
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateUploadImageParams(params) {
  const errors = [];
  
  // 校验必需字段
  const { valid, missingFields } = validateRequiredFields(params, ['image']);
  if (!valid) {
    errors.push(`缺少必需参数: ${missingFields.join(', ')}`);
  }
  
  // 校验image是base64格式
  if (params.image) {
    if (typeof params.image !== 'string') {
      errors.push('image必须是字符串');
    } else if (!params.image.startsWith('data:image/')) {
      errors.push('image必须是有效的base64图片格式（以data:image/开头）');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 校验人脸提取请求参数
 * @param {Object} params - 请求参数
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateExtractFacesParams(params) {
  const errors = [];
  
  // 校验必需字段
  const { valid, missingFields } = validateRequiredFields(params, ['imageUrls']);
  if (!valid) {
    errors.push(`缺少必需参数: ${missingFields.join(', ')}`);
  }
  
  // 校验imageUrls
  if (params.imageUrls) {
    if (!validateArrayLength(params.imageUrls, 1, 10)) {
      errors.push('imageUrls数组长度必须在1-10之间');
    } else {
      // 校验每个URL格式
      for (let i = 0; i < params.imageUrls.length; i++) {
        if (!validateUrl(params.imageUrls[i])) {
          errors.push(`imageUrls[${i}]不是有效的URL格式`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 校验创建产品订单请求参数
 * @param {Object} params - 请求参数
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateCreateProductOrderParams(params) {
  const errors = [];
  
  // 校验必需字段
  const { valid, missingFields } = validateRequiredFields(params, [
    'userId', 'generationId', 'productType', 'productPrice',
    'shippingName', 'shippingPhone', 'shippingAddress', 'imageUrl'
  ]);
  if (!valid) {
    errors.push(`缺少必需参数: ${missingFields.join(', ')}`);
  }
  
  // 校验userId
  if (params.userId && !validateUUID(params.userId)) {
    errors.push('userId必须是有效的UUID格式');
  }
  
  // 校验generationId
  if (params.generationId && !validateUUID(params.generationId)) {
    errors.push('generationId必须是有效的UUID格式');
  }
  
  // 校验productType
  if (params.productType && !validateEnum(params.productType, ['crystal', 'scroll'])) {
    errors.push('productType必须是crystal或scroll之一');
  }
  
  // 校验productPrice
  if (params.productPrice && !validateNumberRange(params.productPrice, 0, 100000)) {
    errors.push('productPrice必须在0-100000之间');
  }
  
  // 校验shippingName
  if (params.shippingName && !validateStringLength(params.shippingName, 1, 100)) {
    errors.push('shippingName长度必须在1-100字符之间');
  }
  
  // 校验shippingPhone
  if (params.shippingPhone && !validatePhone(params.shippingPhone)) {
    errors.push('shippingPhone必须是有效的中国大陆手机号');
  }
  
  // 校验shippingAddress
  if (params.shippingAddress && !validateStringLength(params.shippingAddress, 1, 500)) {
    errors.push('shippingAddress长度必须在1-500字符之间');
  }
  
  // 校验imageUrl
  if (params.imageUrl && !validateUrl(params.imageUrl)) {
    errors.push('imageUrl不是有效的URL格式');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 校验生成微动态视频请求参数
 * @param {Object} params - 请求参数
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateGenerateVideoParams(params) {
  const errors = [];
  
  // 校验必需字段
  const { valid, missingFields } = validateRequiredFields(params, ['imageUrl', 'userId']);
  if (!valid) {
    errors.push(`缺少必需参数: ${missingFields.join(', ')}`);
  }
  
  // 校验imageUrl
  if (params.imageUrl && !validateUrl(params.imageUrl)) {
    errors.push('imageUrl不是有效的URL格式');
  }
  
  // 校验userId
  if (params.userId && !validateUUID(params.userId)) {
    errors.push('userId必须是有效的UUID格式');
  }
  
  // 校验motionBucketId（可选）
  if (params.motionBucketId !== undefined && !validateNumberRange(params.motionBucketId, 1, 255)) {
    errors.push('motionBucketId必须在1-255之间');
  }
  
  // 校验fps（可选）
  if (params.fps !== undefined && !validateNumberRange(params.fps, 1, 60)) {
    errors.push('fps必须在1-60之间');
  }
  
  // 校验videoLength（可选）
  if (params.videoLength !== undefined && !validateNumberRange(params.videoLength, 1, 30)) {
    errors.push('videoLength必须在1-30秒之间');
  }
  
  // 校验dynamicType（可选）
  if (params.dynamicType && !validateEnum(params.dynamicType, ['festival', 'normal', 'subtle'])) {
    errors.push('dynamicType必须是festival、normal或subtle之一');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Express中间件：校验请求参数
 * @param {Function} validatorFn - 校验函数
 * @returns {Function} Express中间件函数
 */
function validateRequest(validatorFn) {
  return (req, res, next) => {
    const result = validatorFn(req.body);
    
    if (!result.valid) {
      return res.status(400).json({
        success: false,
        error: '参数校验失败',
        details: result.errors
      });
    }
    
    next();
  };
}

module.exports = {
  // 基础校验函数
  validateRequiredFields,
  validateStringLength,
  validateUrl,
  validateArrayLength,
  validateEnum,
  validateNumberRange,
  validateUUID,
  validateUserId,
  validatePhone,
  
  // 业务校验函数
  validateGenerateArtPhotoParams,
  validateCreatePaymentParams,
  validateWechatPaymentParams,
  validateUploadImageParams,
  validateExtractFacesParams,
  validateCreateProductOrderParams,
  validateGenerateVideoParams,
  
  // Express中间件
  validateRequest
};
