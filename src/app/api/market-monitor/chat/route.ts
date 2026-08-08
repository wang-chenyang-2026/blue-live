import { NextResponse } from 'next/server';
import {
  callTool,
  initializeServer,
  parseIntent,
  type ParsedIntent,
  type ServerName,
} from '@/lib/mcp-client';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface ChatRequest {
  message: string;
  category?: string[];
  view?: string;
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
 * Handle ecommerce data queries via crawler-server
 */
async function handleCrawlerQuery(
  intent: ParsedIntent,
  category?: string[],
  brand?: string,
): Promise<{ reply: string; data?: unknown; dataType?: string }> {
  const view = intent.view || '大盘趋势';
  const catList = category || ['手机'];
  const now = new Date();
  const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startMonth = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  try {
    const { sessionId } = await initializeServer('crawler-server');
    const result = await callTool(
      'crawler-server',
      'download_data',
      {
        category_list: catList,
        category_view: view,
        start_date: startMonth,
        end_date: endMonth,
        brand: brand || '',
      },
      sessionId,
    );

    const textContent = result.content?.[0]?.text || '';
    let parsedData: unknown = null;
    try {
      parsedData = JSON.parse(textContent);
    } catch {
      parsedData = textContent;
    }

    return {
      reply: `已获取「${catList.join(' > ')}」类目${view}数据（${startMonth} ~ ${endMonth}）`,
      data: parsedData,
      dataType: view,
    };
  } catch (err) {
    return {
      reply: `获取${view}数据失败：${err instanceof Error ? err.message : '未知错误'}。请检查品类路径是否正确。`,
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
    const { message, category, brand } = body;

    if (!message?.trim()) {
      return NextResponse.json({ success: false, error: '消息不能为空' });
    }

    const intent = parseIntent(message);

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
        result = await handleCrawlerQuery(intent, category, brand);
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
