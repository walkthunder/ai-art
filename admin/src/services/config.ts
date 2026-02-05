import api from './api';

export interface SystemConfig {
  initialBalance: {
    freePuzzle: number;
    freeTransform: number;
  };
  invite: {
    rewardCount: number;
  };
  task: {
    timeoutMinutes: number;
    maxRetries: number;
  };
  order: {
    timeoutHours: number;
  };
  monitor: {
    orderFailureThreshold: number;
    callbackFailureThreshold: number;
    dbBackupThreshold: number;
  };
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// 获取系统配置
export const getSystemConfig = async (): Promise<SystemConfig> => {
  const response = await api.get<any, ApiResponse<SystemConfig>>('/config/system');
  return response.data;
};

// 更新系统配置
export const updateSystemConfig = async (config: SystemConfig): Promise<void> => {
  await api.put('/config/system', config);
};
