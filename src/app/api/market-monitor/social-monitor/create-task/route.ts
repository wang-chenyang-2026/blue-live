import { NextRequest, NextResponse } from 'next/server';
import { nmmCreateTask } from '@/lib/social-mcp';
import { createTask, resolveUserId } from '@/lib/social-task-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskName, projectName, periodDuration, frequency, urlList } = body;

    if (!taskName) {
      return NextResponse.json({ success: false, error: '任务名称不能为空' }, { status: 400 });
    }

    // 调用 MCP 创建舆情监测任务
    const args: Record<string, unknown> = {
      projectName: projectName || taskName,
    };
    if (periodDuration) args.periodDuration = periodDuration;
    if (frequency) args.frequency = Number(frequency);
    if (urlList && Array.isArray(urlList) && urlList.length > 0) args.urlList = urlList;

    const result = await nmmCreateTask(args as unknown as Parameters<typeof nmmCreateTask>[0]);

    const projectId = result.projectId ?? result.project_id ?? null;

    const record = await createTask({
      type: 'monitor',
      task_name: taskName,
      project_id: projectId,
      period: periodDuration || (frequency ? `P${frequency}D` : null),
      url_list: urlList || [],
      status: projectId ? 'running' : 'pending',
      mcp_status: result.status ?? null,
      mcp_status_desc: result.statusDesc || null,
      result_data: result,
      file_url: null,
      created_by: resolveUserId(req),
    });

    return NextResponse.json({ success: true, data: record });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[social-monitor/create-task]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
