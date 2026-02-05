#!/usr/bin/env python3
"""
水印添加脚本
使用Pillow添加自定义水印，水印包含二维码/图片和文字
Requirements: 3.1, 3.2
"""

import sys
import json
import os
from PIL import Image, ImageDraw, ImageFont
import qrcode
import requests
from io import BytesIO


def add_watermark(image_path, output_path=None, watermark_text="AI全家福制作\n扫码去水印", 
                  qr_url="https://your-domain.com/pay", qr_image_url=None, position="center"):
    """
    在图片上添加水印
    
    Args:
        image_path: 输入图片路径
        output_path: 输出图片路径（可选）
        watermark_text: 水印文字
        qr_url: 二维码URL（如果qr_image_url为空则生成二维码）
        qr_image_url: 二维码图片URL（优先使用，如小程序码）
        position: 水印位置（center/bottom-right）
        
    Returns:
        dict: {success: bool, output_path: str, message: str}
    """
    try:
        # 打开图片
        img = Image.open(image_path)
        
        # 转换为RGBA模式以支持透明度
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        width, height = img.size
        
        # 创建水印层
        watermark = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(watermark)
        
        # 计算水印大小（占图片面积15%-20%）
        watermark_width = int(width * 0.4)
        watermark_height = int(height * 0.15)
        
        # 确保水印不会太小
        watermark_height = max(watermark_height, 100)
        watermark_width = max(watermark_width, 300)
        
        # 获取二维码/小程序码图片
        if qr_image_url:
            # 使用提供的图片URL
            try:
                response = requests.get(qr_image_url, timeout=10)
                qr_img = Image.open(BytesIO(response.content))
                print(f"使用自定义二维码图片: {qr_image_url}")
            except Exception as e:
                print(f"下载二维码图片失败，使用生成的二维码: {e}")
                qr_img = generate_qr_code(qr_url)
        else:
            # 生成二维码
            qr_img = generate_qr_code(qr_url)
        
        # 调整二维码大小
        qr_size = min(watermark_height, 150)
        qr_img = qr_img.resize((qr_size, qr_size), Image.Resampling.LANCZOS)
        
        # 计算水印位置
        if position == "center":
            x = (width - watermark_width) // 2
            y = (height - watermark_height) // 2
        elif position == "bottom-right":
            x = width - watermark_width - 20
            y = height - watermark_height - 20
        else:
            x = (width - watermark_width) // 2
            y = (height - watermark_height) // 2
        
        # 绘制半透明背景
        draw.rectangle(
            [x, y, x + watermark_width, y + watermark_height],
            fill=(255, 255, 255, 180)
        )
        
        # 粘贴二维码
        qr_x = x + 10
        qr_y = y + (watermark_height - qr_size) // 2
        
        # 将二维码转换为RGBA
        qr_img_rgba = qr_img.convert('RGBA')
        watermark.paste(qr_img_rgba, (qr_x, qr_y), qr_img_rgba)
        
        # 绘制文字
        try:
            # 尝试使用系统字体
            font_size = int(watermark_height * 0.25)
            try:
                # macOS/Linux
                font = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", font_size)
            except:
                try:
                    # Windows
                    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", font_size)
                except:
                    # 使用默认字体
                    font = ImageFont.load_default()
        except:
            font = ImageFont.load_default()
        
        # 计算文字位置
        text_x = qr_x + qr_size + 20
        text_y = y + watermark_height // 3
        
        # 绘制文字（黑色，半透明）
        draw.text(
            (text_x, text_y),
            watermark_text,
            fill=(0, 0, 0, 200),
            font=font
        )
        
        # 合并图层
        img = Image.alpha_composite(img, watermark)
        
        # 转换回RGB模式
        img = img.convert('RGB')
        
        # 保存
        if output_path is None:
            base, ext = os.path.splitext(image_path)
            output_path = f"{base}_watermarked{ext}"
        
        img.save(output_path, 'JPEG', quality=95)
        
        return {
            'success': True,
            'output_path': output_path,
            'message': '水印添加成功'
        }
    
    except Exception as e:
        return {
            'success': False,
            'message': f'水印添加失败: {str(e)}'
        }


def generate_qr_code(qr_url):
    """生成二维码图片"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2
    )
    qr.add_data(qr_url)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white")


def main():
    """
    命令行入口
    接收JSON格式的参数: {
        "image_path": "...",
        "output_path": "...",
        "watermark_text": "...",
        "qr_url": "...",
        "qr_image_url": "...",
        "position": "center"
    }
    """
    try:
        # 从命令行参数读取JSON
        if len(sys.argv) > 1:
            params = json.loads(sys.argv[1])
        else:
            # 从stdin读取
            params = json.load(sys.stdin)
        
        image_path = params.get('image_path')
        output_path = params.get('output_path')
        watermark_text = params.get('watermark_text', 'AI全家福制作\n扫码去水印')
        qr_url = params.get('qr_url', 'https://your-domain.com/pay')
        qr_image_url = params.get('qr_image_url')  # 新增：自定义二维码图片URL
        position = params.get('position', 'center')
        
        if not image_path:
            result = {
                'success': False,
                'message': '缺少必需参数: image_path'
            }
        else:
            result = add_watermark(image_path, output_path, watermark_text, qr_url, qr_image_url, position)
        
        # 输出JSON结果
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        result = {
            'success': False,
            'message': f'脚本执行失败: {str(e)}'
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)


if __name__ == '__main__':
    main()
