/**
 * 图片水印工具
 * 为免费用户的图片添加水印
 */

/**
 * 为图片添加水印
 * @param {string} imagePath - 图片路径（本地临时路径）
 * @param {string} watermarkText - 水印文字，默认"团圆照相馆"
 * @returns {Promise<string>} 添加水印后的图片临时路径
 */
function addWatermark(imagePath, watermarkText = '团圆照相馆') {
  return new Promise((resolve, reject) => {
    // 获取图片信息
    wx.getImageInfo({
      src: imagePath,
      success: (imageInfo) => {
        const { width, height } = imageInfo;
        
        // 创建离屏Canvas
        const canvas = wx.createOffscreenCanvas({
          type: '2d',
          width: width,
          height: height
        });
        
        const ctx = canvas.getContext('2d');
        
        // 创建图片对象
        const img = canvas.createImage();
        
        img.onload = () => {
          // 绘制原图
          ctx.drawImage(img, 0, 0, width, height);
          
          // 计算水印大小和位置
          const fontSize = Math.max(16, Math.floor(width * 0.04)); // 根据图片宽度自适应
          const padding = Math.max(20, Math.floor(width * 0.02));
          
          // 设置水印样式
          ctx.font = `${fontSize}px sans-serif`;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.lineWidth = 2;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          
          // 绘制水印（右下角）
          const x = width - padding;
          const y = height - padding;
          
          // 先描边再填充，增强可读性
          ctx.strokeText(watermarkText, x, y);
          ctx.fillText(watermarkText, x, y);
          
          // 导出图片
          wx.canvasToTempFilePath({
            canvas: canvas,
            success: (res) => {
              console.log('[Watermark] 水印添加成功:', res.tempFilePath);
              resolve(res.tempFilePath);
            },
            fail: (err) => {
              console.error('[Watermark] 导出图片失败:', err);
              reject(err);
            }
          });
        };
        
        img.onerror = (err) => {
          console.error('[Watermark] 图片加载失败:', err);
          reject(err);
        };
        
        // 加载图片
        img.src = imagePath;
      },
      fail: (err) => {
        console.error('[Watermark] 获取图片信息失败:', err);
        reject(err);
      }
    });
  });
}

/**
 * 为图片添加水印（兼容版本，使用页面Canvas）
 * @param {string} imagePath - 图片路径
 * @param {string} canvasId - Canvas ID
 * @param {Object} component - 页面或组件实例
 * @param {string} watermarkText - 水印文字
 * @returns {Promise<string>} 添加水印后的图片临时路径
 */
function addWatermarkWithCanvas(imagePath, canvasId, component, watermarkText = '团圆照相馆') {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: imagePath,
      success: (imageInfo) => {
        const { width, height } = imageInfo;
        
        // 获取Canvas上下文
        const query = wx.createSelectorQuery().in(component);
        query.select(`#${canvasId}`)
          .fields({ node: true, size: true })
          .exec((res) => {
            if (!res || !res[0]) {
              reject(new Error('Canvas节点未找到'));
              return;
            }
            
            const canvas = res[0].node;
            const ctx = canvas.getContext('2d');
            
            // 设置Canvas尺寸
            const dpr = wx.getSystemInfoSync().pixelRatio;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
            
            // 创建图片对象
            const img = canvas.createImage();
            
            img.onload = () => {
              // 绘制原图
              ctx.drawImage(img, 0, 0, width, height);
              
              // 计算水印大小和位置
              const fontSize = Math.max(16, Math.floor(width * 0.04));
              const padding = Math.max(20, Math.floor(width * 0.02));
              
              // 设置水印样式
              ctx.font = `${fontSize}px sans-serif`;
              ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
              ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
              ctx.lineWidth = 2;
              ctx.textAlign = 'right';
              ctx.textBaseline = 'bottom';
              
              // 绘制水印
              const x = width - padding;
              const y = height - padding;
              ctx.strokeText(watermarkText, x, y);
              ctx.fillText(watermarkText, x, y);
              
              // 导出图片
              setTimeout(() => {
                wx.canvasToTempFilePath({
                  canvas: canvas,
                  success: (res) => {
                    console.log('[Watermark] 水印添加成功:', res.tempFilePath);
                    resolve(res.tempFilePath);
                  },
                  fail: (err) => {
                    console.error('[Watermark] 导出图片失败:', err);
                    reject(err);
                  }
                }, component);
              }, 100);
            };
            
            img.onerror = (err) => {
              console.error('[Watermark] 图片加载失败:', err);
              reject(err);
            };
            
            img.src = imagePath;
          });
      },
      fail: (err) => {
        console.error('[Watermark] 获取图片信息失败:', err);
        reject(err);
      }
    });
  });
}

module.exports = {
  addWatermark,
  addWatermarkWithCanvas
};
