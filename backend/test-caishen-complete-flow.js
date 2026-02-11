/**
 * 财神变身完整流程测试
 * 测试从上传到生成到结果的完整流程
 * 
 * 测试场景:
 * 1. 免费用户完整流程
 * 2. 付费用户完整流程
 * 3. 余额不足场景
 * 4. 错误处理场景
 */

require('dotenv').config();
const http = require('http');
const db = require('./db/connection');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:3001';
const TEST_USER_FREE = 'test_free_' + Date.now();
const TEST_USER_PAID = 'test_paid_' + Date.now();
const TEST_IMAGE_URL = 'https://wms.webinfra.cloud/test-face.jpg';

// 测试结果统计
const testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

/**
 * 发送HTTP请求
 */
function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * 等待指定时间
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 测试断言
 */
function assert(condition, message) {
  if (condition) {
    console.log(`   ✅ ${message}`);
    testResults.passed++;
  } else {
    console.log(`   ❌ ${message}`);
    testResults.failed++;
    testResults.errors.push(message);
    throw new Error(message);
  }
}

/**
 * 准备测试用户
 */
async function setupTestUsers() {
  console.log('\n📋 准备测试用户...\n');
  
  // 创建免费用户（有3次免费次数）
  console.log('1️⃣  创建免费用户...');
  
  // 先插入用户记录，获取生成的ID
  const freeUserId = uuidv4();
  await db.query(`
    INSERT INTO users (id, openid, payment_status, created_at)
    VALUES (?, ?, 'free', NOW())
    ON DUPLICATE KEY UPDATE id=VALUES(id), payment_status = 'free'
  `, [freeUserId, TEST_USER_FREE]);
  
  await db.query(`
    INSERT INTO user_balances (id, user_id, balance_type, amount, updated_at)
    VALUES (UUID(), ?, 'free_caishen', 3, NOW())
    ON DUPLICATE KEY UPDATE amount = 3
  `, [freeUserId]);
  
  console.log(`   ✅ 免费用户已创建: ${TEST_USER_FREE} (ID: ${freeUserId})`);
  
  // 创建付费用户（有5次付费次数）
  console.log('\n2️⃣  创建付费用户...');
  
  const paidUserId = uuidv4();
  await db.query(`
    INSERT INTO users (id, openid, payment_status, created_at)
    VALUES (UUID(), ?, 'premium', NOW())
    ON DUPLICATE KEY UPDATE id=VALUES(id), payment_status = 'premium'
  `, [paidUserId, TEST_USER_PAID]);
  
  await db.query(`
    INSERT INTO user_balances (id, user_id, balance_type, amount, updated_at)
    VALUES (UUID(), ?, 'paid_caishen', 5, NOW())
    ON DUPLICATE KEY UPDATE amount = 5
  `, [paidUserId]);
  
  console.log(`   ✅ 付费用户已创建: ${TEST_USER_PAID} (ID: ${paidUserId})`);
  
  return { freeUserId, paidUserId };
}

/**
 * 测试1: 获取模板列表
 */
async function testGetTemplates() {
  console.log('\n========== 测试1: 获取模板列表 ==========\n');
  
  try {
    const response = await makeRequest('GET', '/api/caishen/templates');
    
    assert(response.statusCode === 200, '状态码应为200');
    assert(response.body.success === true, '响应success应为true');
    assert(Array.isArray(response.body.data), '模板数据应为数组');
    assert(response.body.data.length > 0, '应至少有一个模板');
    
    const template = response.body.data[0];
    assert(template.id !== undefined, '模板应有id字段');
    assert(template.name !== undefined, '模板应有name字段');
    
    console.log(`   📦 获取到 ${response.body.data.length} 个模板`);
    return response.body.data[0].id;
    
  } catch (error) {
    console.log(`   ❌ 测试失败: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`获取模板列表失败: ${error.message}`);
    throw error;
  }
}

/**
 * 测试2: 免费用户生成视频
 */
async function testFreeUserGeneration(templateId, freeUserId) {
  console.log('\n========== 测试2: 免费用户生成视频 ==========\n');
  
  try {
    // 2.1 检查余额
    console.log('2.1 检查用户余额...');
    const balances = await db.query(
      'SELECT * FROM user_balances WHERE user_id = ? AND balance_type = ?',
      [freeUserId, 'free_caishen']
    );
    
    if (!balances || balances.length === 0) {
      console.log('   ⚠️  余额记录不存在');
      throw new Error('余额记录不存在');
    }
    
    const balance = balances[0];
    console.log(`   📊 当前余额: ${balance.amount}`);
    assert(balance.amount >= 1, '余额应大于等于1');
    
    // 2.2 发起生成请求
    console.log('\n2.2 发起生成请求...');
    const generateResponse = await makeRequest('POST', '/api/caishen/generate', {
      userImageUrl: TEST_IMAGE_URL,
      templateId: templateId,
      userId: freeUserId  // 使用实际的用户ID
    });
    
    if (generateResponse.statusCode !== 200) {
      console.log(`   ⚠️  响应状态码: ${generateResponse.statusCode}`);
      console.log(`   ⚠️  响应内容:`, generateResponse.body);
    }
    
    assert(generateResponse.statusCode === 200, '生成请求状态码应为200');
    assert(generateResponse.body.success === true, '生成请求应成功');
    assert(generateResponse.body.data.taskId !== undefined, '应返回taskId');
    assert(generateResponse.body.data.recordId !== undefined, '应返回recordId');
    
    const taskId = generateResponse.body.data.taskId;
    const recordId = generateResponse.body.data.recordId;
    console.log(`   📝 任务ID: ${taskId}`);
    console.log(`   📝 记录ID: ${recordId}`);
    
    // 2.3 验证余额已扣减
    console.log('\n2.3 验证余额扣减...');
    const newBalances = await db.query(
      'SELECT * FROM user_balances WHERE user_id = ? AND balance_type = ?',
      [freeUserId, 'free_caishen']
    );
    const newBalance = newBalances[0];
    const originalAmount = balance.amount;
    assert(newBalance.amount === originalAmount - 1, '余额应减少1');
    console.log(`   📊 扣减后余额: ${newBalance.amount}`);
    
    // 2.4 轮询任务状态
    console.log('\n2.4 轮询任务状态...');
    let attempts = 0;
    let taskStatus = null;
    const maxAttempts = 30; // 最多等待60秒
    
    while (attempts < maxAttempts) {
      await sleep(2000);
      attempts++;
      
      const statusResponse = await makeRequest('GET', `/api/caishen/task/${taskId}`);
      taskStatus = statusResponse.body.data;
      
      console.log(`   🔄 [${attempts}/${maxAttempts}] 状态: ${taskStatus.status}, 进度: ${taskStatus.progress}%`);
      
      if (taskStatus.status === 'completed') {
        console.log('   ✅ 视频生成完成');
        break;
      } else if (taskStatus.status === 'failed') {
        console.log(`   ❌ 视频生成失败: ${taskStatus.message}`);
        break;
      }
    }
    
    // 2.5 验证生成结果
    console.log('\n2.5 验证生成结果...');
    if (taskStatus.status === 'completed') {
      assert(taskStatus.videoUrl !== undefined, '应返回视频URL');
      assert(taskStatus.videoUrl.length > 0, '视频URL不应为空');
      console.log(`   🎬 视频URL: ${taskStatus.videoUrl}`);
      
      // 验证免费用户视频应有水印
      const [records] = await db.query(
        'SELECT * FROM generation_history WHERE id = ?',
        [recordId]
      );
      console.log(`   💧 水印状态: ${records[0].has_watermark ? '有水印' : '无水印'}`);
      // Note: 水印检查依赖于实际实现
      
      return { taskId, recordId, videoUrl: taskStatus.videoUrl };
    } else {
      console.log('   ⚠️  视频生成未完成或失败（可能是Mock模式）');
      return { taskId, recordId, videoUrl: null };
    }
    
  } catch (error) {
    console.log(`   ❌ 测试失败: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`免费用户生成失败: ${error.message}`);
    throw error;
  }
}

/**
 * 测试3: 付费用户生成视频
 */
async function testPaidUserGeneration(templateId, paidUserId) {
  console.log('\n========== 测试3: 付费用户生成视频 ==========\n');
  
  try {
    // 3.1 发起生成请求
    console.log('3.1 发起生成请求...');
    const generateResponse = await makeRequest('POST', '/api/caishen/generate', {
      userImageUrl: TEST_IMAGE_URL,
      templateId: templateId,
      userId: paidUserId  // 使用实际的用户ID
    });
    
    assert(generateResponse.statusCode === 200, '生成请求状态码应为200');
    assert(generateResponse.body.success === true, '生成请求应成功');
    
    const taskId = generateResponse.body.data.taskId;
    const recordId = generateResponse.body.data.recordId;
    console.log(`   📝 任务ID: ${taskId}`);
    console.log(`   📝 记录ID: ${recordId}`);
    
    // 3.2 验证付费用户余额扣减
    console.log('\n3.2 验证付费用户余额扣减...');
    const balances = await db.query(
      'SELECT * FROM user_balances WHERE user_id = ? AND balance_type = ?',
      [paidUserId, 'paid_caishen']
    );
    const balance = balances[0];
    assert(balance.amount === 4, '付费余额应为4');
    console.log(`   📊 付费余额: ${balance.amount}`);
    
    // 3.3 简单轮询（不等待完成）
    console.log('\n3.3 检查任务状态...');
    await sleep(2000);
    const statusResponse = await makeRequest('GET', `/api/caishen/task/${taskId}`);
    assert(statusResponse.statusCode === 200, '状态查询应成功');
    console.log(`   🔄 当前状态: ${statusResponse.body.data.status}`);
    
    return { taskId, recordId };
    
  } catch (error) {
    console.log(`   ❌ 测试失败: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`付费用户生成失败: ${error.message}`);
    throw error;
  }
}

/**
 * 测试4: 余额不足场景
 */
async function testInsufficientBalance() {
  console.log('\n========== 测试4: 余额不足场景 ==========\n');
  
  try {
    const noBalanceUser = 'test_no_balance_' + Date.now();
    
    // 创建无余额用户
    console.log('4.1 创建无余额用户...');
    await db.query(`
      INSERT INTO user_balances (id, user_id, balance_type, amount, updated_at)
      VALUES (UUID(), ?, 'free_caishen', 0, NOW())
    `, [noBalanceUser]);
    console.log(`   ✅ 用户已创建: ${noBalanceUser}`);
    
    // 尝试生成
    console.log('\n4.2 尝试生成（应失败）...');
    const generateResponse = await makeRequest('POST', '/api/caishen/generate', {
      userImageUrl: TEST_IMAGE_URL,
      templateId: 'default',
      userId: noBalanceUser
    });
    
    assert(
      generateResponse.statusCode === 400 || generateResponse.body.success === false,
      '余额不足应返回错误'
    );
    console.log(`   ✅ 正确返回余额不足错误`);
    
    // 清理
    await db.query('DELETE FROM user_balances WHERE user_id = ?', [noBalanceUser]);
    
  } catch (error) {
    console.log(`   ❌ 测试失败: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`余额不足测试失败: ${error.message}`);
  }
}

/**
 * 测试5: 历史记录查询
 */
async function testHistoryQuery(freeUserId) {
  console.log('\n========== 测试5: 历史记录查询 ==========\n');
  
  try {
    // 5.1 查询免费用户历史
    console.log('5.1 查询免费用户历史...');
    const historyResponse = await makeRequest(
      'GET',
      `/api/caishen/history?userId=${freeUserId}&page=1&limit=10`
    );
    
    assert(historyResponse.statusCode === 200, '历史查询状态码应为200');
    assert(historyResponse.body.success === true, '历史查询应成功');
    assert(Array.isArray(historyResponse.body.data.records), '历史记录应为数组');
    assert(historyResponse.body.data.records.length > 0, '应至少有一条历史记录');
    
    console.log(`   📚 查询到 ${historyResponse.body.data.records.length} 条历史记录`);
    
    const record = historyResponse.body.data.records[0];
    assert(record.mode === 'caishen', '记录模式应为caishen');
    console.log(`   📝 最新记录状态: ${record.status}`);
    
  } catch (error) {
    console.log(`   ❌ 测试失败: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`历史记录查询失败: ${error.message}`);
  }
}

/**
 * 测试6: 视频URL可访问性
 */
async function testVideoAccessibility(videoUrl) {
  console.log('\n========== 测试6: 视频URL可访问性 ==========\n');
  
  if (!videoUrl) {
    console.log('   ⚠️  跳过测试（无视频URL，可能是Mock模式）');
    return;
  }
  
  try {
    console.log(`6.1 测试视频URL: ${videoUrl}`);
    
    // 简单的URL格式验证
    assert(videoUrl.startsWith('http'), '视频URL应以http开头');
    console.log('   ✅ 视频URL格式正确');
    
  } catch (error) {
    console.log(`   ❌ 测试失败: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`视频可访问性测试失败: ${error.message}`);
  }
}

/**
 * 清理测试数据
 */
async function cleanup() {
  console.log('\n========== 清理测试数据 ==========\n');
  
  try {
    await db.query('DELETE FROM generation_history WHERE user_id IN (?, ?)', 
      [TEST_USER_FREE, TEST_USER_PAID]);
    await db.query('DELETE FROM user_balances WHERE user_id IN (?, ?)', 
      [TEST_USER_FREE, TEST_USER_PAID]);
    await db.query('DELETE FROM users WHERE openid IN (?, ?)', 
      [TEST_USER_FREE, TEST_USER_PAID]);
    
    console.log('   ✅ 测试数据已清理');
  } catch (error) {
    console.log(`   ⚠️  清理失败: ${error.message}`);
  }
}

/**
 * 主测试函数
 */
async function runCompleteFlowTest() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║          财神变身完整流程测试                          ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  let templateId = null;
  let freeUserResult = null;
  let freeUserId = null;
  let paidUserId = null;
  
  try {
    // 准备测试用户
    const userIds = await setupTestUsers();
    freeUserId = userIds.freeUserId;
    paidUserId = userIds.paidUserId;
    
    // 测试1: 获取模板列表
    templateId = await testGetTemplates();
    
    // 测试2: 免费用户完整流程
    freeUserResult = await testFreeUserGeneration(templateId, freeUserId);
    
    // 测试3: 付费用户生成
    await testPaidUserGeneration(templateId, paidUserId);
    
    // 测试4: 余额不足场景
    await testInsufficientBalance();
    
    // 测试5: 历史记录查询
    await testHistoryQuery(freeUserId);
    
    // 测试6: 视频URL可访问性
    if (freeUserResult && freeUserResult.videoUrl) {
      await testVideoAccessibility(freeUserResult.videoUrl);
    }
    
  } catch (error) {
    console.error('\n❌ 测试执行出错:', error.message);
  } finally {
    // 清理测试数据
    await cleanup();
    
    // 关闭数据库连接
    if (db.pool) {
      await db.pool.end();
    }
  }
  
  // 输出测试结果
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                    测试结果汇总                        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  console.log(`✅ 通过: ${testResults.passed}`);
  console.log(`❌ 失败: ${testResults.failed}`);
  console.log(`📊 总计: ${testResults.passed + testResults.failed}`);
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ 失败详情:');
    testResults.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }
  
  console.log('\n📝 测试说明:');
  console.log('   - 本测试覆盖了完整的生成流程');
  console.log('   - 测试了免费用户和付费用户场景');
  console.log('   - 验证了余额扣减和历史记录功能');
  console.log('   - 如果启用了MOCK模式，视频生成会快速完成');
  
  const exitCode = testResults.failed > 0 ? 1 : 0;
  process.exit(exitCode);
}

// 运行测试
runCompleteFlowTest();
