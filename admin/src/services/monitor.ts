import api from './api';

export interface MonitorMetrics {
  orderCreated: number;
  orderCreateFailed: number;
  callbackSuccess: number;
  callbackFailed: number;
  dbBackup: number;
  orderCreateFailureRate: string;
  callbackFailureRate: string;
  lastReset: string;
}

export interface MonitorAlert {
  level: 'warning' | 'critical';
  type: string;
  message: string;
  data?: Record<string, any>;
}

export interface HealthStatus {
  status: 'healthy' | 'warning' | 'error';
  lastReset: string;
  alerts: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// 获取监控指标
export const getMonitorMetrics = async (): Promise<MonitorMetrics> => {
  const response = await api.get<any, ApiResponse<MonitorMetrics>>('/monitor/metrics');
  return response.data;
};

// 获取告警信息
export const getMonitorAlerts = async (): Promise<MonitorAlert[]> => {
  const response = await api.get<any, ApiResponse<{ alerts: MonitorAlert[] }>>('/monitor/alerts');
  return response.data.alerts;
};

// 获取健康状态
export const getMonitorHealth = async (): Promise<HealthStatus> => {
  const response = await api.get<any, ApiResponse<HealthStatus>>('/monitor/health');
  return response.data;
};

// 重置监控指标
export const resetMonitorMetrics = async (): Promise<void> => {
  await api.post('/monitor/reset');
};
