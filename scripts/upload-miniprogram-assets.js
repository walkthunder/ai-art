/**
 * 小程序静态资源上传到腾讯云COS脚本
 * 将 miniprogram/assets 目录下的图片上传到 OSS
 * 生成 URL 映射文件供小程序使用
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

// 小程序资源目录
const ASSETS_DIR = path.join(__dirname, '../miniprogram/assets');
// OSS 上的目录前缀
const OSS_PREFIX = 'miniprogram-assets';
// 输出的映射文件路径
const OUTPUT_MAP_FILE = path.join(__dirname, '../miniprogram/utils/oss-assets.js');

// 支持的图片格式
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

// 初始化 COS
const cos = new COS({
  SecretId: COS_SECRET_ID,
  SecretKey: COS_SECRET_KEY,
});

/**
 * 递归获取目录下所有图片文件
 */
function getAllImageFiles(dir, baseDir = dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getAllImageFiles(fullPath, baseDir));
    } else if (IMAGE_EXTENSIONS.includes(path.extname(item).toLowerCase())) {
      const relativePath = path.relative(baseDir, fullPath);
      files.push({
        localPath: fullPath,
        relativePath: relativePath,
        size: stat.size,
      });
    }
  }
  
  return files;
}

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
 * 生成资源映射 JS 文件
 */
function generateAssetMapFile(urlMap) {
  // 读取现有的映射文件（如果存在）
  let existingAssets = {};
  if (fs.existsSync(OUTPUT_MAP_FILE)) {
    try {
      const existingContent = fs.readFileSync(OUTPUT_MAP_FILE, 'utf-8');
      // 提取现有的 OSS_ASSETS 对象
      const match = existingContent.match(/const OSS_ASSETS = ({[\s\S]*?});/);
      if (match) {
        existingAssets = eval('(' + match[1] + ')');
        console.log(`\n📦 找到现有映射 ${Object.keys(existingAssets).length} 条`);
      }
    } catch (err) {
      console.warn('⚠️  读取现有映射文件失败，将创建新文件:', err.message);
    }
  }
  
  // 合并新旧映射（新的覆盖旧的）
  const mergedAssets = { ...existingAssets, ...urlMap };
  
  const content = `/**
 * 小程序静态资源 OSS URL 映射
 * 自动生成，请勿手动修改
 * 生成时间: ${new Date().toISOString()}
 */

const OSS_ASSETS = ${JSON.stringify(mergedAssets, null, 2)};

/**
 * 获取 OSS 资源 URL
 * @param {string} localPath - 本地相对路径，如 'images/launch-bg.png'
 * @returns {string} OSS URL
 */
function getAssetUrl(localPath) {
  return OSS_ASSETS[localPath] || '/assets/' + localPath;
}

module.exports = {
  OSS_ASSETS,
  getAssetUrl,
};
`;
  
  fs.writeFileSync(OUTPUT_MAP_FILE, content);
  console.log(`\n✅ 资源映射文件已更新: ${OUTPUT_MAP_FILE}`);
  console.log(`   现有映射: ${Object.keys(existingAssets).length} 条`);
  console.log(`   新增映射: ${Object.keys(urlMap).length} 条`);
  console.log(`   合并后: ${Object.keys(mergedAssets).length} 条`);
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始上传小程序静态资源到 OSS...\n');
  
  // 检查配置
  if (!COS_SECRET_ID || !COS_SECRET_KEY || !COS_BUCKET || !COS_REGION || !COS_DOMAIN) {
    console.error('❌ 错误: 请检查 backend/.env 中的 COS 配置');
    process.exit(1);
  }
  
  // 获取所有图片文件
  const files = getAllImageFiles(ASSETS_DIR);
  console.log(`📁 找到 ${files.length} 个图片文件\n`);
  
  // 统计
  let totalSize = 0;
  let uploadedCount = 0;
  let skippedCount = 0;
  const urlMap = {};
  
  // 上传所有图片（小程序规范：图片不应超过 200KB）
  const SIZE_THRESHOLD = 0;
  
  for (const file of files) {
    totalSize += file.size;
    const ossKey = `${OSS_PREFIX}/${file.relativePath.replace(/\\/g, '/')}`;
    
    if (file.size > SIZE_THRESHOLD) {
      try {
        const url = await uploadFile(file.localPath, ossKey);
        urlMap[file.relativePath.replace(/\\/g, '/')] = url;
        console.log(`✅ ${file.relativePath} (${formatSize(file.size)}) -> ${url}`);
        uploadedCount++;
      } catch (err) {
        console.error(`❌ 上传失败: ${file.relativePath}`, err.message);
      }
    }
  }
  
  // 生成映射文件
  generateAssetMapFile(urlMap);
  
  // 输出统计
  console.log('\n📊 上传统计:');
  console.log(`   总文件数: ${files.length}`);
  console.log(`   已上传: ${uploadedCount}`);
  console.log(`   已跳过: ${skippedCount}`);
  console.log(`   总大小: ${formatSize(totalSize)}`);
  console.log('\n💡 提示: 请更新小程序代码，使用 getAssetUrl() 获取资源 URL');
}

main().catch(console.error);
