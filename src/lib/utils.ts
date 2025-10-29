import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import COS from 'cos-js-sdk-v5'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 格式化日期时间
export function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 模拟AI生成艺术照的延迟函数
export function simulateAIGeneration(): Promise<void> {
  return new Promise((resolve) => {
    // 模拟3-5秒的生成时间
    const delay = Math.floor(Math.random() * 2000) + 3000;
    setTimeout(resolve, delay);
  });
}

// 上传图片到腾讯云OSS
export async function uploadImageToOSS(base64Image: string): Promise<string> {
  try {
    // 从环境变量中获取配置
    const cosSecretId = import.meta.env.VITE_COS_SECRET_ID as string;
    const cosSecretKey = import.meta.env.VITE_COS_SECRET_KEY as string;
    const cosRegion = import.meta.env.VITE_COS_REGION as string;
    const cosBucket = import.meta.env.VITE_COS_BUCKET as string;
    const cosDomain = import.meta.env.VITE_COS_DOMAIN as string;
    
    // 检查必要配置是否存在
    if (!cosSecretId || !cosSecretKey || !cosRegion || !cosBucket || !cosDomain) {
      throw new Error('缺少腾讯云OSS配置信息');
    }
    
    // 初始化COS实例
    const cos = new COS({
      SecretId: cosSecretId,
      SecretKey: cosSecretKey,
    });
    
    // 将Base64转换为Blob
    const byteString = atob(base64Image.split(',')[1]);
    const mimeString = base64Image.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });
    
    // 生成文件名
    const fileName = `art-photos/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${mimeString.split('/')[1]}`;
    
    // 获取预签名URL用于上传
    const putSignUrl: any = await new Promise((resolve, reject) => {
      cos.getObjectUrl({
        Bucket: cosBucket,
        Region: cosRegion,
        Key: fileName,
        Method: 'PUT',
        Expires: 3600, // 1小时过期
      }, function(err: any, data: any) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
    
    // 使用fetch通过预签名URL上传文件
    const response = await fetch(putSignUrl.Url, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeString,
      },
      body: blob,
    });
    
    if (response.ok) {
      // 构造可访问的文件URL
      return `https://${cosDomain}/${fileName}`;
    } else {
      throw new Error(`上传失败，HTTP状态码: ${response.status}`);
    }
  } catch (error) {
    console.error('上传图片到OSS失败:', error);
    throw new Error('图片上传失败，请稍后重试');
  }
}