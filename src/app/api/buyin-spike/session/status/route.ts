import { getSessionStatus } from '@/lib/buyin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get('sessionId') || '';
  try {
    const s = await getSessionStatus(sessionId);
    return Response.json({ ...s, sessionId });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, status: 'error', sessionId, error });
  }
}