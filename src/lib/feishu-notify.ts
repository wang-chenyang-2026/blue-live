/**
 * 飞书消息通知工具
 * 用于向管理员发送系统事件通知（如新用户注册、审批提醒等）
 */

const APP_ID = process.env.FEISHU_APP_ID || 'cli_aad6eadc8d381cde';
const APP_SECRET = process.env.FEISHU_APP_SECRET || 'ejUxI30c9sYDW1NWha0lqeABBMPYFZca';

// 管理员 open_id（王晨阳）
const ADMIN_OPEN_ID = 'ou_e2c05e4384132feffc5d9de02496ca1b';

interface TenantTokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TenantTokenCache | null = null;

/**
 * 获取 tenant_access_token（带缓存，过期前 5 分钟刷新）
 */
async function getTenantToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 300_000) {
    return tokenCache.token;
  }

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书获取 token 失败: ${data.msg}`);
  }

  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire || 7200) * 1000,
  };

  return tokenCache.token;
}

/**
 * 发送飞书消息给管理员
 */
export async function notifyAdmin(content: { title: string; fields: { label: string; value: string }[] }): Promise<void> {
  try {
    const token = await getTenantToken();

    // 构造卡片消息
    const fieldText = content.fields
      .map(f => `**${f.label}：** ${f.value}`)
      .join('\n');

    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    const body = {
      receive_id: ADMIN_OPEN_ID,
      msg_type: 'interactive',
      content: JSON.stringify({
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: content.title },
          template: 'blue',
        },
        elements: [
          {
            tag: 'div',
            text: { tag: 'lark_md', content: fieldText },
          },
          { tag: 'hr' },
          {
            tag: 'note',
            elements: [
              { tag: 'plain_text', content: `Blue直播管理系统 · ${now}` },
            ],
          },
        ],
      }),
    };

    const res = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.code !== 0) {
      console.error('飞书通知发送失败:', data.msg);
    }
  } catch (err) {
    // 通知失败不应阻塞注册流程
    console.error('飞书通知异常:', err);
  }
}

/**
 * 新用户注册通知
 */
export async function notifyNewRegistration(user: {
  name: string;
  phone: string;
  role: string;
  brand: string;
}): Promise<void> {
  const roleMap: Record<string, string> = {
    anchor: '主播',
    operator: '运营',
    PM: '项目管理',
  };

  await notifyAdmin({
    title: '📋 新用户注册待审批',
    fields: [
      { label: '姓名', value: user.name },
      { label: '手机号', value: user.phone },
      { label: '申请岗位', value: roleMap[user.role] || user.role },
      { label: '申请项目', value: user.brand || '未指定' },
    ],
  });
}
