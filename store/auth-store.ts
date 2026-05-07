import { create } from 'zustand';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
  isAuthenticated: boolean;
  setAuthenticated: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  isAuthenticated: false,
  setAuthenticated: (val) => set({ isAuthenticated: val }),
}));
