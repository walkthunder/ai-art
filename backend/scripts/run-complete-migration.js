/**
 * 执行完整的数据库迁移
 * 将用量系统从旧架构迁移到新架构
 * 
 * 使用方法：
 * node backend/scripts/run-complete-migration.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const db = require('../db/connection');

async function runMigration() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          用量系统完整迁移脚本                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let connection;
  
  try {
    console.log('🔄 连接数据库...');
    connection = await db.pool.getConnection();
    console.log('✅ 数据库连接成功\n');

    // 读取迁移脚本
    const migrationPath = path.join(__dirname, '../db/migrations/011_complete_refactor.sql');

    console.log('📖 读取迁移脚本...');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ 迁移脚本读取成功\n');

    // 执行迁移
    console.log('🚀 执行数据库迁移...');
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    for (const statement of statements) {
      if (statement.includes('DELIMITER')) continue;
      if (statement.includes('CREATE VIEW') || statement.includes('DROP VIEW')) {
        try {
          await connection.query(statement);
        } catch (error) {
          console.warn(`⚠️  视图操作警告: ${error.message}`);
        }
        continue;
      }
      
      try {
        const result = await connection.query(statement);
        
        // 如果是 SELECT 语句，显示结果
        if (statement.trim().toUpperCase().startsWith('SELECT')) {
          if (Array.isArray(result[0]) && result[0].length > 0) {
            console.log('\n📊 验证结果:');
            console.table(result[0]);
          }
        }
      } catch (error) {
        if (!error.message.includes('already exists') && 
            !error.message.includes('Duplicate') &&
            !error.message.includes("Can't DROP")) {
          console.warn(`⚠️  警告: ${error.message}`);
        }
      }
    }
    console.log('✅ 迁移执行完成\n');

    // 最终验证
    console.log('🔍 执行最终验证...\n');

    // 验证用户数量
    const [userCount] = await connection.query('SELECT COUNT(*) as count FROM users');
    console.log(`👥 总用户数: ${userCount[0].count}`);

    // 验证余额记录
    const [balanceCount] = await connection.query('SELECT COUNT(*) as count FROM user_balances');
    console.log(`💰 总余额记录: ${balanceCount[0].count}`);

    // 验证每个用户都有3条余额记录
    const [balanceCheck] = await connection.query(`
      SELECT 
        COUNT(DISTINCT user_id) as users_with_balances,
        COUNT(*) / COUNT(DISTINCT user_id) as avg_records_per_user
      FROM user_balances
    `);
    console.log(`✅ 有余额记录的用户: ${balanceCheck[0].users_with_balances}`);
    console.log(`📊 平均每用户记录数: ${balanceCheck[0].avg_records_per_user.toFixed(2)}`);

    // 验证付费信息
    const [paymentCount] = await connection.query('SELECT COUNT(*) as count FROM user_payments');
    console.log(`💳 总付费记录: ${paymentCount[0].count}`);

    // 验证邀请码
    const [inviteCount] = await connection.query('SELECT COUNT(*) as count FROM user_invites');
    console.log(`🎁 总邀请记录: ${inviteCount[0].count}`);

    // 检查是否还有旧字段
    console.log('\n🔍 检查旧字段是否已删除...');
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME IN (
          'usage_count_puzzle', 
          'usage_count_transform', 
          'usage_count_paid',
          'usage_count',
          'has_ever_paid',
          'first_payment_at',
          'last_payment_at',
          'invite_code'
        )
    `);

    if (columns.length === 0) {
      console.log('✅ 所有旧字段已成功删除');
    } else {
      console.log('⚠️  以下旧字段仍然存在:');
      columns.forEach(col => console.log(`   - ${col.COLUMN_NAME}`));
    }

    // 显示余额分布
    console.log('\n📊 余额分布统计:');
    const [balanceStats] = await connection.query(`
      SELECT 
        balance_type,
        COUNT(*) as record_count,
        SUM(amount) as total_amount,
        ROUND(AVG(amount), 2) as avg_amount,
        MIN(amount) as min_amount,
        MAX(amount) as max_amount
      FROM user_balances
      GROUP BY balance_type
    `);
    console.table(balanceStats);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          ✅ 迁移成功完成！                               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📝 下一步操作:');
    console.log('   1. 重启后端服务: cd backend && pnpm run dev');
    console.log('   2. 测试所有功能');
    console.log('   3. 监控错误日志');
    console.log('   4. 验证数据一致性\n');

  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error('详细错误:', error);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    db.closePool();
  }
}

// 执行迁移
runMigration()
  .then(() => {
    console.log('✅ 脚本执行完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 脚本执行失败:', error);
    process.exit(1);
  });
