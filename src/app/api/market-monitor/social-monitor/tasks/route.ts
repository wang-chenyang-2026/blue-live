import { NextRequest, NextResponse } from 'next/server';
import { listTasks, resolveUserId } from '@/lib/social-task-store';
import type { SocialTaskType } from '@/lib/social-task-store';

export async function GET(req: NextRequest) {
  try {
    const userId = resolveUserId(req);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') as SocialTaskType | null;
    const tasks = await listTasks(userId, type || undefined);
    return NextResponse.json({ success: true, data: tasks });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[social/tasks]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
