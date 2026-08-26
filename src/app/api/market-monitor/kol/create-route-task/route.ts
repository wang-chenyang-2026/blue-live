import { NextRequest, NextResponse } from 'next/server';
import { kolCreateRouteTask } from '@/lib/kol-mcp';
import { createTask, resolveUserId } from '@/lib/kol-task-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { productName, projectName, kolUrls } = body as {
      productName?: string;
      projectName?: string;
      kolUrls?: unknown;
    };

    // 校验 kolUrls
    if (!Array.isArray(kolUrls) || kolUrls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'kolUrls 必须是非空数组' },
        { status: 400 },
      );
    }

    // 简单 URL 校验
    for (const url of kolUrls) {
      if (typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        return NextResponse.json(
          { success: false, error: `无效的 URL: ${url}` },
          { status: 400 },
        );
      }
    }

    const mcpResult = await kolCreateRouteTask({
      creatType: 2,
      kolUrls: kolUrls as string[],
      productName: productName || undefined,
      projectName: projectName || undefined,
    });

    const projectId = Number(mcpResult.projectId);
    if (!Number.isFinite(projectId)) {
      throw new Error('MCP 未返回有效的 projectId');
    }

    const mcpStatus = Number(mcpResult.status ?? 0);
    let localStatus: 'pending' | 'running' | 'completed' | 'failed' = 'running';
    if (mcpStatus === 1) {
      localStatus = 'completed';
    } else if (mcpStatus === 3) {
      localStatus = 'failed';
    }

    const userId = resolveUserId(req);
    const taskName = projectName || `URL上传达人 - ${new Date().toLocaleDateString('zh-CN')}`;

    const row = await createTask({
      project_id: projectId,
      task_name: taskName,
      product_name: productName || '',
      brand: null,
      brief_summary: `URL批量上传：${kolUrls.length}个链接`,
      keyword_groups: [],
      metrics: {},
      status: localStatus,
      result_data: null,
      file_url: null,
      kol_list: null,
      mcp_status: mcpStatus,
      mcp_status_desc: mcpResult.statusDesc || null,
      created_by: userId,
    });

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        taskId: row.id,
        status: localStatus,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[create-route-task]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
