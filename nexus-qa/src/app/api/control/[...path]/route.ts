import { NextRequest, NextResponse } from 'next/server';

async function forwardRequest(
  request: NextRequest,
  path: string[],
): Promise<NextResponse> {
  const backendBase =
    process.env.NEXT_PUBLIC_CONTROL_API_URL ?? 'http://localhost:3001';
  const upstreamUrl = `${backendBase.replace(/\/$/, '')}/${path.join('/')}`;

  try {
    const init: RequestInit = {
      method: request.method,
      headers: {
        Accept: 'application/json',
        'Content-Type': request.headers.get('content-type') ?? 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.text();
    }

    const res = await fetch(upstreamUrl, init);
    const text = await res.text();

    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json(
      { error: 'control_plane_unavailable' },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return forwardRequest(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return forwardRequest(request, path);
}
