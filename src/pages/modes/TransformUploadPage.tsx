import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { faceAPI } from '@/lib/api';
import { TRANSFORM_MODE } from '@/config/modes';
import transformUploadBg from '@/assets/transform-upload.png';
import PageTransition from '@/components/PageTransition';

// 日志工具函数
function logUpload(stage: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[TransformUpload][${timestamp}][${stage}]`;
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export default function TransformUploadPage() {
  const navigate = useNavigate();
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (isUploading) return;
    logUpload('点击', '用户点击上传区域');
    setErrorMessage('');
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      logUpload('文件选择', '用户取消选择文件');
      return;
    }

    logUpload('文件选择', '========== 开始处理上传文件 ==========');
    logUpload('文件选择', '文件信息', {
      name: file.name,
      type: file.type,
      size: `${(file.size / 1024 / 1024).toFixed(2)}MB`
    });

    // 检查文件格式
    if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
      logUpload('验证', '❌ 文件格式不支持', { type: file.type });
      setErrorMessage('请上传JPG或PNG格式的图片');
      return;
    }
    logUpload('验证', '✅ 文件格式验证通过');

    // 检查文件大小（最大10MB）
    if (file.size > 10 * 1024 * 1024) {
      logUpload('验证', '❌ 文件过大', { size: file.size });
      setErrorMessage('图片文件过大，请上传小于10MB的图片');
      return;
    }
    logUpload('验证', '✅ 文件大小验证通过');

    setIsUploading(true);
    setErrorMessage('');

    try {
      // 读取文件为 base64
      logUpload('读取', '正在读取图片为Base64...');
      setStatusText('正在读取图片...');
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = (event) => {
          if (event.target?.result) {
            resolve(event.target.result as string);
          } else {
            reject(new Error('读取文件失败'));
          }
        };
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });
      logUpload('读取', '✅ 图片读取成功', {
        dataUrlLength: dataUrl.length,
        preview: dataUrl.substring(0, 50) + '...'
      });

      // 直接使用 base64 进行人脸检测（后端已跳过实际检测）
      logUpload('人脸检测', '正在调用人脸检测API...');
      setStatusText('正在检测人脸...');
      const result = await faceAPI.extractFaces([dataUrl]);
      logUpload('人脸检测', '人脸检测API返回（已跳过实际检测）', {
        success: result.success,
        faceCount: result.faces?.length || 0,
        message: result.message
      });

      if (!result.success) {
        logUpload('人脸检测', '❌ 检测接口调用失败');
        setErrorMessage(result.message || '图片处理失败，请重新上传');
        setIsUploading(false);
        setStatusText('');
        return;
      }

      // 检测成功，自动进入下一步
      logUpload('人脸检测', `✅ 检测成功`);
      setStatusText('检测成功，正在跳转...');
      
      logUpload('跳转', '准备跳转到模板选择页', {
        targetPath: `${TRANSFORM_MODE.slug}/template`,
        imageCount: 1,
        faceCount: result.faces.length
      });
      
      setTimeout(() => {
        navigate(`${TRANSFORM_MODE.slug}/template`, {
          state: {
            mode: 'transform',
            uploadedImages: [dataUrl],
            faces: result.faces
          }
        });
      }, 300);

    } catch (error) {
      logUpload('错误', `❌ 上传处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
      console.error('上传失败:', error);
      setErrorMessage(error instanceof Error ? error.message : '上传失败，请重试');
      setIsUploading(false);
      setStatusText('');
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen w-full relative overflow-hidden">
        {/* 隐藏的文件输入 */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/jpeg,image/jpg,image/png"
          className="hidden"
        />

        {/* 完整背景图 - 可点击触发上传 */}
        <div
          onClick={handleClick}
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat ${
            isUploading ? 'cursor-wait' : 'cursor-pointer'
          }`}
          style={{
            backgroundImage: `url(${transformUploadBg})`,
          }}
        >
          {/* 上传中的遮罩 */}
          {isUploading && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#FFD700]"></div>
              {statusText && (
                <p className="text-white text-lg mt-4 font-medium">{statusText}</p>
              )}
            </div>
          )}

          {/* 错误提示 */}
          {errorMessage && !isUploading && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
              <div className="bg-red-500 text-white px-6 py-4 rounded-lg shadow-lg max-w-sm mx-4 text-center">
                <p className="text-lg font-medium mb-2">⚠️ {errorMessage}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setErrorMessage('');
                  }}
                  className="mt-2 px-4 py-2 bg-white text-red-500 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  重新上传
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
