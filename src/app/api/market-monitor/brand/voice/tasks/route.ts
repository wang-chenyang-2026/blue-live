import { NextRequest, NextResponse } from 'next/server';
import { listTasks, resolveUserId } from '@/lib/brand-task-store';

export async function GET(req: NextRequest) {
  try {
    const userId = resolveUserId(req);
    const tasks = await listTasks(userId);
    return NextResponse.json({ success: true, data: tasks });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[brand/voice/tasks]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
