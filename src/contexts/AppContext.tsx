'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { RoleKey, User } from '@/lib/types';
import { BRANDS, ROLES } from '@/lib/constants';
import { getCurrentUser, logout as storeLogout, setCurrentUser as persistCurrentUser } from '@/lib/store';

interface AppState {
  currentBrand: string;      // 'all' | brandId
  currentAccount: string;    // 'all' | accountId
  currentRole: RoleKey;
  currentUser: User | null;
  pendingCount: number;
  isClient: boolean;
  isAuthenticated: boolean;
  setCurrentBrand: (brandId: string) => void;
  setCurrentAccount: (accountId: string) => void;
  setCurrentRole: (role: RoleKey) => void;
  setUser: (user: User | null) => void;
  refreshPendingCount: () => void;
  handleLogout: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentBrand, setCurrentBrand] = useState<string>('all');
  const [currentAccount, setCurrentAccount] = useState<string>('all');
  const [currentRole, setCurrentRole] = useState<RoleKey>('PM');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setIsClient(true);
    try {
      // 恢复认证状态
      const user = getCurrentUser();
      if (user) {
        setCurrentUser(user);
        setCurrentRole(ROLES.some((r) => r.key === user.role) ? user.role : 'PM');
        setIsAuthenticated(true);
      }

      // 恢复 UI 偏好
      const saved = localStorage.getItem('lm_app_state');
      if (saved) {
        const parsed = JSON.parse(saved) as {
          brand?: string;
          account?: string;
          role?: RoleKey;
        };
        if (parsed.brand) setCurrentBrand(parsed.brand);
        if (parsed.account) setCurrentAccount(parsed.account);
        if (parsed.role && !user) setCurrentRole(parsed.role);
      }

      // 待审核数量
      fetch('/api/users/pending', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (d?.success) setPendingCount((d.users || []).length);
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  }, []);

  const handleSetBrand = useCallback((brandId: string) => {
    setCurrentBrand(brandId);
    setCurrentAccount('all'); // 切换品牌时重置账号
    try {
      const saved = localStorage.getItem('lm_app_state');
      const parsed = saved ? JSON.parse(saved) : {};
      parsed.brand = brandId;
      parsed.account = 'all';
      localStorage.setItem('lm_app_state', JSON.stringify(parsed));
    } catch {
      // ignore
    }
  }, []);

  const handleSetAccount = useCallback((accountId: string) => {
    setCurrentAccount(accountId);
    try {
      const saved = localStorage.getItem('lm_app_state');
      const parsed = saved ? JSON.parse(saved) : {};
      parsed.account = accountId;
      localStorage.setItem('lm_app_state', JSON.stringify(parsed));
    } catch {
      // ignore
    }
  }, []);

  const handleSetRole = useCallback((role: RoleKey) => {
    setCurrentRole(role);
    try {
      const saved = localStorage.getItem('lm_app_state');
      const parsed = saved ? JSON.parse(saved) : {};
      parsed.role = role;
      localStorage.setItem('lm_app_state', JSON.stringify(parsed));
    } catch {
      // ignore
    }
  }, []);

  const handleSetUser = useCallback((user: User | null) => {
    persistCurrentUser(user);
    setCurrentUser(user);
    setIsAuthenticated(!!user);
    if (user) {
      setCurrentRole(ROLES.some((r) => r.key === user.role) ? user.role : 'PM');
    }
  }, []);

  const refreshPendingCount = useCallback(() => {
    fetch('/api/users/pending', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setPendingCount((d.users || []).length);
      })
      .catch(() => {});
  }, []);

  const handleLogout = useCallback(() => {
    storeLogout();
    setCurrentUser(null);
    setIsAuthenticated(false);
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentBrand,
        currentAccount,
        currentRole,
        currentUser,
        pendingCount,
        isClient,
        isAuthenticated,
        setCurrentBrand: handleSetBrand,
        setCurrentAccount: handleSetAccount,
        setCurrentRole: handleSetRole,
        setUser: handleSetUser,
        refreshPendingCount,
        handleLogout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
