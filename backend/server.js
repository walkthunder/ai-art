require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');
const COS = require('cos-nodejs-sdk-v5');
const { Signer } = require('@volcengine/openapi');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 初始化COS实例
const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
});

// 火山引擎API配置
const VOLCENGINE_ENDPOINT = 'https://open.volcengineapi.com';
const VOLCENGINE_ACTION = 'JimengT2IV40SubmitTask';
const VOLCENGINE_VERSION = '2024-06-06';
const VOLCENGINE_SERVICE_NAME = 'cv';
const VOLCENGINE_REGION = 'cn-beijing';

// 腾讯云OSS配置
const COS_BUCKET = process.env.COS_BUCKET;
const COS_REGION = process.env.COS_REGION;
const COS_DOMAIN = process.env.COS_DOMAIN;

// 不参与加签过程的 header key
const HEADER_KEYS_TO_IGNORE = new Set([
  "authorization",
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
 * HMAC-SHA256签名
 * @param secret 密钥
 * @param s 待签名字符串
 * @returns 签名结果
 */
function hmac(secret, s) {
  return crypto.createHmac('sha256', secret).update(s).digest();
}

/**
 * SHA256哈希
 * @param s 待哈希字符串
 * @returns 哈希结果
 */
function hash(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * URI转义
 * @param str 待转义字符串
 * @returns 转义后的字符串
 */
function uriEscape(str) {
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
function queryParamsToString(params) {
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
function getSignHeaders(originHeaders, needSignHeaders = []) {
  function trimHeaderValue(header) {
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
function sign(params) {
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
    bodySha || hash(''),
  ].join('\n');
  
  const credentialScope = [date, region, serviceName, "request"].join('/');
  
  // 创建待签字符串
  const stringToSign = ["HMAC-SHA256", datetime, credentialScope, hash(canonicalRequest)].join('\n');
  
  // 构建签名密钥
  const kDate = hmac(secretAccessKey, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, serviceName);
  const kSigning = hmac(kService, "request");
  const signature = hmac(kSigning, stringToSign);
  
  // 转换为十六进制字符串
  const signatureHex = signature.toString('hex');

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
 * @param imageUrls 图片文件URL数组
 * @returns 生成任务ID
 */
async function generateArtPhoto(prompt, imageUrls) {
  return new Promise((resolve, reject) => {
    try {
      // 检查环境变量是否已设置
      if (!process.env.VOLCENGINE_ACCESS_KEY_ID || !process.env.VOLCENGINE_SECRET_ACCESS_KEY) {
        throw new Error('火山引擎API的访问密钥未设置，请检查.env文件中的配置');
      }
      
      // 准备请求参数
      const datetime = getDateTimeNow();
      const urlObj = new URL(VOLCENGINE_ENDPOINT);
      const host = urlObj.host;
      
      // 构造请求体
      const requestBody = {
        force_single: false,
        max_ratio: 3,
        min_ratio: 0.33,
        req_key: "jimeng_t2i_v40",
        scale: 0.9,
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
      
      // 将请求体转换为JSON字符串
      const requestBodyString = JSON.stringify(requestBody);
      
      // 构造headers
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': host,
        'X-Date': datetime,
      };
      
      // 使用火山引擎SDK进行查询参数签名
      const openApiRequestData = {
        method: "POST",
        region: VOLCENGINE_REGION,
        params: {
          Action: VOLCENGINE_ACTION,
          Version: VOLCENGINE_VERSION,
          'X-Algorithm': 'HMAC-SHA256',
          'X-Date': datetime,
          'X-Expires': '3600',
          'X-NotSignBody': '1',
          'X-SignedHeaders': 'content-type;host;x-date',
        },
      };
      
      const credentials = {
        accessKeyId: process.env.VOLCENGINE_ACCESS_KEY_ID,
        secretKey: process.env.VOLCENGINE_SECRET_ACCESS_KEY,
        sessionToken: "",
      };
      
      const signer = new Signer(openApiRequestData, VOLCENGINE_SERVICE_NAME);
      const signedQueryString = signer.getSignUrl(credentials);
      
      // 构造完整的URL
      const url = `${VOLCENGINE_ENDPOINT}/?${signedQueryString}`;
      
      console.log('火山引擎API请求URL:', url);
      console.log('请求headers:', JSON.stringify(headers, null, 2));
      console.log('请求体:', requestBodyString);
      console.log('最终的image_urls数组:', requestBody.image_urls);
      
      // 构造请求选项
      const options = {
        method: 'POST',
        headers: headers,
      };
      
      // 发起HTTPS请求
      const req = https.request(url, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            console.log('响应状态:', res.statusCode);
            console.log('响应headers:', JSON.stringify(res.headers, null, 2));
            console.log('响应体:', JSON.stringify(result, null, 2));
            
            // 检查API调用是否成功
            if (res.statusCode !== 200) {
              if (res.statusCode === 401) {
                // 检查是否是签名错误
                if (result?.ResponseMetadata?.Error?.Code === 'SignatureDoesNotMatch') {
                  reject(new Error(`签名错误: ${result.ResponseMetadata.Error.Message}`));
                } else {
                  reject(new Error('API调用未授权，请检查访问密钥是否正确'));
                }
              } else if (res.statusCode === 403) {
                reject(new Error('API调用被禁止，请检查访问密钥权限'));
              } else {
                reject(new Error(`API调用失败，状态码: ${res.statusCode}`));
              }
              return;
            }
            
            // 检查火山引擎API的返回结果
            // 火山引擎API使用code=10000表示成功，而不是0
            if (result?.Result?.code !== 10000) {
              reject(new Error(result?.Result?.message || `API调用失败，错误码: ${result?.Result?.code}`));
              return;
            }
            
            // 获取任务ID
            const taskId = result.Result.data?.task_id || '';
            
            // 记录新创建的任务
            if (taskId) {
              const historyRecord = {
                taskId: taskId,
                originalImageUrls: imageUrls || [],
                generatedImageUrls: [], // 初始为空，等任务完成后再填充
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              
              // 保存到历史记录
              const history = require('./history');
              history.addHistoryRecord(historyRecord);
              console.log(`新任务 ${taskId} 已记录`);
            }
            
            // 返回任务ID
            resolve(taskId);
          } catch (parseError) {
            console.error('解析响应失败:', parseError);
            reject(new Error(`解析响应失败: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('网络请求失败:', error);
        reject(new Error(`网络请求失败: ${error.message}`));
      });
      
      // 发送请求体
      req.write(requestBodyString);
      req.end();
    } catch (error) {
      console.error('生成艺术照过程中发生错误:', error);
      reject(error);
    }
  });
}

/**
 * 查询任务状态
 * @param taskId 任务ID
 * @returns 任务状态和结果
 */
async function getTaskStatus(taskId) {
  return new Promise((resolve, reject) => {
    try {
      // 检查环境变量是否已设置
      if (!process.env.VOLCENGINE_ACCESS_KEY_ID || !process.env.VOLCENGINE_SECRET_ACCESS_KEY) {
        throw new Error('火山引擎API的访问密钥未设置，请检查.env文件中的配置');
      }
      
      // 首先检查是否已经有完成的任务记录
      const history = require('./history');
      const existingRecord = history.findHistoryRecordByTaskId(taskId);
      if (existingRecord && existingRecord.generatedImageUrls && existingRecord.generatedImageUrls.length > 0) {
        // 如果任务已完成且有图片URL，直接返回
        console.log(`任务 ${taskId} 已完成，返回缓存结果`);
        return resolve({
          ResponseMetadata: {},
          Result: {
            code: 10000,
            data: {
              status: "done",
              uploaded_image_urls: existingRecord.generatedImageUrls
            },
            message: "Success"
          }
        });
      }
      
      // 准备请求参数
      const datetime = getDateTimeNow();
      const urlObj = new URL(VOLCENGINE_ENDPOINT);
      const host = urlObj.host;
      
      // 构造请求体
      const requestBody = {
        task_id: taskId,
        req_key: "jimeng_t2i_v40"
      };
      
      // 将请求体转换为JSON字符串
      const requestBodyString = JSON.stringify(requestBody);
      
      // 构造headers
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': host,
        'X-Date': datetime,
      };
      
      // 使用火山引擎SDK进行查询参数签名
      const openApiRequestData = {
        method: "POST",
        region: VOLCENGINE_REGION,
        params: {
          Action: "JimengT2IV40GetResult",
          Version: VOLCENGINE_VERSION,
        },
        headers: headers,
      };
      
      const credentials = {
        accessKeyId: process.env.VOLCENGINE_ACCESS_KEY_ID,
        secretKey: process.env.VOLCENGINE_SECRET_ACCESS_KEY,
        sessionToken: "",
      };
      
      const signer = new Signer(openApiRequestData, VOLCENGINE_SERVICE_NAME);
      // 使用getSignUrl方法生成签名URL
      const signedQueryString = signer.getSignUrl(credentials);
      
      // 构造完整的URL
      const url = `${VOLCENGINE_ENDPOINT}/?${signedQueryString}`;
      
      console.log('查询任务状态请求URL:', url);
      console.log('请求headers:', JSON.stringify(headers, null, 2));
      console.log('请求体:', requestBodyString);
      
      // 构造请求选项
      const options = {
        method: 'POST',
        headers: headers,
      };
      
      // 发起HTTPS请求
      const req = https.request(url, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', async () => {
          try {
            const result = JSON.parse(data);
            console.log('查询任务状态响应状态:', res.statusCode);
            console.log('查询任务状态响应headers:', JSON.stringify(res.headers, null, 2));
            // console.log('查询任务状态响应体:', JSON.stringify(result, null, 2));
            
            // 检查API调用是否成功
            if (res.statusCode !== 200) {
              if (res.statusCode === 401) {
                // 检查是否是签名错误
                if (result?.ResponseMetadata?.Error?.Code === 'SignatureDoesNotMatch') {
                  reject(new Error(`签名错误: ${result.ResponseMetadata.Error.Message}`));
                } else {
                  reject(new Error('API调用未授权，请检查访问密钥是否正确'));
                }
              } else if (res.statusCode === 403) {
                reject(new Error('API调用被禁止，请检查访问密钥权限'));
              } else {
                reject(new Error(`API调用失败，状态码: ${res.statusCode}`));
              }
              return;
            }
            
            // 检查火山引擎API的返回结果
            if (result?.ResponseMetadata?.Error) {
              reject(new Error(`API调用失败: ${result.ResponseMetadata.Error.Message}`));
              return;
            }
            
            // 只有当任务完成时才上传图片
            if (result?.Result?.data?.status === 'done' && 
                result?.Result?.data?.binary_data_base64 && 
                Array.isArray(result.Result.data.binary_data_base64)) {
              console.log(`检测到任务 ${taskId} 已完成，开始上传 ${result.Result.data.binary_data_base64.length} 张图片到OSS`);
              
              // 上传每张图片到OSS
              const uploadedImageUrls = [];
              for (let i = 0; i < result.Result.data.binary_data_base64.length; i++) {
                try {
                  const base64Data = result.Result.data.binary_data_base64[i];
                  // 构造完整的Base64数据URI
                  const base64Image = `data:image/jpeg;base64,${base64Data}`;
                  
                  console.log(`正在上传第 ${i + 1} 张图片到OSS...`);
                  const imageUrl = await uploadImageToOSS(base64Image);
                  uploadedImageUrls.push(imageUrl);
                  console.log(`第 ${i + 1} 张图片上传成功: ${imageUrl}`);
                } catch (uploadError) {
                  console.error(`第 ${i + 1} 张图片上传失败:`, uploadError);
                  // 如果上传失败，仍然继续处理其他图片
                }
              }
              
              // 更新返回结果，将Base64数据替换为OSS URL
              result.Result.data.uploaded_image_urls = uploadedImageUrls;
              
              // 保存到历史记录
              const historyRecord = {
                taskId: taskId,
                originalImageUrls: [], // 原始图片URL需要从前端传递或从任务提交时保存
                generatedImageUrls: uploadedImageUrls,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              
              // 动态导入历史记录模块并保存记录
              const history = require('./history');
              history.addHistoryRecord(historyRecord);
              console.log('历史记录保存成功');
            }
            
            // 返回完整的任务状态信息
            resolve(result);
          } catch (parseError) {
            console.error('解析响应失败:', parseError);
            reject(new Error(`解析响应失败: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('网络请求失败:', error);
        reject(new Error(`网络请求失败: ${error.message}`));
      });
      
      // 发送请求体
      req.write(requestBodyString);
      req.end();
    } catch (error) {
      console.error('查询任务状态过程中发生错误:', error);
      reject(error);
    }
  });
}

/**
 * 上传图片到腾讯云OSS
 * @param base64Image Base64编码的图片数据
 * @returns 上传后的图片URL
 */
async function uploadImageToOSS(base64Image) {
  return new Promise((resolve, reject) => {
    try {
      // 检查环境变量是否已设置
      if (!process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY || 
          !COS_BUCKET || !COS_REGION || !COS_DOMAIN) {
        throw new Error('腾讯云OSS配置未设置，请检查.env文件中的配置');
      }
      
      // 移除Base64数据URI前缀
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
      
      // 将Base64转换为Buffer
      const buffer = Buffer.from(base64Data, 'base64');
      
      // 获取MIME类型
      let mimeType = 'image/jpeg';
      if (base64Image.startsWith('data:image/png')) {
        mimeType = 'image/png';
      } else if (base64Image.startsWith('data:image/gif')) {
        mimeType = 'image/gif';
      }
      
      // 生成文件名
      const fileExtension = mimeType.split('/')[1];
      const fileName = `art-photos/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
      
      // 上传到COS
      cos.putObject({
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: fileName,
        Body: buffer,
        ContentEncoding: 'base64',
        ContentType: mimeType
      }, function(err, data) {
        if (err) {
          console.error('上传到OSS失败:', err);
          reject(new Error('图片上传失败，请稍后重试'));
        } else {
          // 构造可访问的文件URL
          const url = `https://${COS_DOMAIN}/${fileName}`;
          console.error('上传到OSS成功:', url);
          resolve(url);
        }
      });
    } catch (error) {
      console.error('上传图片到OSS失败:', error);
      reject(new Error('图片上传失败，请稍后重试'));
    }
  });
}

// API路由

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 生成艺术照端点
app.post('/api/generate-art-photo', async (req, res) => {
  try {
    const { prompt, imageUrls } = req.body;
    
    if (!prompt || !imageUrls) {
      return res.status(400).json({ 
        error: '缺少必要参数', 
        message: '需要提供 prompt 和 imageUrls 参数' 
      });
    }
    
    const taskId = await generateArtPhoto(prompt, imageUrls);
    res.json({ 
      success: true, 
      data: { 
        taskId: taskId 
      } 
    });
  } catch (error) {
    console.error('生成艺术照失败:', error);
    res.status(500).json({ 
      error: '生成艺术照失败', 
      message: error.message 
    });
  }
});

// 查询任务状态端点
app.get('/api/task-status/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!taskId) {
      return res.status(400).json({ 
        error: '缺少必要参数', 
        message: '需要提供 taskId 参数' 
      });
    }
    
    const status = await getTaskStatus(taskId);
    res.json({ 
      success: true, 
      data: status 
    });
  } catch (error) {
    console.error('查询任务状态失败:', error);
    res.status(500).json({ 
      error: '查询任务状态失败', 
      message: error.message 
    });
  }
});

// 上传图片到OSS端点
app.post('/api/upload-image', async (req, res) => {
  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ 
        error: '缺少必要参数', 
        message: '需要提供 image 参数' 
      });
    }
    
    const imageUrl = await uploadImageToOSS(image);
    res.json({ 
      success: true, 
      data: { 
        imageUrl: imageUrl 
      } 
    });
  } catch (error) {
    console.error('上传图片失败:', error);
    res.status(500).json({ 
      error: '上传图片失败', 
      message: error.message 
    });
  }
});

// 获取所有历史记录端点
app.get('/api/history', async (req, res) => {
  try {
    const historyRecords = require('./history').getAllHistoryRecords();
    res.json({ 
      success: true, 
      data: historyRecords 
    });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    res.status(500).json({ 
      error: '获取历史记录失败', 
      message: error.message 
    });
  }
});

// 根据任务ID获取历史记录端点
app.get('/api/history/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!taskId) {
      return res.status(400).json({ 
        error: '缺少必要参数', 
        message: '需要提供 taskId 参数' 
      });
    }
    
    const record = require('./history').findHistoryRecordByTaskId(taskId);
    if (!record) {
      return res.status(404).json({ 
        error: '未找到记录', 
        message: '未找到对应的任务记录' 
      });
    }
    
    res.json({ 
      success: true, 
      data: record 
    });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    res.status(500).json({ 
      error: '获取历史记录失败', 
      message: error.message 
    });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`火山引擎API代理服务器运行在端口 ${PORT}`);
  console.log(`健康检查端点: http://localhost:${PORT}/health`);
  console.log(`生成艺术照端点: http://localhost:${PORT}/api/generate-art-photo`);
  console.log(`查询任务状态端点: http://localhost:${PORT}/api/task-status/:taskId`);
  console.log(`上传图片端点: http://localhost:${PORT}/api/upload-image`);
  console.log(`获取历史记录端点: http://localhost:${PORT}/api/history`);
  console.log(`根据任务ID获取历史记录端点: http://localhost:${PORT}/api/history/:taskId`);
});