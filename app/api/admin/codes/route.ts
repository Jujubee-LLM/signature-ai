import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createRedeemCode, createRedeemCodesBatch, listRedeemCodes } from '@/lib/quotaStore'

type CreateCodeBody = {
  code?: string
  credits?: number
  maxUses?: number
  count?: number
  codePrefix?: string
}

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') || '0'
  const limit = Number.parseInt(searchParams.get('limit') || '50', 10)

  try {
    const result = await listRedeemCodes(cursor, Number.isNaN(limit) ? 50 : limit)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '查询失败' }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  try {
    const body = (await req.json()) as CreateCodeBody
    const credits = Math.floor(body.credits || 0)
    const maxUses = body.maxUses ? Math.floor(body.maxUses) : 1
    const count = body.count ? Math.floor(body.count) : 1

    if (credits <= 0) {
      return NextResponse.json({ error: 'credits 必须大于 0' }, { status: 400 })
    }
    if (maxUses <= 0) {
      return NextResponse.json({ error: 'maxUses 必须大于 0' }, { status: 400 })
    }

    if (count > 1) {
      const items = await createRedeemCodesBatch({
        count,
        credits,
        maxUses,
        codePrefix: body.codePrefix,
      })
      return NextResponse.json({ items })
    }

    const item = await createRedeemCode({
      code: body.code,
      credits,
      maxUses,
      active: true,
    })
    return NextResponse.json({ item })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '创建失败' }, { status: 400 })
  }
}
