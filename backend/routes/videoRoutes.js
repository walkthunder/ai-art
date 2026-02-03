/**
 * 视频生成路由模块
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const userServiceV2 = require('../services/userServiceV2');
const { generateVideo, getVideoTaskStatus } = require('../services/videoService');
const { convertToLivePhoto } = require('../services/pythonBridge');
const { uploadImageToOSS } = require('../services/ossService');
const { validateRequest, validateGenerateVideoParams } = require('../utils/validation');

// 生成微动态视频
router.post('/generate-video', validateRequest(validateGenerateVideoParams), async (req, res) => {
  try {
    const { imageUrl, userId, motionBucketId, fps, videoLength, dynamicType } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 imageUrl 参数' });
    }
    
    // 检查用户付费状态 - 只有尊享包用户可以使用
    if (userId) {
      try {
        const user = await userServiceV2.getUserById(userId);
        if (!user) {
          return res.status(404).json({ error: '用户不存在', message: '未找到对应的用户' });
        }
        
        if (user.payment_status !== 'premium') {
          return res.status(403).json({ 
            error: '权限不足', 
            message: '微动态功能仅对尊享包用户开放，请升级套餐' 
          });
        }
      } catch (error) {
        console.error('获取用户付费状态失败:', error);
        return res.status(500).json({ error: '获取用户信息失败', message: error.message });
      }
    } else {
      return res.status(401).json({ error: '未授权', message: '需要提供 userId 参数' });
    }
    
    const taskId = await generateVideo(
      imageUrl,
      motionBucketId || 10,
      fps || 10,
      videoLength || 5,
      dynamicType || 'festival'
    );
    
    res.json({ 
      success: true, 
      data: { taskId, message: '视频生成任务已创建，请轮询查询任务状态' }
    });
  } catch (error) {
    console.error('生成视频失败:', error);
    res.status(500).json({ error: '生成视频失败', message: error.message });
  }
});

// 查询视频生成任务状态
router.get('/video-task-status/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!taskId) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 taskId 参数' });
    }
    
    const status = await getVideoTaskStatus(taskId);
    
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('查询视频任务状态失败:', error);
    res.status(500).json({ error: '查询视频任务状态失败', message: error.message });
  }
});

// 转换视频为Live Photo格式
router.post('/convert-to-live-photo', async (req, res) => {
  try {
    const { videoUrl, userId } = req.body;
    
    if (!videoUrl) {
      return res.status(400).json({ error: '缺少必要参数', message: '需要提供 videoUrl 参数' });
    }
    
    // 检查用户付费状态
    if (userId) {
      try {
        const user = await userServiceV2.getUserById(userId);
        if (!user) {
          return res.status(404).json({ error: '用户不存在', message: '未找到对应的用户' });
        }
        
        if (user.payment_status !== 'premium') {
          return res.status(403).json({ 
            error: '权限不足', 
            message: 'Live Photo功能仅对尊享包用户开放，请升级套餐' 
          });
        }
      } catch (error) {
        console.error('获取用户付费状态失败:', error);
        return res.status(500).json({ error: '获取用户信息失败', message: error.message });
      }
    } else {
      return res.status(401).json({ error: '未授权', message: '需要提供 userId 参数' });
    }
    
    const result = await convertToLivePhoto(videoUrl);
    
    if (!result.success) {
      return res.status(500).json({ error: 'Live Photo转换失败', message: result.message });
    }
    
    // 读取转换后的文件并上传
    const livePhotoBuffer = fs.readFileSync(result.output_path);
    const livePhotoBase64 = `data:video/quicktime;base64,${livePhotoBuffer.toString('base64')}`;
    const livePhotoUrl = await uploadImageToOSS(livePhotoBase64);
    
    // 清理临时文件
    try { fs.unlinkSync(result.output_path); } catch (e) { console.error('清理临时文件失败:', e); }
    
    res.json({ 
      success: true, 
      data: { 
        livePhotoUrl, fileSize: result.file_size, message: 'Live Photo格式转换成功'
      } 
    });
  } catch (error) {
    console.error('转换Live Photo失败:', error);
    res.status(500).json({ error: '转换Live Photo失败', message: error.message });
  }
});

module.exports = router;
