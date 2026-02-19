import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { getQuotaSnapshot } from '@/lib/quotaStore'

export async function GET(
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

    const quota = await getQuotaSnapshot(userId)
    return NextResponse.json({ userId, quota })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '查询失败' }, { status: 400 })
  }
}
