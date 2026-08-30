'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';
import { getAccessibleModules } from '@/lib/constants';
import type { ModuleKey } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MonitorPlay } from 'lucide-react';
import Link from 'next/link';

const MODULE_PATHS: Record<ModuleKey, string> = {
  dashboard: '/',
  schedule: '/schedule',
  'data-overview': '/data-overview',
  'market-monitor': '/market-monitor',
  cost: '/cost',
  visual: '/visual',
  sop: '/sop',
  workstation: '/workstation',
  'problem-feedback': '/feedback',
  personnel: '/admin/user-management',
  approval: '/approval',
};

export default function LoginPage() {
  const router = useRouter();
  const { setUser, isClient, isAuthenticated, refreshPendingCount } = useApp();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isClient && isAuthenticated) {
      router.replace('/');
    }
  }, [isClient, isAuthenticated, router, isClient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phone.trim()) {
      setError('请输入手机号');
      return;
    }
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登录失败');
        return;
      }
      setUser(data.user);
      refreshPendingCount();
      // 跳转到该角色允许的第一个模块，而非固定跳首页（超级管理员专属模块会被过滤）
      const allowedModules = getAccessibleModules(data.user.role, data.user.phone);
      const firstModule = allowedModules[0] || 'dashboard';
      const targetPath = MODULE_PATHS[firstModule as ModuleKey] || '/';
      router.push(targetPath);
    } catch (err) {
      console.error('login error', err);
      setError('网络异常，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (!isClient) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen relative">
      {/* 左侧装饰区 */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/20 via-background to-background">
        <div className="absolute inset-0 flex flex-col items-center justify-center p-12">
          <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/20 border border-primary/30">
            <MonitorPlay className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-3">Blue直播</h2>
          <p className="text-muted-foreground text-center max-w-sm leading-relaxed">
            面向直播代运营团队的专业管理平台，涵盖排班、成本、考勤、工作台等核心模块
          </p>
          <div className="mt-12 grid grid-cols-3 gap-6 text-center">
            <div className="space-y-2">
              <div className="mx-auto h-10 w-10 rounded-lg bg-[#415FFF]/20 flex items-center justify-center">
                <span className="text-sm font-bold text-[#415FFF]">V</span>
              </div>
              <p className="text-xs text-muted-foreground">vivo</p>
            </div>
            <div className="space-y-2">
              <div className="mx-auto h-10 w-10 rounded-lg bg-[#FF6B35]/20 flex items-center justify-center">
                <span className="text-sm font-bold text-[#FF6B35]">Q</span>
              </div>
              <p className="text-xs text-muted-foreground">iQOO</p>
            </div>
            <div className="space-y-2">
              <div className="mx-auto h-10 w-10 rounded-lg bg-[#00C9A7]/20 flex items-center justify-center">
                <span className="text-sm font-bold text-[#00C9A7]">I</span>
              </div>
              <p className="text-xs text-muted-foreground">IOT</p>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧登录表单 */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <MonitorPlay className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Blue直播</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground">登录</h1>
            <p className="text-sm text-muted-foreground mt-1">
              输入手机号和密码登录系统
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm text-muted-foreground">
                手机号
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="请输入11位手机号"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 11));
                  setError('');
                }}
                className="h-11 bg-card border-border"
                maxLength={11}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground">
                密码
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="h-11 bg-card border-border"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11"
              disabled={loading}
            >
              {loading ? '登录中...' : '登录'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            还没有账号？{' '}
            <Link href="/register" className="text-primary hover:underline font-medium">
              立即注册
            </Link>
          </p>
        </div>
      </div>
      {/* 备案信息 */}
      <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-1 text-xs text-muted-foreground/60">
        <span>COPYRIGHT©BLUEXH.COM 蓝色星合传媒科技（北京）有限公司</span>
        <div className="flex items-center gap-3">
          <a href="https://beian.mps.gov.cn/#/query/webSearch?code=11010502049597" target="_blank" rel="noreferrer" className="hover:text-muted-foreground">京公网安备 11010502049597号</a>
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" className="hover:text-muted-foreground">京ICP备2022012255号-2</a>
        </div>
      </div>
    </div>
  );
}
