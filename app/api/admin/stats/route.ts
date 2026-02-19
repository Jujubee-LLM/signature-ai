import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { getAdminStats } from '@/lib/quotaStore'

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  try {
    const stats = await getAdminStats()
    return NextResponse.json({ stats })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '查询失败' }, { status: 400 })
  }
}
