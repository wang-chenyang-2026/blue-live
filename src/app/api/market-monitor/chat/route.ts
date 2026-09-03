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
    const TRANSIENT_KEYWORDS = ['KEY_RPM_EXCEEDED', 'Session ID missing', 'rate limit', 'timeout', 'ECONNRESET', 'fetch failed'];
    const DETERMINISTIC_KEYWORDS = ['Out of range float', 'code":500'];

    let textContent = '';
    let lastError: unknown = null;
    const MAX_ATTEMPTS = 3;
    const DELAYS = [0, 2500, 5000];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (signal?.aborted) {
        return { reply: '请求已取消', dataType: 'cancelled' };
      }

      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, DELAYS[attempt]));
      }

      if (signal?.aborted) {
        return { reply: '请求已取消', dataType: 'cancelled' };
      }

      try {
        const { sessionId } = await initializeServer('crawler-server');

        if (signal?.aborted) {
          return { reply: '请求已取消', dataType: 'cancelled' };
        }

        const result = await callTool(
          'crawler-server',
          'download_data',
          {
            category_list: category,
            category_view: view,
          },
          sessionId,
        );

        if (signal?.aborted) {
          return { reply: '请求已取消', dataType: 'cancelled' };
        }

        textContent = result.content?.[0]?.text || '';
        lastError = null;

        const isTransient = TRANSIENT_KEYWORDS.some((kw) => textContent.includes(kw));
        const isDeterministic = DETERMINISTIC_KEYWORDS.some((kw) => textContent.includes(kw)) && !isTransient;

        if (isTransient && attempt < MAX_ATTEMPTS - 1) {
          continue;
        }

        break;
      } catch (err) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isTransient = TRANSIENT_KEYWORDS.some((kw) => errMsg.includes(kw));

        if (isTransient && attempt < MAX_ATTEMPTS - 1) {
          continue;
        }

        break;
      }
    }

    if (lastError && !textContent) {
      throw lastError;
    }

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
  _intent: ParsedIntent,
): Promise<{ reply: string; data?: unknown; dataType?: string }> {
  // 达人选号是多步异步流程（AI 生词 → 关键词确认 → 建项 → 轮询出 Excel），
  // 不适合在自由对话中一步完成；引导用户到专用页面操作。
  return {
    reply:
      '达人选号请在「市场监测 → 达人选号」页面操作：填写产品与选号需求后，AI 会生成搜索关键词组，确认后创建选号任务，完成后可下载达人 Excel。目前支持抖音平台；小红书选号即将开通。',
    dataType: 'guide',
  };
}

/**
 * Handle dim-server queries
 */
async function handleDimQuery(
  _intent: ParsedIntent,
): Promise<{ reply: string; data?: unknown; dataType?: string }> {
  // 维表匹配需要结构化输入（达人简介/品类全路径/帖子评论 JSON），自由对话无法可靠提供；
  // 该能力的业务入口尚在规划中，这里不再占位空跑。
  return {
    reply:
      '维度标签匹配功能正在规划中，暂未开放。您可以先使用「市场监测」中的电商数据监测、社媒洞察或达人选号功能。',
    dataType: 'guide',
  };
}

/**
 * Handle common-tools (社媒洞察) queries
 */
async function handleCommonToolsQuery(
  _intent: ParsedIntent,
): Promise<{ reply: string; data?: unknown; dataType?: string }> {
  // 社媒洞察是多步异步流程（提交洞察目标 → 解析关键词 → 选渠道/时间范围 → 采集分析出报告），
  // 引导用户到专用页面操作。
  return {
    reply:
      '社媒洞察请在「市场监测 → 社媒帖子监测 → 社媒洞察」页面提交：描述您的洞察目标后，系统会解析关键词，选择渠道（小红书/抖音/微博/B站）和时间范围，完成后生成声量数据与分析报告。品牌全网声量在「品牌洞察 → 品牌声量」中。',
    dataType: 'guide',
  };
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
