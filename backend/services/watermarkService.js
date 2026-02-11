/**
 * 水印服务
 * 为免费用户的图片添加自定义水印
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const appConfig = require('../config/app');
const { uploadImageToOSS } = require('./ossService');

/**
 * 为图片添加水印
 * @param {string} imageUrl - 图片URL或本地路径
 * @param {Object} options - 水印选项
 * @returns {Promise<string>} 添加水印后的图片URL
 */
async function addWatermarkToImage(imageUrl, options = {}) {
  try {
    console.log(`[水印服务] 开始为图片添加水印: ${imageUrl}`);
    
    // 获取水印配置（从数据库）
    const watermarkConfig = await appConfig.getWatermarkConfig();
    const watermarkText = options.text || watermarkConfig.text;
    const qrUrl = options.qrUrl || watermarkConfig.qrUrl;
    const qrImageUrl = options.qrImageUrl || watermarkConfig.qrImageUrl; // 新增：小程序码图片URL
    const position = options.position || watermarkConfig.position;
    
    console.log(`[水印服务] 水印文字: ${watermarkText}`);
    console.log(`[水印服务] 二维码URL: ${qrUrl}`);
    console.log(`[水印服务] 二维码图片: ${qrImageUrl || '使用生成的二维码'}`);
    
    // 如果是URL，先下载图片
    let inputPath = imageUrl;
    let needCleanup = false;
    
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      inputPath = await downloadImage(imageUrl);
      needCleanup = true;
    }
    
    // 生成输出路径
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const os = require('os');
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, `watermarked_${timestamp}_${random}.jpg`);
    
    // 调用Python脚本添加水印
    const result = await callWatermarkScript({
      image_path: inputPath,
      output_path: outputPath,
      watermark_text: watermarkText,
      qr_url: qrUrl,
      qr_image_url: qrImageUrl, // 新增：传递小程序码图片URL
      position: position,
    });
    
    if (!result.success) {
      throw new Error(result.message || '水印添加失败');
    }
    
    console.log(`[水印服务] 水印添加成功: ${outputPath}`);
    
    // 上传到OSS
    const watermarkedImageUrl = await uploadWatermarkedImage(outputPath);
    
    console.log(`[水印服务] 水印图片已上传: ${watermarkedImageUrl}`);
    
    // 清理临时文件
    if (needCleanup) {
      await fs.unlink(inputPath).catch(err => 
        console.warn(`[水印服务] 清理临时文件失败: ${err.message}`)
      );
    }
    await fs.unlink(outputPath).catch(err => 
      console.warn(`[水印服务] 清理输出文件失败: ${err.message}`)
    );
    
    return watermarkedImageUrl;
  } catch (error) {
    console.error('[水印服务] 添加水印失败:', error);
    throw error;
  }
}

/**
 * 批量为图片添加水印
 * @param {string[]} imageUrls - 图片URL数组
 * @param {Object} options - 水印选项
 * @returns {Promise<string[]>} 添加水印后的图片URL数组
 */
async function addWatermarkToImages(imageUrls, options = {}) {
  console.log(`[水印服务] 批量添加水印，共 ${imageUrls.length} 张图片`);
  
  const results = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      console.log(`[水印服务] 处理第 ${i + 1}/${imageUrls.length} 张图片`);
      const watermarkedUrl = await addWatermarkToImage(imageUrls[i], options);
      results.push(watermarkedUrl);
    } catch (error) {
      console.error(`[水印服务] 第 ${i + 1} 张图片添加水印失败:`, error);
      // 失败时返回原图
      results.push(imageUrls[i]);
    }
  }
  
  console.log(`[水印服务] 批量处理完成，成功 ${results.length} 张`);
  return results;
}

/**
 * 下载图片到本地
 * @param {string} imageUrl - 图片URL
 * @returns {Promise<string>} 本地文件路径
 */
async function downloadImage(imageUrl) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const os = require('os');
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `download_${timestamp}_${random}.jpg`);
  
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`下载图片失败: ${response.status}`);
  }
  
  // 限制文件大小为10MB
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    throw new Error('图片文件过大，超过10MB限制');
  }
  
  const buffer = await response.arrayBuffer();
  
  // 再次检查实际大小
  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error('图片文件过大，超过10MB限制');
  }
  
  await fs.writeFile(tempPath, Buffer.from(buffer));
  
  return tempPath;
}

/**
 * 上传水印图片到OSS
 * @param {string} filePath - 本地文件路径
 * @returns {Promise<string>} OSS URL（带水印标识）
 */
async function uploadWatermarkedImage(filePath) {
  try {
    // 读取文件为base64
    const fileBuffer = await fs.readFile(filePath);
    const base64Image = `data:image/jpeg;base64,${fileBuffer.toString('base64')}`;
    
    // 上传到OSS
    const ossUrl = await uploadImageToOSS(base64Image);
    
    // 添加水印标识参数，便于前端检测
    const urlWithFlag = `${ossUrl}${ossUrl.includes('?') ? '&' : '?'}watermark=true&t=${Date.now()}`;
    
    console.log(`[水印服务] 已添加水印标识: ${urlWithFlag}`);
    
    return urlWithFlag;
  } catch (error) {
    console.error('[水印服务] 上传水印图片失败:', error);
    throw error;
  }
}

/**
 * 调用Python水印脚本
 * @param {Object} params - 脚本参数
 * @returns {Promise<Object>} 脚本执行结果
 */
function callWatermarkScript(params) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../utils/add_watermark.py');
    const pythonCmd = process.env.PYTHON_CMD || 'python3';
    
    console.log(`[水印服务] 调用Python脚本: ${scriptPath}`);
    console.log(`[水印服务] 参数:`, JSON.stringify(params, null, 2));
    
    const python = spawn(pythonCmd, [scriptPath, JSON.stringify(params)]);
    
    // 设置30秒超时
    const timeout = setTimeout(() => {
      python.kill();
      reject(new Error('水印脚本执行超时（30秒）'));
    }, 30000);
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    python.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0) {
        console.error(`[水印服务] Python脚本执行失败 (code ${code}):`, stderr);
        reject(new Error(`水印脚本执行失败: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        console.error(`[水印服务] 解析脚本输出失败:`, stdout);
        reject(new Error(`解析脚本输出失败: ${error.message}`));
      }
    });
    
    python.on('error', (error) => {
      console.error(`[水印服务] 启动Python脚本失败:`, error);
      reject(new Error(`启动Python脚本失败: ${error.message}`));
    });
  });
}

/**
 * 检查是否需要添加水印
 * @param {string} paymentStatus - 用户付费状态
 * @returns {Promise<boolean>} 是否需要添加水印
 */
async function shouldAddWatermark(paymentStatus) {
  // 只有免费用户需要添加水印
  const enableWatermark = await appConfig.getConfig('features.enableWatermark', true);
  return paymentStatus === 'free' && enableWatermark;
}

/**
 * 为视频添加水印
 * @param {string} videoUrl - 视频URL
 * @param {string} userId - 用户ID
 * @returns {Promise<string>} 带水印的视频URL
 */
async function addWatermarkToVideo(videoUrl, userId) {
  try {
    console.log(`[视频水印] 开始为视频添加水印: ${videoUrl}`);
    
    // 获取水印配置
    const watermarkConfig = await appConfig.getWatermarkConfig();
    const watermarkText = watermarkConfig.text || '团圆照相馆';
    
    console.log(`[视频水印] 水印文字: ${watermarkText}`);
    
    // 如果是URL，先下载视频
    let inputPath = videoUrl;
    let needCleanup = false;
    
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      inputPath = await downloadVideo(videoUrl);
      needCleanup = true;
    }
    
    // 生成输出路径
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const os = require('os');
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, `watermarked_video_${timestamp}_${random}.mp4`);
    
    // 使用FFmpeg添加水印
    await addWatermarkWithFFmpeg(inputPath, outputPath, watermarkText);
    
    console.log(`[视频水印] 水印添加成功: ${outputPath}`);
    
    // 上传到OSS
    const watermarkedVideoUrl = await uploadWatermarkedVideo(outputPath);
    
    console.log(`[视频水印] 水印视频已上传: ${watermarkedVideoUrl}`);
    
    // 清理临时文件
    if (needCleanup) {
      await fs.unlink(inputPath).catch(err => 
        console.warn(`[视频水印] 清理临时文件失败: ${err.message}`)
      );
    }
    await fs.unlink(outputPath).catch(err => 
      console.warn(`[视频水印] 清理输出文件失败: ${err.message}`)
    );
    
    return watermarkedVideoUrl;
  } catch (error) {
    console.error('[视频水印] 添加水印失败:', error);
    throw error;
  }
}

/**
 * 下载视频到本地
 * @param {string} videoUrl - 视频URL
 * @returns {Promise<string>} 本地文件路径
 */
async function downloadVideo(videoUrl) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const os = require('os');
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `download_video_${timestamp}_${random}.mp4`);
  
  console.log(`[视频水印] 下载视频: ${videoUrl}`);
  
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`下载视频失败: ${response.status}`);
  }
  
  // 限制文件大小为50MB
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
    throw new Error('视频文件过大，超过50MB限制');
  }
  
  const buffer = await response.arrayBuffer();
  
  // 再次检查实际大小
  if (buffer.byteLength > 50 * 1024 * 1024) {
    throw new Error('视频文件过大，超过50MB限制');
  }
  
  await fs.writeFile(tempPath, Buffer.from(buffer));
  
  console.log(`[视频水印] 视频下载完成: ${tempPath}`);
  return tempPath;
}

/**
 * 使用FFmpeg为视频添加水印
 * @param {string} inputPath - 输入视频路径
 * @param {string} outputPath - 输出视频路径
 * @param {string} watermarkText - 水印文字
 * @returns {Promise<void>}
 */
function addWatermarkWithFFmpeg(inputPath, outputPath, watermarkText) {
  return new Promise((resolve, reject) => {
    const ffmpegCmd = process.env.FFMPEG_CMD || 'ffmpeg';
    
    // FFmpeg命令：在视频右下角添加半透明水印
    // -vf "drawtext=text='文字':x=W-tw-10:y=H-th-10:fontsize=24:fontcolor=white@0.5"
    const args = [
      '-i', inputPath,
      '-vf', `drawtext=text='${watermarkText}':x=W-tw-10:y=H-th-10:fontsize=24:fontcolor=white@0.5`,
      '-codec:a', 'copy', // 音频直接复制，不重新编码
      '-y', // 覆盖输出文件
      outputPath
    ];
    
    console.log(`[视频水印] 执行FFmpeg命令: ${ffmpegCmd} ${args.join(' ')}`);
    
    const ffmpeg = spawn(ffmpegCmd, args);
    
    // 设置60秒超时
    const timeout = setTimeout(() => {
      ffmpeg.kill();
      reject(new Error('FFmpeg执行超时（60秒）'));
    }, 60000);
    
    let stderr = '';
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0) {
        console.error(`[视频水印] FFmpeg执行失败 (code ${code}):`, stderr);
        reject(new Error(`FFmpeg执行失败: ${stderr}`));
        return;
      }
      
      console.log('[视频水印] FFmpeg执行成功');
      resolve();
    });
    
    ffmpeg.on('error', (error) => {
      clearTimeout(timeout);
      console.error(`[视频水印] 启动FFmpeg失败:`, error);
      reject(new Error(`启动FFmpeg失败: ${error.message}`));
    });
  });
}

/**
 * 上传水印视频到OSS
 * @param {string} filePath - 本地文件路径
 * @returns {Promise<string>} OSS URL
 */
async function uploadWatermarkedVideo(filePath) {
  try {
    console.log('[视频水印] 开始上传水印视频到OSS...');
    
    // 读取文件
    const fileBuffer = await fs.readFile(filePath);
    
    // 上传到OSS（需要实现视频上传功能）
    // 注意：这里假设ossService有uploadVideoToOSS方法
    // 如果没有，需要扩展ossService
    const ossService = require('./ossService');
    
    // 生成文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const fileName = `caishen-videos/watermarked_${timestamp}_${random}.mp4`;
    
    // 上传视频
    let ossUrl;
    if (typeof ossService.uploadVideoToOSS === 'function') {
      ossUrl = await ossService.uploadVideoToOSS(fileBuffer, fileName);
    } else {
      // 如果没有专门的视频上传方法，使用通用上传
      ossUrl = await ossService.uploadFileToOSS(fileBuffer, fileName, 'video/mp4');
    }
    
    // 添加水印标识参数
    const urlWithFlag = `${ossUrl}${ossUrl.includes('?') ? '&' : '?'}watermark=true&t=${Date.now()}`;
    
    console.log(`[视频水印] 水印视频已上传: ${urlWithFlag}`);
    
    return urlWithFlag;
  } catch (error) {
    console.error('[视频水印] 上传水印视频失败:', error);
    throw error;
  }
}

module.exports = {
  addWatermarkToImage,
  addWatermarkToImages,
  addWatermarkToVideo,
  shouldAddWatermark,
};
