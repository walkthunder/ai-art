/**
 * 上传背景音乐到腾讯云COS
 * 将 public/caishen-bg-music.mp3 上传到 OSS
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

// 音乐文件路径
const MUSIC_FILE = path.join(__dirname, '../public/caishen-bg-music.mp3');
const OSS_KEY = 'music/caishen-bg-music.mp3';

// 初始化 COS
const cos = new COS({
  SecretId: COS_SECRET_ID,
  SecretKey: COS_SECRET_KEY,
});

/**
 * 上传文件到 COS
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
 * 更新音乐配置文件
 */
function updateMusicConfig(musicUrl) {
  const configPath = path.join(__dirname, '../miniprogram/config/music.js');
  const configDir = path.dirname(configPath);
  
  // 确保目录存在
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  const content = `/**
 * 小程序背景音乐配置
 * 自动生成，请勿手动修改
 * 生成时间: ${new Date().toISOString()}
 */

module.exports = {
  // 财神模式音乐列表
  caishen: [
    {
      id: 'caishen-bgm-1',
      name: '财神背景音乐',
      url: '${musicUrl}',
      duration: 60,
      loop: true
    }
  ],
  
  // 默认配置
  defaultConfig: {
    volume: 0.6,
    loop: true,
    autoplay: false
  }
};
`;
  
  fs.writeFileSync(configPath, content);
  console.log(`✅ 音乐配置文件已更新: ${configPath}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('🎵 开始上传背景音乐到 OSS...\n');
  
  // 检查配置
  if (!COS_SECRET_ID || !COS_SECRET_KEY || !COS_BUCKET || !COS_REGION || !COS_DOMAIN) {
    console.error('❌ 错误: 请检查 backend/.env 中的 COS 配置');
    process.exit(1);
  }
  
  // 检查文件是否存在
  if (!fs.existsSync(MUSIC_FILE)) {
    console.error(`❌ 错误: 音乐文件不存在: ${MUSIC_FILE}`);
    process.exit(1);
  }
  
  // 获取文件大小
  const stat = fs.statSync(MUSIC_FILE);
  console.log(`📁 文件: ${path.basename(MUSIC_FILE)}`);
  console.log(`📦 大小: ${formatSize(stat.size)}`);
  
  // 检查文件大小（建议 < 2MB）
  if (stat.size > 2 * 1024 * 1024) {
    console.warn(`⚠️  警告: 文件大小超过 2MB，可能影响加载速度`);
  }
  
  try {
    // 上传文件
    console.log(`\n⬆️  正在上传到 OSS...`);
    const url = await uploadFile(MUSIC_FILE, OSS_KEY);
    console.log(`✅ 上传成功: ${url}`);
    
    // 更新配置文件
    console.log(`\n📝 更新音乐配置文件...`);
    updateMusicConfig(url);
    
    console.log('\n🎉 完成！音乐文件已上传并配置完成');
    console.log(`\n💡 音乐 URL: ${url}`);
    
  } catch (err) {
    console.error(`\n❌ 上传失败:`, err.message);
    process.exit(1);
  }
}

main().catch(console.error);
