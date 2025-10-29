import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import Background from '../components/Background';
import HistoryItem from '../components/HistoryItem';
import PaymentModal from '../components/PaymentModal';
import HelpModal from '../components/HelpModal';
import ImagePreviewModal from '../components/ImagePreviewModal';
import { formatDateTime } from '../lib/utils';
import { streamGenerateArtPhoto, processStreamResponse } from '../lib/cozeAPI';

// 定义历史记录项类型
interface HistoryItemType {
  id: string;
  originalImage: string;
  generatedImage: string;
  createdAt: string;
  isPaid: boolean;
  regenerateCount: number;
}

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
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
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
  }, []);
  
   // 保存历史记录和重生成次数到localStorage，限制历史记录数量
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
    
    setIsGenerating(true);
    
    try {
      // 设置30秒超时
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('生成超时，请重试')), 30000)
      );
      
      // 调用真实的Coze API生成艺术照
      const stream = await streamGenerateArtPhoto(selectedImage);
      
      // 处理流式响应，获取生成的艺术照
      const artPhotoUrl = await processStreamResponse(stream);
      
      // 如果API调用成功，设置生成的图片
      // 使用从流式响应中提取的URL，如果未提取到则使用原图作为示例
      setGeneratedImage(artPhotoUrl || selectedImage);
      
       // 保存到历史记录
      const newHistoryItem: HistoryItemType = {
        id: Date.now().toString(),
        originalImage: selectedImage,
        generatedImage: artPhotoUrl || selectedImage, // 使用从流式响应中提取的URL
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
      toast(error instanceof Error ? error.message : '生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleRegenerate = async () => {
    if (regenerateCount <= 0) {
      toast('重生成次数已用完');
      return;
    }
    
    setIsGenerating(true);
    setRegenerateCount(prev => prev - 1);
    
    try {
      // 调用真实的Coze API重新生成艺术照
      const stream = await streamGenerateArtPhoto(selectedImage || '');
      
      // 处理流式响应，获取生成的艺术照
      const artPhotoUrl = await processStreamResponse(stream);
      
      // 如果API调用成功，设置生成的图片
      // 使用从流式响应中提取的URL，如果未提取到则使用原图作为示例
      setGeneratedImage(artPhotoUrl || selectedImage || '');
      
      // 更新当前历史记录项的重生成次数
      if (currentHistoryItem) {
        setHistoryItems(historyItems.map(item => 
          item.id === currentHistoryItem.id 
            ? { ...item, regenerateCount: item.regenerateCount - 1, generatedImage: artPhotoUrl || selectedImage || '' } 
            : item
        ));
      }
      
    } catch (error) {
      toast('重生成失败，请重试');
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
            <h2 className="text-lg font-bold text-[#6B5CA5] mb-4">照片上传</h2>
            
            {/* 预览框 */}
            <div className="flex justify-center mb-4">
              <div className="w-[180px] h-[180px] rounded-lg bg-gray-100 flex flex-col items-center justify-center overflow-hidden border border-gray-200">
                {selectedImage ? (
                  <img 
                    src={selectedImage} 
                    alt="预览图" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center">
                    <i className="fas fa-camera text-gray-400 text-4xl mb-2"></i>
                    <p className="text-gray-500 text-sm">点击上传/拍照</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* 操作按钮 */}
            <div className="flex space-x-4">
              <button 
                onClick={handleCameraClick} 
                className="flex-1 py-3 px-4 bg-white border border-[#6B5CA5] rounded-lg text-[#6B5CA5] font-medium flex items-center justify-center transition-all duration-200 hover:bg-[#6B5CA5]/5"
              >
                <i className="fas fa-camera mr-2"></i>
                <span>拍照</span>
              </button>
              <button 
                onClick={handleUploadClick} 
                className="flex-1 py-3 px-4 bg-white border border-[#6B5CA5] rounded-lg text-[#6B5CA5] font-medium flex items-center justify-center transition-all duration-200 hover:bg-[#6B5CA5]/5"
              >
                <i className="fas fa-upload mr-2"></i>
                <span>上传</span>
              </button>
            </div>
            
            {/* 操作提示 */}
            <p className="text-xs text-gray-500 mt-3 text-center">
              支持 JPG/PNG 格式，照片清晰效果更佳
            </p>
          </motion.div>
          
          {/* 生成与重生成模块 */}
          <motion.div 
            className="bg-white/80 rounded-xl p-6 shadow-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {!generatedImage ? (
              <>
                <div className="flex justify-center">
                  <button 
                    onClick={handleGenerate}
                    disabled={isGenerating || !selectedImage}
                    className={`py-3 px-8 bg-[#6B5CA5] text-white rounded-lg font-medium transition-all duration-200 hover:bg-[#5A4B9E] ${
                      !selectedImage ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isGenerating ? (
                      <div className="flex items-center">
                        <img 
                          src="https://space.coze.cn/api/coze_space/gen_image?image_size=square&prompt=Artistic%20loading%20spinner&sign=d7311fd22b6f978196d0c940b5fbfd3f" 
                          alt="加载中" 
                          className="w-5 h-5 mr-2 animate-spin"
                        />
                        <span>生成中...</span>
                      </div>
                    ) : (
                      '调用 AI 生成'
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* 生成后的预览 */}
                <div className="flex justify-center mb-4">
                  <div className="w-[180px] h-[180px] rounded-lg overflow-hidden border border-gray-200">
                    <img 
                      src={generatedImage} 
                      alt="生成的艺术照" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                
                <div className="flex space-x-3 mb-2">
                  <button 
                    onClick={handleRegenerate}
                    disabled={isGenerating || regenerateCount <= 0}
                    className={`flex-1 py-3 px-4 bg-white border border-[#6B5CA5] rounded-lg text-[#6B5CA5] font-medium transition-all duration-200 hover:bg-[#6B5CA5]/5 ${
                      regenerateCount <= 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isGenerating ? (
                      <div className="flex items-center justify-center">
                        <img 
                          src="https://space.coze.cn/api/coze_space/gen_image?image_size=square&prompt=Artistic%20loading%20spinner&sign=d7311fd22b6f978196d0c940b5fbfd3f" 
                          alt="加载中" 
                          className="w-4 h-4 mr-1 animate-spin"
                        />
                        <span>重生成中...</span>
                      </div>
                    ) : (
                      '重新生成'
                    )}
                  </button>
                  
                  {regenerateCount > 0 && (
                    <span className="text-[#FF9F43] text-sm font-medium self-center">
                      还剩 {regenerateCount} 次重生成
                    </span>
                  )}
                </div>
                
                <div className="flex justify-center">
                  <button 
                    onClick={handlePay}
                    className="py-3 px-8 bg-[#FF9F43] text-white rounded-lg font-medium transition-all duration-200 hover:bg-[#E68930]"
                  >
                    支付 5 元获取
                  </button>
                </div>
              </>
            )}
            
            {/* 收费提示 */}
            <p className="text-xs text-gray-500 mt-3 text-center">
              3 次重生成算 1 次收费，支付后可保存艺术照
            </p>
          </motion.div>
        </div>
        
        {/* 生成历史区 */}
        <motion.div 
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="flex items-center mb-4">
            <h2 className="text-lg font-bold text-[#6B5CA5]">生成历史</h2>
            <div className="h-px bg-[#6B5CA5] ml-2 flex-grow max-w-[100px]"></div>
          </div>
          
          <div className="space-y-3">
            {historyItems.length > 0 ? (
              historyItems.map((item) => (
                <HistoryItem 
                  key={item.id}
                  item={item}
                  onClick={() => handleHistoryItemClick(item)}
                  onContinuePayment={() => handleContinuePayment(item)}
                  onReRegenerate={() => handleReRegenerateFromHistory(item)}
                />
              ))
            ) : (
              <div className="bg-white/80 rounded-xl p-6 text-center text-gray-500">
                暂无生成历史
              </div>
            )}
          </div>
        </motion.div>
      </main>
      
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileChange}
        className="hidden"
      />
      
      {/* 支付弹窗 */}
      <PaymentModal 
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onComplete={handleCompletePayment}
      />
      
      {/* 帮助弹窗 */}
      <HelpModal 
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />
      
      {/* 图片预览弹窗 */}
      <ImagePreviewModal 
        isOpen={showImagePreviewModal}
        imageUrl={previewImage}
        onClose={() => setShowImagePreviewModal(false)}
      />
    </div>
  );
}