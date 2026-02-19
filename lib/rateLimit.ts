import { NextRequest, NextResponse } from 'next/server'
import { getRedisClient } from '@/lib/redisClient'

const KEY_PREFIX = process.env.REDIS_KEY_PREFIX?.trim() || 'signify'

function readLimit(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim()
  const parsed = Number.parseInt(raw || String(fallback), 10)
  if (Number.isNaN(parsed) || parsed <= 0) return fallback
  return parsed
}

const PER_MINUTE = readLimit('RATE_LIMIT_PER_MINUTE', 20)
const PER_DAY = readLimit('RATE_LIMIT_PER_DAY', 200)

function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()

  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  return req.ip || 'unknown'
}

function hashIdentity(userId: string, ip: string): string {
  return `${userId}:${ip}`
}

function minuteWindowKey(identity: string): string {
  const minuteSlot = Math.floor(Date.now() / 60000)
  return `${KEY_PREFIX}:rl:minute:${identity}:${minuteSlot}`
}

function dayWindowKey(identity: string): string {
  const daySlot = Math.floor(Date.now() / 86400000)
  return `${KEY_PREFIX}:rl:day:${identity}:${daySlot}`
}

async function incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
  const redis = await getRedisClient()
  const current = await redis.incr(key)
  if (current === 1) {
    await redis.expire(key, ttlSeconds)
  }
  return current
}

export async function checkRateLimit(
  req: NextRequest,
  userId: string
): Promise<NextResponse | null> {
  const ip = getClientIP(req)
  const identity = hashIdentity(userId, ip)

  try {
    const [minuteCount, dayCount] = await Promise.all([
      incrementWithTtl(minuteWindowKey(identity), 70),
      incrementWithTtl(dayWindowKey(identity), 60 * 60 * 24 + 120),
    ])

    if (dayCount > PER_DAY) {
      return NextResponse.json(
        { error: '您24小时内请求次数已超过限制，请稍后再试。' },
        { status: 429 }
      )
    }

    if (minuteCount > PER_MINUTE) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试。' },
        { status: 429 }
      )
    }

    return null
  } catch (err) {
    console.error('Rate limit unavailable, allowing request:', err)
    return null
  }
}
