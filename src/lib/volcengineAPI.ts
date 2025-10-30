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

// 不参与加签过程的 header key
const HEADER_KEYS_TO_IGNORE = new Set([
  "authorization",
  "content-type",
  "content-length",
  "user-agent",
  "presigned-expires",
  "expect",
]);

/**
 * 生成当前时间戳
 * @returns 格式化的日期时间字符串
 */
function getDateTimeNow() {
  const now = new Date();
  return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

/**
 * HMAC-SHA256签名 (使用Web Crypto API)
 * @param secret 密钥
 * @param s 待签名字符串
 * @returns 签名结果
 */
async function hmac(secret: string | Uint8Array, s: string) {
  const encoder = new TextEncoder();
  
  // 如果secret是字符串，转换为Uint8Array
  let secretArray: Uint8Array;
  if (typeof secret === 'string') {
    secretArray = encoder.encode(secret);
  } else {
    secretArray = secret;
  }
  
  const key = await crypto.subtle.importKey(
    'raw',
    secretArray,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(s));
  return new Uint8Array(signature);
}

/**
 * SHA256哈希 (使用Web Crypto API)
 * @param s 待哈希字符串
 * @returns 哈希结果
 */
async function hash(s: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(s);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * URI转义
 * @param str 待转义字符串
 * @returns 转义后的字符串
 */
function uriEscape(str: string) {
  try {
    return encodeURIComponent(str)
      .replace(/[^A-Za-z0-9_.~\-%]+/g, (match) => {
        return match.split('').map(char => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`).join('');
      })
      .replace(/[*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch (e) {
    return '';
  }
}

/**
 * 查询参数转字符串 (按ASCII排序)
 * @param params 查询参数对象
 * @returns 格式化的查询参数字符串
 */
function queryParamsToString(params: Record<string, any>) {
  return Object.keys(params)
    .sort() // 按ASCII排序
    .map((key) => {
      const val = params[key];
      if (typeof val === 'undefined' || val === null) {
        return `${uriEscape(key)}=`;
      }
      const escapedKey = uriEscape(key);
      if (!escapedKey) {
        return '';
      }
      if (Array.isArray(val)) {
        return `${escapedKey}=${val.map(uriEscape).sort().join(`&${escapedKey}=`)}`;
      }
      return `${escapedKey}=${uriEscape(val)}`;
    })
    .filter((v) => v)
    .join('&');
}

/**
 * 获取签名头
 * @param originHeaders 原始headers
 * @param needSignHeaders 需要签名的headers
 * @returns [签名头keys, 规范化headers]
 */
function getSignHeaders(originHeaders: Record<string, any>, needSignHeaders: string[] = []) {
  function trimHeaderValue(header: any) {
    return header.toString?.().trim().replace(/\s+/g, ' ') ?? '';
  }

  let h = Object.keys(originHeaders);
  // 根据 needSignHeaders 过滤
  if (Array.isArray(needSignHeaders)) {
    const needSignSet = new Set([...needSignHeaders, 'x-date', 'host'].map((k) => k.toLowerCase()));
    h = h.filter((k) => needSignSet.has(k.toLowerCase()));
  }
  // 根据 ignore headers 过滤
  h = h.filter((k) => !HEADER_KEYS_TO_IGNORE.has(k.toLowerCase()));
  const signedHeaderKeys = h
    .slice()
    .map((k) => k.toLowerCase())
    .sort() // 按ASCII排序
    .join(';');
  const canonicalHeaders = h
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
    .map((k) => `${k.toLowerCase()}:${trimHeaderValue(originHeaders[k])}`)
    .join('\n');
  return [signedHeaderKeys, canonicalHeaders];
}

/**
 * 签名函数
 * @param params 签名参数
 * @returns 签名字符串
 */
async function sign(params: {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  region?: string;
  serviceName?: string;
  method?: string;
  pathName?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  needSignHeaderKeys?: string[];
  bodySha?: string;
}) {
  const {
    headers = {},
    query = {},
    region = '',
    serviceName = '',
    method = '',
    pathName = '/',
    accessKeyId = '',
    secretAccessKey = '',
    needSignHeaderKeys = [],
    bodySha,
  } = params;
  
  const datetime = headers["X-Date"] || headers["x-date"];
  const date = datetime.substring(0, 8); // YYYYMMDD
  
  // 创建规范请求
  const [signedHeaders, canonicalHeaders] = getSignHeaders(headers, needSignHeaderKeys);
  const canonicalRequest = [
    method.toUpperCase(),
    pathName,
    queryParamsToString(query) || '',
    `${canonicalHeaders}\n`,
    signedHeaders,
    bodySha || await hash(''),
  ].join('\n');
  
  const credentialScope = [date, region, serviceName, "request"].join('/');
  
  // 创建待签字符串
  const stringToSign = ["HMAC-SHA256", datetime, credentialScope, await hash(canonicalRequest)].join('\n');
  
  // 构建签名密钥
  const kDate = await hmac(secretAccessKey, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, serviceName);
  const kSigning = await hmac(kService, "request");
  const signature = await hmac(kSigning, stringToSign);
  
  // 将Uint8Array转换为十六进制字符串
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return [
    "HMAC-SHA256",
    `Credential=${accessKeyId}/${credentialScope},`,
    `SignedHeaders=${signedHeaders},`,
    `Signature=${signatureHex}`,
  ].join(' ');
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