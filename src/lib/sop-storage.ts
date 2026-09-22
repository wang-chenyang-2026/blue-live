import { randomUUID } from 'crypto';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const BUCKET = 'sop-files';

const SAFE_RE = /[^\w.()-]/g;

function sanitizeName(name: string): string {
  const base = String(name ?? 'file').split(/[\\/]/).pop() || 'file';
  return base.replace(SAFE_RE, '_').slice(0, 120);
}

export async function ensureSopBucket(): Promise<void> {
  const sb = getSupabaseClient().storage;
  const { data } = await sb.getBucket(BUCKET);
  if (!data) {
    await sb.createBucket(BUCKET, { public: false, fileSizeLimit: 40_000_000 });
  }
}

// 返回对象 object key
export async function uploadSopFile(
  buffer: Buffer,
  fileName: string,
  mime: string,
): Promise<string> {
  const key = `${randomUUID().slice(0, 8).toLowerCase()}/${sanitizeName(fileName)}`;
  const { error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .upload(key, buffer, { contentType: mime || 'application/octet-stream', cacheControl: '3600' });
  if (error) throw new Error(`对象存储上传失败: ${error.message}`);
  return key;
}

export async function deleteSopFile(key?: string | null): Promise<void> {
  if (!key) return;
  await getSupabaseClient().storage.from(BUCKET).remove([key]);
}

// 短时签名 URL（默认 10 分钟），便于文档页直连展示
export async function sopFileSignedUrl(
  key: string,
  expiresIn = 600,
): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .createSignedUrl(key, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

// 直接把文件下发为下载（新窗口打开二进制），用于 Word/PPT/PDF 的「下载原文件」
export async function sopFileDownloadUrl(key: string): Promise<string | null> {
  return sopFileSignedUrl(key, 600);
}