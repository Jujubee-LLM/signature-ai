import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { getRedeemCode, setRedeemCodeActive } from '@/lib/quotaStore'

type PatchBody = {
  active?: boolean
}

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  try {
    const code = decodeURIComponent(params.code || '')
    const item = await getRedeemCode(code)
    if (!item) {
      return NextResponse.json({ error: '兑换码不存在' }, { status: 404 })
    }
    return NextResponse.json({ item })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '查询失败' }, { status: 400 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  try {
    const code = decodeURIComponent(params.code || '')
    const body = (await req.json()) as PatchBody

    if (typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'active 必须是 boolean' }, { status: 400 })
    }

    const item = await setRedeemCodeActive(code, body.active)
    return NextResponse.json({ item })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '更新失败' }, { status: 400 })
  }
}
