import { NextRequest, NextResponse } from 'next/server';
import { ctsSubmitMediaTask } from '@/lib/social-mcp';
import { getTaskById, updateTask } from '@/lib/social-task-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, startTime, endTime, sourceCodes, contentModes, briefKeyword, briefPassword } = body;

    if (!taskId) {
      return NextResponse.json({ success: false, error: '缺少 taskId' }, { status: 400 });
    }

    const task = await getTaskById(taskId);
    if (!task) {
      return NextResponse.json({ success: false, error: '任务不存在' }, { status: 404 });
    }

    // 使用传入的 briefKeyword，或从任务记录中取
    const keyword = briefKeyword || task.brief_keyword;
    if (!keyword) {
      return NextResponse.json({ success: false, error: '缺少 briefKeyword（关键词组未就绪）' }, { status: 400 });
    }

    if (!startTime || !endTime || !sourceCodes || !contentModes) {
      return NextResponse.json(
        { success: false, error: '缺少必填参数: startTime, endTime, sourceCodes, contentModes' },
        { status: 400 },
      );
    }

    const result = await ctsSubmitMediaTask({
      briefKeyword: keyword,
      briefPassword: briefPassword || task.brief_password || undefined,
      startTime: String(startTime),
      endTime: String(endTime),
      sourceCodes,
      contentModes,
      sessionId: task.brief_session_id || undefined,
    });

    const bizNo = result.bizNo;
    if (!bizNo) {
      return NextResponse.json(
        { success: false, error: '提交任务未返回 bizNo', raw: result },
        { status: 500 },
      );
    }

    const updated = await updateTask(taskId, {
      biz_no: bizNo,
      status: 'running',
      mcp_status: 0,
      mcp_status_desc: '数据采集中...',
      source_codes: sourceCodes,
      content_modes: contentModes,
      start_time: String(startTime),
      end_time: String(endTime),
      result_data: { ...(task.result_data as Record<string, unknown>), submitTaskResult: result },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[social-insight/submit-task]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
