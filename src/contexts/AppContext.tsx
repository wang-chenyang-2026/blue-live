'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { RoleKey, User, ModuleKey } from '@/lib/types';
import { parseBrands } from '@/lib/types';
import { BRANDS, ROLES } from '@/lib/constants';
import { getCurrentUser, logout as storeLogout, setCurrentUser as persistCurrentUser } from '@/lib/store';

interface AppState {
  currentBrand: string;      // 'all' | brandId
  currentAccount: string;    // 'all' | accountId
  currentRole: RoleKey;
  currentUser: User | null;
  userBrands: string[];      // 用户注册时选择的品牌列表
  pendingCount: number;
  isClient: boolean;
  isAuthenticated: boolean;
  setCurrentBrand: (brandId: string) => void;
  setCurrentAccount: (accountId: string) => void;
  setCurrentRole: (role: RoleKey) => void;
  setUser: (user: User | null) => void;
  refreshPendingCount: () => void;
  handleLogout: () => void;
  /** 获取当前用户在指定模块下可见的品牌ID列表 */
  getVisibleBrands: (moduleKey?: ModuleKey) => string[];
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentBrand, setCurrentBrand] = useState<string>('all');
  const [currentAccount, setCurrentAccount] = useState<string>('all');
  const [currentRole, setCurrentRole] = useState<RoleKey>('PM');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userBrands, setUserBrands] = useState<string[]>(['all']);
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
        setUserBrands(parseBrands(user.projectScope || ''));
        // 始终以数据库中用户真实角色为准，不用 localStorage 缓存的角色
        const userRole = user.role as RoleKey;
        const validRole = ROLES.find((r) => r.key === userRole);
        setCurrentRole(validRole ? userRole : 'PM');
        setIsAuthenticated(true);
      }

      // 恢复 UI 偏好（仅恢复品牌和账号，角色以用户数据库记录为准）
      const saved = localStorage.getItem('lm_app_state');
      if (saved) {
        const parsed = JSON.parse(saved) as {
          brand?: string;
          account?: string;
        };
        if (parsed.brand) setCurrentBrand(parsed.brand);
        if (parsed.account) setCurrentAccount(parsed.account);
        // 不再从 localStorage 恢复 role，避免角色残留
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
    // 角色不再持久化到 localStorage，由登录用户的数据库记录决定
  }, []);

  const handleSetUser = useCallback((user: User | null) => {
    persistCurrentUser(user);
    setCurrentUser(user);
    setIsAuthenticated(!!user);
    if (user) {
      setUserBrands(parseBrands(user.projectScope || ''));
      setCurrentRole(ROLES.some((r) => r.key === user.role) ? user.role : 'PM');
    } else {
      setUserBrands(['all']);
    }
  }, []);

  const getVisibleBrands = useCallback((moduleKey?: ModuleKey): string[] => {
    // PM 不受品牌限制
    if (currentRole === 'PM') return BRANDS.map(b => b.id);
    // 没有用户品牌信息，返回全部
    if (userBrands.includes('all')) return BRANDS.map(b => b.id);
    // 检查当前模块是否受品牌限制
    if (moduleKey) {
      const roleConfig = ROLES.find(r => r.key === currentRole);
      if (roleConfig && !roleConfig.brandScopedModules.includes(moduleKey)) {
        // 该模块不受品牌限制，返回全部品牌
        return BRANDS.map(b => b.id);
      }
    }
    // 受品牌限制的模块，只返回用户的品牌
    return userBrands.filter(b => BRANDS.some(br => br.id === b));
  }, [currentRole, userBrands]);

  const refreshPendingCount = useCallback(() => {
    fetch('/api/users/pending', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setPendingCount((d.users || []).length);
      })
      .catch(() => {});
  }, []);

  const handleLogout = useCallback(() => {
    // 通知服务端清除 httpOnly cookie（fire-and-forget）
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    storeLogout();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setCurrentRole('PM'); // 重置为默认
    setUserBrands(['all']);
    // 清除 localStorage 中残留的角色状态，避免下次登录时读到旧值
    try {
      const saved = localStorage.getItem('lm_app_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        delete parsed.role;
        localStorage.setItem('lm_app_state', JSON.stringify(parsed));
      }
    } catch { /* ignore */ }
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentBrand,
        currentAccount,
        currentRole,
        currentUser,
        userBrands,
        pendingCount,
        isClient,
        isAuthenticated,
        setCurrentBrand: handleSetBrand,
        setCurrentAccount: handleSetAccount,
        setCurrentRole: handleSetRole,
        setUser: handleSetUser,
        refreshPendingCount,
        handleLogout,
        getVisibleBrands,
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
