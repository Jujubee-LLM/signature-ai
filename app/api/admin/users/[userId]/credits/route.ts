import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { grantPaidCredits } from '@/lib/quotaStore'

type Body = {
  credits?: number
}

export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  try {
    const userId = decodeURIComponent(params.userId || '').trim()
    if (!userId) {
      return NextResponse.json({ error: 'userId 不能为空' }, { status: 400 })
    }

    const body = (await req.json()) as Body
    const credits = Math.floor(body.credits || 0)
    if (credits <= 0) {
      return NextResponse.json({ error: 'credits 必须大于 0' }, { status: 400 })
    }

    const quota = await grantPaidCredits(userId, credits)
    return NextResponse.json({ userId, quota })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '充值失败' }, { status: 400 })
  }
}
