import { NextRequest, NextResponse } from 'next/server';
import { ctsGetVoiceTaskResult } from '@/lib/social-mcp';
import { getTaskById, updateTask } from '@/lib/brand-task-store';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

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

    if (!task.biz_no) {
      return NextResponse.json(
        { success: false, error: '任务尚未提交采集（biz_no 缺失）' },
        { status: 400 },
      );
    }

    const result = await ctsGetVoiceTaskResult(task.biz_no);

    let newStatus = task.status;
    let fileUrl = task.file_url;
    let desc = task.mcp_status_desc;
    // status: 0采集中 1分析中 2完成 3失败 4异常
    if (result.status === 2) {
      newStatus = 'completed';
      fileUrl = result.zipUrl || fileUrl;
      desc = '已完成';
    } else if (result.status === 3 || result.status === 4) {
      newStatus = 'failed';
      desc = result.status === 3 ? '采集失败' : '采集异常';
    } else {
      newStatus = 'running';
      desc = result.status === 1 ? '声量分析中...' : '全网声量采集中...';
    }

    const updated = await updateTask(taskId, {
      status: newStatus,
      mcp_status: result.status,
      mcp_status_desc: desc,
      result_data: result,
      file_url: fileUrl,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[brand/voice/task-result]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
