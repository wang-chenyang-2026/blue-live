import { NextRequest, NextResponse } from 'next/server';
import { SUPER_ADMIN_PHONE } from '@/lib/constants';
import { FEEDBACK_APP_TOKEN, FEEDBACK_TABLE_ID, updateBitableRecord } from '@/lib/feishu-bitable';

/**
 * POST /api/feedback/reply  超管回复反馈
 * body: { id, reply }
 */
export async function POST(request: NextRequest) {
  try {
    const phone = request.headers.get('x-user-phone');
    if (phone !== SUPER_ADMIN_PHONE) {
      return NextResponse.json({ success: false, error: '无权限：仅超级管理员可回复反馈' }, { status: 403 });
    }

    const body = await request.json();
    const { id, reply } = body as { id?: string; reply?: string };
    if (!id || !reply?.trim()) {
      return NextResponse.json({ success: false, error: '反馈ID和回复内容不能为空' }, { status: 400 });
    }

    await updateBitableRecord(FEEDBACK_APP_TOKEN, FEEDBACK_TABLE_ID, id, {
      回复: reply.trim(),
      状态: '已处理',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
