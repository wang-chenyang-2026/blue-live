import { NextRequest, NextResponse } from 'next/server';
import { ctsSubmitVoiceTask } from '@/lib/social-mcp';
import { getTaskById, updateTask } from '@/lib/brand-task-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      taskId,
      startTime,
      endTime,
      sourceCodes,
      contentModes,
      briefKeyword,
      briefPassword,
    } = body as {
      taskId?: string;
      startTime?: string | number;
      endTime?: string | number;
      sourceCodes?: string;
      contentModes?: string;
      briefKeyword?: string;
      briefPassword?: string;
    };

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

    const keyword = (briefKeyword || task.brief_keyword || '').trim();
    if (!keyword) {
      return NextResponse.json(
        { success: false, error: '缺少 briefKeyword（关键词组未就绪）' },
        { status: 400 },
      );
    }

    if (
      startTime === undefined ||
      endTime === undefined ||
      !sourceCodes ||
      !contentModes
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            '缺少必填参数: startTime, endTime, sourceCodes, contentModes',
        },
        { status: 400 },
      );
    }

    const result = await ctsSubmitVoiceTask({
      sessionId: task.brief_session_id || undefined,
      briefKeyword: keyword,
      briefPassword:
        (briefPassword && briefPassword.trim()) ||
        task.brief_password ||
        undefined,
      startTime: String(startTime),
      endTime: String(endTime),
      sourceCodes,
      contentModes,
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
      mcp_status_desc: '全网声量采集中...',
      brief_keyword: keyword,
      brief_password:
        (briefPassword && briefPassword.trim()) || task.brief_password || null,
      source_codes: sourceCodes,
      content_modes: contentModes,
      start_time: String(startTime),
      end_time: String(endTime),
      result_data: {
        ...(task.result_data as Record<string, unknown> | null),
        submitTaskResult: result,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[brand/voice/submit-task]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
