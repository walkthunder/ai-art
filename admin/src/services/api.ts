import axios from 'axios';

// 创建axios实例
const api = axios.create({
  baseURL: '/admin-api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      
      // 401 未授权 - 只有在非登录页面时才跳转
      if (status === 401) {
        // 如果当前不在登录页，清除token并跳转
        if (!window.location.pathname.includes('/login')) {
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
          window.location.href = '/login';
        }
      }
      
      // 返回错误信息
      return Promise.reject(data || { message: '请求失败' });
    }
    
    // 网络错误
    return Promise.reject({ message: '网络连接失败' });
  }
);

export default api;
