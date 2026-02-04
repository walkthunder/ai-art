/**
 * 艺术照生成 Worker
 * 
 * 负责异步执行艺术照生成任务
 * 支持重试、超时处理、进度更新
 */

const { TaskStatus, updateTask, getTask } = require('./taskQueueService');
const generationService = require('./generationService');
const { uploadImagesFromUrlsToOSS, COS_DOMAIN } = require('./ossService');

// 正在处理的任务集合（防止重复处理）
const processingTasks = new Set();

// Mock 模式配置
const MOCK_ENABLED = process.env.MOCK_AI_ENABLED === 'true';

// Mock 图片 URL（使用 picsum.photos 提供的随机图片服务）
const MOCK_IMAGES = [
  'https://picsum.photos/seed/art1/512/512',
  'https://picsum.photos/seed/art2/512/512',
  'https://picsum.photos/seed/art3/512/512',
  'https://picsum.photos/seed/art4/512/512'
];

/**
 * 日志工具函数
 */
function logWorker(taskId, stage, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[Worker][${timestamp}][${taskId}][${stage}]`;
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Mock 生成函数 - 模拟 AI 生成过程
 */
async function mockGenerateArtPhoto(taskId) {
  logWorker(taskId, 'MOCK', '🎭 Mock 模式启用，模拟 AI 生成过程...');
  
  // 模拟 AI 处理时间（2-4秒）
  const delay = 2000 + Math.random() * 2000;
  await new Promise(resolve => setTimeout(resolve, delay));
  
  logWorker(taskId, 'MOCK', `✅ Mock 生成完成，耗时 ${Math.round(delay)}ms`);
  
  // 返回 mock 图片（随机选择1-4张）
  const imageCount = Math.floor(Math.random() * 4) + 1;
  return MOCK_IMAGES.slice(0, imageCount);
}

/**
 * 执行艺术照生成任务
 * @param {string} taskId 任务ID
 * @param {Function} generateFn 生成函数 (generateArtPhotoInternal)
 */
async function executeArtPhotoTask(taskId, generateFn) {
  const startTime = Date.now();
  
  logWorker(taskId, '初始化', '========== 开始执行艺术照生成任务 ==========');
  
  // 防止重复处理
  if (processingTasks.has(taskId)) {
    logWorker(taskId, '初始化', '⚠️ 任务正在处理中，跳过重复执行');
    return;
  }
  
  processingTasks.add(taskId);
  logWorker(taskId, '初始化', '✅ 任务已加入处理队列');
  
  try {
    // 阶段1: 获取任务信息
    logWorker(taskId, '阶段1-获取任务', '正在从队列获取任务信息...');
    const task = await getTask(taskId);
    if (!task) {
      logWorker(taskId, '阶段1-获取任务', '❌ 任务不存在，终止执行');
      return;
    }
    logWorker(taskId, '阶段1-获取任务', '✅ 任务信息获取成功', {
      status: task.status,
      mode: task.meta?.mode,
      imageCount: task.meta?.imageCount,
      createdAt: task.createdAt
    });
    
    // 检查任务状态
    if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.PROCESSING) {
      logWorker(taskId, '阶段1-获取任务', `⚠️ 任务状态为 ${task.status}，跳过处理`);
      return;
    }
    
    // 阶段2: 更新为处理中
    logWorker(taskId, '阶段2-状态更新', '正在更新任务状态为处理中...');
    updateTask(taskId, {
      status: TaskStatus.PROCESSING,
      progress: 10,
      message: '正在连接AI服务...',
      startedAt: new Date().toISOString()
    });
    logWorker(taskId, '阶段2-状态更新', '✅ 状态已更新: PROCESSING, 进度: 10%');
    
    const { params } = task;
    const { finalPrompt, finalImageUrls, facePositions, paymentStatus, modelParams } = params;
    
    logWorker(taskId, '阶段2-参数解析', '任务参数详情', {
      mode: modelParams?.mode || 'unknown',
      imageCount: finalImageUrls?.length || 0,
      paymentStatus,
      promptLength: finalPrompt?.length || 0,
      hasFacePositions: !!facePositions
    });
    
    // 阶段3: 准备调用AI服务
    logWorker(taskId, '阶段3-AI调用准备', MOCK_ENABLED ? '🎭 Mock 模式，跳过真实 AI 调用' : '正在准备调用火山方舟API...');
    updateTask(taskId, {
      progress: 30,
      message: MOCK_ENABLED ? '🎭 Mock 模式生成中...' : '正在生成艺术照...'
    });
    logWorker(taskId, '阶段3-AI调用准备', '✅ 进度更新: 30%');
    
    // 阶段4: 调用生成函数（带超时控制）
    const timeoutMs = 120000; // 2分钟超时
    logWorker(taskId, '阶段4-AI生成', MOCK_ENABLED ? '🎭 使用 Mock 生成' : `开始调用生成函数，超时时间: ${timeoutMs}ms`);
    
    const generateStartTime = Date.now();
    let result;
    
    if (MOCK_ENABLED) {
      // Mock 模式：直接返回模拟图片
      result = await mockGenerateArtPhoto(taskId);
    } else {
      // 真实模式：调用 AI API
      result = await Promise.race([
        generateFn(finalPrompt, finalImageUrls, facePositions, true, paymentStatus, modelParams),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('生成超时，请重试')), timeoutMs)
        )
      ]);
    }
    const generateDuration = Date.now() - generateStartTime;
    
    logWorker(taskId, '阶段4-AI生成', `✅ ${MOCK_ENABLED ? 'Mock' : 'AI'}生成完成，耗时: ${generateDuration}ms`, {
      resultType: typeof result,
      resultValue: Array.isArray(result) ? `Array(${result.length})` : (typeof result === 'string' ? result : 'unknown')
    });
    
    // 阶段5: 处理生成结果
    logWorker(taskId, '阶段5-结果处理', '正在处理生成结果...');
    updateTask(taskId, {
      progress: 80,
      message: '正在处理生成结果...'
    });
    logWorker(taskId, '阶段5-结果处理', '✅ 进度更新: 80%');
    
    // 获取生成的图片
    let generatedImages = [];
    
    if (Array.isArray(result)) {
      // Mock 模式或直接返回图片数组
      generatedImages = result;
      logWorker(taskId, '阶段5-结果处理', `✅ 直接获取到 ${generatedImages.length} 张图片`);
    } else if (typeof result === 'string') {
      logWorker(taskId, '阶段5-结果处理', `返回值为taskId: ${result}，从history获取图片`);
      const history = require('../history');
      const historyRecord = history.findHistoryRecordByTaskId(result);
      if (historyRecord && historyRecord.generatedImageUrls) {
        generatedImages = historyRecord.generatedImageUrls;
        logWorker(taskId, '阶段5-结果处理', `✅ 从history获取到 ${generatedImages.length} 张图片`);
      } else {
        logWorker(taskId, '阶段5-结果处理', '⚠️ history中未找到图片记录');
      }
    }
    
    if (generatedImages.length === 0) {
      logWorker(taskId, '阶段5-结果处理', '❌ 未能获取生成的图片');
      throw new Error('未能获取生成的图片');
    }
    
    // 阶段5.5: 转存图片到OSS（防止原始URL过期）
    logWorker(taskId, '阶段5.5-OSS转存', '正在将图片转存到OSS...');
    updateTask(taskId, {
      progress: 85,
      message: '正在保存图片...'
    });
    
    // 检查是否需要转存（如果图片URL不是我们的OSS域名，则需要转存）
    const needsTransfer = generatedImages.some(url => !url.includes(COS_DOMAIN || 'wms.webinfra.cloud'));
    
    if (needsTransfer) {
      try {
        const ossImages = await uploadImagesFromUrlsToOSS(generatedImages);
        logWorker(taskId, '阶段5.5-OSS转存', `✅ 图片转存完成，${ossImages.length} 张图片已保存到OSS`);
        generatedImages = ossImages;
      } catch (ossError) {
        logWorker(taskId, '阶段5.5-OSS转存', `⚠️ 图片转存失败，使用原始URL: ${ossError.message}`);
        // 转存失败不影响主流程，继续使用原始URL
      }
    } else {
      logWorker(taskId, '阶段5.5-OSS转存', '图片已在OSS上，跳过转存');
    }
    
    // 阶段6: 任务完成
    logWorker(taskId, '阶段6-完成', '正在更新任务为完成状态...');
    updateTask(taskId, {
      status: TaskStatus.COMPLETED,
      progress: 100,
      message: '生成完成',
      result: {
        images: generatedImages,
        generatedAt: new Date().toISOString()
      },
      completedAt: new Date().toISOString()
    });
    
    // 同步更新数据库中的生成历史记录
    try {
      const historyRecord = await generationService.getGenerationHistoryByTaskId(taskId);
      if (historyRecord) {
        await generationService.updateGenerationHistory(historyRecord.id, {
          generatedImageUrls: generatedImages,
          status: 'completed'
        });
        logWorker(taskId, '阶段6-完成', `✅ 数据库历史记录已更新，记录ID: ${historyRecord.id}`);
      } else {
        logWorker(taskId, '阶段6-完成', '⚠️ 未找到对应的历史记录，跳过数据库更新');
      }
    } catch (historyError) {
      logWorker(taskId, '阶段6-完成', `⚠️ 更新历史记录失败: ${historyError.message}`);
      // 不影响主流程
    }
    
    const totalDuration = Date.now() - startTime;
    logWorker(taskId, '阶段6-完成', `✅ 任务执行成功！`, {
      imageCount: generatedImages.length,
      totalDuration: `${totalDuration}ms`,
      generateDuration: `${generateDuration}ms`
    });
    logWorker(taskId, '完成', '========== 任务执行结束 ==========\n');
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logWorker(taskId, '错误', `❌ 任务执行失败，耗时: ${totalDuration}ms`, {
      errorMessage: error.message,
      errorStack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
    
    const task = await getTask(taskId);
    const retryCount = (task?.retryCount || 0) + 1;
    const maxRetries = task?.maxRetries || 2;
    
    logWorker(taskId, '错误处理', `重试信息: ${retryCount}/${maxRetries}`);
    
    if (retryCount < maxRetries) {
      logWorker(taskId, '错误处理', '可以重试，更新状态为FAILED');
      updateTask(taskId, {
        status: TaskStatus.FAILED,
        progress: 0,
        message: `生成失败: ${error.message}`,
        retryCount: retryCount,
        error: error.message,
        completedAt: new Date().toISOString()
      });
    } else {
      logWorker(taskId, '错误处理', '已达到最大重试次数');
      updateTask(taskId, {
        status: TaskStatus.FAILED,
        progress: 0,
        message: '生成失败，已达到最大重试次数',
        error: error.message,
        completedAt: new Date().toISOString()
      });
      
      // ✅ 恢复使用次数（最终失败时）
      try {
        const balanceService = require('./balanceService');
        const task = await getTask(taskId);
        if (task && task.params && task.params.userId) {
          const userId = task.params.userId;
          const mode = task.params.modelParams?.mode || 'puzzle';
          const result = await balanceService.restoreBalance(userId, taskId, mode);
          
          if (result.success) {
            logWorker(taskId, '错误处理', `✅ 使用次数已恢复`);
          } else {
            logWorker(taskId, '错误处理', `⚠️ 使用次数恢复被拒绝: ${result.error} - ${result.message}`);
          }
        }
      } catch (restoreError) {
        logWorker(taskId, '错误处理', `⚠️ 恢复使用次数失败: ${restoreError.message}`);
      }
      
      // 同步更新数据库中的生成历史记录为失败状态
      try {
        const historyRecord = await generationService.getGenerationHistoryByTaskId(taskId);
        if (historyRecord) {
          await generationService.updateGenerationHistory(historyRecord.id, {
            status: 'failed'
          });
          logWorker(taskId, '错误处理', `✅ 数据库历史记录已更新为失败状态`);
        }
      } catch (historyError) {
        logWorker(taskId, '错误处理', `⚠️ 更新历史记录失败: ${historyError.message}`);
      }
    }
    logWorker(taskId, '错误', '========== 任务执行结束(失败) ==========\n');
    
  } finally {
    processingTasks.delete(taskId);
    logWorker(taskId, '清理', '任务已从处理队列移除');
  }
}

/**
 * 重试失败的任务
 * @param {string} taskId 任务ID
 * @param {Function} generateFn 生成函数
 */
async function retryTask(taskId, generateFn) {
  logWorker(taskId, '重试', '========== 开始重试任务 ==========');
  
  const task = await getTask(taskId);
  
  if (!task) {
    logWorker(taskId, '重试', '❌ 任务不存在');
    throw new Error('任务不存在');
  }
  
  logWorker(taskId, '重试', '当前任务状态', {
    status: task.status,
    retryCount: task.retryCount,
    error: task.error
  });
  
  if (task.status !== TaskStatus.FAILED && task.status !== TaskStatus.TIMEOUT) {
    logWorker(taskId, '重试', `❌ 任务状态为 ${task.status}，不允许重试`);
    throw new Error('只能重试失败或超时的任务');
  }
  
  // 重置任务状态
  logWorker(taskId, '重试', '正在重置任务状态...');
  updateTask(taskId, {
    status: TaskStatus.PENDING,
    progress: 0,
    message: '准备重新生成...',
    retryCount: 0,
    error: null
  });
  logWorker(taskId, '重试', '✅ 任务状态已重置，开始重新执行');
  
  // 执行任务
  executeArtPhotoTask(taskId, generateFn);
}

/**
 * 取消任务
 * @param {string} taskId 任务ID
 */
async function cancelTask(taskId) {
  logWorker(taskId, '取消', '========== 开始取消任务 ==========');
  
  const task = await getTask(taskId);
  
  if (!task) {
    logWorker(taskId, '取消', '❌ 任务不存在');
    throw new Error('任务不存在');
  }
  
  logWorker(taskId, '取消', '当前任务状态', { status: task.status });
  
  if (task.status === TaskStatus.COMPLETED) {
    logWorker(taskId, '取消', '❌ 已完成的任务无法取消');
    throw new Error('已完成的任务无法取消');
  }
  
  updateTask(taskId, {
    status: TaskStatus.CANCELLED,
    message: '任务已取消',
    completedAt: new Date().toISOString()
  });
  
  logWorker(taskId, '取消', '✅ 任务已成功取消');
}

module.exports = {
  executeArtPhotoTask,
  retryTask,
  cancelTask
};
