import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ 
  isOpen, 
  onClose, 
  onComplete 
}) => {
  const handlePayment = (method: string) => {
    // 模拟支付过程
    setTimeout(() => {
      onComplete();
    }, 1500);
  };
  
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
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
            className="bg-white rounded-t-xl w-full max-w-md z-10 p-6"
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 300, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-[#6B5CA5] mb-2">支付 5 元</h3>
              <p className="text-gray-500">获取高清艺术照，支持保存</p>
            </div>
            
            <div className="space-y-4 mb-8">
              {/* 微信支付 */}
              <motion.button
                className="w-full py-4 rounded-xl bg-green-500 text-white font-medium flex items-center justify-center"
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePayment('wechat')}
              >
                <i className="fab fa-weixin text-2xl mr-2"></i>
                <span>微信支付</span>
              </motion.button>
              
              {/* 支付宝支付 */}
              <motion.button
                className="w-full py-4 rounded-xl bg-blue-500 text-white font-medium flex items-center justify-center"
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePayment('alipay')}
              >
                <i className="fab fa-alipay text-2xl mr-2"></i>
                <span>支付宝支付</span>
              </motion.button>
            </div>
            
            {/* 取消按钮 */}
            <button
              className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 font-medium"
              onClick={onClose}
            >
              取消
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PaymentModal;