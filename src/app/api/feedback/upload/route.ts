import { NextRequest, NextResponse } from 'next/server';
import { FEEDBACK_APP_TOKEN, uploadBitableAttachment } from '@/lib/feishu-bitable';

/** 单文件大小上限：图片 10MB，视频 100MB */
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 100 * 1024 * 1024;

/**
 * POST /api/feedback/upload  上传反馈附件（multipart/form-data，字段名 file）
 * 返回 { success, fileToken, name, size, type }
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: '未收到文件' }, { status: 400 });
    }

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      return NextResponse.json(
        { success: false, error: '仅支持上传截图（图片）或视频附件' },
        { status: 400 },
      );
    }
    const limit = isImage ? MAX_IMAGE : MAX_VIDEO;
    if (file.size > limit) {
      return NextResponse.json(
        { success: false, error: `文件过大：${isImage ? '图片' : '视频'}上限 ${Math.round(limit / 1024 / 1024)}MB` },
        { status: 400 },
      );
    }

    // 文件名安全处理：去除路径分隔符等特殊字符
    const safeName = file.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'attachment';
    const buffer = Buffer.from(await file.arrayBuffer());

    const fileToken = await uploadBitableAttachment(FEEDBACK_APP_TOKEN, {
      name: safeName,
      size: buffer.length,
      data: buffer,
      mime: file.type || 'application/octet-stream',
    });

    return NextResponse.json({
      success: true,
      fileToken,
      name: safeName,
      size: buffer.length,
      type: file.type,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
