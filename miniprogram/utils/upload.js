/**
 * 图片上传工具模块
 * 实现图片选择、压缩、上传等功能
 * 
 * 上传策略：
 * 1. 优先使用云存储上传（wx.cloud.uploadFile）避免请求体过大
 * 2. 云存储上传后获取临时 URL，传给后端转存到 OSS
 * 3. 如果云存储不可用，回退到 Base64 方式（小图片）
 */

// 云开发环境 ID
const CLOUDBASE_ENV_ID = 'test-1g71tc7eb37627e2';

/**
 * 图片压缩质量配置
 */
const COMPRESS_CONFIG = {
  maxWidth: 1920,      // 最大宽度
  maxHeight: 1920,     // 最大高度
  quality: 80          // 压缩质量 (0-100)
};

/**
 * 图片大小限制配置
 */
const IMAGE_SIZE_LIMITS = {
  maxFileSize: 10 * 1024 * 1024,  // 最大文件大小 10MB
  maxWidth: 4096,                  // 最大宽度
  maxHeight: 4096,                 // 最大高度
  minWidth: 200,                   // 最小宽度
  minHeight: 200                   // 最小高度
};

/**
 * 文件大小限制
 * 由于云托管 callContainer 请求体限制，直接使用云存储上传更稳定
 * 这个阈值设置得很低，确保大部分情况都走云存储
 */
const MAX_BASE64_SIZE = 50 * 1024; // 50KB，基本上所有图片都会走云存储

/**
 * 选择图片
 * @param {Object} options 选择配置
 * @param {number} [options.count=1] 最多选择数量
 * @param {string[]} [options.sourceType=['album', 'camera']] 来源类型
 * @param {string[]} [options.sizeType=['compressed']] 尺寸类型
 * @returns {Promise<Object[]>} 选择的图片列表
 */
const chooseImage = (options = {}) => {
  const {
    count = 1,
    sourceType = ['album', 'camera'],
    sizeType = ['compressed']
  } = options;

  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType,
      sizeType,
      success: (res) => {
        const files = res.tempFiles.map(file => ({
          path: file.tempFilePath,
          size: file.size,
          width: file.width,
          height: file.height
        }));
        console.log('[Upload] 选择图片成功:', files.length, '张');
        resolve(files);
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) {
          // 用户取消选择
          reject({ cancelled: true, message: '用户取消选择' });
        } else {
          console.error('[Upload] 选择图片失败:', err);
          reject(err);
        }
      }
    });
  });
};

/**
 * 选择单张图片
 * @param {Object} options 选择配置
 * @returns {Promise<Object>} 选择的图片
 */
const chooseOneImage = async (options = {}) => {
  const files = await chooseImage({ ...options, count: 1 });
  return files[0];
};

/**
 * 选择多张图片（时空拼图模式，最多5张）
 * @param {number} [maxCount=5] 最大数量
 * @returns {Promise<Object[]>} 选择的图片列表
 */
const chooseMultipleImages = (maxCount = 5) => {
  return chooseImage({ count: maxCount });
};

/**
 * 验证图片尺寸和大小
 * @param {string} filePath 图片路径
 * @returns {Promise<Object>} { valid: boolean, error?: string, info: Object }
 */
const validateImage = async (filePath) => {
  try {
    // 获取图片信息
    const info = await getImageInfo(filePath);
    const fileSize = await getFileSize(filePath);
    
    // 检查文件大小
    if (fileSize > IMAGE_SIZE_LIMITS.maxFileSize) {
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
      return {
        valid: false,
        error: `图片太大了（${sizeMB}MB），请选择小于10MB的图片`,
        info
      };
    }
    
    // 检查图片尺寸
    if (info.width > IMAGE_SIZE_LIMITS.maxWidth || info.height > IMAGE_SIZE_LIMITS.maxHeight) {
      return {
        valid: false,
        error: `图片尺寸过大（${info.width}x${info.height}），请选择小于4096x4096的图片`,
        info
      };
    }
    
    if (info.width < IMAGE_SIZE_LIMITS.minWidth || info.height < IMAGE_SIZE_LIMITS.minHeight) {
      return {
        valid: false,
        error: `图片尺寸太小（${info.width}x${info.height}），请选择大于200x200的图片`,
        info
      };
    }
    
    return { valid: true, info };
  } catch (err) {
    console.error('[Upload] 验证图片失败:', err);
    return {
      valid: false,
      error: '无法读取图片信息，请重新选择',
      info: null
    };
  }
};

/**
 * 压缩图片
 * @param {string} filePath 图片路径
 * @param {Object} [options] 压缩配置
 * @param {number} [options.quality=80] 压缩质量
 * @returns {Promise<string>} 压缩后的图片路径
 */
const compressImage = (filePath, options = {}) => {
  const { quality = COMPRESS_CONFIG.quality } = options;

  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      quality,
      success: (res) => {
        console.log('[Upload] 图片压缩成功');
        resolve(res.tempFilePath);
      },
      fail: (err) => {
        console.error('[Upload] 图片压缩失败:', err);
        // 压缩失败时返回原图
        resolve(filePath);
      }
    });
  });
};

/**
 * 获取图片信息
 * @param {string} filePath 图片路径
 * @returns {Promise<Object>} 图片信息
 */
const getImageInfo = (filePath) => {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: filePath,
      success: (res) => {
        resolve({
          width: res.width,
          height: res.height,
          path: res.path,
          orientation: res.orientation,
          type: res.type
        });
      },
      fail: reject
    });
  });
};

/**
 * 将图片转换为 Base64
 * @param {string} filePath 图片路径
 * @returns {Promise<string>} Base64 字符串
 */
const imageToBase64 = (filePath) => {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (res) => {
        // 获取图片类型
        const ext = filePath.split('.').pop().toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const base64 = `data:${mimeType};base64,${res.data}`;
        resolve(base64);
      },
      fail: reject
    });
  });
};

/**
 * 获取文件大小
 * @param {string} filePath 文件路径
 * @returns {Promise<number>} 文件大小（字节）
 */
const getFileSize = (filePath) => {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    fs.getFileInfo({
      filePath,
      success: (res) => resolve(res.size),
      fail: (err) => {
        console.warn('[Upload] 获取文件大小失败:', err);
        resolve(0); // 失败时返回 0，让后续逻辑使用云存储
      }
    });
  });
};

/**
 * 使用云存储上传图片
 * @param {string} filePath 图片路径
 * @param {Function} [onProgress] 进度回调
 * @returns {Promise<string>} 云存储文件 ID
 */
const uploadToCloudStorage = (filePath, onProgress) => {
  return new Promise((resolve, reject) => {
    // 生成唯一的云存储路径
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = filePath.split('.').pop().toLowerCase() || 'jpg';
    const cloudPath = `uploads/${timestamp}_${random}.${ext}`;

    const uploadTask = wx.cloud.uploadFile({
      cloudPath,
      filePath,
      config: {
        env: CLOUDBASE_ENV_ID
      },
      success: (res) => {
        if (res.fileID) {
          resolve(res.fileID);
        } else {
          reject(new Error('云存储上传失败：未返回 fileID'));
        }
      },
      fail: (err) => {
        console.error('[Upload] 云存储上传失败:', err);
        reject(err);
      }
    });

    // 监听上传进度
    if (onProgress) {
      uploadTask.onProgressUpdate((res) => {
        onProgress(res.progress);
      });
    }
  });
};

/**
 * 获取云存储文件的临时 URL
 * @param {string} fileID 云存储文件 ID
 * @returns {Promise<string>} 临时访问 URL
 */
const getTempFileURL = (fileID) => {
  return new Promise((resolve, reject) => {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          resolve(res.fileList[0].tempFileURL);
        } else {
          reject(new Error('获取临时 URL 失败'));
        }
      },
      fail: reject
    });
  });
};

/**
 * 上传图片到 OSS
 * 优先使用云存储上传，更稳定可靠
 * @param {string} filePath 图片路径
 * @param {Function} [onProgress] 进度回调
 * @param {Object} [options] 配置选项
 * @param {boolean} [options.skipValidation=false] 是否跳过验证
 * @returns {Promise<string>} 上传后的图片 URL
 */
const uploadImage = async (filePath, onProgress, options = {}) => {
  try {
    // 验证图片（除非明确跳过）
    if (!options.skipValidation) {
      if (onProgress) onProgress(5);
      const validation = await validateImage(filePath);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      console.log('[Upload] 图片验证通过:', validation.info);
    }
    
    // 先压缩图片
    if (onProgress) onProgress(10);
    const compressedPath = await compressImage(filePath);

    // 获取压缩后的文件大小
    const fileSize = await getFileSize(compressedPath);
    console.log('[Upload] 压缩后文件大小:', (fileSize / 1024).toFixed(2), 'KB');
    
    // 直接使用云存储上传，更稳定可靠
    // 云托管 callContainer 有请求体大小限制，云存储没有这个问题
    return await uploadImageViaCloudStorage(compressedPath, onProgress);
  } catch (err) {
    console.error('[Upload] 上传失败:', err);
    throw err;
  }
};

/**
 * 通过云存储上传图片到 OSS
 * 1. 先上传到云存储获取临时 URL
 * 2. 将临时 URL 传给后端转存到 OSS
 * 3. 如果后端转存失败，直接返回临时 URL
 * @param {string} filePath 图片路径
 * @param {Function} [onProgress] 进度回调
 * @returns {Promise<string>} OSS 图片 URL
 */
const uploadImageViaCloudStorage = async (filePath, onProgress) => {
  const { uploadAPI } = require('./api');

  // 上传到云存储
  if (onProgress) onProgress(20);
  const fileID = await uploadToCloudStorage(filePath, (percent) => {
    if (onProgress) onProgress(20 + percent * 0.5); // 20-70%
  });

  // 获取临时 URL
  if (onProgress) onProgress(75);
  const tempUrl = await getTempFileURL(fileID);

  // 尝试调用后端接口转存到 OSS
  if (onProgress) onProgress(80);
  try {
    const result = await uploadAPI.uploadImageFromUrl(tempUrl);

    if (result.success && result.data && result.data.imageUrl) {
      if (onProgress) onProgress(100);
      return result.data.imageUrl;
    }
  } catch (err) {
    // 后端接口可能不存在（404）或其他错误，静默处理
  }

  // 如果后端转存失败，直接返回云存储临时 URL
  // 临时 URL 有效期约 2 小时，对于即时使用场景足够
  if (onProgress) onProgress(100);
  return tempUrl;
};

/**
 * 上传图片到 OSS（使用 Base64 方式）
 * 适用于小文件（< 300KB）
 * @param {string} filePath 图片路径
 * @param {Function} [onProgress] 进度回调
 * @returns {Promise<string>} 上传后的图片 URL
 */
const uploadImageBase64 = async (filePath, onProgress) => {
  const { uploadAPI } = require('./api');

  // 转换为 Base64
  if (onProgress) onProgress(30);
  const base64 = await imageToBase64(filePath);

  // 上传
  if (onProgress) onProgress(50);
  
  try {
    const result = await uploadAPI.uploadImage(base64);

    if (result.success && result.data && result.data.imageUrl) {
      if (onProgress) onProgress(100);
      console.log('[Upload] Base64 上传成功:', result.data.imageUrl);
      return result.data.imageUrl;
    }

    throw new Error(result.message || '上传失败');
  } catch (err) {
    // 如果是云托管请求体过大的错误，抛出特定错误让上层处理
    if (err.errCode === -606001 || err.code === -606001 || 
        (err.message && err.message.includes('606001'))) {
      console.log('[Upload] Base64 上传失败（请求体过大），需要切换到云存储');
      const error = new Error('请求体过大');
      error.errCode = -606001;
      throw error;
    }
    throw err;
  }
};

/**
 * 批量上传图片
 * @param {string[]} filePaths 图片路径数组
 * @param {Function} [onProgress] 进度回调 (current, total, percent)
 * @returns {Promise<string[]>} 上传后的图片 URL 数组
 */
const uploadImages = async (filePaths, onProgress) => {
  const urls = [];
  const total = filePaths.length;

  for (let i = 0; i < total; i++) {
    const filePath = filePaths[i];
    
    try {
      const url = await uploadImage(filePath, (percent) => {
        if (onProgress) {
          const overallPercent = Math.floor(((i + percent / 100) / total) * 100);
          onProgress(i + 1, total, overallPercent);
        }
      });
      urls.push(url);
    } catch (err) {
      console.error(`[Upload] 第 ${i + 1} 张图片上传失败:`, err);
      throw new Error(`第 ${i + 1} 张图片上传失败`);
    }
  }

  return urls;
};

/**
 * 选择并上传图片（一站式）
 * @param {Object} options 配置
 * @param {number} [options.count=1] 选择数量
 * @param {Function} [options.onProgress] 进度回调
 * @returns {Promise<string[]>} 上传后的图片 URL 数组
 */
const chooseAndUpload = async (options = {}) => {
  const { count = 1, onProgress } = options;

  // 选择图片
  const files = await chooseImage({ count });
  const filePaths = files.map(f => f.path);

  // 上传图片
  return await uploadImages(filePaths, onProgress);
};

/**
 * 预览图片
 * @param {string} current 当前图片 URL
 * @param {string[]} urls 所有图片 URL 数组
 */
const previewImage = (current, urls) => {
  wx.previewImage({
    current,
    urls
  });
};

/**
 * 保存图片到相册
 * @param {string} url 图片 URL
 * @returns {Promise<void>}
 */
const saveImageToAlbum = (url) => {
  return new Promise((resolve, reject) => {
    // 先下载图片
    wx.downloadFile({
      url,
      success: (downloadRes) => {
        if (downloadRes.statusCode === 200) {
          // 保存到相册
          wx.saveImageToPhotosAlbum({
            filePath: downloadRes.tempFilePath,
            success: () => {
              wx.showToast({
                title: '保存成功',
                icon: 'success'
              });
              resolve();
            },
            fail: (err) => {
              if (err.errMsg && err.errMsg.includes('auth deny')) {
                // 用户拒绝授权
                wx.showModal({
                  title: '提示',
                  content: '需要您授权保存图片到相册',
                  confirmText: '去设置',
                  success: (res) => {
                    if (res.confirm) {
                      wx.openSetting();
                    }
                  }
                });
              } else {
                wx.showToast({
                  title: '保存失败',
                  icon: 'none'
                });
              }
              reject(err);
            }
          });
        } else {
          reject(new Error('下载图片失败'));
        }
      },
      fail: reject
    });
  });
};

/**
 * 检查相册权限
 * @returns {Promise<boolean>} 是否有权限
 */
const checkAlbumPermission = () => {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          resolve(true);
        } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
          // 用户之前拒绝过
          resolve(false);
        } else {
          // 未请求过权限
          resolve(true);
        }
      },
      fail: () => resolve(false)
    });
  });
};

/**
 * 请求相册权限
 * @returns {Promise<boolean>} 是否授权成功
 */
const requestAlbumPermission = () => {
  return new Promise((resolve) => {
    wx.authorize({
      scope: 'scope.writePhotosAlbum',
      success: () => resolve(true),
      fail: () => {
        // 引导用户去设置页开启权限
        wx.showModal({
          title: '提示',
          content: '需要您授权保存图片到相册，请在设置中开启',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting({
                success: (settingRes) => {
                  resolve(!!settingRes.authSetting['scope.writePhotosAlbum']);
                },
                fail: () => resolve(false)
              });
            } else {
              resolve(false);
            }
          }
        });
      }
    });
  });
};

module.exports = {
  COMPRESS_CONFIG,
  IMAGE_SIZE_LIMITS,
  MAX_BASE64_SIZE,
  chooseImage,
  chooseOneImage,
  chooseMultipleImages,
  validateImage,
  compressImage,
  getImageInfo,
  getFileSize,
  imageToBase64,
  uploadToCloudStorage,
  getTempFileURL,
  uploadImage,
  uploadImageViaCloudStorage,
  uploadImageBase64,
  uploadImages,
  chooseAndUpload,
  previewImage,
  saveImageToAlbum,
  checkAlbumPermission,
  requestAlbumPermission
};
