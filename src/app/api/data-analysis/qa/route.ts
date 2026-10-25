import { NextRequest, NextResponse } from 'next/server';
import { answerQuestion } from '../lib';
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

export async function POST(req: NextRequest) {
  const denied = requireDataAnalysisRole(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const q = typeof body?.q === 'string' ? body.q : '';
    if (!q.trim()) {
      return NextResponse.json({ success: true, answer: answerQuestion('') });
    }
    return NextResponse.json({ success: true, answer: answerQuestion(q) });
  } catch {
    return NextResponse.json({ success: false, answer: answerQuestion('') }, { status: 400 });
  }
}