import { NextRequest, NextResponse } from 'next/server';
import { nmmGetTaskResult, ctsGetMediaTaskResult } from '@/lib/social-mcp';
import {
  getTaskById,
  updateTask,
} from '@/lib/social-task-store';

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

    let mcpResult: unknown;
    let newStatus = task.status;
    let fileUrl = task.file_url;

    if (task.type === 'monitor' && task.project_id) {
      const result = await nmmGetTaskResult(Number(task.project_id));
      mcpResult = result;
      const mcpStatus = result.status;
      // status: 0/1=执行中 2=完成 3=异常
      if (mcpStatus === 2) {
        newStatus = 'completed';
      } else if (mcpStatus === 3) {
        newStatus = 'failed';
      } else {
        newStatus = 'running';
      }
      fileUrl = (result as Record<string, unknown>).fileUrl as string || fileUrl;
    } else if (task.type === 'insight' && task.biz_no) {
      const result = await ctsGetMediaTaskResult(task.biz_no);
      mcpResult = result;
      // status: 0采集中 1分析中 2完成 3失败 4异常
      if (result.status === 2) {
        newStatus = 'completed';
        fileUrl = result.zipUrl || fileUrl;
      } else if (result.status === 3 || result.status === 4) {
        newStatus = 'failed';
      } else {
        newStatus = 'running';
      }
    }

    const updated = await updateTask(taskId, {
      status: newStatus,
      mcp_status: (mcpResult as Record<string, unknown>)?.status as number | string | null ?? task.mcp_status,
      mcp_status_desc: (mcpResult as Record<string, unknown>)?.statusDesc as string ?? null,
      result_data: mcpResult,
      file_url: fileUrl,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[social/task-result]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
