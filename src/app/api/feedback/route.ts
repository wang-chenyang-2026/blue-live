import { NextRequest, NextResponse } from 'next/server';
import { SUPER_ADMIN_PHONE } from '@/lib/constants';
import {
  FEEDBACK_APP_TOKEN,
  FEEDBACK_TABLE_ID,
  listBitableRecords,
  createBitableRecord,
} from '@/lib/feishu-bitable';
import type { FeedbackAttachment } from '@/lib/types';

/** 从请求头读取 middleware 注入的用户信息（中文已 URL 编码） */
function getUser(request: NextRequest) {
  return {
    phone: request.headers.get('x-user-phone') || '',
    role: decodeURIComponent(request.headers.get('x-user-role') || ''),
    name: decodeURIComponent(request.headers.get('x-user-name') || ''),
  };
}

interface BitableAttachment {
  file_token?: string;
  name?: string;
  size?: number;
  tmp_url?: string;
  type?: string;
  url?: string;
}

/** 多维表格记录 -> 前端反馈结构 */
function mapRecord(rec: { record_id: string; fields: Record<string, any> }) {
  const f = rec.fields || {};
  const attachments: FeedbackAttachment[] = (Array.isArray(f['附件']) ? f['附件'] : [])
    .map((a: BitableAttachment) => ({
      fileToken: a.file_token || '',
      name: a.name || '附件',
      size: typeof a.size === 'number' ? a.size : 0,
      type: a.type || '',
    }))
    .filter((a: FeedbackAttachment) => a.fileToken);

  // 日期字段：飞书返回毫秒时间戳（存的是北京时间0点=UTC前一天16点），按北京时间转回日期
  let date = '';
  if (typeof f['日期'] === 'number') {
    date = new Date(f['日期'] + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }

  return {
    id: rec.record_id,
    module: typeof f['模块'] === 'string' ? f['模块'] : '',
    category: typeof f['反馈类别'] === 'string' ? f['反馈类别'] : '',
    staffId: f['反馈人'] || '',
    submitterName: typeof f['反馈人'] === 'string' ? f['反馈人'] : '',
    phone: typeof f['手机号'] === 'string' ? f['手机号'] : '',
    date,
    content: typeof f['内容'] === 'string' ? f['内容'] : '',
    status: f['状态'] === '已处理' ? '已处理' : '待处理',
    reply: typeof f['回复'] === 'string' ? f['回复'] : '',
    attachments,
  };
}

/**
 * GET /api/feedback
 * 超级管理员：返回全部反馈；其他用户：仅返回本人提交的反馈。
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUser(request);
    const records = await listBitableRecords(FEEDBACK_APP_TOKEN, FEEDBACK_TABLE_ID);
    let list = records.map(mapRecord);

    const isSuperAdmin = user.phone === SUPER_ADMIN_PHONE;
    if (!isSuperAdmin) {
      // 非超管只能看到自己提交的反馈（按姓名+手机号双重匹配，防止同名）
      list = list.filter(
        (f) => f.phone === user.phone || (f.submitterName === user.name && user.name !== ''),
      );
    }

    // 按日期倒序（飞书默认按创建顺序，这里统一排序）
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    return NextResponse.json({ success: true, feedbacks: list });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/feedback  提交反馈
 * body: { module, category, content, attachments?: [{fileToken,name,size,type}] }
 */
export async function POST(request: NextRequest) {
  try {
    const user = getUser(request);
    const body = await request.json();
    const { module, category, content, attachments } = body as {
      module?: string;
      category?: string;
      content?: string;
      attachments?: FeedbackAttachment[];
    };

    if (!module || !category || !content?.trim()) {
      return NextResponse.json(
        { success: false, error: '模块、反馈类别和问题描述不能为空' },
        { status: 400 },
      );
    }

    // 日期按北京时间自然日（UTC+8）
    const now = new Date();
    const bjDate = new Date(now.getTime() + 8 * 3600 * 1000);
    const dateStr = bjDate.toISOString().slice(0, 10);
    // 飞书日期字段需要当天 00:00 (UTC+8) 的毫秒时间戳
    const [y, m, d] = dateStr.split('-').map(Number);
    const dayStartUtc = Date.UTC(y, m - 1, d, -8, 0, 0); // 北京时间0点 = UTC前一天16点

    const fields: Record<string, any> = {
      内容: content.trim(),
      模块: module,
      反馈类别: category,
      反馈人: user.name || '未知用户',
      手机号: user.phone,
      状态: '待处理',
      日期: dayStartUtc,
    };
    if (attachments && attachments.length > 0) {
      fields['附件'] = attachments
        .filter((a) => a.fileToken)
        .map((a) => ({ file_token: a.fileToken }));
    }

    const record = await createBitableRecord(FEEDBACK_APP_TOKEN, FEEDBACK_TABLE_ID, fields);
    return NextResponse.json({
      success: true,
      feedback: mapRecord({ record_id: record.record_id, fields: record.fields }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
