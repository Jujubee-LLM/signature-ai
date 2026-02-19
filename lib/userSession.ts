import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

const USER_COOKIE_NAME = 'signify_uid'

export type UserSession = {
  userId: string
  shouldSetCookie: boolean
}

function isValidUserId(value: string | undefined): value is string {
  if (!value) return false
  return value.length >= 16 && value.length <= 128
}

export function getOrCreateUserSession(req: NextRequest): UserSession {
  const existing = req.cookies.get(USER_COOKIE_NAME)?.value
  if (isValidUserId(existing)) {
    return {
      userId: existing,
      shouldSetCookie: false,
    }
  }

  return {
    userId: randomUUID(),
    shouldSetCookie: true,
  }
}

export function applyUserCookie(res: NextResponse, session: UserSession) {
  if (!session.shouldSetCookie) return
  res.cookies.set({
    name: USER_COOKIE_NAME,
    value: session.userId,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 180,
    path: '/',
  })
}
