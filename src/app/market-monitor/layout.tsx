'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingCart,
  Megaphone,
  Users,
  Lightbulb,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SUB_NAV_ITEMS = [
  {
    key: 'ecommerce',
    label: '电商数据监测',
    href: '/market-monitor/ecommerce',
    icon: <ShoppingCart className="h-4 w-4" />,
  },
  {
    key: 'social-media',
    label: '社媒帖子监测',
    href: '/market-monitor/social-media',
    icon: <Megaphone className="h-4 w-4" />,
  },
  {
    key: 'kol',
    label: '达人选号',
    href: '/market-monitor/kol',
    icon: <Users className="h-4 w-4" />,
  },
  {
    key: 'brand-insight',
    label: '品牌洞察',
    href: '/market-monitor/brand-insight',
    icon: <Lightbulb className="h-4 w-4" />,
  },
];

export default function MarketMonitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/market-monitor/ecommerce') {
      return (
        pathname === '/market-monitor' ||
        pathname === '/market-monitor/' ||
        pathname.startsWith(href)
      );
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="flex flex-col gap-6 -mx-6 -mt-6 px-6 pt-4">
      {/* Module Header */}
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#4158D0] to-[#C850C0]">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">市场监测</h1>
            <p className="text-xs text-muted-foreground">
              全渠道市场数据监测与分析平台
            </p>
          </div>
        </div>

        {/* Sub Navigation Tabs */}
        <nav className="flex items-center gap-1 mt-2">
          {SUB_NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                isActive(item.href)
                  ? 'bg-gradient-to-r from-[#4158D0]/20 to-[#C850C0]/20 text-foreground border border-[#4158D0]/30'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Page Content */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
