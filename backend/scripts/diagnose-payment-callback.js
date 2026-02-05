/**
 * 支付回调问题诊断脚本
 * 
 * 用途：检查支付回调相关的配置和数据
 */

const db = require('../db/connection');

async function diagnose() {
  console.log('🔍 开始诊断支付回调问题...\n');
  
  try {
    const connection = await db.pool.getConnection();
    
    try {
      // 1. 检查最近的订单
      console.log('📋 检查最近的支付订单：');
      const [orders] = await connection.execute(`
        SELECT 
          id, out_trade_no, user_id, package_type, amount, 
          status, trade_type, created_at, paid_at
        FROM payment_orders 
        ORDER BY created_at DESC 
        LIMIT 10
      `);
      
      console.table(orders);
      
      // 2. 检查 pending 状态的订单
      console.log('\n⏳ 检查 pending 状态的订单（可能是回调失败）：');
      const [pendingOrders] = await connection.execute(`
        SELECT 
          id, out_trade_no, user_id, package_type, amount,
          TIMESTAMPDIFF(MINUTE, created_at, NOW()) as minutes_ago
        FROM payment_orders 
        WHERE status = 'pending'
        AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
        ORDER BY created_at DESC
      `);
      
      if (pendingOrders.length === 0) {
        console.log('✅ 没有 pending 状态的订单');
      } else {
        console.table(pendingOrders);
        console.log(`\n⚠️  发现 ${pendingOrders.length} 个 pending 订单，可能需要手动处理`);
      }
      
      // 3. 检查已支付但未充值的订单
      console.log('\n💰 检查已支付但可能未充值的订单：');
      const [paidNotRecharged] = await connection.execute(`
        SELECT 
          po.id, po.out_trade_no, po.user_id, po.package_type, 
          po.amount, po.paid_at,
          COUNT(ul.id) as recharge_count
        FROM payment_orders po
        LEFT JOIN usage_logs ul ON ul.reference_id = po.id 
          AND ul.action_type = 'increment' 
          AND ul.reason = 'payment'
        WHERE po.status = 'paid'
        AND po.created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
        GROUP BY po.id
        HAVING recharge_count = 0
        ORDER BY po.paid_at DESC
      `);
      
      if (paidNotRecharged.length === 0) {
        console.log('✅ 所有已支付订单都已充值');
      } else {
        console.table(paidNotRecharged);
        console.log(`\n❌ 发现 ${paidNotRecharged.length} 个已支付但未充值的订单！`);
      }
      
      // 4. 检查用户余额
      console.log('\n👤 检查测试用户余额（821fd59568122fc2591e823bfe03cb3a）：');
      const [userBalance] = await connection.execute(`
        SELECT mode, balance_type, balance, last_updated
        FROM user_balances
        WHERE user_id = '821fd59568122fc2591e823bfe03cb3a'
      `);
      
      if (userBalance.length === 0) {
        console.log('❌ 用户余额记录不存在');
      } else {
        console.table(userBalance);
      }
      
      // 5. 检查用户充值记录
      console.log('\n📝 检查测试用户充值记录：');
      const [usageLogs] = await connection.execute(`
        SELECT 
          action_type, reason, amount, balance_type, mode,
          reference_id, created_at
        FROM usage_logs
        WHERE user_id = '821fd59568122fc2591e823bfe03cb3a'
        AND action_type = 'increment'
        ORDER BY created_at DESC
        LIMIT 10
      `);
      
      if (usageLogs.length === 0) {
        console.log('❌ 没有充值记录');
      } else {
        console.table(usageLogs);
      }
      
      // 6. 生成修复建议
      console.log('\n\n📌 诊断结果和建议：\n');
      
      if (pendingOrders.length > 0) {
        console.log('❌ 问题1：存在 pending 状态的订单');
        console.log('   原因：微信支付回调未到达或处理失败');
        console.log('   解决：');
        console.log('   1. 检查云函数 wxpayFunctions 的环境变量 API_BASE_URL');
        console.log('   2. 检查 cloudbase_module 扩展能力的回调URL配置');
        console.log('   3. 检查云函数HTTP触发器是否启用');
        console.log('   4. 查看云函数日志，确认是否收到回调\n');
      }
      
      if (paidNotRecharged.length > 0) {
        console.log('❌ 问题2：已支付但未充值的订单');
        console.log('   原因：回调通知云托管失败或充值逻辑异常');
        console.log('   解决：');
        console.log('   1. 手动调用充值接口：');
        paidNotRecharged.forEach(order => {
          console.log(`   curl -X POST https://express-215695-6-1317586939.sh.run.tcloudbase.com/api/payment/internal/notify \\`);
          console.log(`     -H "Content-Type: application/json" \\`);
          console.log(`     -H "X-Internal-Secret: your-secret" \\`);
          console.log(`     -d '{"outTradeNo":"${order.out_trade_no}","status":"paid","packageType":"${order.package_type}"}'\n`);
        });
      }
      
      if (pendingOrders.length === 0 && paidNotRecharged.length === 0) {
        console.log('✅ 支付回调系统运行正常！');
      }
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ 诊断失败:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

diagnose();
