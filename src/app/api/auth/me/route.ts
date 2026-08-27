import { NextRequest, NextResponse } from "next/server";
import { verifyToken, AUTH_COOKIE_NAME } from "@/lib/auth-token";

export const runtime = "nodejs";

/**
 * GET /api/auth/me
 * 用于前端在加载时校验 httpOnly cookie 中的 JWT 是否有效。
 * 若有效，返回用户基本信息；无效返回 401。
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, error: "未登录", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json(
      { success: false, error: "登录已过期", code: "TOKEN_EXPIRED" },
      { status: 401 },
    );
  }
  return NextResponse.json({
    success: true,
    user: {
      id: payload.userId,
      phone: payload.phone,
      role: payload.role,
      name: payload.name || "",
    },
  });
}
