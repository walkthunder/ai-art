/**
 * 修复未充值的已支付订单
 * 定时任务：每小时执行一次，扫描状态为paid但未充值的订单
 */

const { query } = require('../db/connection');
const balanceService = require('../services/balanceService');
const priceConfigService = require('../services/priceConfigService');

/**
 * 修复未充值的订单
 */
async function fixUnpaidOrders() {
  console.log('[FixUnpaidOrders] 开始扫描未充值的已支付订单...');
  
  try {
    // 查询状态为paid但未充值的订单（最近7天）
    const sql = `
      SELECT po.* 
      FROM payment_orders po
      LEFT JOIN usage_logs ul ON ul.reference_id = po.id 
        AND ul.action_type = 'increment' 
        AND ul.reason = 'payment'
      WHERE po.status = 'paid' 
        AND ul.id IS NULL
        AND po.paid_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY po.paid_at DESC
    `;
    
    const orders = await query(sql);
    
    if (orders.length === 0) {
      console.log('[FixUnpaidOrders] ✅ 没有需要修复的订单');
      return { success: true, fixed: 0, failed: 0 };
    }
    
    console.log(`[FixUnpaidOrders] 发现 ${orders.length} 个未充值订单，开始修复...`);
    
    let fixed = 0;
    let failed = 0;
    
    for (const order of orders) {
      try {
        console.log(`[FixUnpaidOrders] 处理订单: ${order.id}, 用户: ${order.user_id}, 套餐: ${order.package_type}`);
        
        // 获取充值金额
        const rechargeAmount = await priceConfigService.getRechargeAmount(order.package_type);
        
        if (rechargeAmount <= 0 || rechargeAmount > 1000) {
          console.warn(`[FixUnpaidOrders] 订单 ${order.id} 充值金额异常: ${rechargeAmount}，跳过`);
          failed++;
          continue;
        }
        
        // 执行充值
        await balanceService.addBalance(
          order.user_id,
          rechargeAmount,
          'payment',
          order.id,
          balanceService.BALANCE_TYPES.PAID
        );
        
        console.log(`[FixUnpaidOrders] ✅ 订单 ${order.id} 充值成功: ${rechargeAmount}次`);
        fixed++;
        
      } catch (error) {
        console.error(`[FixUnpaidOrders] ❌ 订单 ${order.id} 充值失败:`, error.message);
        failed++;
      }
    }
    
    console.log(`[FixUnpaidOrders] 修复完成: 成功 ${fixed}, 失败 ${failed}`);
    
    return { success: true, fixed, failed, total: orders.length };
    
  } catch (error) {
    console.error('[FixUnpaidOrders] 扫描失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 手动执行修复
 */
async function manualFix() {
  console.log('='.repeat(60));
  console.log('手动执行未充值订单修复');
  console.log('='.repeat(60));
  
  const result = await fixUnpaidOrders();
  
  console.log('\n修复结果:', result);
  console.log('='.repeat(60));
  
  process.exit(result.success ? 0 : 1);
}

// 如果直接运行此脚本，执行手动修复
if (require.main === module) {
  manualFix();
}

module.exports = {
  fixUnpaidOrders
};
