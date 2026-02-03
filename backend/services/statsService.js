/**
 * 统计服务
 * 提供各种数据统计功能
 */

const db = require('../db/connection');
const { convertArrayTimesToCST } = require('../utils/timezone');

/**
 * 获取今日统计数据
 */
async function getTodayStats() {
  const connection = await db.pool.getConnection();
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // 今日新增用户
    const [newUsers] = await connection.execute(
      `SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = ?`,
      [todayStr]
    );

    // 今日收入（已支付订单）
    const [todayRevenue] = await connection.execute(
      `SELECT COALESCE(SUM(amount), 0) as revenue 
       FROM payment_orders 
       WHERE DATE(created_at) = ? AND status = 'paid'`,
      [todayStr]
    );

    // 今日订单数
    const [todayOrders] = await connection.execute(
      `SELECT COUNT(*) as count 
       FROM payment_orders 
       WHERE DATE(created_at) = ?`,
      [todayStr]
    );

    // 今日生成次数
    const [todayGenerations] = await connection.execute(
      `SELECT COUNT(*) as count 
       FROM generation_history 
       WHERE DATE(created_at) = ?`,
      [todayStr]
    );

    return {
      newUsers: newUsers[0].count,
      revenue: parseFloat(todayRevenue[0].revenue),
      orders: todayOrders[0].count,
      generations: todayGenerations[0].count
    };
  } finally {
    connection.release();
  }
}

/**
 * 获取趋势数据
 * @param {number} days - 天数（7或30）
 */
async function getTrendData(days = 7) {
  const connection = await db.pool.getConnection();
  
  try {
    // 用户增长趋势
    const [userTrend] = await connection.execute(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
       FROM users
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days]
    );

    // 收入趋势
    const [revenueTrend] = await connection.execute(
      `SELECT 
        DATE(created_at) as date,
        SUM(amount) as revenue
       FROM payment_orders
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         AND status = 'paid'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days]
    );

    // 订单趋势
    const [orderTrend] = await connection.execute(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
       FROM payment_orders
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days]
    );

    // 生成次数趋势
    const [generationTrend] = await connection.execute(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
       FROM generation_history
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days]
    );

    return {
      users: userTrend,
      revenue: revenueTrend.map(item => ({
        date: item.date,
        revenue: parseFloat(item.revenue || 0)
      })),
      orders: orderTrend,
      generations: generationTrend
    };
  } finally {
    connection.release();
  }
}

/**
 * 获取用户分布统计
 */
async function getUserDistribution() {
  const connection = await db.pool.getConnection();
  
  try {
    const [distribution] = await connection.execute(
      `SELECT 
        payment_status,
        COUNT(*) as count
       FROM users
       GROUP BY payment_status`
    );

    return distribution.map(item => ({
      status: item.payment_status,
      count: item.count
    }));
  } finally {
    connection.release();
  }
}

/**
 * 获取套餐销售分布
 */
async function getPackageDistribution() {
  const connection = await db.pool.getConnection();
  
  try {
    const [distribution] = await connection.execute(
      `SELECT 
        package_type,
        COUNT(*) as count,
        SUM(amount) as revenue
       FROM payment_orders
       WHERE status = 'paid'
       GROUP BY package_type`
    );

    return distribution.map(item => ({
      package: item.package_type,
      count: item.count,
      revenue: parseFloat(item.revenue)
    }));
  } finally {
    connection.release();
  }
}

/**
 * 获取热门模板统计
 * @param {number} limit - 返回数量
 */
async function getPopularTemplates(limit = 10) {
  const connection = await db.pool.getConnection();
  
  try {
    // 使用 query 而不是 execute，因为 LIMIT 不能作为参数绑定
    const query = `SELECT 
        template_url,
        COUNT(*) as usage_count
       FROM generation_history
       WHERE template_url IS NOT NULL
       GROUP BY template_url
       ORDER BY usage_count DESC
       LIMIT ${parseInt(limit)}`;
    
    const [templates] = await connection.query(query);

    return templates.map(item => ({
      template: item.template_url,
      count: item.usage_count
    }));
  } finally {
    connection.release();
  }
}

/**
 * 获取收入统计
 * @param {string} startDate - 开始日期
 * @param {string} endDate - 结束日期
 */
async function getRevenueStats(startDate, endDate) {
  const connection = await db.pool.getConnection();
  
  try {
    let whereClause = "WHERE status = 'paid'";
    const params = [];

    if (startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(endDate);
    }

    // 总收入
    const [totalRevenue] = await connection.query(
      `SELECT 
        COUNT(*) as order_count,
        SUM(amount) as total_revenue,
        AVG(amount) as avg_revenue
       FROM payment_orders
       ${whereClause}`,
      params
    );

    // 按套餐类型统计
    const [byPackage] = await connection.query(
      `SELECT 
        package_type,
        COUNT(*) as count,
        SUM(amount) as revenue
       FROM payment_orders
       ${whereClause}
       GROUP BY package_type`,
      params
    );

    // 按支付方式统计
    const [byMethod] = await connection.query(
      `SELECT 
        payment_method,
        COUNT(*) as count,
        SUM(amount) as revenue
       FROM payment_orders
       ${whereClause}
       GROUP BY payment_method`,
      params
    );

    return {
      total: {
        orderCount: totalRevenue[0].order_count,
        totalRevenue: parseFloat(totalRevenue[0].total_revenue || 0),
        avgRevenue: parseFloat(totalRevenue[0].avg_revenue || 0)
      },
      byPackage: byPackage.map(item => ({
        package: item.package_type,
        count: item.count,
        revenue: parseFloat(item.revenue)
      })),
      byMethod: byMethod.map(item => ({
        method: item.payment_method,
        count: item.count,
        revenue: parseFloat(item.revenue)
      }))
    };
  } finally {
    connection.release();
  }
}

/**
 * 获取用户统计
 * @param {string} startDate - 开始日期
 * @param {string} endDate - 结束日期
 */
async function getUserStats(startDate, endDate) {
  const connection = await db.pool.getConnection();
  
  try {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(endDate);
    }

    // 总用户数
    const [totalUsers] = await connection.query(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );

    // 按付费状态统计
    const [byStatus] = await connection.query(
      `SELECT 
        payment_status,
        COUNT(*) as count
       FROM users
       ${whereClause}
       GROUP BY payment_status`,
      params
    );

    // 活跃用户（有生成记录）
    const [activeUsers] = await connection.query(
      `SELECT COUNT(DISTINCT user_id) as count 
       FROM generation_history
       ${whereClause.replace('created_at', 'generation_history.created_at')}`,
      params
    );

    return {
      total: totalUsers[0].count,
      byStatus: byStatus.map(item => ({
        status: item.payment_status,
        count: item.count
      })),
      active: activeUsers[0].count
    };
  } finally {
    connection.release();
  }
}

/**
 * 获取完整的看板数据
 */
async function getDashboardData() {
  try {
    const [todayStats, trendData, userDist, packageDist, popularTemplates] = await Promise.all([
      getTodayStats(),
      getTrendData(7),
      getUserDistribution(),
      getPackageDistribution(),
      getPopularTemplates(10)
    ]);

    return {
      today: todayStats,
      trends: trendData,
      userDistribution: userDist,
      packageDistribution: packageDist,
      popularTemplates
    };
  } catch (error) {
    console.error('获取看板数据失败:', error);
    throw error;
  }
}

module.exports = {
  getTodayStats,
  getTrendData,
  getUserDistribution,
  getPackageDistribution,
  getPopularTemplates,
  getRevenueStats,
  getUserStats,
  getDashboardData
};
