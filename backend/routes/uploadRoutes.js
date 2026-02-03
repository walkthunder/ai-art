/**
 * 上传相关路由模块
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { uploadImageToOSS } = require('../services/ossService');
const { extractFaces, addWatermark } = require('../services/pythonBridge');
const { validateRequest, validateUploadImageParams, validateExtractFacesParams } = require('../utils/validation');
const userService = require('../services/userService');

// 上传图片到OSS（Base64 方式）
router.post('/upload-image', validateRequest(validateUploadImageParams), async (req, res) => {
  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 image 参数' });
    }
    
    const imageUrl = await uploadImageToOSS(image);
    res.json({ success: true, data: { imageUrl } });
  } catch (error) {
    console.error('上传图片失败:', error);
    res.status(500).json({ error: '上传图片失败', message: error.message });
  }
});

// 从 URL 上传图片到 OSS（用于云存储转存）
router.post('/upload-image-from-url', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 imageUrl 参数' });
    }
    
    console.log('[Upload] 从 URL 下载图片:', imageUrl.substring(0, 100) + '...');
    
    // 下载图片到临时文件
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `download_${Date.now()}.jpg`);
    
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempFilePath);
      const protocol = imageUrl.startsWith('https') ? https : http;
      
      protocol.get(imageUrl, (response) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          const redirectProtocol = redirectUrl.startsWith('https') ? https : http;
          redirectProtocol.get(redirectUrl, (redirectResponse) => {
            redirectResponse.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
          }).on('error', reject);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`下载失败，状态码: ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', (err) => {
        fs.unlink(tempFilePath, () => {});
        reject(err);
      });
    });
    
    // 读取文件并转换为 Base64
    const imageBuffer = fs.readFileSync(tempFilePath);
    const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    
    // 清理临时文件
    fs.unlink(tempFilePath, () => {});
    
    // 上传到 OSS
    const ossUrl = await uploadImageToOSS(base64Image);
    
    console.log('[Upload] URL 转存成功:', ossUrl);
    res.json({ success: true, data: { imageUrl: ossUrl } });
  } catch (error) {
    console.error('从 URL 上传图片失败:', error);
    res.status(500).json({ error: '上传图片失败', message: error.message });
  }
});

// 人脸提取
router.post('/extract-faces', validateRequest(validateExtractFacesParams), async (req, res) => {
  try {
    const { imageUrls } = req.body;
    
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 imageUrls 数组参数' });
    }
    
    // 临时跳过人脸检测，直接返回成功
    // TODO: 后续可以通过环境变量控制是否启用人脸检测
    console.log('[Upload] 人脸检测已临时跳过，直接返回成功');
    const mockResult = {
      success: true,
      faces: imageUrls.map((url, index) => ({
        image_url: url,
        face_index: index,
        confidence: 0.95,
        bbox: [100, 100, 300, 300]
      })),
      message: '检测成功（已跳过实际检测）'
    };
    
    res.json({ success: true, data: mockResult });
    
    // 原有的人脸检测逻辑（已注释）
    // const result = await extractFaces(imageUrls);
    // if (!result.success) {
    //   return res.status(400).json({ error: '人脸提取失败', message: result.message });
    // }
    // res.json({ success: true, data: result });
  } catch (error) {
    console.error('人脸提取失败:', error);
    res.status(500).json({ error: '人脸提取失败', message: error.message });
  }
});

// 添加水印
router.post('/add-watermark', async (req, res) => {
  try {
    const { imageUrl, userId } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 imageUrl 参数' });
    }
    
    // 检查用户付费状态
    let shouldAddWatermark = true;
    if (userId) {
      try {
        const user = await userService.getUserById(userId);
        if (user && user.payment_status !== 'free') {
          shouldAddWatermark = false;
        }
      } catch (error) {
        console.error('获取用户付费状态失败:', error);
      }
    }
    
    // 付费用户直接返回原图
    if (!shouldAddWatermark) {
      return res.json({ success: true, data: { imageUrl, watermarked: false } });
    }
    
    const tempDir = os.tmpdir();
    const tempInputPath = path.join(tempDir, `input_${Date.now()}.jpg`);
    const tempOutputPath = path.join(tempDir, `output_${Date.now()}.jpg`);
    
    // 下载图片
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempInputPath);
      https.get(imageUrl, (response) => {
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', (err) => {
        fs.unlink(tempInputPath, () => {});
        reject(err);
      });
    });
    
    // 添加水印
    const result = await addWatermark(
      tempInputPath, tempOutputPath,
      'AI全家福制作\n扫码去水印',
      process.env.PAYMENT_URL || 'https://your-domain.com/pay',
      'center'
    );
    
    if (!result.success) {
      fs.unlink(tempInputPath, () => {});
      fs.unlink(tempOutputPath, () => {});
      return res.status(500).json({ error: '添加水印失败', message: result.message });
    }
    
    // 上传到OSS
    const watermarkedImageBuffer = fs.readFileSync(tempOutputPath);
    const watermarkedImageBase64 = `data:image/jpeg;base64,${watermarkedImageBuffer.toString('base64')}`;
    const watermarkedImageUrl = await uploadImageToOSS(watermarkedImageBase64);
    
    // 清理临时文件
    fs.unlink(tempInputPath, () => {});
    fs.unlink(tempOutputPath, () => {});
    
    res.json({ success: true, data: { imageUrl: watermarkedImageUrl, watermarked: true } });
  } catch (error) {
    console.error('添加水印失败:', error);
    res.status(500).json({ error: '添加水印失败', message: error.message });
  }
});

// 付费解锁无水印图片
router.post('/unlock-watermark', async (req, res) => {
  try {
    const { taskId, userId } = req.body;
    
    if (!taskId || !userId) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 taskId 和 userId 参数' });
    }
    
    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在', message: '未找到对应的用户' });
    }
    
    if (user.payment_status === 'free') {
      return res.status(403).json({ error: '权限不足', message: '需要付费才能解锁无水印图片' });
    }
    
    const history = require('../history');
    const historyRecord = history.findHistoryRecordByTaskId(taskId);
    
    if (!historyRecord || !historyRecord.generatedImageUrls || historyRecord.generatedImageUrls.length === 0) {
      return res.status(404).json({ error: '任务不存在', message: '未找到对应的生成任务' });
    }
    
    res.json({ 
      success: true, 
      data: { imageUrls: historyRecord.generatedImageUrls, message: '已解锁无水印高清图片' }
    });
  } catch (error) {
    console.error('解锁无水印图片失败:', error);
    res.status(500).json({ error: '解锁无水印图片失败', message: error.message });
  }
});

module.exports = router;
