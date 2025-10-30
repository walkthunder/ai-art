// 注意：此文件在浏览器环境中运行，使用Web Crypto API

// 火山引擎API配置
const VOLCENGINE_ENDPOINT = 'https://open.volcengineapi.com';
const VOLCENGINE_ACTION = 'JimengT2IV40SubmitTask';
const VOLCENGINE_VERSION = '2024-06-06';
const VOLCENGINE_SERVICE_NAME = 'cv';
const VOLCENGINE_REGION = 'cn-beijing';

// 后端代理服务地址
const VOLCENGINE_API_PROXY = 'http://localhost:3001';

// 从环境变量中获取配置
const VOLCENGINE_ACCESS_KEY_ID = import.meta.env.VITE_VOLCENGINE_ACCESS_KEY_ID as string;
const VOLCENGINE_SECRET_ACCESS_KEY = import.meta.env.VITE_VOLCENGINE_SECRET_ACCESS_KEY as string;

// 验证环境变量是否已设置
if (!VOLCENGINE_ACCESS_KEY_ID || !VOLCENGINE_SECRET_ACCESS_KEY) {
  console.warn('警告: 火山引擎API的访问密钥未设置或为空，请检查.env文件中的配置');
}

/**
 * 调用火山引擎API生成艺术照（通过后端代理）
 * @param prompt 用于生成图像的提示词
 * @param imageUrls 图片文件URL数组，Note that 图1人物照片，图2艺术参考图
 * @returns 生成任务ID
 */
export const generateArtPhoto = async (
  prompt: string = "参考图分工：图 1 为人脸参考图，图 2 为艺术风格参考图。要求：1:1 还原图 1 面部特征，严格复刻图 2 的姿势、风格、场景氛围和光影逻辑。色彩过渡均匀，背景禁用高饱和色。分辨率超高清（300dpi，像素≥2000×3000），确保细节清晰。禁止混淆两图特征，整体画面需通透自然，符合艺术照审美。",
  imageUrls: string[] = []
): Promise<string> => {
  try {
    // 构造请求体
    const requestBody = {
      prompt,
      imageUrls
    };
    
    const response = await fetch(`${VOLCENGINE_API_PROXY}/api/generate-art-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    const result = await response.json();
    
    // 检查API调用是否成功
    if (!response.ok) {
      throw new Error(result?.message || `API调用失败，状态码: ${response.status}`);
    }
    
    if (!result?.success) {
      throw new Error(result?.message || 'API调用失败');
    }
    
    // 返回任务ID
    return result.data?.taskId || '';
  } catch (error) {
    console.error('火山引擎API调用失败:', error);
    throw new Error(error instanceof Error ? error.message : '艺术照生成失败，请稍后重试');
  }
};

/**
 * 查询任务状态（通过后端代理）
 * @param taskId 任务ID
 * @returns 任务状态和结果
 */
export const getTaskStatus = async (taskId: string): Promise<any> => {
  try {
    const response = await fetch(`${VOLCENGINE_API_PROXY}/api/task-status/${taskId}`);
    
    const result = await response.json();
    
    // 检查API调用是否成功
    if (!response.ok) {
      throw new Error(result?.message || `API调用失败，状态码: ${response.status}`);
    }
    
    if (!result?.success) {
      throw new Error(result?.message || 'API调用失败');
    }
    
    return result.data;
  } catch (error) {
    console.error('查询任务状态失败:', error);
    throw new Error(error instanceof Error ? error.message : '查询任务状态失败，请稍后重试');
  }
};

export default {
  generateArtPhoto,
  getTaskStatus
};