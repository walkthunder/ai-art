import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import Background from '../components/Background';
import HistoryItem from '../components/HistoryItem';
import PaymentModal from '../components/PaymentModal';
import HelpModal from '../components/HelpModal';
import ImagePreviewModal from '../components/ImagePreviewModal';
import { formatDateTime, uploadImageToOSS, getTemplateImages } from '../lib/utils';
import { generateArtPhoto, getTaskStatus } from '../lib/volcengineAPI';

// 定义历史记录项类型
interface HistoryItemType {
  id: string;
  originalImage: string;
  generatedImage: string;
  createdAt: string;
  isPaid: boolean;
  regenerateCount: number;
}

const PROMPT_TEXT = `我提供了至少两张参考图，分工:​
图0:人物基础参考图(真实人物照片，仅用于提取人脸核心特征,不含姿势/风格参考)​
图1:艺术风格参考图(文件名以template开始,仅用于复刻姿势、穿着风格、场景氛围、光影逻辑,不含人脸参考)​
其他图均为真实人物照片。
主体核心要求:​
人脸特征:1:1 还原图0(人物参考图)的面部轮廓、五官比例、肤色质感、发型细节,确保人脸辨识度无任何扭曲(如五官位置、面部痣/疤等特征需完全匹配)​
姿势/风格:严格复刻图1(艺术风格参考图)的肢体姿势(含肢体角度、动作幅度、姿态细节)、穿着风格(含衣物款式、纹理质感、搭配逻辑)、场景氛围(含场景类型、背景基调),需与图1 风格完全统一​
艺术风格规范(以图1 为准):​
色彩:遵循图1 的色彩调性,过渡均匀,主体与背景色调和谐；背景禁用高饱和色,避免抢夺人脸焦点,且背景质感需呼应图1 的场景风格​
统一性:仅保留图1 的艺术风格(如柔和写实、简约高级等),禁止混入水彩、卡通、夸张滤镜等其他风格,确保整体艺术感连贯​
画质与细节标准:​
分辨率:超高清(300dpi,像素≥2000×3000),需清晰呈现:①图0 人脸；②图1 姿势的衣物褶皱、肢体线条；③图1 背景的笔触/质感细节​
光影:沿用图1 的柔和光影逻辑(如侧光/柔光),人脸光影需自然衔接图1 风格(无明显阴影死角),既突出图1 姿势的立体感,又不破坏图0 人脸的原有特征​
背景:仅按图1 的场景延伸逻辑处理(如室内配简约淡色墙面、室外配柔和自然背景),禁止添加无关元素,确保 “图0 人脸 + 图1 姿势” 为视觉中心​
禁止项:​
禁止用图1 的人脸特征替代图0(如改变图0 五官比例、肤色)​
禁止用图0 的姿势/风格替代图1(如调整图1 的肢体角度、衣物款式)​
禁止使用与图1 调性冲突的颜色(如鲜艳红、亮绿)​
禁止笔触不当(人脸模糊、姿势线条生硬),整体画面需通透自然,符合 “艺术照” 审美
`;

export default function GeneratorPage() {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [regenerateCount, setRegenerateCount] = useState(3);
  const [historyItems, setHistoryItems] = useState<HistoryItemType[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showImagePreviewModal, setShowImagePreviewModal] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [currentHistoryItem, setCurrentHistoryItem] = useState<HistoryItemType | null>(null);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<Record<string, string>>({}); // 用于缓存已上传图片的URL
  const [templateImages, setTemplateImages] = useState<string[]>([]); // 模板图片列表
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null); // 选中的模板
  const [showTemplateSelector, setShowTemplateSelector] = useState(false); // 是否显示模板选择器
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  // 获取模板图片列表
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const templates = await getTemplateImages();
        setTemplateImages(templates);
        // 默认选择第一个模板
        if (templates.length > 0 && !selectedTemplate) {
          setSelectedTemplate(templates[0]);
        }
      } catch (error) {
        console.error('获取模板图片失败:', error);
      }
    };
    
    fetchTemplates();
  }, []);
  
  // 从localStorage加载历史记录和重生成次数
  useEffect(() => {
    const savedHistory = localStorage.getItem('artPhotoHistory');
    if (savedHistory) {
      setHistoryItems(JSON.parse(savedHistory));
    }
    
    const savedRegenerateCount = localStorage.getItem('regenerateCount');
    if (savedRegenerateCount) {
      setRegenerateCount(parseInt(savedRegenerateCount));
    }
    
    // 从localStorage加载选中的模板
    const savedTemplate = localStorage.getItem('selectedTemplate');
    if (savedTemplate && templateImages.length > 0) {
      setSelectedTemplate(savedTemplate);
    }
  }, [templateImages.length]);
  
   // 保存历史记录和重生成次数到localStorage,限制历史记录数量
  useEffect(() => {
    try {
      // 限制历史记录最多保存10条
      const limitedHistory = historyItems.slice(0, 10);
      localStorage.setItem('artPhotoHistory', JSON.stringify(limitedHistory));
    } catch (error) {
      console.error('保存历史记录失败:', error);
      // 存储失败时不影响应用正常运行
    }
  }, [historyItems]);
  
  useEffect(() => {
    try {
      localStorage.setItem('regenerateCount', regenerateCount.toString());
    } catch (error) {
      console.error('保存重生成次数失败:', error);
      // 存储失败时不影响应用正常运行
    }
  }, [regenerateCount]);
  
  // 保存选中的模板到localStorage
  useEffect(() => {
    if (selectedTemplate) {
      try {
        localStorage.setItem('selectedTemplate', selectedTemplate);
      } catch (error) {
        console.error('保存选中模板失败:', error);
      }
    }
  }, [selectedTemplate]);
  
  const handleBack = () => {
    navigate('/');
  };
  
  const handleHelp = () => {
    setShowHelpModal(true);
  };
  
  const handleUploadClick = () => {
    fileInputRef.current?.click();
    triggerVibration();
  };
  
  const handleCameraClick = () => {
    cameraInputRef.current?.click();
    triggerVibration();
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setGeneratedImage(null); // 重置生成的图片
      };
      reader.readAsDataURL(file);
    }
  };
  
  const triggerVibration = () => {
    // 模拟手机震动反馈
    if ('vibrate' in navigator) {
      (navigator as any).vibrate(50);
    }
  };
  
  const handleGenerate = async () => {
    if (!selectedImage) {
      toast('请先上传或拍摄照片');
      return;
    }
    
    if (!selectedTemplate) {
      toast('请选择一个模板');
      return;
    }
    
    setIsGenerating(true);
    
    try {
      // 设置30秒超时
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('生成超时,请重试')), 30000)
      );
      
      // 检查图片是否已经上传过,避免重复上传
      let imageUrl = uploadedImageUrls[selectedImage];
      if (!imageUrl) {
        // 上传图片到OSS
        imageUrl = await uploadImageToOSS(selectedImage);
        // 缓存已上传的图片URL
        setUploadedImageUrls(prev => ({ ...prev, [selectedImage]: imageUrl }));
      }
      
      // 调用火山引擎API生成艺术照，传入两张图片：自己的照片和选中的模板
      const taskId = await Promise.race([
        generateArtPhoto(PROMPT_TEXT, [imageUrl, selectedTemplate]),
        timeoutPromise
      ]);
      
      if (!taskId || typeof taskId !== 'string') {
        throw new Error('生成任务ID获取失败');
      }
      // 模拟轮询获取结果(实际实现中需要根据API文档调整)
      let artPhotoUrl = '';
      const maxAttempts = 30;
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        attempts++;
        // 等待2秒再查询
        await new Promise(resolve => setTimeout(resolve, 6000));
        
        const statusResponse = await getTaskStatus(taskId);
        // 检查火山引擎API返回的状态
        if (statusResponse?.Result?.data?.status === 'done') {
          // 优先使用上传到OSS的图片URL,如果没有则使用原始图片
          artPhotoUrl = statusResponse?.Result?.data?.uploaded_image_urls?.[0] || selectedImage || '';
          break;
        } else if (statusResponse?.Result?.data?.status === 'failed') {
          throw new Error('艺术照生成失败');
        }
        // 如果还在处理中,继续轮询
      }
      
      if (!artPhotoUrl) {
        throw new Error('艺术照生成超时');
      }
      
      // 设置生成的图片
      setGeneratedImage(artPhotoUrl);
      
       // 保存到历史记录
      const newHistoryItem: HistoryItemType = {
        id: Date.now().toString(),
        originalImage: selectedImage,
        generatedImage: artPhotoUrl,
        createdAt: formatDateTime(new Date()),
        isPaid: false,
        regenerateCount: 3
      };
      
      // 添加新记录并保持历史记录数量限制
      setHistoryItems(prev => {
        const updatedHistory = [newHistoryItem, ...prev];
        // 限制最多保存10条记录
        return updatedHistory.slice(0, 10);
      });
      setCurrentHistoryItem(newHistoryItem);
      
    } catch (error) {
      toast(error instanceof Error ? error.message : '生成失败,请重试');
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleRegenerate = async () => {
    if (regenerateCount <= 0) {
      toast('重生成次数已用完');
      return;
    }
    
    if (!selectedImage) {
      toast('请先上传或拍摄照片');
      return;
    }
    
    if (!selectedTemplate) {
      toast('请选择一个模板');
      return;
    }
    
    setIsGenerating(true);
    setRegenerateCount(prev => prev - 1);
    
    try {
      // 设置30秒超时
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('生成超时,请重试')), 30000)
      );
      
      // 检查图片是否已经上传过,避免重复上传
      let imageUrl = uploadedImageUrls[selectedImage || ''];
      if (!imageUrl && selectedImage) {
        // 上传图片到OSS
        imageUrl = await uploadImageToOSS(selectedImage);
        // 缓存已上传的图片URL
        setUploadedImageUrls(prev => ({ ...prev, [selectedImage]: imageUrl }));
      }
      
      // 调用火山引擎API重新生成艺术照
      const taskId = await Promise.race([
        generateArtPhoto(PROMPT_TEXT, [imageUrl, selectedTemplate]),
        timeoutPromise
      ]);
      
      if (!taskId || typeof taskId !== 'string') {
        throw new Error('生成任务ID获取失败');
      }

      // 模拟轮询获取结果(实际实现中需要根据API文档调整)
      let artPhotoUrl = '';
      const maxAttempts = 30;
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        attempts++;
        // 等待2秒再查询
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await getTaskStatus(taskId);
        // 检查火山引擎API返回的状态
        if (statusResponse?.Result?.data?.status === 'done') {
          artPhotoUrl = statusResponse?.Result?.data?.uploaded_image_urls?.[0] || selectedImage || '';
          break;
        } else if (statusResponse?.Result?.data?.status === 'failed') {
          throw new Error('艺术照生成失败');
        }
        // 如果还在处理中,继续轮询
      }
      
      if (!artPhotoUrl) {
        throw new Error('艺术照生成超时');
      }
      
      // 设置生成的图片
      setGeneratedImage(artPhotoUrl);
      
      // 更新当前历史记录项的重生成次数
      if (currentHistoryItem) {
        setHistoryItems(historyItems.map(item => 
          item.id === currentHistoryItem.id 
            ? { ...item, regenerateCount: item.regenerateCount - 1, generatedImage: artPhotoUrl || selectedImage || '' } 
            : item
        ));
      }
      
    } catch (error) {
      toast('重生成失败,请重试');
      setRegenerateCount(prev => prev + 1); // 恢复重生成次数
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handlePay = () => {
    setShowPaymentModal(true);
  };
  
  const handleCompletePayment = () => {
    setShowPaymentModal(false);
    toast('支付成功！您可以保存艺术照了');
    
    // 更新历史记录项的支付状态
    if (currentHistoryItem) {
      setHistoryItems(historyItems.map(item => 
        item.id === currentHistoryItem.id 
          ? { ...item, isPaid: true } 
          : item
      ));
    }
  };
  
  const handleHistoryItemClick = (item: HistoryItemType) => {
    setPreviewImage(item.generatedImage);
    setShowImagePreviewModal(true);
    setCurrentHistoryItem(item);
    setRegenerateCount(item.regenerateCount);
    setSelectedImage(item.originalImage);
    setGeneratedImage(item.generatedImage);
  };
  
  const handleContinuePayment = (item: HistoryItemType) => {
    setCurrentHistoryItem(item);
    setShowPaymentModal(true);
  };
  
  const handleReRegenerateFromHistory = (item: HistoryItemType) => {
    if (item.regenerateCount <= 0) {
      toast('重生成次数已用完');
      return;
    }
    
    setSelectedImage(item.originalImage);
    setCurrentHistoryItem(item);
    setRegenerateCount(item.regenerateCount);
    handleRegenerate();
  };
  
  // 处理模板选择
  const handleTemplateSelect = (templateUrl: string) => {
    setSelectedTemplate(templateUrl);
    setShowTemplateSelector(false);
  };
  
  return (
    <div className="min-h-screen w-full flex flex-col relative overflow-hidden pb-20">
      <Background />
      
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-30 w-full backdrop-blur-sm bg-white/70 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <button 
            onClick={handleBack} 
            className="flex items-center text-[#6B5CA5] font-medium"
          >
            <i className="fas fa-arrow-left mr-1"></i>
            <span>返回</span>
          </button>
          <h1 className="text-xl font-bold text-[#6B5CA5]">艺术照生成</h1>
          <button 
            onClick={handleHelp} 
            className="text-[#6B5CA5] p-1"
          >
            <i className="fas fa-question-circle"></i>
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 z-10">
        {/* 核心操作区 */}
        <div className="space-y-6">
          {/* 照片上传/拍照模块 */}
          <motion.div 
            className="bg-white/80 rounded-xl p-6 shadow-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-lg font-semibold text-gray-800 mb-4">上传照片</h2>
            <div className="flex flex-col items-center space-y-4">
              {selectedImage ? (
                <div className="relative">
                  <img 
                    src={selectedImage} 
                    alt="Selected" 
                    className="w-48 h-48 object-cover rounded-lg border-2 border-[#6B5CA5]"
                  />
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="w-48 h-48 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                  <i className="fas fa-user text-gray-400 text-4xl"></i>
                </div>
              )}
              
              <div className="flex space-x-4">
                <button
                  onClick={handleUploadClick}
                  className="px-4 py-2 bg-[#6B5CA5] text-white rounded-lg flex items-center"
                >
                  <i className="fas fa-upload mr-2"></i>
                  上传照片
                </button>
                <button
                  onClick={handleCameraClick}
                  className="px-4 py-2 bg-[#6B5CA5] text-white rounded-lg flex items-center"
                >
                  <i className="fas fa-camera mr-2"></i>
                  拍照
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <input
                  type="file"
                  ref={cameraInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                />
              </div>
            </div>
          </motion.div>

          {/* 模板选择模块 */}
          <motion.div 
            className="bg-white/80 rounded-xl p-6 shadow-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">选择模板</h2>
              <button
                onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                className="text-[#6B5CA5] text-sm flex items-center"
              >
                {showTemplateSelector ? '收起' : '展开'}模板
                <i className={`fas fa-chevron-${showTemplateSelector ? 'up' : 'down'} ml-1`}></i>
              </button>
            </div>
            
            {selectedTemplate && (
              <div className="mb-4">
                <p className="text-gray-600 text-sm mb-2">当前选中模板：</p>
                <div className="relative inline-block">
                  <img 
                    src={selectedTemplate} 
                    alt="Selected Template" 
                    className="w-32 h-32 object-cover rounded-lg border-2 border-[#6B5CA5]"
                  />
                  <div className="absolute bottom-2 right-2 bg-[#6B5CA5] text-white text-xs px-2 py-1 rounded">
                    已选中
                  </div>
                </div>
              </div>
            )}
            
            {showTemplateSelector && (
              <div className="mt-4">
                <p className="text-gray-600 text-sm mb-3">选择一个模板作为艺术风格参考：</p>
                <div className="grid grid-cols-3 gap-3">
                  {templateImages.map((templateUrl, index) => (
                    <div 
                      key={index} 
                      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 ${
                        selectedTemplate === templateUrl ? 'border-[#6B5CA5] ring-2 ring-[#6B5CA5]' : 'border-gray-200'
                      }`}
                      onClick={() => handleTemplateSelect(templateUrl)}
                    >
                      <img 
                        src={templateUrl} 
                        alt={`Template ${index + 1}`} 
                        className="w-full h-24 object-cover"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all"></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* 生成按钮 */}
          <motion.div 
            className="bg-white/80 rounded-xl p-6 shadow-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !selectedImage}
              className={`w-full py-3 rounded-lg font-medium flex items-center justify-center ${
                isGenerating || !selectedImage 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-[#6B5CA5] to-[#8A7DB0] text-white hover:from-[#5A4B8C] hover:to-[#7A6CA0]'
              }`}
            >
              {isGenerating ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  生成中...
                </>
              ) : (
                <>
                  <i className="fas fa-magic mr-2"></i>
                  生成艺术照
                </>
              )}
            </button>
            
            {currentHistoryItem && (
              <div className="mt-4 flex justify-between items-center">
                <span className="text-gray-600">
                  剩余重生成次数: {regenerateCount}
                </span>
                <button
                  onClick={handleRegenerate}
                  disabled={isGenerating || regenerateCount <= 0}
                  className={`px-4 py-2 rounded-lg text-sm ${
                    isGenerating || regenerateCount <= 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-[#6B5CA5] text-white hover:bg-[#5A4B8C]'
                  }`}
                >
                  <i className="fas fa-redo mr-1"></i>
                  重新生成
                </button>
              </div>
            )}
          </motion.div>

          {/* 生成结果展示 */}
          {generatedImage && (
            <motion.div 
              className="bg-white/80 rounded-xl p-6 shadow-md"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <h2 className="text-lg font-semibold text-gray-800 mb-4">生成结果</h2>
              <div className="flex flex-col items-center">
                <img 
                  src={generatedImage} 
                  alt="Generated Art Photo" 
                  className="w-full max-w-md rounded-lg border-2 border-[#6B5CA5]"
                />
                <div className="mt-4 flex space-x-4">
                  <button
                    onClick={() => {
                      setPreviewImage(generatedImage);
                      setShowImagePreviewModal(true);
                    }}
                    className="px-4 py-2 bg-[#6B5CA5] text-white rounded-lg flex items-center"
                  >
                    <i className="fas fa-eye mr-2"></i>
                    预览
                  </button>
                  <button
                    onClick={handlePay}
                    className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg flex items-center"
                  >
                    <i className="fas fa-download mr-2"></i>
                    保存图片
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* 历史记录 */}
          {historyItems.length > 0 && (
            <motion.div 
              className="bg-white/80 rounded-xl p-6 shadow-md"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <h2 className="text-lg font-semibold text-gray-800 mb-4">历史记录</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {historyItems.map((item) => (
                  <HistoryItem
                    key={item.id}
                    item={item}
                    onClick={() => handleHistoryItemClick(item)}
                    onContinuePayment={() => handleContinuePayment(item)}
                    onReRegenerate={() => handleReRegenerateFromHistory(item)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* 帮助弹窗 */}
      {showHelpModal && (
        <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      )}

      {/* 支付弹窗 */}
      {showPaymentModal && (
        <PaymentModal 
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)} 
          onComplete={handleCompletePayment}
        />
      )}

      {/* 图片预览弹窗 */}
      {showImagePreviewModal && previewImage && (
        <ImagePreviewModal 
          isOpen={showImagePreviewModal}
          imageUrl={previewImage} 
          onClose={() => setShowImagePreviewModal(false)} 
        />
      )}
    </div>
  );
}