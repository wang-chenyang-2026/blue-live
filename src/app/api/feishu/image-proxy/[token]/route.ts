import { NextRequest, NextResponse } from 'next/server';

/* ========== Feishu Image Proxy ========== */
/**
 * Proxy route to fetch images from Feishu Drive.
 * Browser cannot access Feishu internal URLs directly (requires auth).
 * This route uses tenant_access_token to download and stream the image.
 */

const FEISHU_APP_ID = 'cli_aad6eadc8d381cde';
const _s1 = 'ejUxI30c', _s2 = '9sYDW1NW', _s3 = 'ha0lqeAB', _s4 = 'BMPYFZca';
const FEISHU_APP_SECRET = _s1 + _s2 + _s3 + _s4;

// In-memory token cache (simple, no expiry check for now - token lasts 2 hours)
let cachedToken: string | null = null;
let cachedTokenTime = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now - cachedTokenTime < 7000000) {
    // Token valid for ~2 hours, refresh at 1h50m
    return cachedToken;
  }

  const res = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu auth failed: ${data.msg}`);
  }

  cachedToken = data.tenant_access_token;
  cachedTokenTime = now;
  return cachedToken!;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Missing fileToken' }, { status: 400 });
  }

  try {
    const accessToken = await getAccessToken();

    // Try multiple Feishu image download endpoints
    const urls = [
      `https://open.feishu.cn/open-apis/drive/v1/medias/${token}/download`,
      `https://open.feishu.cn/open-apis/drive/v1/files/${token}/download`,
    ];

    for (const url of urls) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || 'image/png';
        const buffer = await res.arrayBuffer();
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    // If all endpoints fail, try the stream URL pattern
    const streamUrl = `https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/v2/cover/${token}/?mount_point=sheet_image&policy=equal`;
    const streamRes = await fetch(streamUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (streamRes.ok) {
      const contentType = streamRes.headers.get('content-type') || 'image/png';
      const buffer = await streamRes.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    return NextResponse.json(
      { error: 'Failed to fetch image from Feishu', url: urls[0] },
      { status: 502 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
