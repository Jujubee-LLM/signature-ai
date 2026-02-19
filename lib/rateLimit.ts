import { NextRequest, NextResponse } from 'next/server'

/**
 * 限流记录接口
 */
interface RateLimitRecord {
  minuteWindow: number // 分钟窗口的时间戳
  dailyRequests: number[] // 24 小时内的请求时间戳数组
}

/**
 * 纯内存限流存储
 * Key: IP 地址
 * Value: 限流记录
 */
const rateLimitStore = new Map<string, RateLimitRecord>()

/**
 * 限流配置
 */
const RATE_LIMIT_CONFIG = {
  PER_MINUTE: 2, // 每分钟最多 2 次请求
  PER_DAY: 5, // 每 24 小时最多 5 次请求
  MINUTE_WINDOW_MS: 60 * 1000, // 1 分钟的毫秒数
  DAY_WINDOW_MS: 24 * 60 * 60 * 1000, // 24 小时的毫秒数
}

/**
 * 从请求中获取客户端 IP 地址
 */
function getClientIP(req: NextRequest): string {
  // 尝试从各种 header 中获取真实 IP
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  // 兜底使用 Next.js 的 IP（可能是 IPv6 格式）
  return req.ip || 'unknown'
}

/**
 * 清理过期的请求记录（定期执行，避免内存泄漏）
 */
function cleanupExpiredRecords() {
  const now = Date.now()
  const dayWindow = RATE_LIMIT_CONFIG.DAY_WINDOW_MS

  for (const [ip, record] of rateLimitStore.entries()) {
    // 过滤掉 24 小时之外的请求记录
    record.dailyRequests = record.dailyRequests.filter(
      (timestamp) => now - timestamp < dayWindow
    )

    // 如果该 IP 没有任何请求记录，删除该条目
    if (record.dailyRequests.length === 0) {
      rateLimitStore.delete(ip)
    }
  }
}

/**
 * 每 5 分钟清理一次过期记录
 */
setInterval(cleanupExpiredRecords, 5 * 60 * 1000)

/**
 * 检查限流并返回是否允许请求
 * @param req Next.js 请求对象
 * @returns 如果被限流，返回 429 响应；否则返回 null
 */
export function checkRateLimit(req: NextRequest): NextResponse | null {
  const ip = getClientIP(req)
  const now = Date.now()

  // 获取或创建该 IP 的记录
  let record = rateLimitStore.get(ip)
  if (!record) {
    record = {
      minuteWindow: 0,
      dailyRequests: [],
    }
    rateLimitStore.set(ip, record)
  }

  // === 1. 检查每日限流 ===
  // 先清理 24 小时之外的请求
  record.dailyRequests = record.dailyRequests.filter(
    (timestamp) => now - timestamp < RATE_LIMIT_CONFIG.DAY_WINDOW_MS
  )

  if (record.dailyRequests.length >= RATE_LIMIT_CONFIG.PER_DAY) {
    // 24 小时内已达到限制
    return NextResponse.json(
      { error: '您24小时内生成签名数已超过限制' },
      { status: 429 }
    )
  }

  // === 2. 检查每分钟限流 ===
  // 统计最近 1 分钟内的请求次数
  const recentRequests = record.dailyRequests.filter(
    (timestamp) => now - timestamp < RATE_LIMIT_CONFIG.MINUTE_WINDOW_MS
  )

  if (recentRequests.length >= RATE_LIMIT_CONFIG.PER_MINUTE) {
    // 1 分钟内已达到限制
    return NextResponse.json(
      { error: '请勿频繁操作' },
      { status: 429 }
    )
  }

  // === 3. 允许请求，更新记录 ===
  record.dailyRequests.push(now) // 添加本次请求时间戳

  return null // 返回 null 表示允许通过
}
