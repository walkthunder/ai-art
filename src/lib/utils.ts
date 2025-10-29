import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 格式化日期时间
export function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 模拟AI生成艺术照的延迟函数
export function simulateAIGeneration(): Promise<void> {
  return new Promise((resolve) => {
    // 模拟3-5秒的生成时间
    const delay = Math.floor(Math.random() * 2000) + 3000;
    setTimeout(resolve, delay);
  });
}
