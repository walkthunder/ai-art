/**
 * 更新 oss-assets.js 文件，添加新上传的模板 URL
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const COS_DOMAIN = process.env.COS_DOMAIN;
const OUTPUT_FILE = path.join(__dirname, '../miniprogram/utils/oss-assets.js');

// 新增的模板 URL（基于上传脚本的结果）
const NEW_TEMPLATES = {
  // Transform 模板
  'templates/transform/fugui-tuanyuan.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/transform/fugui-tuanyuan.jpg`,
  'templates/transform/haomen-shengyan.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/transform/haomen-shengyan.jpg`,
  'templates/transform/yazhi-jusuo.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/transform/yazhi-jusuo.jpg`,
  'templates/transform/luxury-european.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/transform/luxury-european.jpg`,
  'templates/transform/luxury-chinese.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/transform/luxury-chinese.jpg`,
  'templates/transform/modern-luxury.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/transform/modern-luxury.jpg`,
  'templates/transform/classical-palace.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/transform/classical-palace.jpg`,
  
  // Puzzle 模板
  'templates/puzzle/time-family.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/puzzle/time-family.jpg`,
  'templates/puzzle/years-song.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/puzzle/years-song.jpg`,
  'templates/puzzle/spring-reunion.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/puzzle/spring-reunion.jpg`,
  'templates/puzzle/mid-autumn.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/puzzle/mid-autumn.jpg`,
  'templates/puzzle/modern-simple.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/puzzle/modern-simple.jpg`,
  'templates/puzzle/vintage.jpg': `https://${COS_DOMAIN}/miniprogram-assets/templates/puzzle/vintage.jpg`,
};

/**
 * 读取现有的 oss-assets.js 文件
 */
function readExistingAssets() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    return {};
  }
  
  const content = fs.readFileSync(OUTPUT_FILE, 'utf-8');
  const match = content.match(/const OSS_ASSETS = ({[\s\S]*?});/);
  
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch (err) {
      console.error('解析现有资源文件失败:', err);
      return {};
    }
  }
  
  return {};
}

/**
 * 生成新的 oss-assets.js 文件
 */
function generateAssetFile(assets) {
  const content = `/**
 * 小程序静态资源 OSS URL 映射
 * 自动生成，请勿手动修改
 * 生成时间: ${new Date().toISOString()}
 */

const OSS_ASSETS = ${JSON.stringify(assets, null, 2)};

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
  
  fs.writeFileSync(OUTPUT_FILE, content);
  console.log(`✅ 资源映射文件已更新: ${OUTPUT_FILE}`);
}

/**
 * 主函数
 */
function main() {
  console.log('🔄 更新 oss-assets.js 文件...\n');
  
  // 读取现有资源
  const existingAssets = readExistingAssets();
  console.log(`📁 现有资源数量: ${Object.keys(existingAssets).length}`);
  
  // 合并新资源
  const mergedAssets = {
    ...existingAssets,
    ...NEW_TEMPLATES
  };
  
  console.log(`📦 新增资源数量: ${Object.keys(NEW_TEMPLATES).length}`);
  console.log(`📊 合并后总数量: ${Object.keys(mergedAssets).length}\n`);
  
  // 生成新文件
  generateAssetFile(mergedAssets);
  
  console.log('\n✅ 更新完成！');
  console.log('\n新增的模板路径:');
  Object.keys(NEW_TEMPLATES).forEach(key => {
    console.log(`  - ${key}`);
  });
}

main();
