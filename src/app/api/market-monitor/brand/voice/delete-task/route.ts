import { NextRequest, NextResponse } from 'next/server';
import { deleteTask, getTaskById, resolveUserId } from '@/lib/brand-task-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId } = body as { taskId?: string };
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: '缺少 taskId' },
        { status: 400 },
      );
    }

    const task = await getTaskById(taskId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: '任务不存在' },
        { status: 404 },
      );
    }

    const userId = resolveUserId(req);
    if (task.created_by !== userId) {
      return NextResponse.json(
        { success: false, error: '无权限删除' },
        { status: 403 },
      );
    }

    await deleteTask(taskId);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[brand/voice/delete-task]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
