import { NextRequest, NextResponse } from 'next/server'
import { getQuotaSnapshot } from '@/lib/quotaStore'
import { applyUserCookie, getOrCreateUserSession } from '@/lib/userSession'

export async function GET(req: NextRequest) {
  const session = getOrCreateUserSession(req)
  try {
    const quota = await getQuotaSnapshot(session.userId)
    const response = NextResponse.json({ quota })
    applyUserCookie(response, session)
    return response
  } catch (err) {
    console.error('quota status error:', err)
    const response = NextResponse.json({
      quota: {
        freeRemaining: 0,
        paidRemaining: 0,
        totalRemaining: 0,
      },
      quotaUnavailable: true,
      error: '额度服务暂时不可用，请稍后重试。',
    })
    applyUserCookie(response, session)
    return response
  }
}
