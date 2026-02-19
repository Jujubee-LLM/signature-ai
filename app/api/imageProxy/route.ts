import { NextRequest, NextResponse } from 'next/server'
import { getImageHostPolicyHint, isAllowedImageHost } from '@/lib/imageHostPolicy'

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

  const srcUrl = new URL(src)
  if (!isAllowedImageHost(srcUrl.hostname)) {
    return NextResponse.json(
      {
        error: 'Image host is not allowed',
        host: srcUrl.hostname,
        allowed: getImageHostPolicyHint(),
      },
      { status: 403 }
    )
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
