/**
 * 上传模板图片到腾讯云COS
 * 从指定目录上传模板图片并更新配置
 */

import COS from 'cos-nodejs-sdk-v5';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

// COS 配置
const COS_SECRET_ID = process.env.COS_SECRET_ID;
const COS_SECRET_KEY = process.env.COS_SECRET_KEY;
const COS_BUCKET = process.env.COS_BUCKET;
const COS_REGION = process.env.COS_REGION;
const COS_DOMAIN = process.env.COS_DOMAIN;

// 源图片目录
const SOURCE_DIR = 'C:\\Users\\jacli\\Desktop\\programming\\图片';
// OSS 上的目录前缀
const OSS_PREFIX = 'miniprogram-assets/templates';

// 初始化 COS
const cos = new COS({
  SecretId: COS_SECRET_ID,
  SecretKey: COS_SECRET_KEY,
});

// 模板映射配置
const TEMPLATE_MAPPING = {
  // Transform 模板
  transform: {
    '06gJGeda_dSt1713eb12b2546305e0ca9a624bbe9840.jpg': 'fugui-tuanyuan.jpg', // 富贵团圆（新文件名）
    '欧式豪华客厅.jpg': 'luxury-european.jpg',
    '中式豪宅大厅.jpeg': 'luxury-chinese.jpg',
    '现代轻奢客厅.jpg': 'modern-luxury.jpg',
    '古典宫廷.jpg': 'classical-palace.jpg',
    '豪门盛宴.jpg': 'fHPyN0b67.jpg',
    '雅致居所.jpg': 'fHPyoUXXv.jpg'
  },
  // Puzzle 模板
  puzzle: {
    '时光全家福.jpeg': 'time-family.jpg',
    '岁月如歌.jpg': 'years-song.jpg',
    '春节团圆.jpeg': 'spring-reunion.jpg',
    '中秋月圆.jpeg': 'mid-autumn.jpg',
    '现代简约.jpeg': 'modern-simple.jpg',
    '复古怀旧.jpeg': 'vintage.jpg'
  }
};

/**
 * 上传单个文件到 COS
 */
function uploadFile(localPath, ossKey) {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: ossKey,
      Body: fs.createReadStream(localPath),
    }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(`https://${COS_DOMAIN}/${ossKey}`);
      }
    });
  });
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始上传模板图片到 OSS...\n');
  
  // 检查配置
  if (!COS_SECRET_ID || !COS_SECRET_KEY || !COS_BUCKET || !COS_REGION || !COS_DOMAIN) {
    console.error('❌ 错误: 请检查 backend/.env 中的 COS 配置');
    process.exit(1);
  }
  
  // 检查源目录
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`❌ 错误: 源目录不存在: ${SOURCE_DIR}`);
    process.exit(1);
  }
  
  const uploadResults = {
    transform: {},
    puzzle: {}
  };
  
  // 上传 Transform 模板
  console.log('📤 上传 Transform 模板...\n');
  for (const [sourceFile, targetFile] of Object.entries(TEMPLATE_MAPPING.transform)) {
    const localPath = path.join(SOURCE_DIR, sourceFile);
    
    if (!fs.existsSync(localPath)) {
      console.warn(`⚠️  文件不存在，跳过: ${sourceFile}`);
      continue;
    }
    
    const stat = fs.statSync(localPath);
    const ossKey = `${OSS_PREFIX}/transform/${targetFile}`;
    
    try {
      const url = await uploadFile(localPath, ossKey);
      uploadResults.transform[targetFile] = url;
      console.log(`✅ ${sourceFile} (${formatSize(stat.size)}) -> ${targetFile}`);
      console.log(`   URL: ${url}\n`);
    } catch (err) {
      console.error(`❌ 上传失败: ${sourceFile}`, err.message);
    }
  }
  
  // 上传 Puzzle 模板
  console.log('\n📤 上传 Puzzle 模板...\n');
  for (const [sourceFile, targetFile] of Object.entries(TEMPLATE_MAPPING.puzzle)) {
    const localPath = path.join(SOURCE_DIR, sourceFile);
    
    if (!fs.existsSync(localPath)) {
      console.warn(`⚠️  文件不存在，跳过: ${sourceFile}`);
      continue;
    }
    
    const stat = fs.statSync(localPath);
    const ossKey = `${OSS_PREFIX}/puzzle/${targetFile}`;
    
    try {
      const url = await uploadFile(localPath, ossKey);
      uploadResults.puzzle[targetFile] = url;
      console.log(`✅ ${sourceFile} (${formatSize(stat.size)}) -> ${targetFile}`);
      console.log(`   URL: ${url}\n`);
    } catch (err) {
      console.error(`❌ 上传失败: ${sourceFile}`, err.message);
    }
  }
  
  // 输出结果
  console.log('\n📊 上传完成统计:');
  console.log(`   Transform 模板: ${Object.keys(uploadResults.transform).length} 个`);
  console.log(`   Puzzle 模板: ${Object.keys(uploadResults.puzzle).length} 个`);
  
  console.log('\n✅ 所有模板上传完成！');
  console.log('\n💡 下一步: 运行 update-oss-assets.js 更新 oss-assets.js 映射文件');
}

main().catch(console.error);
