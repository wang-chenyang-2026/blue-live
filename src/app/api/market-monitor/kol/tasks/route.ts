import { NextRequest, NextResponse } from 'next/server';
import { listTasks, resolveUserId } from '@/lib/kol-task-store';

export async function GET(req: NextRequest) {
  try {
    const userId = resolveUserId(req);
    const rows = await listTasks(userId);

    const tasks = rows.map((r) => {
      const groups = Array.isArray(r.keyword_groups)
        ? (r.keyword_groups as Array<{ content?: string }>)
        : [];
      return {
        id: r.id,
        projectId: r.project_id,
        taskName: r.task_name,
        productName: r.product_name,
        brand: r.brand || '',
        briefSummary: r.brief_summary || '',
        keywordGroupCount: groups.length,
        keywordGroups: groups,
        metrics: r.metrics,
        status: r.status,
        mcpStatus: r.mcp_status,
        mcpStatusDesc: r.mcp_status_desc,
        fileUrl: r.file_url,
        hasResult: !!r.file_url || !!r.result_data,
        createdAt: r.created_at,
      };
    });

    return NextResponse.json({ success: true, data: tasks });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tasks GET] failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
