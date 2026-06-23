'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { RoleKey } from '@/lib/types';
import { BRANDS } from '@/lib/constants';

interface AppState {
  currentBrand: string;
  currentRole: RoleKey;
  setCurrentBrand: (brandId: string) => void;
  setCurrentRole: (role: RoleKey) => void;
  isClient: boolean;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentBrand, setCurrentBrand] = useState<string>('vivo');
  const [currentRole, setCurrentRole] = useState<RoleKey>('PM');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // 所有 localStorage 读取只在客户端 useEffect 中执行
    setIsClient(true);
    try {
      const saved = localStorage.getItem('lm_app_state');
      if (saved) {
        const parsed = JSON.parse(saved) as { brand?: string; role?: RoleKey };
        if (parsed.brand && BRANDS.find((b) => b.id === parsed.brand)) {
          setCurrentBrand(parsed.brand);
        }
        if (parsed.role) {
          setCurrentRole(parsed.role);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const handleSetBrand = useCallback((brandId: string) => {
    setCurrentBrand(brandId);
    try {
      const saved = localStorage.getItem('lm_app_state');
      const parsed = saved ? JSON.parse(saved) : {};
      parsed.brand = brandId;
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

  return (
    <AppContext.Provider
      value={{
        currentBrand,
        currentRole,
        setCurrentBrand: handleSetBrand,
        setCurrentRole: handleSetRole,
        isClient,
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
