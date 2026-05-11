import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy route: /api/proxy/[...path]
 *
 * Forwards requests to the backend API. Used by demo pages so Playwright can
 * intercept /api/proxy/* routes without CORS issues.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const backendBase =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
  const upstreamUrl = `${backendBase}/${path.join('/')}`;

  try {
    const res = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
