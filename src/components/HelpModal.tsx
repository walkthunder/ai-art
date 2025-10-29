import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 半透明背景 */}
          <motion.div 
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          
          {/* 弹窗内容 */}
          <motion.div
            className="bg-white rounded-xl w-full max-w-md z-10 p-6 shadow-lg"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <h3 className="text-xl font-bold text-[#6B5CA5] mb-4">使用帮助</h3>
            
            <ul className="space-y-3 text-gray-600 mb-6">
              <li className="flex">
                <span className="font-medium mr-2">1.</span>
                <span>上传/拍照后点击生成</span>
              </li>
              <li className="flex">
                <span className="font-medium mr-2">2.</span>
                <span>最多可重生成 3 次，算 1 次收费</span>
              </li>
              <li className="flex">
                <span className="font-medium mr-2">3.</span>
                <span>支付后可保存艺术照</span>
              </li>
            </ul>
            
            {/* 关闭按钮 */}
            <button
              className="w-full py-3 rounded-xl bg-[#6B5CA5] text-white font-medium"
              onClick={onClose}
            >
              我知道了
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default HelpModal;