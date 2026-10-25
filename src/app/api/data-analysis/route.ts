import { NextRequest, NextResponse } from 'next/server';
import { analyze, allHosts, referenceToday } from './lib';
import { getRequestRole } from '@/lib/api-permission';

export const runtime = 'nodejs';

const ALLOWED_ROLES = new Set(['PM', '运营']);

/** 数据分析仅对 PM、运营开放；其余角色（含外部合作）一律 403 且不返回任何数据。 */
function requireDataAnalysisRole(req: NextRequest): NextResponse | null {
  const role = getRequestRole(req);
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json(
      { success: false, code: 'FORBIDDEN', error: '无权限访问数据分析' },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = requireDataAnalysisRole(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const start = sp.get('start') || undefined;
  const end = sp.get('end') || undefined;
  const host = sp.get('host') || undefined;
  const slot = sp.get('slot') || undefined;
  const data = analyze({ start, end, host, slot });
  return NextResponse.json({ success: true, data, hosts: allHosts(), today: referenceToday() });
}