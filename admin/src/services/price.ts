/**
 * 价格配置服务
 */

import api from './api';

export interface PriceConfig {
  id: string;
  category: string;
  code: string;
  name: string;
  price: number;
  recharge_amount?: number;
  description: string;
  effective_date: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PriceHistory {
  id: string;
  price_config_id: string;
  old_price: number | null;
  new_price: number;
  changed_by: string;
  changed_at: string;
  change_reason: string;
}

export interface CreatePriceData {
  category: string;
  code: string;
  name: string;
  price: number;
  rechargeAmount?: number;
  description?: string;
  effectiveDate?: string;
}

export interface UpdatePriceData {
  price?: number;
  rechargeAmount?: number;
  effectiveDate?: string;
  status?: string;
  description?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * 获取所有价格配置
 */
export const getAllPrices = async (): Promise<PriceConfig[]> => {
  const response = await api.get<any, ApiResponse<PriceConfig[]>>('/prices');
  return response.data;
};

/**
 * 获取当前生效的价格（公开API）
 */
export const getCurrentPrices = async (): Promise<Record<string, number>> => {
  const response = await api.get<any, ApiResponse<Record<string, number>>>('/prices/current', { 
    baseURL: '/api' 
  });
  return response.data;
};

/**
 * 创建价格配置
 */
export const createPrice = async (data: CreatePriceData): Promise<PriceConfig> => {
  const response = await api.post<any, ApiResponse<PriceConfig>>('/prices', data);
  return response.data;
};

/**
 * 更新价格配置
 */
export const updatePrice = async (id: string, data: UpdatePriceData): Promise<PriceConfig> => {
  const response = await api.put<any, ApiResponse<PriceConfig>>(`/prices/${id}`, data);
  return response.data;
};

/**
 * 获取价格历史记录
 */
export const getPriceHistory = async (id: string): Promise<PriceHistory[]> => {
  const response = await api.get<any, ApiResponse<PriceHistory[]>>(`/prices/history/${id}`);
  return response.data;
};

/**
 * 获取套餐类型的价格历史
 */
export const getPriceHistoryByCode = async (code: string): Promise<PriceHistory[]> => {
  const response = await api.get<any, ApiResponse<PriceHistory[]>>(`/prices/history/code/${code}`);
  return response.data;
};

// 别名导出，兼容旧代码
export const getPriceHistoryByPackage = getPriceHistoryByCode;

/**
 * 停用价格配置
 */
export const deactivatePrice = async (id: string): Promise<void> => {
  await api.delete(`/prices/${id}`);
};
