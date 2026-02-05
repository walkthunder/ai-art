/**
 * 解锁管理员账户
 * 用于解除因登录失败次数过多而被锁定的管理员账户
 * 
 * 使用方法：
 * 1. 解锁本地数据库: node backend/scripts/unlock-admin-account.js
 * 2. 解锁生产数据库: node backend/scripts/unlock-admin-account.js --production
 */

const mysql = require('mysql2/promise');

// 生产环境数据库配置
const PRODUCTION_DB_URL = 'mysql://art:artPW192026@sh-cynosdbmysql-grp-ei51puvy.sql.tencentcdb.com:22319/test-1g71tc7eb37627e2';

async function unlockAdminAccount(username = 'admin', useProduction = false) {
  let connection;
  
  try {
    // 根据参数选择数据库
    if (useProduction) {
      console.log('🌐 连接到生产环境数据库...');
      connection = await mysql.createConnection(PRODUCTION_DB_URL);
    } else {
      console.log('💻 连接到本地数据库...');
      const { getConnection } = require('../db/connection');
      connection = await getConnection();
    }
    
    console.log('✅ 数据库连接成功\n');
    
    // 查询当前状态
    console.log(`📋 查询账户 "${username}" 的当前状态...`);
    const [users] = await connection.execute(
      'SELECT username, status, login_attempts, locked_until FROM admin_users WHERE username = ?',
      [username]
    );
    
    if (users.length === 0) {
      console.log(`❌ 未找到用户名为 "${username}" 的管理员账户`);
      return;
    }
    
    const user = users[0];
    console.log('当前状态:');
    console.log(`  - 状态: ${user.status}`);
    console.log(`  - 登录失败次数: ${user.login_attempts}`);
    console.log(`  - 锁定至: ${user.locked_until || '未锁定'}\n`);
    
    // 解锁账户
    console.log('🔓 正在解锁账户...');
    const [result] = await connection.execute(
      `UPDATE admin_users 
       SET login_attempts = 0, 
           locked_until = NULL, 
           status = 'active', 
           updated_at = NOW() 
       WHERE username = ?`,
      [username]
    );
    
    if (result.affectedRows === 0) {
      console.log(`❌ 解锁失败`);
      return;
    }
    
    console.log(`✅ 成功解锁管理员账户: ${username}`);
    console.log(`   - 登录失败次数已重置为 0`);
    console.log(`   - 锁定状态已清除`);
    console.log(`   - 账户状态已设置为 active`);
    
  } catch (error) {
    console.error('❌ 解锁账户失败:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 解析命令行参数
const args = process.argv.slice(2);
const useProduction = args.includes('--production') || args.includes('-p');
const username = args.find(arg => !arg.startsWith('-')) || 'admin';

console.log('========================================');
console.log('🔐 管理员账户解锁工具');
console.log('========================================\n');

unlockAdminAccount(username, useProduction)
  .then(() => {
    console.log('\n✅ 操作完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 操作失败:', error);
    process.exit(1);
  });
