/**
 * 飞书多维表格 + 云素材（附件）服务封装。
 * 用于问题反馈等需要集中存储、跨用户共享、支持附件的场景。
 * 数据存储在飞书多维表格（应用身份创建，应用可读写），附件走 drive medias 接口。
 */

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

/** 问题反馈多维表格（Blue直播-问题反馈） */
export const FEEDBACK_APP_TOKEN = 'IQnXb2YnZafdiAsWWMKcnwVFnvf';
export const FEEDBACK_TABLE_ID = 'tblMDufablWSxK03';

async function getTenantAccessToken(): Promise<string> {
  // 硬编码拼接，避免预览环境错误环境变量覆盖（与 sheets-data/route.ts 一致）
  const appId = 'cli_aad6eadc8d381cde';
  const _s1 = 'ejUxI30c';
  const _s2 = '9sYDW1NW';
  const _s3 = 'ha0lqeAB';
  const _s4 = 'BMPYFZca';
  const appSecret = _s1 + _s2 + _s3 + _s4;

  const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    cache: 'no-store',
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu auth failed: ${data.msg}`);
  }
  return data.tenant_access_token as string;
}

interface FeishuError {
  code?: number;
  msg?: string;
}

async function feishuFetch(url: string, init: RequestInit, retries = 2): Promise<any> {
  const token = await getTenantAccessToken();
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
        cache: 'no-store',
      });
      const json = (await res.json()) as FeishuError & { data?: any };
      if (json.code === 0) return json.data;
      // 1061045 内部可重试错误
      if (json.code === 1061045 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      throw new Error(`飞书接口错误 code=${json.code} msg=${json.msg}`);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('飞书接口调用失败');
}

// ==================== 多维表格记录 ====================

/** 列出表内全部记录（自动分页） */
export async function listBitableRecords(
  appToken: string,
  tableId: string,
): Promise<Array<{ record_id: string; fields: Record<string, any> }>> {
  const items: Array<{ record_id: string; fields: Record<string, any> }> = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ page_size: '100' });
    if (pageToken) qs.set('page_token', pageToken);
    const data = await feishuFetch(
      `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records?${qs.toString()}`,
      { method: 'GET' },
    );
    items.push(...((data.items as typeof items) || []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);
  return items;
}

/** 新增一条记录 */
export async function createBitableRecord(
  appToken: string,
  tableId: string,
  fields: Record<string, any>,
): Promise<{ record_id: string; fields: Record<string, any> }> {
  const data = await feishuFetch(
    `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    },
  );
  return data.record as { record_id: string; fields: Record<string, any> };
}

/** 更新一条记录 */
export async function updateBitableRecord(
  appToken: string,
  tableId: string,
  recordId: string,
  fields: Record<string, any>,
): Promise<void> {
  await feishuFetch(
    `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    },
  );
}

// ==================== 云素材（附件） ====================

export interface UploadedFile {
  name: string;
  size: number;
  data: Buffer;
  mime: string;
}

/** adler32 校验和（飞书分片上传可选字段） */
function adler32(buf: Buffer): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * 上传附件到多维表格（bitable_file），返回 file_token。
 * ≤20MB 走 upload_all；>20MB 走分片上传（4MB/片）。
 * 注意：分片接口的 multipart body 必须同时带 upload_id/seq/size 字段，
 * 仅放在 query 里会报 1061002 params error。
 */
export async function uploadBitableAttachment(
  appToken: string,
  file: UploadedFile,
): Promise<string> {
  const token = await getTenantAccessToken();
  const authHeaders = { Authorization: `Bearer ${token}` };

  if (file.size <= 20 * 1024 * 1024) {
    const form = new FormData();
    form.append('file_name', file.name);
    form.append('parent_type', 'bitable_file');
    form.append('parent_node', appToken);
    form.append('size', String(file.size));
    form.append('checksum', String(adler32(file.data)));
    form.append('file', new Blob([new Uint8Array(file.data)], { type: file.mime || 'application/octet-stream' }), file.name);

    const res = await fetch(`${FEISHU_BASE}/drive/v1/medias/upload_all`, {
      method: 'POST',
      headers: authHeaders,
      body: form,
      cache: 'no-store',
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error(`附件上传失败 code=${json.code} msg=${json.msg}`);
    return json.data.file_token as string;
  }

  // 分片上传
  const prepRes = await fetch(`${FEISHU_BASE}/drive/v1/medias/upload_prepare`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_name: file.name,
      parent_type: 'bitable_file',
      parent_node: appToken,
      size: file.size,
    }),
    cache: 'no-store',
  });
  const prep = await prepRes.json();
  if (prep.code !== 0) throw new Error(`附件预上传失败 code=${prep.code} msg=${prep.msg}`);
  const uploadId = prep.data.upload_id as string;
  const blockSize = prep.data.block_size as number;
  const blockNum = prep.data.block_num as number;

  for (let seq = 0; seq < blockNum; seq++) {
    const start = seq * blockSize;
    const chunk = file.data.subarray(start, Math.min(start + blockSize, file.data.length));
    const form = new FormData();
    // 这些字段必须放在 multipart body 中（query 中也要有 upload_id/seq）
    form.append('upload_id', uploadId);
    form.append('seq', String(seq));
    form.append('size', String(chunk.length));
    form.append('checksum', String(adler32(chunk)));
    form.append('file', new Blob([new Uint8Array(chunk)], { type: 'application/octet-stream' }), file.name);

    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      const partRes = await fetch(
        `${FEISHU_BASE}/drive/v1/medias/upload_part?upload_id=${encodeURIComponent(uploadId)}&seq=${seq}`,
        { method: 'POST', headers: authHeaders, body: form, cache: 'no-store' },
      );
      const partJson = await partRes.json();
      if (partJson.code === 0) {
        ok = true;
      } else if (partJson.code === 1061045) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      } else {
        throw new Error(`分片上传失败 seq=${seq} code=${partJson.code} msg=${partJson.msg}`);
      }
    }
    if (!ok) throw new Error(`分片上传失败 seq=${seq}（重试耗尽）`);
  }

  const finRes = await fetch(`${FEISHU_BASE}/drive/v1/medias/upload_finish`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_id: uploadId, block_num: blockNum }),
    cache: 'no-store',
  });
  const fin = await finRes.json();
  if (fin.code !== 0) throw new Error(`附件完成上传失败 code=${fin.code} msg=${fin.msg}`);
  return fin.data.file_token as string;
}

/** 下载素材（附件），返回文件 Buffer */
export async function downloadMedia(fileToken: string): Promise<Buffer> {
  const token = await getTenantAccessToken();
  const res = await fetch(`${FEISHU_BASE}/drive/v1/medias/${fileToken}/download`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`附件下载失败 HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}
