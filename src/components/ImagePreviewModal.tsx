import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImagePreviewModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  onClose: () => void;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ 
  isOpen, 
  imageUrl, 
  onClose 
}) => {
  const handleSaveImage = () => {
    if (!imageUrl) return;
    
    // 创建一个临时链接用于下载
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `art-photo-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  if (!imageUrl) return null;
  
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black/90">
          {/* 关闭按钮 */}
          <button
            className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/50"
            onClick={onClose}
          >
            <i className="fas fa-times text-xl"></i>
          </button>
          
          {/* 图片预览 */}
          <motion.div
            className="flex-1 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <img 
              src={imageUrl} 
              alt="预览大图" 
              className="max-w-full max-h-[70vh] object-contain"
            />
          </motion.div>
          
          {/* 底部操作栏 */}
          <motion.div
            className="w-full mt-4 flex justify-center"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ delay: 0.1 }}
          >
            <button
              onClick={handleSaveImage}
              className="py-3 px-8 bg-white text-[#6B5CA5] rounded-lg font-medium flex items-center"
            >
              <i className="fas fa-download mr-2"></i>
              <span>保存图片</span>
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ImagePreviewModal;