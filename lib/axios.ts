import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'https://eduhub-ysrw.onrender.com',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window === 'undefined') return config;
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const activeCompany = localStorage.getItem('active_company_id');
  if (activeCompany) config.headers['X-Active-Company'] = activeCompany;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      localStorage.removeItem('active_company_id');
      localStorage.removeItem('company_name');
      window.location.href = '/uz/login';
    }
    return Promise.reject(error);
  }
);

export default api;
