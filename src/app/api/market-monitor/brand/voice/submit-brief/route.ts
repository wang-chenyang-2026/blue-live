import { NextRequest, NextResponse } from 'next/server';
import { ctsSubmitVoiceBrief } from '@/lib/social-mcp';
import { createTask, resolveUserId } from '@/lib/brand-task-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      taskName,
      brandName,
      industry,
      category,
      brief,
    } = body as {
      taskName?: string;
      brandName?: string;
      industry?: string;
      category?: string;
      brief?: string;
    };

    if (!brief || !brief.trim()) {
      return NextResponse.json(
        { success: false, error: '洞察描述不能为空' },
        { status: 400 },
      );
    }
    if (!taskName || !taskName.trim()) {
      return NextResponse.json(
        { success: false, error: '任务名称不能为空' },
        { status: 400 },
      );
    }
    if (!brandName || !brandName.trim()) {
      return NextResponse.json(
        { success: false, error: '品牌名不能为空' },
        { status: 400 },
      );
    }

    const result = await ctsSubmitVoiceBrief(brief);
    const sessionId = result.sessionId;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Brief 提交未返回 sessionId', raw: result },
        { status: 500 },
      );
    }

    const record = await createTask({
      task_name: taskName,
      brand_name: brandName,
      industry: industry || null,
      category: category || null,
      brief_session_id: sessionId,
      brief_text: brief,
      status: 'pending',
      mcp_status: result.status || 'RUNNING',
      mcp_status_desc: 'AI 正在解析品牌声量目标...',
      result_data: { submitResult: result },
      file_url: null,
      created_by: resolveUserId(req),
    });

    return NextResponse.json({
      success: true,
      data: { ...record, briefSessionId: sessionId },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[brand/voice/submit-brief]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
