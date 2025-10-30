// 注意：此文件在浏览器环境中运行，使用Web Crypto API

// 火山引擎API配置
const VOLCENGINE_ENDPOINT = 'https://open.volcengineapi.com';
const VOLCENGINE_ACTION = 'JimengT2IV40SubmitTask';
const VOLCENGINE_VERSION = '2024-06-06';
const VOLCENGINE_SERVICE_NAME = 'cv';
const VOLCENGINE_REGION = 'cn-beijing';

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
 * 调用火山引擎API生成艺术照
 * @param prompt 用于生成图像的提示词
 * @param imageUrls 图片文件URL数组，Note that 图1人物照片，图2艺术参考图
 * @returns 生成任务ID
 */
export const generateArtPhoto = async (
  prompt: string = "参考图分工：图 1 为人脸参考图，图 2 为艺术风格参考图。要求：1:1 还原图 1 面部特征，严格复刻图 2 的姿势、风格、场景氛围和光影逻辑。色彩过渡均匀，背景禁用高饱和色。分辨率超高清（300dpi，像素≥2000×3000），确保细节清晰。禁止混淆两图特征，整体画面需通透自然，符合艺术照审美。",
  imageUrls: string[] = []
): Promise<string> => {
  try {
    // 检查环境变量是否已设置
    if (!VOLCENGINE_ACCESS_KEY_ID || !VOLCENGINE_SECRET_ACCESS_KEY) {
      throw new Error('火山引擎API的访问密钥未设置，请检查.env文件中的配置');
    }
    
    // 准备请求参数
    const datetime = getDateTimeNow();
    const host = new URL(VOLCENGINE_ENDPOINT).host;
    
    // 构造请求体
    const requestBody: any = {
      force_single: true,
      max_ratio: 3,
      min_ratio: 0.33,
      req_key: "jimeng_t2i_v40",
      scale: 0.5,
      size: 4194304,
      prompt: prompt
    };
    
    // 如果提供了imageUrls，则添加到请求体中
    if (imageUrls && imageUrls.length > 0) {
      requestBody.image_urls = imageUrls.slice(0, 10); // 限制最多10张图片
      // 确保始终有艺术风格参考图
      if (requestBody.image_urls.length < 2) {
        requestBody.image_urls.push(`https://wms.webinfra.cloud/art-photos/template1.jpeg`);
      }
    } else {
      // 如果没有提供imageUrls，则强制报错
      throw new Error('请提供至少一张照片');
    }
    
    // 构造headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Host': host,
      'X-Date': datetime,
    };
    
    // 构造查询参数 (包含Authorization所需参数)
    const queryParams = {
      Action: VOLCENGINE_ACTION,
      Version: VOLCENGINE_VERSION,
      'X-Algorithm': 'HMAC-SHA256',
      'X-Credential': `${VOLCENGINE_ACCESS_KEY_ID}/${datetime.substring(0, 8)}/${VOLCENGINE_REGION}/${VOLCENGINE_SERVICE_NAME}/request`,
      'X-Date': datetime,
      'X-Expires': '3600',
      'X-NotSignBody': '1',
      'X-SignedHeaders': 'content-type;host;x-date',
      'X-SignedQueries': 'Action;Version;X-Algorithm;X-Credential;X-Date;X-Expires;X-NotSignBody;X-SignedHeaders;X-SignedQueries'
    };
    
    // 用于签名的查询参数 (不包含Authorization相关参数)
    const signQueryParams = {
      Action: VOLCENGINE_ACTION,
      Version: VOLCENGINE_VERSION,
    };
    
    // 签名参数 - 当X-NotSignBody=1时，bodySha应为空字符串的哈希值
    const signParams = {
      headers,
      query: signQueryParams,
      region: VOLCENGINE_REGION,
      serviceName: VOLCENGINE_SERVICE_NAME,
      method: 'POST',
      pathName: '/',
      accessKeyId: VOLCENGINE_ACCESS_KEY_ID,
      secretAccessKey: VOLCENGINE_SECRET_ACCESS_KEY,
      needSignHeaderKeys: ['content-type', 'host', 'x-date'],
      bodySha: await hash('') // 当X-NotSignBody=1时，使用空字符串的哈希值
    };
    
    // 生成签名
    const authorization = await sign(signParams);
    
    // 更新Authorization头
    headers['Authorization'] = authorization;
    
    // 发起请求 (查询参数直接附加在URL上)
    const queryString = queryParamsToString(queryParams);
    const url = `${VOLCENGINE_ENDPOINT}/?${queryString}`;
    
    console.log('火山引擎API请求URL:', url);
    console.log('请求头:', headers);
    console.log('请求体:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });
    
    console.log('响应状态:', response.status);
    console.log('响应头:', response.headers);
    
    const result = await response.json();
    
    console.log('响应体:', JSON.stringify(result, null, 2));
    
    // 检查API调用是否成功
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('API调用未授权，请检查访问密钥是否正确');
      } else if (response.status === 403) {
        throw new Error('API调用被禁止，请检查访问密钥权限');
      } else {
        throw new Error(`API调用失败，状态码: ${response.status}`);
      }
    }
    
    if (result?.code !== 0) {
      throw new Error(result?.message || `API调用失败，错误码: ${result?.code}`);
    }
    
    // 返回任务ID
    return result.data?.task_id || '';
  } catch (error) {
    console.error('火山引擎API调用失败:', error);
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('网络请求失败，可能是由于CORS策略或网络连接问题');
    }
    throw new Error(error instanceof Error ? error.message : '艺术照生成失败，请稍后重试');
  }
};

/**
 * 查询任务状态
 * @param taskId 任务ID
 * @returns 任务状态和结果
 */
export const getTaskStatus = async (taskId: string): Promise<any> => {
  try {
    // 这里需要实现查询任务状态的逻辑
    // 由于示例中没有提供查询接口，暂时返回模拟数据
    // 实际实现时需要调用相应的查询API
    
    // 模拟响应
    return {
      status: 'success',
      data: {
        task_id: taskId,
        state: 'DONE', // 或者 'PROCESSING', 'FAILED'
        result: {
          image_url: 'https://example.com/generated-art-photo.jpg' // 生成的艺术照URL
        }
      }
    };
  } catch (error) {
    console.error('查询任务状态失败:', error);
    throw new Error('查询任务状态失败，请稍后重试');
  }
};

export default {
  generateArtPhoto,
  getTaskStatus
};