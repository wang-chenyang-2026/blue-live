import { PDFDocument } from 'pdf-lib';

// 仅对 jpg/jpeg/png 可无损嵌入 PDF；其它位图格式（gif/webp/bmp/svg）不在此列，保留原图内联。
export const PDF_EMBED_EXTS = new Set(['jpg', 'jpeg', 'png']);

export function isEmbeddableImageExt(ext?: string): boolean {
  return !!ext && PDF_EMBED_EXTS.has(ext.toLowerCase());
}

export interface ConvertibleImage {
  buffer: Buffer;
  mime: string; // image/jpeg | image/png
}

// 单张/多张图片合成 PDF。
// 页面尺寸按 72dpi 换算：1px = 0.75pt，图片铺满页面、不留白边。
export async function buildImagesPdf(images: ConvertibleImage[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const img of images) {
    let embed;
    if (img.mime === 'image/png') {
      embed = await doc.embedPng(img.buffer);
    } else {
      embed = await doc.embedJpg(img.buffer);
    }
    const { width, height } = embed.scale(1); // embed.width/height 单位为图像像素
    const page = doc.addPage([width * 0.75, height * 0.75]);
    page.drawImage(embed, { x: 0, y: 0, width: width * 0.75, height: height * 0.75 });
  }
  return Buffer.from(await doc.save());
}