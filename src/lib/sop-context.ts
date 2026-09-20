/**
 * SOP v2 服务端上下文助手：
 * - 由 middleware 注入的用户头（phone / role / id / name）解析会话身份
 * - 按 users.brand 查内部角色可见业务域（middleware 不注入 brand，需查库）
 * - 外部合作 / 内部角色的可见域与上传权限判定
 */
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getRequestRole, isExternalRoleRequest } from '@/lib/api-permission';
import { Scope, canUpload, visibleScopes } from '@/lib/sop-taxonomy';

export interface SopUserContext {
  userId: string | null;
  phone: string | null;
  name: string;
  role: string;
  brand: string | null;
  isExternal: boolean;
  canUpload: boolean;
  scopes: Scope[];
}

export async function getSopUserContext(request: NextRequest): Promise<SopUserContext> {
  const phone = request.headers.get('x-user-phone');
  const userId = request.headers.get('x-user-id');
  const name = decodeURIComponentSafe(request.headers.get('x-user-name') || '');
  const role = getRequestRole(request);
  const isExternal = isExternalRoleRequest(request);

  let brand: string | null = null;
  if (phone && !isExternal) {
    try {
      const { data } = await getSupabaseClient()
        .from('users')
        .select('brand')
        .eq('phone', phone)
        .maybeSingle();
      brand = data?.brand ?? null;
    } catch {
      brand = null;
    }
  }

  if (isExternal) {
    return { userId, phone, name, role, brand: null, isExternal: true, canUpload: false, scopes: [] };
  }

  return {
    userId,
    phone,
    name,
    role,
    brand,
    isExternal: false,
    canUpload: canUpload(role),
    scopes: visibleScopes(role, brand),
  };
}

function decodeURIComponentSafe(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}