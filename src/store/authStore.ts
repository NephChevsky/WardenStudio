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
  
  // Current user properties
  currentUserId: string | null;
  currentUserName: string | null;
  currentUserDisplayName: string | null;
  currentUserColor: string | undefined;
  broadcasterId: string | null;
  
  setAuthenticated: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentUser: (userId: string, userName: string, displayName: string, color?: string) => void;
  setBroadcasterId: (broadcasterId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  authenticatedUser: null,
  error: null,
  
  // Initialize current user properties
  currentUserId: null,
  currentUserName: null,
  currentUserDisplayName: null,
  currentUserColor: undefined,
  broadcasterId: null,

  setAuthenticated: (user) => set({ 
    isAuthenticated: !!user, 
    authenticatedUser: user,
    error: null,
  }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  setCurrentUser: (userId, userName, displayName, color) => set({
    currentUserId: userId,
    currentUserName: userName,
    currentUserDisplayName: displayName,
    currentUserColor: color,
  }),

  setBroadcasterId: (broadcasterId) => set({ broadcasterId }),

  logout: () => set({ 
    isAuthenticated: false, 
    authenticatedUser: null,
    currentUserId: null,
    currentUserName: null,
    currentUserDisplayName: null,
    currentUserColor: undefined,
    broadcasterId: null,
    error: null,
  }),
}));
