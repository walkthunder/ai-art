/**
 * 路由聚合模块
 * 统一导出所有路由
 */

const userRoutes = require('./userRoutes');
const taskRoutes = require('./taskRoutes');
const paymentRoutes = require('./paymentRoutes');
const historyRoutes = require('./historyRoutes');
const productRoutes = require('./productRoutes');
const videoRoutes = require('./videoRoutes');
const greetingCardRoutes = require('./greetingCardRoutes');
const uploadRoutes = require('./uploadRoutes');
const adminRoutes = require('./adminRoutes');
const wechatRoutes = require('./wechatRoutes');
const usageRoutes = require('./usageRoutes');
const inviteRoutes = require('./inviteRoutes');
const devRoutes = require('./devRoutes');
const adminAuthRoutes = require('./adminAuthRoutes');
const priceConfigRoutes = require('./priceConfigRoutes');
const adminUserRoutes = require('./adminUserRoutes');
const adminOrderRoutes = require('./adminOrderRoutes');
const adminStatsRoutes = require('./adminStatsRoutes');
const adminTemplateRoutes = require('./adminTemplateRoutes');
const monitorRoutes = require('./monitorRoutes');
const configRoutes = require('./configRoutes');
const logRoutes = require('./logRoutes');
const callbackLogRoutes = require('./callbackLogRoutes');
const caishenRoutes = require('./caishenRoutes');
const adminCaishenRoutes = require('./adminCaishenRoutes');

/**
 * 注册所有路由
 * @param app Express应用实例
 */
function registerRoutes(app) {
  // 用户管理
  app.use('/api/user', userRoutes);
  
  // 财神变身
  app.use('/api/caishen', caishenRoutes);
  
  // 任务管理 (包含生成艺术照)
  app.use('/api', taskRoutes);
  
  // 支付系统
  app.use('/api/payment', paymentRoutes);
  
  // 历史记录
  app.use('/api/history', historyRoutes);
  
  // 产品订单
  app.use('/api/product-order', productRoutes);
  
  // 视频生成
  app.use('/api', videoRoutes);
  
  // 贺卡管理
  app.use('/api/greeting-card', greetingCardRoutes);
  
  // 上传相关
  app.use('/api', uploadRoutes);
  
  // 管理员接口
  app.use('/api/admin', adminRoutes);
  
  // 日志查询接口 (独立路径)
  app.use('/api/logs', adminRoutes);
  app.use('/api/error-logs', adminRoutes);
  
  // 微信小程序接口
  app.use('/api/wechat', wechatRoutes);
  
  // 使用次数管理
  app.use('/api/usage', usageRoutes);
  
  // 邀请系统
  app.use('/api/invite', inviteRoutes);
  
  // 开发者模式
  app.use('/api/dev', devRoutes);
  
  // 临时禁用：以下管理后台路由需要 bcrypt 依赖
  // 管理后台认证接口
  app.use('/admin-api/auth', adminAuthRoutes);
  
  // 价格配置接口（管理后台）
  app.use('/admin-api/prices', priceConfigRoutes);
  
  // 价格查询接口（公开API）
  app.use('/api/prices', priceConfigRoutes);
  
  // 模板管理接口（管理后台）
  app.use('/admin-api/templates', adminTemplateRoutes);
  
  // 用户管理接口（管理后台）
  app.use('/admin-api/users', adminUserRoutes);
  
  // 订单管理接口（管理后台）
  app.use('/admin-api/orders', adminOrderRoutes);
  
  // 统计数据接口（管理后台）
  app.use('/admin-api/stats', adminStatsRoutes);
  
  // 监控接口（公开API和管理后台都可访问）
  app.use('/api/monitor', monitorRoutes);
  app.use('/admin-api/monitor', monitorRoutes);
  
  // 系统配置接口（管理后台）
  app.use('/admin-api/config', configRoutes);
  
  // 公开配置接口（小程序可访问）
  app.use('/api/config', configRoutes);
  
  // 日志查询接口（管理后台）
  app.use('/admin-api/logs', logRoutes);
  
  // 支付回调日志接口（管理后台）
  app.use('/admin-api/callback-logs', callbackLogRoutes);
  
  // 财神模板管理接口（管理后台）
  app.use('/admin-api/caishen', adminCaishenRoutes);
}

module.exports = {
  registerRoutes,
  userRoutes,
  taskRoutes,
  paymentRoutes,
  historyRoutes,
  productRoutes,
  videoRoutes,
  greetingCardRoutes,
  uploadRoutes,
  adminRoutes,
  wechatRoutes,
  usageRoutes,
  inviteRoutes,
  devRoutes,
  adminAuthRoutes,
  priceConfigRoutes,
  adminUserRoutes,
  adminOrderRoutes,
  adminStatsRoutes,
  adminTemplateRoutes,
  monitorRoutes,
  configRoutes,
  logRoutes,
  callbackLogRoutes,
  caishenRoutes,
  adminCaishenRoutes
};
