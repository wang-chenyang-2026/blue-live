import { NextResponse } from 'next/server';
import { getCategoryTree } from '@/lib/mcp-client';

interface CategoriesResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function GET(): Promise<NextResponse<CategoriesResponse>> {
  try {
    const data = await getCategoryTree();
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : '获取品类树失败',
      },
      { status: 500 },
    );
  }
}
