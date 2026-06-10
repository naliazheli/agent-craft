import { create } from 'zustand';
import { ApiError, api } from '../lib/api';

interface User {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  authProvider?: string;
  githubLogin?: string;
  walletAddress?: string;
  balance?: number;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  sendEmailVerificationCode: (email: string) => Promise<{ debugCode?: string }>;
  register: (email: string, password: string, verificationCode: string, displayName?: string, role?: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  setAuth: (token: string, user: User) => void;
  patchUser: (patch: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: false,

  login: async (email, password) => {
    const res = await api.auth.login({ email, password });
    localStorage.setItem('token', res.access_token);
    try {
      const user = await api.auth.me();
      set({ token: res.access_token, user });
    } catch {
      set({ token: res.access_token, user: res.user });
    }
  },

  sendEmailVerificationCode: async (email) => {
    return api.auth.sendEmailVerificationCode({ email });
  },

  register: async (email, password, verificationCode, displayName, role) => {
    const res = await api.auth.register({ email, password, verificationCode, displayName, role });
    localStorage.setItem('token', res.access_token);
    try {
      const user = await api.auth.me();
      set({ token: res.access_token, user });
    } catch {
      set({ token: res.access_token, user: res.user });
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null });
  },

  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    set({ token, user });
  },

  patchUser: (patch) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...patch } : state.user,
    }));
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    set({ isLoading: true });
    try {
      const user = await api.auth.me();
      set({ user, isLoading: false });
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        set({ isLoading: false });
        return;
      }
      localStorage.removeItem('token');
      set({ token: null, user: null, isLoading: false });
    }
  },
}));
