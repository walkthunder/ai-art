import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { generateArtPhoto, getTaskStatus } from '../lib/volcengineAPI';
import { uploadImageToOSS } from '../lib/utils';

// 定义历史记录项类型
export interface HistoryItemType {
  id: string;
  originalImage: string;
  generatedImage: string;
  createdAt: string;
  isPaid: boolean;
  regenerateCount: number;
}

interface UseArtPhotoGeneratorProps {
  onUpdateHistory?: (history: HistoryItemType[]) => void;
}

export const useArtPhotoGenerator = ({ onUpdateHistory }: UseArtPhotoGeneratorProps = {}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [regenerateCount, setRegenerateCount] = useState(3);
  const [historyItems, setHistoryItems] = useState<HistoryItemType[]>([]);
  const [currentHistoryItem, setCurrentHistoryItem] = useState<HistoryItemType | null>(null);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<Record<string, string>>({}); // 用于缓存已上传图片的URL
  
  // 从localStorage加载历史记录和重生成次数
  useEffect(() => {
    const savedHistory = localStorage.getItem('artPhotoHistory');
    if (savedHistory) {
      const parsedHistory = JSON.parse(savedHistory);
      setHistoryItems(parsedHistory);
      onUpdateHistory?.(parsedHistory);
    }
    
    const savedRegenerateCount = localStorage.getItem('regenerateCount');
    if (savedRegenerateCount) {
      setRegenerateCount(parseInt(savedRegenerateCount));
    }
  }, [onUpdateHistory]);
  
  // 保存历史记录和重生成次数到localStorage
  useEffect(() => {
    localStorage.setItem('artPhotoHistory', JSON.stringify(historyItems));
    onUpdateHistory?.(historyItems);
  }, [historyItems, onUpdateHistory]);
  
  useEffect(() => {
    localStorage.setItem('regenerateCount', regenerateCount.toString());
  }, [regenerateCount]);
  
  const handleSelectImage = (imageData: string) => {
    setSelectedImage(imageData);
    setGeneratedImage(null); // 重置生成的图片
  };
  
  const handleGenerate = async () => {
    if (!selectedImage) {
      toast('请先上传或拍摄照片');
      return false;
    }
    
    setIsGenerating(true);
    
    try {
      // 设置30秒超时
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('生成超时，请重试')), 30000)
      );
      
      // 检查图片是否已经上传过，避免重复上传
      let imageUrl = uploadedImageUrls[selectedImage];
      if (!imageUrl) {
        // 上传图片到OSS
        imageUrl = await uploadImageToOSS(selectedImage);
        // 缓存已上传的图片URL
        setUploadedImageUrls(prev => ({ ...prev, [selectedImage]: imageUrl }));
      }
      
      // 调用火山引擎API生成艺术照
      const taskId = await generateArtPhoto("请将这张照片转换为艺术照风格", [imageUrl]);
      
      // 模拟轮询获取结果（实际实现中需要根据API文档调整）
      let artPhotoUrl = '';
      const maxAttempts = 30;
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        attempts++;
        // 等待2秒再查询
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await getTaskStatus(taskId);
        if (statusResponse.data?.state === 'DONE') {
          artPhotoUrl = statusResponse.data?.result?.image_url || selectedImage;
          break;
        } else if (statusResponse.data?.state === 'FAILED') {
          throw new Error('艺术照生成失败');
        }
        // 如果还在处理中，继续轮询
      }
      
      if (!artPhotoUrl) {
        throw new Error('艺术照生成超时');
      }
      
      // 设置生成的图片
      setGeneratedImage(artPhotoUrl);
      
      // 添加到历史记录
      const newHistoryItem = addToHistory({
        originalImage: selectedImage,
        generatedImage: artPhotoUrl,
        createdAt: new Date().toISOString(),
        isPaid: false,
        regenerateCount: 3
      });
      
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : '生成失败，请重试');
      return false;
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleRegenerate = async () => {
    if (regenerateCount <= 0) {
      toast('重生成次数已用完');
      return false;
    }
    
    setIsGenerating(true);
    setRegenerateCount(prev => prev - 1);
    
    try {
      // 检查图片是否已经上传过，避免重复上传
      let imageUrl = uploadedImageUrls[selectedImage || ''];
      if (!imageUrl && selectedImage) {
        // 上传图片到OSS
        imageUrl = await uploadImageToOSS(selectedImage);
        // 缓存已上传的图片URL
        setUploadedImageUrls(prev => ({ ...prev, [selectedImage]: imageUrl }));
      }
      
      // 调用火山引擎API重新生成艺术照
      const taskId = await generateArtPhoto("请将这张照片转换为艺术照风格", [imageUrl]);
      
      // 模拟轮询获取结果（实际实现中需要根据API文档调整）
      let artPhotoUrl = '';
      const maxAttempts = 30;
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        attempts++;
        // 等待2秒再查询
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await getTaskStatus(taskId);
        if (statusResponse.data?.state === 'DONE') {
          artPhotoUrl = statusResponse.data?.result?.image_url || selectedImage || '';
          break;
        } else if (statusResponse.data?.state === 'FAILED') {
          throw new Error('艺术照生成失败');
        }
        // 如果还在处理中，继续轮询
      }
      
      if (!artPhotoUrl) {
        throw new Error('艺术照生成超时');
      }
      
      // 设置生成的图片
      setGeneratedImage(artPhotoUrl);
      
      // 更新历史记录项
      if (currentHistoryItem) {
        updateHistoryItem(currentHistoryItem.id, {
          generatedImage: artPhotoUrl,
          regenerateCount: regenerateCount - 1
        });
      }
      
      return true;
    } catch (error) {
      toast('重生成失败，请重试');
      setRegenerateCount(prev => prev + 1); // 恢复重生成次数
      return false;
    } finally {
      setIsGenerating(false);
    }
  };
  
  const addToHistory = (item: Omit<HistoryItemType, 'id'>) => {
    const newItem: HistoryItemType = {
      ...item,
      id: Date.now().toString()
    };
    
    setHistoryItems(prev => [newItem, ...prev]);
    setCurrentHistoryItem(newItem);
    return newItem;
  };
  
  const updateHistoryItem = (id: string, updates: Partial<HistoryItemType>) => {
    setHistoryItems(prev => 
      prev.map(item => item.id === id ? { ...item, ...updates } : item)
    );
    
    if (currentHistoryItem?.id === id) {
      setCurrentHistoryItem(prev => prev ? { ...prev, ...updates } : null);
    }
  };
  
  const resetState = () => {
    setSelectedImage(null);
    setGeneratedImage(null);
    setRegenerateCount(3);
    setCurrentHistoryItem(null);
  };
  
  return {
    selectedImage,
    generatedImage,
    isGenerating,
    regenerateCount,
    historyItems,
    currentHistoryItem,
    handleSelectImage,
    handleGenerate,
    handleRegenerate,
    addToHistory,
    updateHistoryItem,
    resetState
  };
};