/**
 * AI全家福服务器入口文件
 * 
 * 模块化架构：
 * - routes/     路由模块
 * - services/   业务服务
 * - utils/      工具函数
 * - config/     配置文件
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 导入路由
const { registerRoutes } = require('./routes');

// 导入服务
const { initWechatPayment } = require('./services/wechatPayService');
const cleanupService = require('./services/cleanupService');
const { recoverPendingTasks, getQueueStats } = require('./services/taskQueueService');
const { executeArtPhotoTask } = require('./services/artPhotoWorker');
const { generateArtPhotoInternal } = require('./services/volcengineService');

const app = express();
// 从环境变量读取端口，默认 3002
const PORT = process.env.PORT || 3002;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: 'application/json', limit: '10mb' }));

// 初始化微信支付
initWechatPayment();

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 注册所有路由
registerRoutes(app);

// 启动服务器
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`🚀 AI全家福服务器运行在端口 ${PORT}`);
  console.log(`========================================\n`);
  
  console.log(`📋 核心功能端点:`);
  console.log(`  - 健康检查: http://localhost:${PORT}/health`);
  console.log(`  - 生成艺术照: POST /api/generate-art-photo`);
  console.log(`  - 上传图片: POST /api/upload-image\n`);
  
  console.log(`📦 异步任务管理:`);
  console.log(`  - 查询任务状态: GET /api/task/:taskId`);
  console.log(`  - 重试任务: POST /api/task/:taskId/retry`);
  console.log(`  - 取消任务: POST /api/task/:taskId/cancel\n`);
  
  console.log(`👤 用户管理:`);
  console.log(`  - 初始化用户: POST /api/user/init`);
  console.log(`  - 获取用户信息: GET /api/user/:userId\n`);
  
  console.log(`💳 支付系统:`);
  console.log(`  - 创建订单: POST /api/payment/create`);
  console.log(`  - 微信支付: POST /api/payment/wechat/jsapi\n`);
  
  console.log(`📚 历史记录:`);
  console.log(`  - 用户历史: GET /api/history/user/:userId\n`);
  
  console.log(`========================================\n`);
  
  // 启动定时清理任务
  cleanupService.startCleanupSchedule();
  
  // 启动监控服务
  const monitorService = require('./services/monitorService');
  monitorService.startMetricsReset();
  
  // 恢复未完成的任务
  console.log(`🔄 正在检查并恢复未完成的任务...`);
  recoverPendingTasks((taskId) => {
    executeArtPhotoTask(taskId, generateArtPhotoInternal);
  }).then((recoveredTasks) => {
    if (recoveredTasks.length > 0) {
      console.log(`✅ 已恢复 ${recoveredTasks.length} 个未完成任务`);
    } else {
      console.log(`✅ 没有需要恢复的任务`);
    }
    
    const stats = getQueueStats();
    console.log(`📊 任务队列统计: 总计 ${stats.total}, 待处理 ${stats.pending}, 处理中 ${stats.processing}, 已完成 ${stats.completed}, 失败 ${stats.failed}`);
  }).catch((err) => {
    console.error(`❌ 恢复任务失败:`, err.message);
  });
});

module.exports = app;
