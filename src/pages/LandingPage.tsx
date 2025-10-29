import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Background from '../components/Background';

// 艺术照风格示例图片（使用常量URL）
const styleSampleImages = [
  "https://space.coze.cn/api/coze_space/gen_image?image_size=square&prompt=Oil%20painting%20style%20portrait%20artwork%2C%20soft%20colors%2C%20morandi%20style&sign=287f9f3f8b1d889fc32f5e758ae99be7",
  "https://space.coze.cn/api/coze_space/gen_image?image_size=square&prompt=Watercolor%20style%20portrait%20artwork%2C%20soft%20colors%2C%20morandi%20style&sign=41e162782f414b093466627c85a0e7a4",
  "https://space.coze.cn/api/coze_space/gen_image?image_size=square&prompt=Impressionist%20style%20portrait%20artwork%2C%20soft%20colors%2C%20morandi%20style&sign=ac3a4df57ae2c6fb905f88644f64baa1"
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  
  // 控制元素渐入动画的状态
  const [showTitle, setShowTitle] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [showButton, setShowButton] = useState(false);
  
  useEffect(() => {
    // 设置元素依次渐入的时间序列
    const titleTimer = setTimeout(() => setShowTitle(true), 100);
    const subtitleTimer = setTimeout(() => setShowSubtitle(true), 400);
    const samplesTimer = setTimeout(() => setShowSamples(true), 700);
    const buttonTimer = setTimeout(() => setShowButton(true), 1000);
    
    return () => {
      clearTimeout(titleTimer);
      clearTimeout(subtitleTimer);
      clearTimeout(samplesTimer);
      clearTimeout(buttonTimer);
    };
  }, []);
  
  const handleEnterCreate = () => {
    navigate('/generator');
  };
  
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden pb-20">
      <Background />
      
      <div className="container mx-auto px-6 flex flex-col items-center justify-center z-10">
        {/* 主标题 */}
        <motion.h1 
          className="text-2xl md:text-3xl font-bold text-[#6B5CA5] text-center mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={showTitle ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          一键生成专属艺术照
        </motion.h1>
        
        {/* 副标题 */}
        <motion.p 
          className="text-lg md:text-xl text-gray-500 text-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={showSubtitle ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          拍照/传图→AI生成→5元获取，支持3次重生成
        </motion.p>
        
        {/* 示例预览区 */}
        <motion.div 
          className="flex space-x-4 mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={showSamples ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          {styleSampleImages.map((imageUrl, index) => (
            <motion.div 
              key={index}
              className="w-20 h-20 rounded-full overflow-hidden shadow-md border-2 border-white"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 * index, duration: 0.3 }}
            >
              <img 
                src={imageUrl} 
                alt={`Art style sample ${index + 1}`} 
                className="w-full h-full object-cover"
              />
            </motion.div>
          ))}
        </motion.div>
        
        {/* 行动按钮 */}
        <motion.button
          className={`w-[70%] py-4 rounded-xl text-white text-xl font-bold ${
            isButtonHovered ? 'bg-[#5A4B9E]' : 'bg-[#6B5CA5]'
          } shadow-lg transition-all duration-300`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleEnterCreate}
          onMouseEnter={() => setIsButtonHovered(true)}
          onMouseLeave={() => setIsButtonHovered(false)}
          initial={{ opacity: 0, y: 20 }}
          animate={showButton ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          进入创作
        </motion.button>
      </div>
    </div>
  );
}