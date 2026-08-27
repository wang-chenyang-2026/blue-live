/**
 * 全局 fetch 拦截：
 * - 当 /api/* 请求返回 401 时，认为 cookie/JWT 已失效，清除本地登录态并跳转 /login
 * - 仅在浏览器环境生效
 *
 * 在 AppProvider 顶部 import 一次即可。
 */

let installed = false;

export function installApiInterceptor() {
  if (installed) return;
  if (typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);

    // 只拦截 /api/* 业务接口的 401
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (response.status === 401 && url.includes('/api/')) {
      try {
        const clone = response.clone();
        const body = await clone.json().catch(() => null);
        const code = body?.code;
        if (code === 'UNAUTHORIZED' || code === 'TOKEN_EXPIRED') {
          // 登录接口本身 401 不重定向（让页面展示错误）
          if (!url.includes('/api/auth/login')) {
            handleAuthLost();
          }
        }
      } catch {
        // ignore
      }
    }
    return response;
  };
}

function handleAuthLost() {
  try {
    // 清掉本地登录态（与 src/lib/store.ts 中的 AUTH_KEY 一致）
    localStorage.removeItem('lm_auth');
    localStorage.removeItem('lm_app_state');
  } catch {
    // ignore
  }
  // 避免在登录页重复跳转
  if (!window.location.pathname.startsWith('/login')) {
    window.location.replace('/login');
  }
}
