import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface CategoriesResponse {
  success: boolean;
  data?: Record<string, Record<string, string[]>>;
  error?: string;
}

export async function GET(): Promise<NextResponse<CategoriesResponse>> {
  try {
    const jsonPath = path.join(process.cwd(), 'src', 'data', 'category_tree.json');
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (parsed.code === 200 && parsed.data) {
      return NextResponse.json({
        success: true,
        data: parsed.data as Record<string, Record<string, string[]>>,
      });
    }

    return NextResponse.json(
      { success: false, error: '品类树数据格式异常' },
      { status: 500 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : '读取品类树失败',
      },
      { status: 500 },
    );
  }
}
