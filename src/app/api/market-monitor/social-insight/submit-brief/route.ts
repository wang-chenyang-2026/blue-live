import { NextRequest, NextResponse } from 'next/server';
import { ctsSubmitMediaBrief } from '@/lib/social-mcp';
import { createTask, resolveUserId } from '@/lib/social-task-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskName, brief } = body;

    if (!brief || !brief.trim()) {
      return NextResponse.json({ success: false, error: '洞察描述不能为空' }, { status: 400 });
    }
    if (!taskName || !taskName.trim()) {
      return NextResponse.json({ success: false, error: '任务名称不能为空' }, { status: 400 });
    }

    // 第1步：提交 brief 解析
    const result = await ctsSubmitMediaBrief(brief);
    const sessionId = result.sessionId;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Brief 提交未返回 sessionId', raw: result },
        { status: 500 },
      );
    }

    // 先存入本地，状态 pending（等待 brief 解析完成）
    const record = await createTask({
      type: 'insight',
      task_name: taskName,
      brief_session_id: sessionId,
      status: 'pending',
      mcp_status: result.status || 'RUNNING',
      mcp_status_desc: 'AI正在解析洞察目标...',
      result_data: { brief, submitResult: result },
      file_url: null,
      created_by: resolveUserId(req),
    });

    return NextResponse.json({
      success: true,
      data: { ...record, briefSessionId: sessionId },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[social-insight/submit-brief]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
