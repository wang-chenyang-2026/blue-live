import { randomUUID } from 'crypto';

// 白名单：扩展名（小写，去点）+ 对应 file_kind/mime
const EXT_MAP: Record<string, { kind: string; mime: string }> = {
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  doc: { kind: 'word', mime: 'application/msword' },
  docx: { kind: 'word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  ppt: { kind: 'ppt', mime: 'application/vnd.ms-powerpoint' },
  pptx: { kind: 'ppt', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  txt: { kind: 'text', mime: 'text/plain' },
  md: { kind: 'text', mime: 'text/markdown' },
  png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  gif: { kind: 'image', mime: 'image/gif' },
  webp: { kind: 'image', mime: 'image/webp' },
  bmp: { kind: 'image', mime: 'image/bmp' },
  svg: { kind: 'image', mime: 'image/svg+xml' },
};

export interface FileSniff {
  ok: boolean;
  reason?: string;
  ext?: string;
  kind?: string;
  mime?: string;
}

// 扩展名 + 魔数双重校验，防伪装
export function sniffFile(fileName: string, mime: string, head: Buffer): FileSniff {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const entry = EXT_MAP[ext];
  if (!entry) return { ok: false, reason: `不支持的文件类型: .${ext || '未知'}` };

  const size = head.length;
  const magicOk =
    (entry.kind === 'pdf' && (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)) || // %PDF
    (entry.kind === 'image' && ext !== 'svg' && size > 0) || // 常见图片交由 mime/client 加载
    (entry.kind === 'image' && ext === 'svg' && head.toString('latin1').includes('<svg')) ||
    (ext === 'docx' && head.toString('latin1').includes('PK')) ||
    (ext === 'pptx' && head.toString('latin1', 0, Math.min(4, size)).includes('PK')) ||
    (ext === 'doc' && (head.toString('latin1', 0, 8).includes('D0 CF') || head.toString('latin1', 0, 256).includes('W0rd'))) ||
    (ext === 'ppt' && (head.toString('latin1', 0, 8).includes('D0 CF') || head.toString('latin1', 0, 256).includes('PPT'))) ||
    (entry.kind === 'text');

  if (!magicOk) {
    // 容忍很短的文本/空文件
    if (entry.kind === 'text' && size < 64) {
      return { ok: true, ext, kind: entry.kind, mime: entry.mime };
    }
    return { ok: false, reason: `文件内容与扩展名不匹配` };
  }

  return { ok: true, ext, kind: entry.kind, mime: entry.mime };
}

export const MAX_DOC_BYTES = 30 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// 文本提取：PDF/docx/pptx/txt/md；old doc/ppt 尽力解析；图片不 OCR（返回空）
export async function extractFileText(kind: string, buffer: Buffer): Promise<string> {
  if (kind === 'image') return '';
  try {
    switch (kind) {
      case 'pdf': {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return normalize((data?.text || '') as string);
      }
      case 'word': {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mammoth = require('mammoth');
        const r = await mammoth.extractRawText({ buffer });
        return normalize((r?.value || '') as string);
      }
      case 'ppt': {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(buffer);
        const texts: string[] = [];
        const slideFiles = Object.keys(zip.files)
          .filter((f) => /ppt\/slides\/slide\d+\.xml$/i.test(f))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        for (const f of slideFiles) {
          const xml = await zip.file(f)?.async('text');
          if (!xml) continue;
          const t = xml
            .replace(/<a:t>([\s\S]*?)<\/a:t>/g, '$1')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (t) texts.push(t);
        }
        return normalize(texts.join('\n'));
      }
      case 'text': {
        return buffer.toString('utf8').replace(/^\uFEFF/, '');
      }
      default:
        return '';
    }
  } catch (e) {
    // 老 doc/ppt 二进制或损坏文件：尽力提取 ASCII，失败返回空
    const s = buffer.toString('latin1');
    const filtered = s.replace(/[^\x20-\x7E\u4e00-\u9fa5\n]/g, ' ').replace(/\s{3,}/g, '\n');
    return normalize(filtered.slice(0, 20000));
  }
}

function normalize(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 200_000);
}