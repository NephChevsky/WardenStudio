import { create } from 'zustand';

interface AuthUser {
  id?: string;
  name: string;
  displayName?: string;
}

interface AuthStore {
  isAuthenticated: boolean;
  isLoading: boolean;
  authenticatedUser: AuthUser | null;
  error: string | null;
  
  setAuthenticated: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  authenticatedUser: null,
  error: null,

  setAuthenticated: (user) => set({ 
    isAuthenticated: !!user, 
    authenticatedUser: user,
    error: null,
  }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  logout: () => set({ 
    isAuthenticated: false, 
    authenticatedUser: null,
    error: null,
  }),
}));
