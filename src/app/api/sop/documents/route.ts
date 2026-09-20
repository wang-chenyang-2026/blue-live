import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isExternalRoleRequest } from '@/lib/api-permission';

// GET /api/sop/documents?doc_type=management|training|all&category=日常培训&brand=iQOO抖音&keyword=违规
// 权限：内部角色可见全部 published 文档；「外部合作」角色仅可见 visibility=general 的文档（本期数据全为 internal，故为空态）。
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const docType = searchParams.get('doc_type') || 'all';
    const category = searchParams.get('category') || '';
    const brand = searchParams.get('brand') || '';
    const keyword = searchParams.get('keyword') || '';

    const external = isExternalRoleRequest(request);

    const client = getSupabaseClient();
    let query = client
      .from('sop_documents')
      .select(
        'id, doc_type, title, category, applicable_post, applicable_brand, source_type, external_url, visibility, needs_quiz, status, version, created_at, updated_at'
      )
      .eq('status', 'published')
      .order('created_at', { ascending: true });

    if (external) {
      // 外部合作只能看通用可见文档，本期无，返回空
      query = query.eq('visibility', 'general');
    }

    if (docType && docType !== 'all') {
      query = query.eq('doc_type', docType);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (keyword) {
      query = query.ilike('title', `%${keyword}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    let docs = data || [];
    // applicable_brand 为 jsonb 数组，PostgREST 直接 contains 会因序列化报错，故在内存中做包含匹配（数据量小）
    if (brand) {
      docs = docs.filter((d) => Array.isArray(d.applicable_brand) && d.applicable_brand.includes(brand));
    }

    return NextResponse.json({ success: true, docs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}