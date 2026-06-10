import { NextRequest, NextResponse } from 'next/server';

async function forwardRequest(
  request: NextRequest,
  path: string[],
): Promise<NextResponse> {
  const backendBase =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
  const upstreamUrl = new URL(`${backendBase.replace(/\/$/, '')}/${path.join('/')}`);
  upstreamUrl.search = request.nextUrl.search;
  const timeoutMs = request.method === 'GET' || request.method === 'HEAD' ? 30_000 : 180_000;

  try {
    const headers: HeadersInit = { Accept: request.headers.get('accept') ?? 'application/json' };
    const contentType = request.headers.get('content-type');
    if (contentType) headers['Content-Type'] = contentType;

    const init: RequestInit = {
      method: request.method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.arrayBuffer();
    }

    const res = await fetch(upstreamUrl, {
      ...init,
    });
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}

async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return forwardRequest(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
