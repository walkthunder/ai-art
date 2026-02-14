#!/usr/bin/env node
/**
 * 检查生产环境水印配置状态
 */

const mysql = require('mysql2/promise');

async function checkWatermarkStatus() {
  let connection;
  
  try {
    console.log('=== 连接生产数据库 ===\n');
    
    // 连接生产数据库
    connection = await mysql.createConnection({
      host: 'sh-cynosdbmysql-grp-ei51puvy.sql.tencentcdb.com',
      port: 22319,
      user: 'art',
      password: 'artPW192026',
      database: 'test-1g71tc7eb37627e2'
    });
    
    console.log('✅ 数据库连接成功\n');
    
    // 查询水印相关配置
    console.log('=== 水印配置 ===\n');
    const [configs] = await connection.execute(
      `SELECT config_key, config_value, config_type, description, is_public 
       FROM app_config 
       WHERE config_key LIKE 'watermark%' OR config_key = 'features.enableWatermark'
       ORDER BY config_key`
    );
    
    if (configs.length === 0) {
      console.log('⚠️  未找到水印配置');
    } else {
      configs.forEach(config => {
        console.log(`配置键: ${config.config_key}`);
        console.log(`  值: ${config.config_value}`);
        console.log(`  类型: ${config.config_type}`);
        console.log(`  说明: ${config.description || '无'}`);
        console.log(`  公开: ${config.is_public ? '是' : '否'}`);
        console.log('');
      });
    }
    
    // 解析配置值
    console.log('=== 解析后的配置 ===\n');
    
    const configMap = {};
    configs.forEach(row => {
      let value = row.config_value;
      
      // 解析值
      switch (row.config_type) {
        case 'number':
          value = Number(value);
          break;
        case 'boolean':
          value = value === 'true' || value === '1';
          break;
        case 'json':
          try {
            value = JSON.parse(value);
          } catch (e) {
            // 保持原值
          }
          break;
        case 'string':
        default:
          // 移除字符串两端的引号
          value = value.replace(/^"(.*)"$/, '$1');
          break;
      }
      
      configMap[row.config_key] = value;
    });
    
    console.log('水印功能启用:', configMap['features.enableWatermark'] !== false ? '是' : '否');
    console.log('水印文字模板:', configMap['watermark.textTemplate'] || '(未配置)');
    console.log('二维码URL:', configMap['watermark.qrUrl'] || '(未配置)');
    console.log('小程序码图片URL:', configMap['watermark.qrImageUrl'] || '(未配置)');
    console.log('水印位置:', configMap['watermark.position'] || 'center');
    console.log('水印透明度:', configMap['watermark.opacity'] || 180);
    
    // 分析状态
    console.log('\n=== 状态分析 ===\n');
    
    const enableWatermark = configMap['features.enableWatermark'] !== false;
    const qrImageUrl = configMap['watermark.qrImageUrl'];
    const qrUrl = configMap['watermark.qrUrl'];
    
    if (!enableWatermark) {
      console.log('❌ 水印功能已禁用');
      console.log('   免费用户生成的图片不会添加水印');
    } else {
      console.log('✅ 水印功能已启用');
      console.log('   免费用户生成的图片会自动添加水印');
      
      if (qrImageUrl && qrImageUrl.trim() && qrImageUrl !== '""') {
        console.log('\n✅ 已配置小程序码图片URL');
        console.log('   水印将使用配置的小程序码图片');
        console.log('   图片URL:', qrImageUrl);
      } else {
        console.log('\n⚠️  未配置小程序码图片URL');
        console.log('   水印将动态生成二维码');
        console.log('   二维码内容:', qrUrl || '(未配置)');
      }
    }
    
    // 查询最近的生成记录
    console.log('\n=== 最近生成记录 ===\n');
    const [recentTasks] = await connection.execute(
      `SELECT id, user_id, mode, status, created_at 
       FROM tasks 
       ORDER BY created_at DESC 
       LIMIT 5`
    );
    
    if (recentTasks.length > 0) {
      console.log('最近5条生成记录:');
      recentTasks.forEach((task, index) => {
        console.log(`${index + 1}. ${task.id} - ${task.mode} - ${task.status} - ${task.created_at}`);
      });
    } else {
      console.log('暂无生成记录');
    }
    
    // 查询用户付费状态统计
    console.log('\n=== 用户付费状态统计 ===\n');
    const [userStats] = await connection.execute(
      `SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN payment_status = 'free' THEN 1 ELSE 0 END) as free_users,
        SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid_users
       FROM users`
    );
    
    if (userStats.length > 0) {
      const stats = userStats[0];
      console.log(`总用户数: ${stats.total_users}`);
      console.log(`免费用户: ${stats.free_users} (会添加水印)`);
      console.log(`付费用户: ${stats.paid_users} (不添加水印)`);
    }
    
    console.log('\n=== 检查完成 ===');
    
  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   无法连接到数据库，请检查网络和数据库配置');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   数据库认证失败，请检查用户名和密码');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkWatermarkStatus();
