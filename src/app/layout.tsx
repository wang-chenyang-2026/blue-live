import type { Metadata } from 'next';
import { AppProvider } from '@/contexts/AppContext';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ThemeSetter } from '@/components/layout/ThemeSetter';
import './globals.css';

export const metadata: Metadata = {
  title: 'Blue直播 - 管理平台',
  description: 'Blue直播代运营管理系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeSetter />
        <AppProvider>
          <AuthGuard>{children}</AuthGuard>
        </AppProvider>
      </body>
    </html>
  );
}
