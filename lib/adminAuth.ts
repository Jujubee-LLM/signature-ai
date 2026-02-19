import { NextRequest, NextResponse } from 'next/server'

function getAdminTokenFromRequest(req: NextRequest): string {
  const bearer = req.headers.get('authorization') || ''
  if (bearer.startsWith('Bearer ')) {
    return bearer.slice('Bearer '.length).trim()
  }
  return (req.headers.get('x-admin-token') || '').trim()
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  const expected = (process.env.ADMIN_API_TOKEN || '').trim()
  if (!expected) {
    return NextResponse.json(
      { error: 'ADMIN_API_TOKEN 未配置' },
      { status: 500 }
    )
  }

  const actual = getAdminTokenFromRequest(req)
  if (!actual || actual !== expected) {
    return NextResponse.json(
      { error: '管理员鉴权失败' },
      { status: 401 }
    )
  }

  return null
}
