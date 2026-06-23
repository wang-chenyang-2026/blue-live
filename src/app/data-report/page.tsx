'use client';

import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export default function DataReportPage() {
  const { isClient } = useApp();

  if (!isClient) {
    return <div className="h-8 w-48 bg-muted animate-pulse rounded" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">数据报表</h1>
        <p className="text-sm text-muted-foreground mt-1">直播数据分析与报表</p>
      </div>
      <Card className="border-border bg-card">
        <CardContent className="py-16 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">数据报表模块</h3>
          <p className="text-sm text-muted-foreground">
            该模块将在后续版本中实现，包含直播数据分析、流量趋势、转化率报表等功能
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
