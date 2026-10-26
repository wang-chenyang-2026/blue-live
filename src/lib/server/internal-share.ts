import "server-only";

/**
 * 敏感手机号常量（仅服务端可引用）。
 *
 * 顶部 `import "server-only"` 保证：一旦被任何客户端边（components / client pages）import，
 * 构建会立即报错，从而确保这些手机号字面量绝不会进入前端客户端 chunk。
 *
 * 只在 route handler / server-only 模块中 import（登录、通知、RBAC、feedback 路由等）。
 * 值优先读环境变量，缺失时用内置兜底，不阻断既有部署行为。
 */
export const SUPER_ADMIN_PHONE =
  process.env.SUPER_ADMIN_PHONE || "18333685049";

export const INTERNAL_SHARE_PHONE =
  process.env.INTERNAL_SHARE_PHONE || "29898110261";

export const INTERNAL_SHARE_NOTIFY_TARGET_PHONE =
  process.env.INTERNAL_SHARE_NOTIFY_TARGET_PHONE || "18333685049";