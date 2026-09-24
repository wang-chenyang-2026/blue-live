import { cancelSession } from '@/lib/buyin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as { sessionId?: string });
  const sessionId = body.sessionId || '';
  try {
    const r = await cancelSession(sessionId);
    return Response.json({ ...r, sessionId });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, status: 'error', sessionId, error });
  }
}