import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/contexts/AppContext';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeSetter } from '@/components/layout/ThemeSetter';

export const metadata: Metadata = {
  title: {
    default: '直播代运营管理系统',
    template: '%s | 直播代运营',
  },
  description: '面向直播代运营团队的内部管理工具',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeSetter />
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
