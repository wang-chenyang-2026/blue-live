import { NextRequest, NextResponse } from 'next/server';
import { kolGetRouteTaskResult } from '@/lib/kol-mcp';
import {
  ensureKolTasksTable,
  getKolTaskByProjectId,
  updateKolTask,
} from '@/lib/kol-tasks-db';

/**
 * GET /api/market-monitor/kol/task-result?projectId=xxx
 *
 * 查询 MCP 任务结果，并将最新状态/文件URL回写到 Supabase。
 */
export async function GET(req: NextRequest) {
  try {
    await ensureKolTasksTable();
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

    // MCP status: 0/1 执行中, 2 完成, 其它异常
    const mcpStatus = Number(result.status ?? 0);
    let localStatus: 'pending' | 'running' | 'completed' | 'failed' = 'running';
    if (mcpStatus === 2) localStatus = 'completed';
    else if (mcpStatus === 3 || mcpStatus < 0) localStatus = 'failed';

    const fileUrl = (result.fileUrl as string | undefined) || '';
    const patch: Parameters<typeof updateKolTask>[1] = {
      status: localStatus,
      mcp_status: mcpStatus,
      mcp_status_desc: result.statusDesc || null,
    };
    if (fileUrl) patch.file_url = fileUrl;

    // 把达人列表等结构化数据落到 result_data（如果存在）
    const resultData: Record<string, unknown> = {};
    if (fileUrl) resultData.fileUrl = fileUrl;
    if (result.fileName) resultData.fileName = result.fileName;
    if (Array.isArray(result.kolList)) resultData.kolList = result.kolList;
    if (typeof result.total === 'number') resultData.total = result.total;
    // 兜底：把 data 层所有除已知字段外的字段都存下来
    for (const [k, v] of Object.entries(result)) {
      if (k in resultData) continue;
      if (['projectId', 'status', 'statusDesc', 'fileUrl', 'fileName'].includes(k)) continue;
      resultData[k] = v;
    }
    if (Object.keys(resultData).length > 0) {
      patch.result_data = resultData;
    }

    let dbRow = await updateKolTask(projectId, patch);

    // 如果数据库里还没有这条记录（极端兜底），读一下
    if (!dbRow) {
      dbRow = await getKolTaskByProjectId(projectId);
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
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
