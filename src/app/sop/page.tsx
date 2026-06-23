'use client';

import { useApp } from '@/contexts/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen } from 'lucide-react';

export default function SopPage() {
  const { isClient } = useApp();

  if (!isClient) {
    return <div className="h-8 w-48 bg-muted animate-pulse rounded" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">SOP管理</h1>
        <p className="text-sm text-muted-foreground mt-1">标准操作流程文档</p>
      </div>
      <Card className="border-border bg-card">
        <CardContent className="py-16 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">SOP管理模块</h3>
          <p className="text-sm text-muted-foreground">
            该模块将在后续版本中实现，包含直播SOP流程模板、操作指南、培训资料等功能
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
