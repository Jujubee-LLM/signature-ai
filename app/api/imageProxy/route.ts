import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const src = (req.nextUrl.searchParams.get('src') || '').trim()
  if (!src || !isValidHttpUrl(src)) {
    return NextResponse.json({ error: 'Invalid image src' }, { status: 400 })
  }

  try {
    const upstream = await fetch(src, {
      method: 'GET',
      cache: 'no-store',
    })

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Image upstream failed: ${upstream.status}` },
        { status: 502 }
      )
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'image/png',
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Image proxy failed' }, { status: 502 })
  }
}
