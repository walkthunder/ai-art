/**
 * 模板管理服务
 */

import api from './api';

export interface Template {
  id: string;
  mode: 'puzzle' | 'transform' | 'caishen';
  code: string;
  name: string;
  image_url: string;
  prompt: string;
  category: string;
  duration?: number;
  sort_order: number;
  status: 'active' | 'inactive';
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateData {
  mode: 'puzzle' | 'transform' | 'caishen';
  code: string;
  name: string;
  imageUrl: string;
  prompt?: string;
  category?: string;
  duration?: number;
  sortOrder?: number;
  status?: 'active' | 'inactive';
}

export interface UpdateTemplateData {
  name?: string;
  imageUrl?: string;
  prompt?: string;
  category?: string;
  duration?: number;
  sortOrder?: number;
  status?: 'active' | 'inactive';
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * 获取所有模板
 */
export const getAllTemplates = async (mode?: string): Promise<Template[]> => {
  const params = mode ? { mode } : {};
  const response = await api.get<any, ApiResponse<Template[]>>('/templates', { params });
  return response.data;
};

/**
 * 创建模板
 */
export const createTemplate = async (data: CreateTemplateData): Promise<Template> => {
  const response = await api.post<any, ApiResponse<Template>>('/templates', data);
  return response.data;
};

/**
 * 更新模板
 */
export const updateTemplate = async (id: string, data: UpdateTemplateData): Promise<void> => {
  await api.put(`/templates/${id}`, data);
};

/**
 * 删除模板
 */
export const deleteTemplate = async (id: string): Promise<void> => {
  await api.delete(`/templates/${id}`);
};
