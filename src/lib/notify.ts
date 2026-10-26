import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface ApiNotification {
  id: string;
  target_phone: string;
  kind: string;
  title: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

/** 写入一条站内通知。 */
export async function insertNotification(input: {
  targetPhone: string;
  kind: string;
  title: string;
  content: string;
}): Promise<void> {
  try {
    await getSupabaseClient()
      .from('notifications')
      .insert({
        target_phone: input.targetPhone,
        kind: input.kind,
        title: input.title,
        content: input.content,
        is_read: false,
      });
  } catch (err) {
    // 通知失败不应影响登录主流程
    console.error('[notify] insert failed:', err);
  }
}

/** 拉取某手机号的未读通知（按时间倒序）。 */
export async function getUnreadNotifications(phone: string): Promise<ApiNotification[]> {
  const { data, error } = await getSupabaseClient()
    .from('notifications')
    .select('id, target_phone, kind, title, content, is_read, created_at')
    .eq('target_phone', phone)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`查询通知失败: ${error.message}`);
  return (data || []) as unknown as ApiNotification[];
}

/** 将某手机号的全部通知标记为已读。 */
export async function markAllNotificationsRead(phone: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('target_phone', phone)
    .eq('is_read', false);
  if (error) throw new Error(`标记通知失败: ${error.message}`);
}