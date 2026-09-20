/**
 * SOP v2 异步提炼执行器：上传/编辑后后台对单篇文档执行
 * 抓取正文 → AI 提炼 → 写回 ai_summary / ai_keypoints / ai_status。
 * 任何一步失败均降级为 failed，绝不伪造内容。
 */
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { fetchFeishuDocBody, refineDocument } from '@/lib/sop-ai';

export async function runSopRefine(docId: string, manualKeypoints?: string[]): Promise<void> {
  const client = getSupabaseClient();

  const setStatus = async (patch: Record<string, unknown>) => {
    await client.from('sop_documents').update(patch).eq('id', docId);
  };

  try {
    await setStatus({ ai_status: 'processing', ai_error: null });

    const { data: doc } = await client
      .from('sop_documents')
      .select('title, external_url, source_type')
      .eq('id', docId)
      .maybeSingle();
    if (!doc) throw new Error('文档不存在');

    const url = doc.external_url || '';
    let body = '';
    if (doc.source_type === 'feishu') {
      try {
        body = await fetchFeishuDocBody(url);
      } catch {
        // 飞书正文抓不到不致命，落入下方提炼失败路径并写明原因
        body = '';
      }
    }
    if (!body) body = ''; // 腾讯链接/飞书不可读 → 无正文

    const result = await refineDocument(body);
    await setStatus({
      ai_summary: result.summary,
      ai_keypoints: result.keypoints,
      ai_status: 'done',
      ai_error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const manual = (manualKeypoints ?? []).filter(Boolean);
    await setStatus({
      ai_keypoints: manual.length ? manual : null,
      ai_status: 'failed',
      ai_error: message,
    });
  }
}