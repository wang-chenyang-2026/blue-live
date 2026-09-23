// 表格（xlsx / xls / csv）服务端解析：仅在本服务可信上下文中解析不可信文件，控制内存。
// 产出结构化表格（供详情页表格化展示）与纯文本（供列表检索 + 自动摘要）。只在服务端调用。
import * as XLSX from 'xlsx';

export interface SheetTable {
  name: string;
  header: string[];
  rows: string[][];
  totalRows: number;
  shown: number;
  truncated: boolean;
}

export interface ParsedSheet {
  sheets: SheetTable[];
  text: string;
}

const MAX_SHEETS = 20;
const MAX_ROWS_PER_SHEET = 200;
const MAX_COLS = 50;
const TEXT_CAP = 200_000;

// 兼容编码：优先 UTF-8，非法序列则回退 GBK（常见老 Excel 导出的 CSV 编码），再兜底 latin1
export function decodeCsvBuffer(buf: Buffer): string {
  if (!buf || buf.length === 0) return '';
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8').replace(/^\uFEFF/, '');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return buf.toString('latin1');
    }
  }
}

function normalizeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\u0000/g, '').trim();
  return s;
}

// 解析单个 sheet 为结构化表（表头取首行；裁剪单元格；超支截断并标注总数）
function sheetToTable(name: string, aoa: unknown[][]): SheetTable {
  const effective = aoa;
  if (effective.length === 0) {
    return { name, header: [], rows: [], totalRows: 0, shown: 0, truncated: false };
  }
  const header = (effective[0] as unknown[]).slice(0, MAX_COLS).map(normalizeCell);
  let rows = effective.slice(1).map((r) => (r as unknown[]).slice(0, MAX_COLS).map(normalizeCell));
  const totalRows = rows.length;
  const truncated = totalRows > MAX_ROWS_PER_SHEET;
  if (truncated) rows = rows.slice(0, MAX_ROWS_PER_SHEET);
  // 空表（仅有表头或表头也空）：仍保留结构供展示
  return { name, header, rows, totalRows, shown: rows.length, truncated };
}

function sheetToText(t: SheetTable): string {
  const lines: string[] = [`【${t.name || '未命名'}】`];
  if (t.header.length) lines.push(`表头：${t.header.join('、')}`);
  t.rows.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.join('、')}`);
  });
  if (t.truncated) lines.push(`（共 ${t.totalRows} 行，基于前 ${t.shown} 行提取）`);
  return lines.join('\n');
}

export async function parseSheetFile(kind: string, buffer: Buffer, ext = ''): Promise<ParsedSheet> {
  let workbook: XLSX.WorkBook;
  try {
    if (ext.toLowerCase() === 'csv') {
      const text = decodeCsvBuffer(buffer);
      workbook = XLSX.read(text || '', { type: 'string', raw: false });
    } else {
      workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
    }
  } catch (e) {
    throw new Error(`表格解析失败：${e instanceof Error ? e.message : String(e)}`);
  }

  const names = (workbook.SheetNames || []).slice(0, MAX_SHEETS);
  const sheets: SheetTable[] = [];
  const textParts: string[] = [];
  for (const name of names) {
    const ws = workbook.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][];
    const t = sheetToTable(name, aoa);
    sheets.push(t);
    textParts.push(sheetToText(t));
  }

  return {
    sheets,
    text: textParts.join('\n\n').slice(0, TEXT_CAP),
  };
}