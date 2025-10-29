import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { simulateAIGeneration } from '../lib/utils';

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
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('生成超时，请重试')), 30000)
      );
      
      await Promise.race([simulateAIGeneration(), timeoutPromise]);
      
      // 模拟生成的艺术照
      setGeneratedImage(selectedImage);
      
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
      await simulateAIGeneration();
      // 模拟生成新的艺术照
      setGeneratedImage(selectedImage);
      
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