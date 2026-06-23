'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';
import { addUser, findUserByPhone, genId } from '@/lib/store';
import { POSITION_OPTIONS, REGISTER_PROJECT_OPTIONS } from '@/lib/constants';
import type { RoleKey } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MonitorPlay } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const { isClient, isAuthenticated } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [project, setProject] = useState('');
  const [position, setPosition] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isClient && isAuthenticated) {
      router.replace('/');
    }
  }, [isClient, isAuthenticated, router, isClient]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) { setError('请输入姓名'); return; }
    if (!phone.trim() || phone.length !== 11) { setError('请输入11位手机号'); return; }
    if (!password || password.length < 8) { setError('密码不少于8位字符'); return; }
    if (password !== confirmPassword) { setError('两次输入密码不一致'); return; }
    if (!project) { setError('请选择项目'); return; }
    if (!position) { setError('请选择岗位'); return; }

    // 检查手机号是否已注册
    const existing = findUserByPhone(phone.trim());
    if (existing) {
      if (existing.status === 'pending') {
        setError('该手机号已注册，等待审核中');
      } else if (existing.status === 'approved') {
        setError('该手机号已注册，请直接登录');
      } else {
        setError('该手机号注册已被拒绝，请联系管理员');
      }
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const user = {
        id: genId(),
        name: name.trim(),
        phone: phone.trim(),
        password,
        projectScope: project,
        role: position as RoleKey,
        status: 'pending' as const,
        createdAt: new Date().toISOString().split('T')[0],
      };
      addUser(user);
      setSuccess(true);
      setLoading(false);
    }, 300);
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

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 border border-primary/30">
            <MonitorPlay className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">注册成功</h2>
          <p className="text-muted-foreground">
            您的账号已提交，等待项目负责人审核通过后即可登录使用。
          </p>
          <Button onClick={() => router.push('/login')} className="mt-4">
            前往登录
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* 左侧装饰区 */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/20 via-background to-background">
        <div className="absolute inset-0 flex flex-col items-center justify-center p-12">
          <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/20 border border-primary/30">
            <MonitorPlay className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-3">Blue直播</h2>
          <p className="text-muted-foreground text-center max-w-sm leading-relaxed">
            注册成为团队成员，使用排班管理、成本核算、考勤管理等专业功能
          </p>
        </div>
      </div>

      {/* 右侧注册表单 */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <MonitorPlay className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Blue直播</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground">注册</h1>
            <p className="text-sm text-muted-foreground mt-1">
              填写以下信息，审核通过后即可使用
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">姓名</Label>
              <Input
                placeholder="请输入姓名"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                className="h-11 bg-card border-border"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">手机号</Label>
              <Input
                type="tel"
                placeholder="请输入11位手机号"
                value={phone}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 11)); setError(''); }}
                className="h-11 bg-card border-border"
                maxLength={11}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">密码</Label>
              <Input
                type="password"
                placeholder="不少于8位字符"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className="h-11 bg-card border-border"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">确认密码</Label>
              <Input
                type="password"
                placeholder="请再次输入密码"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                className="h-11 bg-card border-border"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">项目</Label>
              <Select value={project} onValueChange={(v) => { setProject(v); setError(''); }}>
                <SelectTrigger className="h-11 bg-card border-border">
                  <SelectValue placeholder="请选择项目" />
                </SelectTrigger>
                <SelectContent>
                  {REGISTER_PROJECT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">岗位</Label>
              <Select value={position} onValueChange={(v) => { setPosition(v); setError(''); }}>
                <SelectTrigger className="h-11 bg-card border-border">
                  <SelectValue placeholder="请选择岗位" />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? '提交中...' : '注册'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            已有账号？{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">
              立即登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
