/**
 * 视频音频合成服务
 * 为付费用户的财神视频添加背景音乐
 * 支持音频淡入淡出效果
 */

const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const ossService = require('./ossService');

// 背景音乐文件路径
const BACKGROUND_MUSIC_PATH = path.join(__dirname, '../../public/caishen-bg-music.mp3');

// 临时文件目录
const TEMP_DIR = path.join(__dirname, '../temp/video-merge');

/**
 * 确保临时目录存在
 */
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    console.error('[视频合成] 创建临时目录失败:', error);
  }
}

/**
 * 为视频添加背景音乐
 * @param {string} videoUrl - 原始视频URL
 * @param {Object} options - 合成选项
 * @param {number} options.volume - 音乐音量 (0-1)，默认 0.6
 * @param {number} options.fadeIn - 淡入时长（秒），默认 0.5
 * @param {number} options.fadeOut - 淡出时长（秒），默认 0.5
 * @param {boolean} options.loop - 是否循环音乐，默认 true
 * @returns {Promise<string>} 合成后的视频URL
 */
async function addBackgroundMusic(videoUrl, options = {}) {
  const {
    volume = 0.6,
    fadeIn = 0.5,
    fadeOut = 0.5,
    loop = true
  } = options;
  
  console.log('\n========== [视频音频合成] 开始处理 ==========');
  console.log('📹 原始视频:', videoUrl);
  console.log('🎵 背景音乐:', BACKGROUND_MUSIC_PATH);
  console.log('🔊 音量:', volume);
  console.log('⬆️  淡入:', fadeIn, '秒');
  console.log('⬇️  淡出:', fadeOut, '秒');
  console.log('🔁 循环:', loop);
  
  const startTime = Date.now();
  
  try {
    // 检查 FFmpeg 是否可用
    await checkFFmpegAvailable();
    
    // 检查背景音乐文件是否存在
    await checkMusicFileExists();
    
    // 确保临时目录存在
    await ensureTempDir();
    
    // 生成临时文件名
    const timestamp = Date.now();
    const tempVideoPath = path.join(TEMP_DIR, `video_${timestamp}.mp4`);
    const outputVideoPath = path.join(TEMP_DIR, `output_${timestamp}.mp4`);
    
    // 1. 下载原始视频
    console.log('[视频合成] 步骤 1/4: 下载原始视频...');
    await downloadVideo(videoUrl, tempVideoPath);
    
    // 2. 获取视频时长
    console.log('[视频合成] 步骤 2/4: 获取视频信息...');
    const videoDuration = await getVideoDuration(tempVideoPath);
    console.log('[视频合成] 视频时长:', videoDuration, '秒');
    
    // 3. 使用 FFmpeg 合成视频和音频
    console.log('[视频合成] 步骤 3/4: 合成视频和音频...');
    await mergeVideoAndAudio(tempVideoPath, outputVideoPath, videoDuration, {
      volume,
      fadeIn,
      fadeOut,
      loop
    });
    
    // 4. 上传到 OSS
    console.log('[视频合成] 步骤 4/4: 上传到 OSS...');
    const mergedVideoUrl = await uploadMergedVideo(outputVideoPath);
    
    // 5. 清理临时文件
    console.log('[视频合成] 清理临时文件...');
    await cleanupTempFiles([tempVideoPath, outputVideoPath]);
    
    const duration = Date.now() - startTime;
    console.log(`[视频合成] ✅ 合成完成，耗时: ${(duration / 1000).toFixed(2)}秒`);
    console.log('[视频合成] 合成后视频:', mergedVideoUrl);
    
    return mergedVideoUrl;
  } catch (error) {
    console.error('[视频合成] ❌ 合成失败:', error);
    throw new Error(`视频音频合成失败: ${error.message}`);
  }
}

/**
 * 检查 FFmpeg 是否可用
 */
async function checkFFmpegAvailable() {
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    console.log('[视频合成] FFmpeg 版本:', stdout.split('\n')[0]);
    return true;
  } catch (error) {
    throw new Error('FFmpeg 未安装或不可用，请先安装 FFmpeg');
  }
}

/**
 * 检查背景音乐文件是否存在
 */
async function checkMusicFileExists() {
  try {
    await fs.access(BACKGROUND_MUSIC_PATH);
    return true;
  } catch (error) {
    throw new Error(`背景音乐文件不存在: ${BACKGROUND_MUSIC_PATH}`);
  }
}

/**
 * 下载视频到本地
 */
async function downloadVideo(videoUrl, outputPath) {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    await fs.writeFile(outputPath, Buffer.from(buffer));
    
    console.log('[视频合成] 视频下载完成:', outputPath);
  } catch (error) {
    throw new Error(`下载视频失败: ${error.message}`);
  }
}

/**
 * 获取视频时长
 */
async function getVideoDuration(videoPath) {
  try {
    const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
    const { stdout } = await execAsync(command);
    return parseFloat(stdout.trim());
  } catch (error) {
    throw new Error(`获取视频时长失败: ${error.message}`);
  }
}

/**
 * 合成视频和音频
 */
async function mergeVideoAndAudio(videoPath, outputPath, videoDuration, options) {
  const { volume, fadeIn, fadeOut, loop } = options;
  
  try {
    // 构建 FFmpeg 命令
    // 音频处理：
    // 1. 循环音频以匹配视频长度
    // 2. 调整音量
    // 3. 添加淡入淡出效果
    const audioFilter = [
      `volume=${volume}`,
      `afade=t=in:st=0:d=${fadeIn}`,
      `afade=t=out:st=${videoDuration - fadeOut}:d=${fadeOut}`
    ].join(',');
    
    const command = [
      'ffmpeg',
      '-i', `"${videoPath}"`,                    // 输入视频
      '-stream_loop', '-1',                       // 循环音频
      '-i', `"${BACKGROUND_MUSIC_PATH}"`,        // 输入音频
      '-filter_complex',
      `"[1:a]${audioFilter}[a]"`,                // 音频滤镜
      '-map', '0:v',                              // 映射视频流
      '-map', '[a]',                              // 映射处理后的音频流
      '-c:v', 'copy',                             // 复制视频编码（不重新编码）
      '-c:a', 'aac',                              // 音频编码为 AAC
      '-b:a', '128k',                             // 音频比特率
      '-shortest',                                // 以最短流为准（视频长度）
      '-y',                                       // 覆盖输出文件
      `"${outputPath}"`                           // 输出文件
    ].join(' ');
    
    console.log('[视频合成] FFmpeg 命令:', command);
    
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer
    });
    
    if (stderr) {
      console.log('[视频合成] FFmpeg 输出:', stderr.substring(0, 500));
    }
    
    // 检查输出文件是否存在
    await fs.access(outputPath);
    console.log('[视频合成] 合成完成:', outputPath);
  } catch (error) {
    console.error('[视频合成] FFmpeg 错误:', error.message);
    throw new Error(`FFmpeg 合成失败: ${error.message}`);
  }
}

/**
 * 上传合成后的视频到 OSS
 */
async function uploadMergedVideo(videoPath) {
  try {
    const fileName = `caishen-with-music/${Date.now()}-${path.basename(videoPath)}`;
    const videoUrl = await ossService.uploadFile(videoPath, fileName);
    console.log('[视频合成] 视频上传完成:', videoUrl);
    return videoUrl;
  } catch (error) {
    throw new Error(`上传视频失败: ${error.message}`);
  }
}

/**
 * 清理临时文件
 */
async function cleanupTempFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
      console.log('[视频合成] 已删除临时文件:', filePath);
    } catch (error) {
      console.warn('[视频合成] 删除临时文件失败:', filePath, error.message);
    }
  }
}

/**
 * 检查是否需要合成音频（仅付费用户）
 * @param {string} paymentStatus - 付费状态
 * @returns {boolean}
 */
function shouldMergeAudio(paymentStatus) {
  return paymentStatus !== 'free';
}

module.exports = {
  addBackgroundMusic,
  shouldMergeAudio
};
