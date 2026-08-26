import { NextResponse } from 'next/server';
import {
  callTool,
  initializeServer,
  parseIntent,
  type ParsedIntent,
} from '@/lib/mcp-client';
import { buildCacheKey, getCached, setCached, TTL } from '@/lib/mcp-cache';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface ChatRequest {
  message: string;
  category?: string[];
  view?: string;
  timeRange?: string;
  brand?: string;
  history?: ChatMessage[];
}

interface ChatResponse {
  success: boolean;
  data?: {
    reply: string;
    dataType?: string;
    data?: unknown;
    service?: string;
    tool?: string;
  };
  error?: string;
}

/**
 * Handle ecommerce data queries via crawler-server.
 *
 * MCP download_data always returns the full 13-month window (month-2 to month-14),
 * regardless of any start_date/end_date parameters. We do NOT pass them.
 * Time-range filtering is done on the frontend.
 */
async function handleCrawlerQuery(
  intent: ParsedIntent,
  category?: string[],
  brand?: string,
  viewOverride?: string,
  signal?: AbortSignal,
): Promise<{ reply: string; data?: unknown; dataType?: string }> {
  const view = viewOverride || intent.view || '品类视角-大盘趋势';

  if (!category || category.length === 0) {
    return {
      reply: '请提供品类路径（至少需要一级品类）。',
      dataType: 'error',
    };
  }

  // Cache key: only view + category + brand. No timeRange (MCP always returns 13 months).
  const cacheKey = buildCacheKey(['crawler', view, category, brand || '']);
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    return {
      reply: `已获取「${category.join(' > ')}」类目${view}数据（缓存）`,
      data: cached,
      dataType: view,
    };
  }

  // Check if client already disconnected before making expensive MCP call
  if (signal?.aborted) {
    return { reply: '请求已取消', dataType: 'cancelled' };
  }

  try {
    const { sessionId } = await initializeServer('crawler-server');

    // Check abort again after session init (which may take time)
    if (signal?.aborted) {
      return { reply: '请求已取消', dataType: 'cancelled' };
    }

    const result = await callTool(
      'crawler-server',
      'download_data',
      {
        category_list: category,
        category_view: view,
        // MCP download_data does not accept start_date/end_date;
        // it always returns months 2-14 from current month.
        // jqec_cp defaults to bowen.cui@bluefocus.com on the server side.
      },
      sessionId,
    );

    if (signal?.aborted) {
      return { reply: '请求已取消', dataType: 'cancelled' };
    }

    const textContent = result.content?.[0]?.text || '';
    let parsedData: unknown = null;
    try {
      const parsed = JSON.parse(textContent);
      if (parsed && typeof parsed === 'object' && 'code' in parsed) {
        if (parsed.code === 200 && Array.isArray(parsed.data)) {
          parsedData = parsed.data;
        } else {
          parsedData = { error: parsed.detail || parsed.message || '接口返回异常', raw: parsed };
        }
      } else {
        parsedData = parsed;
      }
    } catch {
      parsedData = textContent;
    }

    // Cache successful array responses only
    if (Array.isArray(parsedData) && parsedData.length > 0) {
      setCached(cacheKey, parsedData, TTL.DEFAULT);
    }

    const catLabel = category.join(' > ');
    return {
      reply: `已获取「${catLabel}」类目${view}数据`,
      data: parsedData,
      dataType: view,
    };
  } catch (err) {
    return {
      reply: `获取数据失败：${err instanceof Error ? err.message : '未知错误'}。请稍后重试。`,
      dataType: 'error',
    };
  }
}

/**
 * Handle new media monitoring queries
 */
async function handleNewMediaQuery(
  intent: ParsedIntent,
): Promise<{ reply: string; data?: unknown; dataType?: string }> {
  try {
    const { sessionId } = await initializeServer('new-media-monitoring');
    const result = await callTool(
      'new-media-monitoring',
      'create_monitor_task',
      {
        keywords: intent.rawMessage.replace(/监测|舆情|新媒体/g, '').trim() || '手机市场',
      },
      sessionId,
    );
    const textContent = result.content?.[0]?.text || '';
    let parsed: unknown = null;
    try { parsed = JSON.parse(textContent); } catch { parsed = textContent; }
    return {
      reply: '新媒体监测任务已创建，任务ID已返回。可继续查询结果。',
      data: parsed,
      dataType: 'monitor_task',
    };
  } catch (err) {
    return {
      reply: `新媒体监测创建失败：${err instanceof Error ? err.message : '未知错误'}`,
      dataType: 'error',
    };
  }
}

/**
 * Handle Douyin KOL queries
 */
async function handleDouyinKOLQuery(
  intent: ParsedIntent,
): Promise<{ reply: string; data?: unknown; dataType?: string }> {
  try {
    const { sessionId } = await initializeServer('douyin-kol-api-service');
    const toolsRes = await callTool(
      'douyin-kol-api-service',
      'get_douyin_kol_list',
      { keyword: intent.rawMessage.replace(/抖音|达人|kol|KOL/gi, '').trim() || '手机' },
      sessionId,
    );
    const textContent = toolsRes.content?.[0]?.text || '';
    let parsed: unknown = null;
    try { parsed = JSON.parse(textContent); } catch { parsed = textContent; }
    return {
      reply: '已获取抖音达人KOL数据',
      data: parsed,
      dataType: 'douyin_kol',
    };
  } catch (err) {
    return {
      reply: `抖音KOL数据获取失败：${err instanceof Error ? err.message : '未知错误'}`,
      dataType: 'error',
    };
  }
}

/**
 * Handle dim-server queries
 */
async function handleDimQuery(
  intent: ParsedIntent,
): Promise<{ reply: string; data?: unknown; dataType?: string }> {
  try {
    const { sessionId } = await initializeServer('dim-server');
    const result = await callTool(
      'dim-server',
      'match_dimension_table',
      { keyword: intent.rawMessage.replace(/标签|维表/g, '').trim() || '手机' },
      sessionId,
    );
    const textContent = result.content?.[0]?.text || '';
    let parsed: unknown = null;
    try { parsed = JSON.parse(textContent); } catch { parsed = textContent; }
    return {
      reply: '已匹配标签维表数据',
      data: parsed,
      dataType: 'dimension',
    };
  } catch (err) {
    return {
      reply: `标签维表查询失败：${err instanceof Error ? err.message : '未知错误'}`,
      dataType: 'error',
    };
  }
}

/**
 * Handle common-tools (社媒洞察) queries
 */
async function handleCommonToolsQuery(
  intent: ParsedIntent,
): Promise<{ reply: string; data?: unknown; dataType?: string }> {
  try {
    const { sessionId } = await initializeServer('common-tools-server');
    const result = await callTool(
      'common-tools-server',
      'submit_media_brief',
      { keyword: intent.rawMessage.replace(/社媒|洞察|brief/gi, '').trim() || '手机市场' },
      sessionId,
    );
    const textContent = result.content?.[0]?.text || '';
    let parsed: unknown = null;
    try { parsed = JSON.parse(textContent); } catch { parsed = textContent; }
    return {
      reply: '社媒洞察分析任务已提交',
      data: parsed,
      dataType: 'media_brief',
    };
  } catch (err) {
    return {
      reply: `社媒洞察查询失败：${err instanceof Error ? err.message : '未知错误'}`,
      dataType: 'error',
    };
  }
}

export async function POST(req: Request): Promise<NextResponse<ChatResponse>> {
  try {
    const body: ChatRequest = await req.json();
    const { message, category, brand, view, timeRange } = body;

    if (!message?.trim() && !view) {
      return NextResponse.json({ success: false, error: '消息不能为空' });
    }

    const intent = parseIntent(message || '');

    if (view) {
      intent.view = view;
      intent.service = 'crawler-server';
    }

    let result: { reply: string; data?: unknown; dataType?: string };

    switch (intent.service) {
      case 'new-media-monitoring':
        result = await handleNewMediaQuery(intent);
        break;
      case 'douyin-kol-api-service':
        result = await handleDouyinKOLQuery(intent);
        break;
      case 'dim-server':
        result = await handleDimQuery(intent);
        break;
      case 'common-tools-server':
        result = await handleCommonToolsQuery(intent);
        break;
      case 'crawler-server':
      default:
        result = await handleCrawlerQuery(intent, category, brand, view, req.signal);
        break;
    }

    return NextResponse.json({
      success: true,
      data: {
        reply: result.reply,
        dataType: result.dataType,
        data: result.data,
        service: intent.service || undefined,
        tool: intent.view || undefined,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : '处理失败',
      },
      { status: 500 },
    );
  }
}
