import { NextRequest, NextResponse } from 'next/server'
import { redeemCodeForUser } from '@/lib/quotaStore'
import { applyUserCookie, getOrCreateUserSession } from '@/lib/userSession'

type Body = {
  code?: string
}

export async function POST(req: NextRequest) {
  const session = getOrCreateUserSession(req)

  try {
    const body = (await req.json()) as Body
    const code = (body.code || '').trim()
    const result = await redeemCodeForUser(session.userId, code)

    if (!result.ok) {
      const response = NextResponse.json(
        {
          error: result.error || '兑换失败',
          quota: result.quota,
        },
        { status: 400 }
      )
      applyUserCookie(response, session)
      return response
    }

    const response = NextResponse.json({
      ok: true,
      quota: result.quota,
    })
    applyUserCookie(response, session)
    return response
  } catch {
    const response = NextResponse.json({ error: '无效请求' }, { status: 400 })
    applyUserCookie(response, session)
    return response
  }
}
