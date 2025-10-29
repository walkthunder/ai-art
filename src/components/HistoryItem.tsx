import React from 'react';
import { motion } from 'framer-motion';

// 定义历史记录项类型
interface HistoryItemType {
  id: string;
  originalImage: string;
  generatedImage: string;
  createdAt: string;
  isPaid: boolean;
  regenerateCount: number;
}

interface HistoryItemProps {
  item: HistoryItemType;
  onClick: () => void;
  onContinuePayment: () => void;
  onReRegenerate: () => void;
}

const HistoryItem: React.FC<HistoryItemProps> = ({ 
  item, 
  onClick, 
  onContinuePayment, 
  onReRegenerate 
}) => {
  return (
    <motion.div
      className="bg-white/80 rounded-xl p-3 shadow-sm cursor-pointer"
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 10 }}
      onClick={onClick}
    >
      <div className="flex items-center">
        {/* 缩略图 */}
        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
          <img 
            src={item.generatedImage} 
            alt="生成的艺术照" 
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* 信息区 */}
        <div className="ml-3 flex-grow">
          <div className="text-sm text-gray-500 mb-1">{item.createdAt}</div>
          <div className={`text-sm font-medium ${
            item.isPaid ? 'text-green-500' : 'text-[#FF9F43]'
          }`}>
            {item.isPaid ? '已支付' : '未支付'}
          </div>
        </div>
        
        {/* 操作按钮 */}
        <motion.button
          className={`text-sm font-medium px-2 py-1 rounded transition-colors duration-200 ${
            item.isPaid ? 'text-[#6B5CA5] hover:text-[#5A4B9E]' : 'text-[#FF9F43] hover:text-[#E68930]'
          }`}
          onClick={(e) => {
            e.stopPropagation(); // 阻止冒泡，避免触发整个卡片的点击事件
            if (item.isPaid) {
              onReRegenerate();
            } else {
              onContinuePayment();
            }
          }}
          whileTap={{ scale: 0.95 }}
        >
          {item.isPaid ? '重新生成' : '继续支付'}
        </motion.button>
      </div>
    </motion.div>
  );
};

export default HistoryItem;