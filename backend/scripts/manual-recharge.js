/**
 * 手动补单脚本
 * 
 * 用途：为已支付但未充值的订单手动触发充值
 * 使用：node backend/scripts/manual-recharge.js <out_trade_no>
 */

const db = require('../db/connection');
const balanceService = require('../services/balanceService');
const priceConfigService = require('../services/priceConfigService');

async function manualRecharge(outTradeNo) {
  if (!outTradeNo) {
    console.error('❌ 请提供订单号（out_trade_no）');
    console.log('使用方法：node backend/scripts/manual-recharge.js <out_trade_no>');
    console.log('示例：node backend/scripts/manual-recharge.js 177030035397274656');
    process.exit(1);
  }
  
  console.log(`🔍 开始处理订单：${outTradeNo}\n`);
  
  try {
    const connection = await db.pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // 1. 查询订单
      const [orders] = await connection.execute(
        'SELECT * FROM payment_orders WHERE out_trade_no = ?',
        [outTradeNo]
      );
      
      if (orders.length === 0) {
        console.error('❌ 订单不存在');
        process.exit(1);
      }
      
      const order = orders[0];
      console.log('📋 订单信息：');
      console.log(`   订单ID: ${order.id}`);
      console.log(`   用户ID: ${order.user_id}`);
      console.log(`   套餐类型: ${order.package_type}`);
      console.log(`   金额: ${order.amount} 元`);
      console.log(`   状态: ${order.status}`);
      console.log(`   创建时间: ${order.created_at}`);
      console.log(`   支付时间: ${order.paid_at || '未支付'}\n`);
      
      // 2. 检查订单状态
      if (order.status !== 'paid') {
        console.log(`⚠️  订单状态为 ${order.status}，需要先更新为 paid 吗？(y/n)`);
        // 这里简化处理，直接更新
        console.log('   自动更新订单状态为 paid...');
        await connection.execute(
          'UPDATE payment_orders SET status = ?, paid_at = NOW(), updated_at = NOW() WHERE id = ?',
          ['paid', order.id]
        );
        console.log('   ✅ 订单状态已更新\n');
      }
      
      // 3. 检查是否已经充值过
      const [logs] = await connection.execute(
        `SELECT id FROM usage_logs 
         WHERE user_id = ? AND reference_id = ? AND action_type = 'increment' AND reason = 'payment'
         LIMIT 1`,
        [order.user_id, order.id]
      );
      
      if (logs.length > 0) {
        console.log('⚠️  该订单已经充值过，跳过充值');
        await connection.rollback();
        process.exit(0);
      }
      
      // 4. 获取充值次数配置
      const rechargeAmount = await priceConfigService.getRechargeAmount(order.package_type, connection);
      
      console.log(`💰 充值配置：`);
      console.log(`   套餐: ${order.package_type}`);
      console.log(`   充值次数: ${rechargeAmount}\n`);
      
      if (rechargeAmount <= 0 || rechargeAmount > 1000) {
        console.error(`❌ 充值次数配置异常: ${rechargeAmount}`);
        await connection.rollback();
        process.exit(1);
      }
      
      // 5. 执行充值
      console.log('🔄 开始充值...');
      await balanceService.addBalance(
        order.user_id,
        rechargeAmount,
        'payment',
        order.id,
        balanceService.BALANCE_TYPES.PAID,
        connection
      );
      
      // 6. 更新用户支付状态
      await connection.execute(
        'UPDATE users SET payment_status = ?, updated_at = NOW() WHERE id = ?',
        [order.package_type, order.user_id]
      );
      
      await connection.commit();
      
      console.log('✅ 充值成功！\n');
      
      // 7. 验证充值结果
      const [balances] = await connection.execute(
        'SELECT mode, balance_type, balance FROM user_balances WHERE user_id = ?',
        [order.user_id]
      );
      
      console.log('📊 用户当前余额：');
      console.table(balances);
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ 充值失败:', error.message);
    console.error(error);
    process.exit(1);
  }
  
  process.exit(0);
}

// 从命令行参数获取订单号
const outTradeNo = process.argv[2];
manualRecharge(outTradeNo);
