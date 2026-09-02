import { NextRequest, NextResponse } from 'next/server';
import { downloadMedia } from '@/lib/feishu-bitable';

/**
 * GET /api/feedback/attachment/[token]?name=xxx
 * 代理下载飞书多维表格附件（鉴权由 middleware 统一处理，登录用户均可下载反馈附件）。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token || !/^[A-Za-z0-9]+$/.test(token)) {
      return NextResponse.json({ error: '无效的附件标识' }, { status: 400 });
    }
    const buffer = await downloadMedia(token);
    const name = request.nextUrl.searchParams.get('name') || 'attachment';
    const safeName = encodeURIComponent(name);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${safeName}`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
