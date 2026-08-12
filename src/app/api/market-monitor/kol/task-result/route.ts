import { NextRequest, NextResponse } from 'next/server';
import { kolGetRouteTaskResult } from '@/lib/kol-mcp';
import { getTaskByProjectId, updateTask } from '@/lib/kol-task-store';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectIdStr = searchParams.get('projectId');
    const projectId = Number(projectIdStr);
    if (!Number.isFinite(projectId)) {
      return NextResponse.json(
        { success: false, error: 'projectId 必填且必须为数字' },
        { status: 400 },
      );
    }

    const result = await kolGetRouteTaskResult(projectId);

    const mcpStatus = Number(result.status ?? 0);
    let localStatus: 'pending' | 'running' | 'completed' | 'failed' = 'running';
    if (mcpStatus === 2) localStatus = 'completed';
    else if (mcpStatus === 3 || mcpStatus < 0) localStatus = 'failed';

    const fileUrl = (result.fileUrl as string | undefined) || '';
    const patch: Parameters<typeof updateTask>[1] = {
      status: localStatus,
      mcp_status: mcpStatus,
      mcp_status_desc: result.statusDesc || null,
    };
    if (fileUrl) patch.file_url = fileUrl;

    const resultData: Record<string, unknown> = {};
    if (fileUrl) resultData.fileUrl = fileUrl;
    if (result.fileName) resultData.fileName = result.fileName;
    if (Array.isArray(result.kolList)) resultData.kolList = result.kolList;
    if (typeof result.total === 'number') resultData.total = result.total;
    for (const [k, v] of Object.entries(result)) {
      if (k in resultData) continue;
      if (['projectId', 'status', 'statusDesc', 'fileUrl', 'fileName'].includes(k)) continue;
      resultData[k] = v;
    }
    if (Object.keys(resultData).length > 0) {
      patch.result_data = resultData;
    }

    let dbRow = await updateTask(projectId, patch);
    if (!dbRow) {
      dbRow = await getTaskByProjectId(projectId);
    }

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        status: localStatus,
        mcpStatus,
        statusDesc: result.statusDesc || '',
        fileUrl,
        fileName: result.fileName || '',
        kolList: Array.isArray(result.kolList) ? result.kolList : [],
        total: typeof result.total === 'number' ? result.total : undefined,
        raw: result,
        dbRecord: dbRow
          ? {
              id: dbRow.id,
              taskName: dbRow.task_name,
              productName: dbRow.product_name,
              brand: dbRow.brand,
              status: dbRow.status,
              fileUrl: dbRow.file_url,
              createdAt: dbRow.created_at,
            }
          : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[task-result] failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
