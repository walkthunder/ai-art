import api from './api';

export interface CallbackLog {
  id: string;
  out_trade_no: string;
  transaction_id?: string;
  event_type?: string;
  status: 'success' | 'decrypt_failed' | 'process_failed';
  error_message?: string;
  error_code?: string;
  request_data?: any;
  response_data?: any;
  retry_count: number;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CallbackLogStats {
  history: Array<{
    status: string;
    count: number;
    date: string;
  }>;
  today: Array<{
    status: string;
    count: number;
  }>;
  unresolved: number;
}

/**
 * 获取回调日志列表
 */
export const getCallbackLogs = async (params: {
  status?: string;
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
}) => {
  const response = await api.get('/admin-api/callback-logs/logs', { params });
  return response.data;
};

/**
 * 获取回调统计
 */
export const getCallbackStats = async () => {
  const response = await api.get('/admin-api/callback-logs/stats');
  return response.data;
};

/**
 * 标记为已解决
 */
export const resolveCallbackLog = async (id: string) => {
  const response = await api.post(`/admin-api/callback-logs/resolve/${id}`);
  return response.data;
};

/**
 * 重试失败的回调
 */
export const retryCallbackLog = async (id: string) => {
  const response = await api.post(`/admin-api/callback-logs/retry/${id}`);
  return response.data;
};
