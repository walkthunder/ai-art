/**
 * 重置用户使用次数脚本（适配新架构 user_balances 表）
 * 用于开发调试时快速修改使用次数
 * 
 * 使用方法：
 * node backend/scripts/reset-usage-count.js [userId] [mode] [count]
 * node backend/scripts/reset-usage-count.js --list
 * node backend/scripts/reset-usage-count.js --interactive
 * 
 * 示例：
 * node backend/scripts/reset-usage-count.js user123 paid 100
 * node backend/scripts/reset-usage-count.js all free_puzzle 50
 * node backend/scripts/reset-usage-count.js --list
 * node backend/scripts/reset-usage-count.js -i
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../db/connection');
const balanceService = require('../services/balanceService');
const readline = require('readline');

/**
 * 创建交互式输入接口
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * 提问并获取答案
 */
function question(rl, query) {
  return new Promise(resolve => rl.question(query, resolve));
}

/**
 * 重置指定用户的使用次数
 * @param {string} userId - 用户ID，或 'all' 表示所有用户
 * @param {string} mode - 模式 ('free_puzzle', 'free_transform', 'paid')
 * @param {number} count - 要设置的使用次数
 */
async function resetUsageCount(userId, mode, count) {
  let connection;
  try {
    console.log('\n🔄 连接数据库...');
    connection = await db.pool.getConnection();
    
    if (userId === 'all') {
      // 重置所有用户的指定模式
      const [result] = await connection.query(
        'UPDATE user_balances SET amount = ?, updated_at = NOW() WHERE balance_type = ?',
        [count, mode]
      );
      
      console.log(`\n✅ 成功重置所有用户的 ${mode} 次数为 ${count}`);
      console.log(`   影响行数: ${result.affectedRows}`);
      
      // 显示统计
      const [stats] = await connection.query(
        `SELECT 
          COUNT(DISTINCT user_id) as total_users,
          SUM(amount) as total_balance
         FROM user_balances 
         WHERE balance_type = ?`,
        [mode]
      );
      console.log(`\n📊 当前统计:`);
      console.log(`   用户数: ${stats[0].total_users}`);
      console.log(`   总${mode}次数: ${stats[0].total_balance}`);
      
    } else {
      // 重置指定用户 - 使用 balanceService
      // 先获取当前余额
      const oldBalances = await balanceService.checkBalance(userId);
      const oldCount = mode === 'paid' ? oldBalances.paid.count : 
                      mode === 'free_puzzle' ? oldBalances.puzzle.free_count :
                      oldBalances.transform.free_count;
      
      // 直接更新数据库
      await connection.query(
        'UPDATE user_balances SET amount = ?, updated_at = NOW() WHERE user_id = ? AND balance_type = ?',
        [count, userId, mode]
      );
      
      console.log(`\n✅ 成功重置用户的 ${mode} 次数为 ${count}`);
      
      // 查询当前状态
      const balances = await balanceService.checkBalance(userId);
      
      console.log(`\n📋 用户余额信息:`);
      console.log(`   用户ID: ${userId}`);
      console.log(`   时空拼图: ${balances.puzzle.free_count}`);
      console.log(`   富贵变身: ${balances.transform.free_count}`);
      console.log(`   付费次数: ${balances.paid.count}`);
    }
    
    return true;
    
  } catch (error) {
    console.error('\n❌ 重置失败:', error.message);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 列出所有用户及其使用次数
 */
async function listUsers(limit = 20) {
  let connection;
  try {
    console.log('\n🔄 连接数据库...');
    connection = await db.pool.getConnection();
    
    // 获取总数
    const [countResult] = await connection.query(
      'SELECT COUNT(*) as total FROM users'
    );
    const total = countResult[0].total;
    
    // 获取用户列表及其余额
    const [users] = await connection.query(
      `SELECT 
        u.id, 
        u.openid, 
        u.nickname,
        u.created_at,
        MAX(CASE WHEN ub.balance_type = 'free_puzzle' THEN ub.amount ELSE 0 END) as puzzle_balance,
        MAX(CASE WHEN ub.balance_type = 'free_transform' THEN ub.amount ELSE 0 END) as transform_balance,
        MAX(CASE WHEN ub.balance_type = 'paid' THEN ub.amount ELSE 0 END) as paid_balance
       FROM users u
       LEFT JOIN user_balances ub ON u.id = ub.user_id
       GROUP BY u.id, u.openid, u.nickname, u.created_at
       ORDER BY u.created_at DESC 
       LIMIT ?`,
      [limit]
    );
    
    if (users.length === 0) {
      console.log('\n❌ 没有找到任何用户');
      return;
    }
    
    console.log(`\n📋 用户列表 (显示最近 ${users.length} 个，共 ${total} 个):`);
    console.log('═'.repeat(120));
    console.log(
      '序号'.padEnd(6) + 
      '用户ID'.padEnd(38) + 
      '昵称'.padEnd(15) + 
      '拼图'.padEnd(8) + 
      '变身'.padEnd(8) + 
      '付费'.padEnd(8) + 
      '创建时间'
    );
    console.log('═'.repeat(120));
    
    users.forEach((user, index) => {
      const num = String(index + 1).padEnd(6);
      const id = user.id.substring(0, 36).padEnd(38);
      const nickname = (user.nickname || '未设置').substring(0, 12).padEnd(15);
      const puzzle = String(user.puzzle_balance || 0).padEnd(8);
      const transform = String(user.transform_balance || 0).padEnd(8);
      const paid = String(user.paid_balance || 0).padEnd(8);
      const date = new Date(user.created_at).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      console.log(`${num}${id}${nickname}${puzzle}${transform}${paid}${date}`);
    });
    
    console.log('═'.repeat(120));
    
    // 显示统计
    const [stats] = await connection.query(
      `SELECT 
        COUNT(DISTINCT u.id) as total_users,
        SUM(CASE WHEN ub.balance_type = 'free_puzzle' THEN ub.amount ELSE 0 END) as total_puzzle,
        SUM(CASE WHEN ub.balance_type = 'free_transform' THEN ub.amount ELSE 0 END) as total_transform,
        SUM(CASE WHEN ub.balance_type = 'paid' THEN ub.amount ELSE 0 END) as total_paid
       FROM users u
       LEFT JOIN user_balances ub ON u.id = ub.user_id`
    );
    
    console.log(`\n📊 统计信息:`);
    console.log(`   总用户数: ${stats[0].total_users}`);
    console.log(`   总拼图次数: ${stats[0].total_puzzle}`);
    console.log(`   总变身次数: ${stats[0].total_transform}`);
    console.log(`   总付费次数: ${stats[0].total_paid}`);
    
    return users;
    
  } catch (error) {
    console.error('\n❌ 查询失败:', error.message);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 交互式模式
 */
async function interactiveMode() {
  const rl = createInterface();
  
  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   使用次数管理工具 - 交互式模式      ║');
    console.log('╚════════════════════════════════════════╝');
    
    // 先列出用户
    const users = await listUsers(10);
    
    if (!users || users.length === 0) {
      console.log('\n没有用户可以修改');
      rl.close();
      return;
    }
    
    console.log('\n请选择操作:');
    console.log('  1. 修改指定用户的使用次数');
    console.log('  2. 修改所有用户的使用次数');
    console.log('  3. 查看更多用户');
    console.log('  0. 退出');
    
    const choice = await question(rl, '\n请输入选项 (0-3): ');
    
    if (choice === '0') {
      console.log('\n👋 再见！');
      rl.close();
      return;
    }
    
    if (choice === '3') {
      const limit = await question(rl, '\n显示多少个用户? (默认50): ');
      await listUsers(parseInt(limit) || 50);
      rl.close();
      return;
    }
    
    if (choice === '1') {
      const userId = await question(rl, '\n请输入用户ID: ');
      if (!userId.trim()) {
        console.log('\n❌ 用户ID不能为空');
        rl.close();
        return;
      }
      
      const mode = await question(rl, '请输入模式 (free_puzzle/free_transform/paid): ');
      if (!['free_puzzle', 'free_transform', 'paid'].includes(mode.trim())) {
        console.log('\n❌ 模式必须是 free_puzzle, free_transform 或 paid');
        rl.close();
        return;
      }
      
      const count = await question(rl, '请输入新的使用次数: ');
      const countNum = parseInt(count);
      
      if (isNaN(countNum) || countNum < 0) {
        console.log('\n❌ 使用次数必须是非负整数');
        rl.close();
        return;
      }
      
      await resetUsageCount(userId.trim(), mode.trim(), countNum);
      
    } else if (choice === '2') {
      const mode = await question(rl, '\n请输入模式 (free_puzzle/free_transform/paid): ');
      if (!['free_puzzle', 'free_transform', 'paid'].includes(mode.trim())) {
        console.log('\n❌ 模式必须是 free_puzzle, free_transform 或 paid');
        rl.close();
        return;
      }
      
      const count = await question(rl, '请输入新的使用次数: ');
      const countNum = parseInt(count);
      
      if (isNaN(countNum) || countNum < 0) {
        console.log('\n❌ 使用次数必须是非负整数');
        rl.close();
        return;
      }
      
      const confirm = await question(rl, `\n⚠️  确认要将所有用户的 ${mode} 次数设置为 ${countNum} 吗? (yes/no): `);
      
      if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
        await resetUsageCount('all', mode.trim(), countNum);
      } else {
        console.log('\n❌ 操作已取消');
      }
      
    } else {
      console.log('\n❌ 无效的选项');
    }
    
  } catch (error) {
    console.error('\n❌ 操作失败:', error.message);
  } finally {
    rl.close();
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  // 显示帮助信息
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           使用次数管理工具 - 帮助文档                    ║
╚════════════════════════════════════════════════════════════╝

用法:
  node backend/scripts/reset-usage-count.js <userId> <mode> <count>
  node backend/scripts/reset-usage-count.js --list [limit]
  node backend/scripts/reset-usage-count.js --interactive

参数:
  userId    用户ID（从 --list 获取），或使用 'all' 修改所有用户
  mode      模式 (free_puzzle/free_transform/paid)
  count     要设置的使用次数（必须是非负整数）

选项:
  --list, -l           列出所有用户及其使用次数
  --interactive, -i    进入交互式模式（推荐）
  --help, -h           显示此帮助信息

示例:
  # 交互式模式（推荐，最简单）
  node backend/scripts/reset-usage-count.js -i

  # 列出最近20个用户
  node backend/scripts/reset-usage-count.js --list

  # 列出最近50个用户
  node backend/scripts/reset-usage-count.js --list 50

  # 修改指定用户的付费次数为 100
  node backend/scripts/reset-usage-count.js abc123-def456-ghi789 paid 100

  # 修改所有用户的拼图次数为 50
  node backend/scripts/reset-usage-count.js all free_puzzle 50

提示:
  1. 先使用 --list 查看用户ID
  2. 复制用户ID后使用命令修改
  3. 或直接使用 -i 进入交互式模式
    `);
    process.exit(0);
  }
  
  // 交互式模式
  if (args[0] === '--interactive' || args[0] === '-i') {
    await interactiveMode();
    process.exit(0);
  }
  
  // 列出用户
  if (args[0] === '--list' || args[0] === '-l') {
    const limit = args[1] ? parseInt(args[1]) : 20;
    await listUsers(limit);
    process.exit(0);
  }
  
  // 重置使用次数
  const userId = args[0];
  const mode = args[1];
  const count = args[2] ? parseInt(args[2]) : null;
  
  if (!userId) {
    console.error('\n❌ 错误: 用户ID不能为空');
    console.log('💡 提示: 使用 --help 查看帮助信息');
    process.exit(1);
  }
  
  if (!mode || !['free_puzzle', 'free_transform', 'paid'].includes(mode)) {
    console.error('\n❌ 错误: 模式必须是 free_puzzle, free_transform 或 paid');
    process.exit(1);
  }
  
  if (count === null) {
    console.error('\n❌ 错误: 必须指定使用次数');
    console.log('💡 提示: node backend/scripts/reset-usage-count.js <userId> <mode> <count>');
    process.exit(1);
  }
  
  if (isNaN(count) || count < 0) {
    console.error('\n❌ 错误: 使用次数必须是非负整数');
    process.exit(1);
  }
  
  const success = await resetUsageCount(userId, mode, count);
  process.exit(success ? 0 : 1);
}

// 执行
main()
  .then(() => {
    db.closePool();
  })
  .catch(error => {
    console.error('\n💥 执行失败:', error.message);
    db.closePool();
    process.exit(1);
  });
