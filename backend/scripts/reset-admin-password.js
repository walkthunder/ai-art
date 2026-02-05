#!/usr/bin/env node

/**
 * 重置管理员密码
 * 
 * 使用方法：
 * 1. 重置本地数据库: node backend/scripts/reset-admin-password.js
 * 2. 重置生产数据库: node backend/scripts/reset-admin-password.js --production
 * 3. 自定义密码: node backend/scripts/reset-admin-password.js --production --password "YourNewPassword"
 */

const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

const DEFAULT_PASSWORD = 'Admin@123456';
const SALT_ROUNDS = 10;
const PRODUCTION_DB_URL = 'mysql://art:artPW192026@sh-cynosdbmysql-grp-ei51puvy.sql.tencentcdb.com:22319/test-1g71tc7eb37627e2';

async function resetAdminPassword(username = 'admin', newPassword = DEFAULT_PASSWORD, useProduction = false) {
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
    
    // 生成密码哈希
    console.log('🔒 生成密码哈希...');
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    console.log('✅ 密码哈希生成成功\n');
    
    // 检查用户是否存在
    console.log(`📋 查询账户 "${username}"...`);
    const [users] = await connection.execute(
      'SELECT id, username, status FROM admin_users WHERE username = ?',
      [username]
    );
    
    if (users.length === 0) {
      console.log(`❌ 未找到用户名为 "${username}" 的管理员账户`);
      return;
    }
    
    const user = users[0];
    console.log(`✅ 找到账户: ${user.username} (状态: ${user.status})\n`);
    
    // 更新密码并解锁账户
    console.log('🔄 更新密码并解锁账户...');
    const [result] = await connection.execute(
      `UPDATE admin_users 
       SET password_hash = ?, 
           login_attempts = 0,
           locked_until = NULL,
           status = 'active',
           updated_at = NOW() 
       WHERE username = ?`,
      [passwordHash, username]
    );
    
    if (result.affectedRows === 0) {
      console.log(`❌ 更新失败`);
      return;
    }
    
    console.log(`✅ 成功重置管理员密码: ${username}`);
    console.log(`   - 新密码: ${newPassword}`);
    console.log(`   - 登录失败次数已重置为 0`);
    console.log(`   - 锁定状态已清除`);
    console.log(`   - 账户状态已设置为 active`);
    console.log('\n⚠️  请妥善保管密码，建议首次登录后立即修改！');
    
  } catch (error) {
    console.error('❌ 重置密码失败:', error.message);
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
const passwordIndex = args.indexOf('--password');
const customPassword = passwordIndex !== -1 ? args[passwordIndex + 1] : DEFAULT_PASSWORD;
const username = args.find(arg => !arg.startsWith('-') && arg !== customPassword) || 'admin';

console.log('========================================');
console.log('🔐 管理员密码重置工具');
console.log('========================================\n');

resetAdminPassword(username, customPassword, useProduction)
  .then(() => {
    console.log('\n✅ 操作完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 操作失败:', error);
    process.exit(1);
  });
