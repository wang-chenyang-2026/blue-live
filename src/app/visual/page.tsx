'use client';

import { useApp } from '@/contexts/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Palette } from 'lucide-react';

export default function VisualPage() {
  const { isClient } = useApp();

  if (!isClient) {
    return <div className="h-8 w-48 bg-muted animate-pulse rounded" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">视觉对接</h1>
        <p className="text-sm text-muted-foreground mt-1">直播间视觉素材管理</p>
      </div>
      <Card className="border-border bg-card">
        <CardContent className="py-16 text-center">
          <Palette className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">视觉对接模块</h3>
          <p className="text-sm text-muted-foreground">
            该模块将在后续版本中实现，包含直播间装修方案、素材库、视觉规范管理等功能
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
