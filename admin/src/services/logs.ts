import api from './api';

export interface ErrorLog {
  id: string;
  user_id: string | null;
  error_message: string;
  stack_trace: string | null;
  level: 'error' | 'warning' | 'info';
  created_at: string;
}

export interface UsageLog {
  id: string;
  user_id: string;
  action_type: 'decrement' | 'restore' | 'increment';
  amount: number;
  mode: string;
  reference_id: string;
  notes: string | null;
  created_at: string;
}

interface LogsResponse<T> {
  logs: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// 获取错误日志
export const getErrorLogs = async (params: {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  level?: string;
  search?: string;
}): Promise<LogsResponse<ErrorLog>> => {
  const response = await api.get<any, ApiResponse<LogsResponse<ErrorLog>>>('/logs/errors', { params });
  return response.data;
};

// 获取使用日志
export const getUsageLogs = async (params: {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  actionType?: string;
  userId?: string;
}): Promise<LogsResponse<UsageLog>> => {
  const response = await api.get<any, ApiResponse<LogsResponse<UsageLog>>>('/logs/usage', { params });
  return response.data;
};
