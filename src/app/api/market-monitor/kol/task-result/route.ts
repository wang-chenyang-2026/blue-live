import { NextRequest, NextResponse } from 'next/server';
import { kolGetRouteTaskResult, parseKolExcel } from '@/lib/kol-mcp';
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

    // 状态判断优先级：1.fileUrl非空→已完成 2.statusDesc含"完成"→完成 3.statusDesc含"异常/失败"→失败 4.status数值参考
    const fileUrl = (result.fileUrl as string | undefined) || '';
    const statusDesc = (result.statusDesc as string | undefined) || '';
    const mcpStatus = Number(result.status ?? 0);

    let localStatus: 'pending' | 'running' | 'completed' | 'failed' = 'running';
    if (fileUrl) {
      localStatus = 'completed';
    } else if (statusDesc.includes('完成')) {
      localStatus = 'completed';
    } else if (statusDesc.includes('异常') || statusDesc.includes('失败')) {
      localStatus = 'failed';
    } else if (mcpStatus === 3) {
      localStatus = 'failed';
    }

    // 当 fileUrl 非空且状态为 completed 时，自动解析 Excel
    let parsedColumns: string[] = [];
    let parsedRows: Record<string, unknown>[] = [];
    let parsedTotal = 0;

    if (fileUrl && localStatus === 'completed') {
      const parsed = await parseKolExcel(fileUrl);
      parsedColumns = parsed.columns;
      parsedRows = parsed.rows;
      parsedTotal = parsed.total;
    }

    // 构建 patch
    const patch: Parameters<typeof updateTask>[1] = {
      status: localStatus,
      mcp_status: mcpStatus,
      mcp_status_desc: statusDesc || null,
    };
    if (fileUrl) patch.file_url = fileUrl;

    // 构建 result_data
    const resultData: Record<string, unknown> = {};
    if (fileUrl) resultData.fileUrl = fileUrl;
    if (result.fileName) resultData.fileName = result.fileName;
    if (parsedRows.length > 0) {
      resultData.kolList = parsedRows;
      resultData.columns = parsedColumns;
      resultData.total = parsedTotal;
    } else if (Array.isArray(result.kolList)) {
      resultData.kolList = result.kolList;
    }
    if (typeof result.total === 'number') resultData.total = result.total;

    // 透传其他字段
    for (const [k, v] of Object.entries(result)) {
      if (k in resultData) continue;
      if (['projectId', 'status', 'statusDesc', 'fileUrl', 'fileName'].includes(k)) continue;
      resultData[k] = v;
    }
    if (Object.keys(resultData).length > 0) {
      patch.result_data = resultData;
    }

    // 如果有解析结果，更新 kol_list
    if (parsedRows.length > 0) {
      patch.kol_list = parsedRows;
    }

    let dbRow = await updateTask(projectId, patch);
    if (!dbRow) {
      dbRow = await getTaskByProjectId(projectId);
    }

    // 返回数据：优先用解析后的 Excel 数据
    const kolList = parsedRows.length > 0
      ? parsedRows
      : (Array.isArray(result.kolList) ? result.kolList : []);

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        status: localStatus,
        mcpStatus,
        statusDesc,
        fileUrl,
        fileName: result.fileName || '',
        kolList,
        columns: parsedColumns.length > 0 ? parsedColumns : [],
        total: parsedTotal || (typeof result.total === 'number' ? result.total : undefined),
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
