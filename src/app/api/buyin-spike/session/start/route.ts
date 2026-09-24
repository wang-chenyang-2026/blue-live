import { startSession } from '@/lib/buyin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { sessionId, image, shotMode, status } = await startSession();
    return Response.json({ ok: true, sessionId, image, status, debug: { shotMode } });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, status: 'error', failedStep: 'start', error });
  }
}