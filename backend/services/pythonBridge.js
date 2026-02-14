/**
 * Python脚本调用桥接模块
 * 统一管理所有Python脚本的调用
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Python 路径优先级：环境变量 > venv > 系统 python3 > python
const getDefaultPythonPath = () => {
  const venvPath = path.join(__dirname, '..', 'venv', 'bin', 'python3');
  if (fs.existsSync(venvPath)) {
    console.log('[PythonBridge] 使用虚拟环境Python:', venvPath);
    return venvPath;
  }
  
  // Windows系统优先使用 python 而不是 python3
  if (process.platform === 'win32') {
    console.log('[PythonBridge] Windows系统，使用 python 命令');
    return 'python';
  }
  
  console.log('[PythonBridge] 使用系统Python: python3');
  return 'python3'; // 回退到系统 Python
};

const PYTHON_PATH = process.env.PYTHON_PATH || getDefaultPythonPath();
const UTILS_PATH = path.join(__dirname, '..', 'utils');

/**
 * 通用Python脚本执行函数
 * 通过 stdin 传递参数，避免命令行参数过长导致 E2BIG 错误
 * @param scriptName 脚本名称
 * @param params 参数对象
 * @param timeout 超时时间(毫秒)
 */
async function executePythonScript(scriptName, params, timeout = 60000) {
  return new Promise((resolve, reject) => {
    try {
      const scriptPath = path.join(UTILS_PATH, scriptName);
      
      // 验证脚本文件存在
      if (!fs.existsSync(scriptPath)) {
        reject(new Error(`Python脚本不存在: ${scriptPath}`));
        return;
      }
      
      console.log(`[PythonBridge] 执行脚本: ${scriptPath}`);
      console.log(`[PythonBridge] Python路径: ${PYTHON_PATH}`);
      console.log(`[PythonBridge] 参数:`, JSON.stringify(params).substring(0, 200));
      
      // 不再通过命令行参数传递，改用 stdin
      const pythonProcess = spawn(PYTHON_PATH, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        console.log(`[PythonBridge] stdout:`, chunk.substring(0, 200));
      });
      
      pythonProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        console.error(`[PythonBridge] stderr:`, chunk);
      });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python脚本 ${scriptName} 执行失败:`);
          console.error(`退出码: ${code}`);
          console.error(`stderr: ${stderr}`);
          console.error(`stdout: ${stdout}`);
          reject(new Error(`Python脚本执行失败 (退出码 ${code}): ${stderr || stdout || '未知错误'}`));
          return;
        }
        
        try {
          // 尝试解析stdout中的JSON
          if (!stdout || stdout.trim() === '') {
            console.error(`Python脚本 ${scriptName} 没有输出`);
            console.error(`stderr: ${stderr}`);
            reject(new Error(`Python脚本没有输出: ${stderr || '未知错误'}`));
            return;
          }
          
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (parseError) {
          console.error('解析Python脚本输出失败:', parseError);
          console.error('stdout内容:', stdout);
          console.error('stderr内容:', stderr);
          reject(new Error(`解析Python脚本输出失败: ${parseError.message}. stdout: ${stdout.substring(0, 200)}`));
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.error(`Python进程错误 ${scriptName}:`, error);
        reject(new Error(`Python进程启动失败: ${error.message}. 请确保Python已安装且路径正确: ${PYTHON_PATH}`));
      });
      
      const timeoutId = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error(`Python脚本 ${scriptName} 执行超时 (${timeout}ms)`));
      }, timeout);
      
      pythonProcess.on('close', () => clearTimeout(timeoutId));
      
      // 通过 stdin 传递参数（避免 E2BIG 错误）
      try {
        const paramsJson = JSON.stringify(params);
        console.log(`[PythonBridge] 写入stdin:`, paramsJson.substring(0, 200));
        pythonProcess.stdin.write(paramsJson);
        pythonProcess.stdin.end();
      } catch (stdinError) {
        console.error(`[PythonBridge] stdin写入失败:`, stdinError);
        pythonProcess.kill();
        reject(new Error(`参数传递失败: ${stdinError.message}`));
      }
      
    } catch (error) {
      console.error(`调用Python脚本 ${scriptName} 失败:`, error);
      reject(error);
    }
  });
}

/**
 * 提取人脸
 * @param imageUrls 图片URL数组
 */
async function extractFaces(imageUrls) {
  const params = {
    image_paths: imageUrls,
    min_face_size: 50,
    confidence_threshold: 0.3
  };
  
  const result = await executePythonScript('extract_faces.py', params, 60000);
  return result;
}

/**
 * 添加水印
 * @param imagePath 图片路径
 * @param outputPath 输出路径
 * @param watermarkText 水印文字
 * @param qrUrl 二维码URL
 * @param position 水印位置
 */
async function addWatermark(imagePath, outputPath = null, watermarkText = 'AI全家福制作\n扫码去水印', qrUrl = 'https://your-domain.com/pay', position = 'center') {
  const params = {
    image_path: imagePath,
    output_path: outputPath,
    watermark_text: watermarkText,
    qr_url: qrUrl,
    position: position
  };
  
  const result = await executePythonScript('add_watermark.py', params, 30000);
  
  if (!result.success) {
    throw new Error(result.message || '水印添加失败');
  }
  
  return result;
}

/**
 * 转换为Live Photo格式
 * @param videoUrl 视频URL
 * @param outputPath 输出路径
 */
async function convertToLivePhoto(videoUrl, outputPath = null) {
  const params = {
    video_url: videoUrl,
    output_path: outputPath
  };
  
  const result = await executePythonScript('convert_to_live_photo.py', params, 60000);
  
  if (!result.success) {
    throw new Error(result.message || 'Live Photo转换失败');
  }
  
  return result;
}

/**
 * 导出订单Excel
 * @param orders 订单数据数组
 * @param outputPath 输出路径
 */
async function exportOrdersExcel(orders, outputPath = null) {
  const params = {
    orders: orders,
    output_path: outputPath
  };
  
  const result = await executePythonScript('export_orders_excel.py', params, 30000);
  
  if (!result.success) {
    throw new Error(result.message || 'Excel导出失败');
  }
  
  return result;
}

/**
 * 压缩图片并确保最小尺寸
 * @param inputPath 输入图片路径
 * @param outputPath 输出路径（可选）
 * @param maxSizeMb 最大文件大小（MB）
 * @param minWidth 最小宽度（像素），默认300px
 */
async function compressImage(inputPath, outputPath = null, maxSizeMb = 2, minWidth = 300) {
  const params = {
    input_path: inputPath,
    output_path: outputPath,
    max_size_mb: maxSizeMb,
    min_width: minWidth
  };
  
  const result = await executePythonScript('compress_image.py', params, 30000);
  
  if (!result.success) {
    throw new Error(result.message || '图片压缩失败');
  }
  
  return result;
}

module.exports = {
  executePythonScript,
  extractFaces,
  addWatermark,
  convertToLivePhoto,
  exportOrdersExcel,
  compressImage
};
