/**
 * 视频生成服务
 * 处理财神变身视频生成相关功能
 * 集成火山引擎即梦AI图生视频API (Seedance Image-to-Video)
 * 
 * API文档: https://www.volcengine.com/docs/82379/1520758
 * 接口地址: https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
 * 认证方式: Bearer Token (ARK_API_KEY)
 */

const { executeWithRetry } = require('../utils/apiRetry');
const apiLogService = require('./apiLogService');

// 火山方舟视频生成API配置
const ARK_VIDEO_ENDPOINT = process.env.ARK_VIDEO_ENDPOINT || 
  'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';
const ARK_VIDEO_QUERY_ENDPOINT = process.env.ARK_VIDEO_ENDPOINT || 
  'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';

/**
 * 生成财神变身视频
 * @param {string} userImageUrl - 用户照片URL
 * @param {string} templateId - 模板ID
 * @param {string} userId - 用户ID
 * @param {string} paymentStatus - 付费状态 ('free' | 'paid')
 * @returns {Promise<string>} taskId
 */
async function generateCaishenVideo(userImageUrl, templateId, userId, paymentStatus = 'free') {
  return executeWithRetry(
    () => generateCaishenVideoInternal(userImageUrl, templateId, userId, paymentStatus),
    {
      maxRetries: 1,
      timeout: 60000,
      operationName: '生成财神视频',
      onRetry: (attempt, error) => {
        console.log(`[重试] 生成财神视频失败，准备第 ${attempt + 1} 次重试。错误: ${error.message}`);
      }
    }
  );
}

/**
 * 内部函数：生成财神变身视频
 */
async function generateCaishenVideoInternal(userImageUrl, templateId, userId, paymentStatus) {
  const startTime = Date.now();
  
  console.log(`\n========== [财神模式] 视频生成API调用准备 ==========`);
  console.log('👤 用户ID:', userId);
  console.log('🖼️  用户照片:', userImageUrl);
  console.log('🎬 模板ID:', templateId);
  console.log('💎 付费状态:', paymentStatus);
  
  // 检查API密钥配置
  if (!process.env.ARK_API_KEY) {
    throw new Error('ARK_API_KEY未配置，请在.env文件中配置 ARK_API_KEY');
  }
  
  // 获取模板配置
  const templates = require('../config/templates');
  const template = templates.getTemplateConfig('caishen', templateId);
  
  if (!template) {
    throw new Error(`未找到模板: ${templateId}`);
  }
  
  console.log('📋 模板名称:', template.name);
  console.log('🎨 视频提示词:', template.prompt);
  
  try {
    // 调用火山方舟图生视频API
    const videoResult = await callArkVideoAPI({
      userImageUrl,
      prompt: template.prompt,
      paymentStatus,
      duration: 5 // 5秒视频
    });
    
    console.log('✅ 视频生成任务已创建:', videoResult.id);
    console.log('📊 API响应:', JSON.stringify(videoResult, null, 2));
    
    // 记录API调用日志
    await apiLogService.logApiCall({
      mode: 'caishen',
      taskId: videoResult.id,
      request: {
        userImageUrl,
        templateId,
        prompt: template.prompt,
        userId,
        paymentStatus,
        duration: 5
      },
      response: videoResult,
      status: 'success',
      duration: Date.now() - startTime
    }).catch(err => console.error('[API日志] 记录失败:', err));
    
    return videoResult.id;
  } catch (error) {
    console.error('❌ 视频生成失败:', error);
    
    // 记录错误日志
    await apiLogService.logApiCall({
      mode: 'caishen',
      taskId: 'error',
      request: {
        userImageUrl,
        templateId,
        userId,
        paymentStatus
      },
      response: null,
      status: 'error',
      error: error.message,
      duration: Date.now() - startTime
    }).catch(err => console.error('[API日志] 记录失败:', err));
    
    throw error;
  }
}

/**
 * 调用火山方舟图生视频API
 * @param {Object} params - API参数
 * @returns {Promise<Object>} API响应
 */
async function callArkVideoAPI(params) {
  const { userImageUrl, prompt, paymentStatus, duration = 5 } = params;
  
  console.log('[视频API] 准备调用火山方舟图生视频API...');
  console.log('[视频API] 用户照片:', userImageUrl);
  console.log('[视频API] 提示词:', prompt);
  console.log('[视频API] 时长:', duration, '秒');
  
  // 根据付费状态决定是否添加水印
  const needWatermark = paymentStatus === 'free';
  
  // 构造请求体
  const requestBody = {
    model: process.env.ARK_VIDEO_MODEL || "doubao-seedance-1-5-pro-251215",
    content: [
      {
        type: "text",
        text: prompt
      },
      {
        type: "image_url",
        image_url: {
          url: userImageUrl
        }
      }
    ],
    generate_audio: false, // 财神视频不需要音频
    ratio: "adaptive", // 自动适配宽高比
    duration: parseInt(process.env.CAISHEN_VIDEO_DURATION) || duration,
    watermark: needWatermark, // 免费用户添加水印（火山引擎水印）
    resolution: process.env.CAISHEN_VIDEO_RESOLUTION || "720p"
  };
  
  const requestBodyString = JSON.stringify(requestBody);
  
  console.log('[视频API] 请求体:', requestBodyString);
  
  try {
    const response = await fetch(ARK_VIDEO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ARK_API_KEY}`
      },
      body: requestBodyString
    });
    
    const responseText = await response.text();
    console.log('[视频API] 响应状态:', response.status);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[视频API] 响应解析失败，原始响应:', responseText.substring(0, 500));
      throw new Error(`API响应解析失败: ${parseErr.message}`);
    }
    
    console.log('[视频API] 响应数据:', JSON.stringify(result, null, 2));
    
    if (!response.ok) {
      const errorMsg = result?.error?.message || result?.message || `API调用失败，状态码: ${response.status}`;
      console.error('[视频API] API调用失败:', errorMsg);
      throw new Error(errorMsg);
    }
    
    // 提取任务ID
    if (!result.id) {
      console.error('[视频API] 响应中未找到任务ID');
      throw new Error('API响应格式异常，未返回任务ID');
    }
    
    console.log('[视频API] ✅ 任务创建成功:', result.id);
    
    return {
      id: result.id,
      created_at: result.created_at
    };
  } catch (error) {
    console.error('[视频API] 调用失败:', error);
    throw error;
  }
}

/**
 * 查询视频生成任务状态
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>} 任务状态
 */
async function getVideoTaskStatus(taskId) {
  return executeWithRetry(
    () => getVideoTaskStatusInternal(taskId),
    {
      maxRetries: 1,
      timeout: 30000,
      operationName: '查询视频任务状态',
      onRetry: (attempt, error) => {
        console.log(`[重试] 查询视频任务状态失败，准备第 ${attempt + 1} 次重试。错误: ${error.message}`);
      }
    }
  );
}

/**
 * 内部函数：查询视频生成任务状态
 */
async function getVideoTaskStatusInternal(taskId) {
  console.log(`[视频任务] 查询任务状态: ${taskId}`);
  
  if (!process.env.ARK_API_KEY) {
    throw new Error('ARK_API_KEY未配置');
  }
  
  try {
    const url = `${ARK_VIDEO_QUERY_ENDPOINT}/${taskId}`;
    console.log('[视频任务] 查询URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.ARK_API_KEY}`
      }
    });
    
    const responseText = await response.text();
    console.log('[视频任务] 响应状态:', response.status);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[视频任务] 响应解析失败:', responseText.substring(0, 500));
      throw new Error(`API响应解析失败: ${parseErr.message}`);
    }
    
    if (!response.ok) {
      const errorMsg = result?.error?.message || result?.message || `查询失败，状态码: ${response.status}`;
      console.error('[视频任务] 查询失败:', errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log(`[视频任务] 状态: ${result.status}`);
    console.log('[视频任务] 完整响应:', JSON.stringify(result, null, 2));
    
    // 转换为统一的响应格式
    const statusResponse = {
      taskId: taskId,
      status: result.status,
      progress: calculateProgress(result.status),
      message: getStatusMessage(result.status)
    };
    
    // 如果任务成功，添加视频URL
    // 注意：Ark API返回的字段可能是 output.video_url 或 video_url
    if (result.status === 'succeeded') {
      const videoUrl = result.output?.video_url || result.video_url;
      if (videoUrl) {
        statusResponse.videoUrl = videoUrl;
        statusResponse.duration = result.output?.duration || result.duration;
        statusResponse.ratio = result.output?.ratio || result.ratio;
        console.log('[视频任务] ✅ 视频生成完成:', statusResponse.videoUrl);
      } else {
        console.warn('[视频任务] ⚠️  任务成功但未找到视频URL');
      }
    }
    
    // 如果任务失败，添加错误信息
    if (result.status === 'failed' && result.error) {
      statusResponse.error = result.error;
      console.error('[视频任务] ❌ 任务失败:', result.error);
    }
    
    return statusResponse;
  } catch (error) {
    console.error('[视频任务] 查询状态失败:', error);
    throw error;
  }
}

/**
 * 根据状态计算进度百分比
 */
function calculateProgress(status) {
  const progressMap = {
    'queued': 10,
    'running': 50,
    'succeeded': 100,
    'failed': 0,
    'expired': 0
  };
  return progressMap[status] || 0;
}

/**
 * 获取状态对应的消息
 */
function getStatusMessage(status) {
  const messageMap = {
    'queued': '任务排队中...',
    'running': '视频生成中...',
    'succeeded': '视频生成完成',
    'failed': '视频生成失败',
    'expired': '任务已过期'
  };
  return messageMap[status] || '未知状态';
}

// 注意：视频水印功能已在 API 层面通过 watermark 参数实现
// 免费用户的视频会在生成时自动添加火山引擎的水印
// 如果未来需要自定义水印，可以调用 watermarkService.addWatermarkToVideo()
// 该方法已实现但当前未启用，需要FFmpeg支持

module.exports = {
  generateCaishenVideo,
  getVideoTaskStatus
};
