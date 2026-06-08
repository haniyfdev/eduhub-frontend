import api from './axios';
import { AuthTokens, LoginResponse } from '@/types';

export async function login(phone: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/api/auth/login/', { phone, password });

  if ('requires_company_selection' in data && data.requires_company_selection) {
    return data;
  }

  const tokens = data as AuthTokens;
  localStorage.setItem('access_token', tokens.access);
  localStorage.setItem('refresh_token', tokens.refresh);
  localStorage.setItem('user', JSON.stringify(tokens.user));
  return tokens;
}

export async function selectCompany(company_id: string, temp_token: string): Promise<AuthTokens> {
  const { data } = await api.post<AuthTokens>('/api/auth/select-company/', {
    company_id,
    temp_token,
  });
  localStorage.setItem('access_token', data.access);
  localStorage.setItem('refresh_token', data.refresh);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  localStorage.removeItem('active_company_id');
  localStorage.removeItem('company_name');
}

export function getActiveCompanyId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('active_company_id');
}

export function setActiveCompany(id: string, name: string) {
  localStorage.setItem('active_company_id', id);
  localStorage.setItem('company_name', name);
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
