import { NextRequest, NextResponse } from 'next/server';
import { ctsGetMediaBriefResult } from '@/lib/social-mcp';
import { getTaskById, updateTask } from '@/lib/social-task-store';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ success: false, error: '缺少 taskId' }, { status: 400 });
    }

    const task = await getTaskById(taskId);
    if (!task) {
      return NextResponse.json({ success: false, error: '任务不存在' }, { status: 404 });
    }
    if (!task.brief_session_id) {
      return NextResponse.json({ success: false, error: '任务缺少 brief session id' }, { status: 400 });
    }

    const result = await ctsGetMediaBriefResult(Number(task.brief_session_id));

    let newStatus = task.status;
    if (result.status === 'COMPLETED') {
      // brief 解析完成，但还没提交采集任务，保持 pending
      newStatus = 'pending';
    } else if (result.status === 'FAILED' || result.status === 'ABORTED') {
      newStatus = 'failed';
    }

    const updated = await updateTask(taskId, {
      status: newStatus,
      mcp_status: result.status,
      mcp_status_desc:
        result.status === 'RUNNING'
          ? 'AI正在解析洞察目标...'
          : result.status === 'COMPLETED'
          ? '关键词解析完成'
          : result.status === 'FAILED'
          ? '解析失败'
          : '已取消',
      brief_keyword: result.briefKeyword || task.brief_keyword,
      brief_password: result.briefPassword || task.brief_password,
      result_data: { ...(task.result_data as Record<string, unknown>), briefResult: result },
    });

    return NextResponse.json({
      success: true,
      data: {
        taskId: updated!.id,
        status: result.status,
        briefKeyword: result.briefKeyword || null,
        briefPassword: result.briefPassword || null,
        task: updated,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[social-insight/brief-result]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
