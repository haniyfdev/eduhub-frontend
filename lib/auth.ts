import api from './axios';
import { AuthTokens } from '@/types';

export async function login(phone: string, password: string): Promise<AuthTokens> {
  const { data } = await api.post<AuthTokens>('/api/auth/login/', { phone, password });
  localStorage.setItem('access_token', data.access);
  localStorage.setItem('refresh_token', data.refresh);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
}

export function getUser() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function isAuthenticated() {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('access_token');
}
