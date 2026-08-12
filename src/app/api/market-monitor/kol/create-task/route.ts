import { NextRequest, NextResponse } from 'next/server';
import { kolCreateProjectByKeywords } from '@/lib/kol-mcp';
import { createTask, resolveUserId } from '@/lib/kol-task-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      task_name,
      product_name,
      brand,
      brief_summary,
      keyword_groups,
      metrics,
      user_metrics,
      contword,
      entity_report,
    } = body as {
      task_name?: string;
      product_name?: string;
      brand?: string;
      brief_summary?: string;
      keyword_groups?: Array<{ content: string; query: string; pass_word: string[] }>;
      metrics?: Record<string, unknown>;
      user_metrics?: Record<string, unknown>;
      contword?: string[];
      entity_report?: Record<string, unknown>;
    };

    if (!product_name?.trim()) {
      return NextResponse.json({ success: false, error: '产品名称必填' }, { status: 400 });
    }
    if (!Array.isArray(keyword_groups) || keyword_groups.length === 0) {
      return NextResponse.json({ success: false, error: '至少选择一组关键词' }, { status: 400 });
    }
    const fansLower = Number((metrics as Record<string, unknown> | undefined)?.kolFansRangeLower);
    if (!Number.isFinite(fansLower) || fansLower <= 0) {
      return NextResponse.json(
        { success: false, error: 'metrics.kolFansRangeLower 必填且需为正数' },
        { status: 400 },
      );
    }

    const safeMetrics: Record<string, unknown> = {
      kolNumLower: 50,
      ...(metrics || {}),
      anyFieldNull: true,
    };
    const safeUserMetrics: Record<string, unknown> = {
      ...(user_metrics || {}),
      anyFieldNull: true,
    };

    for (const [k, v] of Object.entries(safeMetrics)) {
      if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
        safeMetrics[k] = Number(v);
      }
    }

    const taskName = task_name?.trim() || `${product_name} - ${new Date().toLocaleDateString('zh-CN')}`;

    const mcpResult = await kolCreateProjectByKeywords({
      keyword_groups: keyword_groups.map((g) => ({
        content: g.content,
        query: g.query,
        pass_word: Array.isArray(g.pass_word) ? g.pass_word : [],
      })),
      metrics: safeMetrics as never,
      brief: brief_summary || '',
      product_name,
      task_name: taskName,
      user_metrics: safeUserMetrics as never,
      contword: Array.isArray(contword) ? contword : [],
      entity_report,
    });

    const projectId = Number(mcpResult.projectId);
    if (!Number.isFinite(projectId)) {
      throw new Error('MCP 未返回有效的 projectId');
    }

    const mcpStatus = Number(mcpResult.status ?? 0);
    let localStatus: 'pending' | 'running' | 'completed' | 'failed' = 'running';
    if (mcpStatus === 2) localStatus = 'completed';
    else if (mcpStatus === 3 || mcpStatus < 0) localStatus = 'failed';

    const userId = resolveUserId(req);

    const row = await createTask({
      project_id: projectId,
      task_name: taskName,
      product_name,
      brand: brand || null,
      brief_summary: brief_summary || null,
      keyword_groups: keyword_groups as unknown,
      metrics: safeMetrics as unknown,
      status: localStatus,
      result_data: null,
      file_url: null,
      mcp_status: mcpStatus,
      mcp_status_desc: mcpResult.statusDesc || null,
      created_by: userId,
    });

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        taskId: row.id,
        status: row.status,
        mcpStatus,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[create-task] failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
