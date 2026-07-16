/**
 * Supabase 客户端统一入口
 *
 * 本模块对 `src/storage/database/supabase-client` 做了业务层的薄封装：
 * - 仅暴露 `supabaseAdmin()` 与 `supabase(userToken)` 两个函数
 * - 默认使用 service role key（后端 API 路由中绕过 RLS），供 API 路由调用
 * - 环境变量由 sandbox 自动注入：COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY / COZE_SUPABASE_SERVICE_ROLE_KEY
 *
 * 使用方式（服务端 API 路由）：
 * ```ts
 * import { supabaseAdmin } from '@/lib/supabase';
 * const db = supabaseAdmin();
 * const { data, error } = await db.from('users').select('*');
 * ```
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 后端专用 Supabase 客户端（使用 service_role_key，绕过 RLS）
 * ⚠️ 仅在 Next.js API 路由 / Server Component / Server Action 中使用，切勿在浏览器端调用
 */
export function supabaseAdmin(): SupabaseClient {
  return getSupabaseClient();
}

/**
 * 带用户 token 的 Supabase 客户端（使用 anon_key，遵循 RLS）
 * 可用于需要按当前登录用户身份访问数据的场景
 */
export function supabase(userToken: string): SupabaseClient {
  return getSupabaseClient(userToken);
}
