import { NextRequest, NextResponse } from 'next/server';
import { getRequestPhone } from '@/lib/api-permission';
import { getUnreadNotifications, markAllNotificationsRead } from '@/lib/notify';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const phone = getRequestPhone(request);
    if (!phone) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    const unread = await getUnreadNotifications(phone);
    return NextResponse.json({ success: true, unreadCount: unread.length, data: unread });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** 标记全部已读。 */
export async function POST(request: NextRequest) {
  try {
    const phone = getRequestPhone(request);
    if (!phone) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    await markAllNotificationsRead(phone);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}