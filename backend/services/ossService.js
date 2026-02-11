/**
 * 腾讯云OSS服务模块
 * 处理图片上传到腾讯云COS
 */

const COS = require('cos-nodejs-sdk-v5');

// 腾讯云OSS配置
const COS_BUCKET = process.env.COS_BUCKET;
const COS_REGION = process.env.COS_REGION;
const COS_DOMAIN = process.env.COS_DOMAIN;

// 初始化COS实例
let cos = null;

function initCOS() {
  if (!cos && process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY) {
    cos = new COS({
      SecretId: process.env.COS_SECRET_ID,
      SecretKey: process.env.COS_SECRET_KEY,
    });
  }
  return cos;
}

/**
 * 上传图片到腾讯云OSS
 * @param base64Image Base64编码的图片数据
 * @returns 上传后的图片URL
 */
async function uploadImageToOSS(base64Image) {
  return new Promise((resolve, reject) => {
    try {
      const cosInstance = initCOS();
      
      if (!cosInstance || !COS_BUCKET || !COS_REGION || !COS_DOMAIN) {
        throw new Error('腾讯云OSS配置未设置，请检查.env文件中的配置');
      }
      
      // 移除Base64数据URI前缀
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
      
      // 将Base64转换为Buffer
      const buffer = Buffer.from(base64Data, 'base64');
      
      // 获取MIME类型
      let mimeType = 'image/jpeg';
      if (base64Image.startsWith('data:image/png')) {
        mimeType = 'image/png';
      } else if (base64Image.startsWith('data:image/gif')) {
        mimeType = 'image/gif';
      }
      
      // 生成文件名
      const fileExtension = mimeType.split('/')[1];
      const fileName = `art-photos/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
      
      // 上传到COS
      cosInstance.putObject({
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: fileName,
        Body: buffer,
        ContentEncoding: 'base64',
        ContentType: mimeType
      }, function(err, data) {
        if (err) {
          console.error('上传到OSS失败:', err);
          reject(new Error('图片上传失败，请稍后重试'));
        } else {
          const url = `https://${COS_DOMAIN}/${fileName}`;
          console.log('上传到OSS成功:', url);
          resolve(url);
        }
      });
    } catch (error) {
      console.error('上传图片到OSS失败:', error);
      reject(new Error('图片上传失败，请稍后重试'));
    }
  });
}

/**
 * 从URL下载图片并上传到腾讯云OSS
 * @param imageUrl 图片URL
 * @returns 上传后的OSS URL
 */
async function uploadImageFromUrlToOSS(imageUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      const cosInstance = initCOS();
      
      if (!cosInstance || !COS_BUCKET || !COS_REGION || !COS_DOMAIN) {
        throw new Error('腾讯云OSS配置未设置，请检查.env文件中的配置');
      }
      
      console.log(`[OSS] 开始从URL下载图片: ${imageUrl.substring(0, 100)}...`);
      
      // 下载图片
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`下载图片失败，状态码: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // 获取Content-Type
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // 根据Content-Type确定文件扩展名
      let fileExtension = 'jpg';
      if (contentType.includes('png')) {
        fileExtension = 'png';
      } else if (contentType.includes('gif')) {
        fileExtension = 'gif';
      } else if (contentType.includes('webp')) {
        fileExtension = 'webp';
      }
      
      // 生成文件名
      const fileName = `art-photos/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
      
      console.log(`[OSS] 图片下载完成，大小: ${buffer.length} 字节，准备上传到: ${fileName}`);
      
      // 上传到COS
      cosInstance.putObject({
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: fileName,
        Body: buffer,
        ContentType: contentType
      }, function(err, data) {
        if (err) {
          console.error('[OSS] 上传失败:', err);
          reject(new Error('图片上传失败，请稍后重试'));
        } else {
          const url = `https://${COS_DOMAIN}/${fileName}`;
          console.log('[OSS] 上传成功:', url);
          resolve(url);
        }
      });
    } catch (error) {
      console.error('[OSS] 从URL上传图片失败:', error);
      reject(error);
    }
  });
}

/**
 * 批量从URL下载图片并上传到OSS
 * @param imageUrls 图片URL数组
 * @returns 上传后的OSS URL数组
 */
async function uploadImagesFromUrlsToOSS(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) {
    return [];
  }
  
  console.log(`[OSS] 开始批量转存 ${imageUrls.length} 张图片到OSS`);
  
  const results = [];
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const ossUrl = await uploadImageFromUrlToOSS(imageUrls[i]);
      results.push(ossUrl);
      console.log(`[OSS] 第 ${i + 1}/${imageUrls.length} 张图片转存成功`);
    } catch (error) {
      console.error(`[OSS] 第 ${i + 1}/${imageUrls.length} 张图片转存失败:`, error.message);
      // 如果转存失败，保留原始URL
      results.push(imageUrls[i]);
    }
  }
  
  console.log(`[OSS] 批量转存完成，成功: ${results.filter(url => url.includes(COS_DOMAIN)).length}/${imageUrls.length}`);
  return results;
}

/**
 * 上传视频到腾讯云OSS
 * @param base64Video Base64编码的视频数据
 * @param mimeType 视频MIME类型
 * @returns 上传后的视频URL
 */
async function uploadVideoToOSS(base64Video, mimeType = 'video/mp4') {
  return new Promise((resolve, reject) => {
    try {
      const cosInstance = initCOS();
      
      if (!cosInstance || !COS_BUCKET || !COS_REGION || !COS_DOMAIN) {
        throw new Error('腾讯云OSS配置未设置');
      }
      
      const base64Data = base64Video.replace(/^data:video\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      const fileExtension = mimeType.split('/')[1] || 'mp4';
      const fileName = `videos/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
      
      cosInstance.putObject({
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: fileName,
        Body: buffer,
        ContentEncoding: 'base64',
        ContentType: mimeType
      }, function(err, data) {
        if (err) {
          console.error('上传视频到OSS失败:', err);
          reject(new Error('视频上传失败'));
        } else {
          const url = `https://${COS_DOMAIN}/${fileName}`;
          console.log('上传视频到OSS成功:', url);
          resolve(url);
        }
      });
    } catch (error) {
      console.error('上传视频到OSS失败:', error);
      reject(error);
    }
  });
}

/**
 * 上传文件到腾讯云OSS（通用方法）
 * @param buffer 文件Buffer
 * @param fileName 文件名（包含路径）
 * @param contentType 文件MIME类型
 * @returns 上传后的文件URL
 */
async function uploadFileToOSS(buffer, fileName, contentType) {
  return new Promise((resolve, reject) => {
    try {
      const cosInstance = initCOS();
      
      if (!cosInstance || !COS_BUCKET || !COS_REGION || !COS_DOMAIN) {
        throw new Error('腾讯云OSS配置未设置');
      }
      
      console.log(`[OSS] 上传文件: ${fileName}, 大小: ${buffer.length} 字节`);
      
      cosInstance.putObject({
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: fileName,
        Body: buffer,
        ContentType: contentType
      }, function(err, data) {
        if (err) {
          console.error('[OSS] 上传文件失败:', err);
          reject(new Error('文件上传失败'));
        } else {
          const url = `https://${COS_DOMAIN}/${fileName}`;
          console.log('[OSS] 上传文件成功:', url);
          resolve(url);
        }
      });
    } catch (error) {
      console.error('[OSS] 上传文件失败:', error);
      reject(error);
    }
  });
}

module.exports = {
  initCOS,
  uploadImageToOSS,
  uploadImageFromUrlToOSS,
  uploadImagesFromUrlsToOSS,
  uploadVideoToOSS,
  uploadFileToOSS,
  COS_BUCKET,
  COS_REGION,
  COS_DOMAIN
};
