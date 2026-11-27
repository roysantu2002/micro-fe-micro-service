import { createContext, useContext } from 'react';

export type AppRole = 'Admin' | 'User';

export interface AuthUser {
  name: string;
  email: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  roles: AppRole[];
  getToken: () => Promise<string>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useHasRole(role: AppRole): boolean {
  return useAuth().roles.includes(role);
}
