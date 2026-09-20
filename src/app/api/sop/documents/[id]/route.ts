import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isExternalRoleRequest } from '@/lib/api-permission';

// GET /api/sop/documents/[id]
// 权限：内部角色可查看任一 published 文档；「外部合作」仅可查看 visibility=general 的文档，否则 404。
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const external = isExternalRoleRequest(request);

    const client = getSupabaseClient();
    let query = client
      .from('sop_documents')
      .select(
        'id, doc_type, title, category, applicable_post, applicable_brand, source_type, external_url, visibility, needs_quiz, status, version, created_by, created_at, updated_at'
      )
      .eq('id', id)
      .eq('status', 'published');

    if (external) {
      query = query.eq('visibility', 'general');
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`查询失败: ${error.message}`);

    if (!data) {
      return NextResponse.json({ success: false, error: '文档不存在或无权访问' }, { status: 404 });
    }

    return NextResponse.json({ success: true, doc: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}