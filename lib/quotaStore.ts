import { getRedisClient } from '@/lib/redisClient'
import { randomBytes } from 'crypto'

const FREE_QUOTA_LIMIT = 8
const KEY_PREFIX = process.env.REDIS_KEY_PREFIX?.trim() || 'signify'

export type QuotaSnapshot = {
  freeRemaining: number
  paidRemaining: number
  totalRemaining: number
}

export type ConsumptionResult = {
  allowed: boolean
  consumedFrom?: 'free' | 'paid'
  quota: QuotaSnapshot
}

export type RedeemResult = {
  ok: boolean
  error?: string
  quota: QuotaSnapshot
}

export type RedeemCodeRecord = {
  code: string
  credits: number
  maxUses: number
  usedCount: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export type AdminCodeListResult = {
  items: RedeemCodeRecord[]
  nextCursor: string
}

export type AdminStats = {
  codeCount: number
  activeCodeCount: number
  exhaustedCodeCount: number
  userCount: number
  totalPaidCredits: number
}

function normalizeCode(rawCode: string): string {
  return rawCode.trim().toUpperCase()
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseSeedCodeList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => normalizeCode(item))
    .filter(Boolean)
}

function userKey(userId: string): string {
  return `${KEY_PREFIX}:user:${userId}`
}

function userRedeemSetKey(userId: string): string {
  return `${KEY_PREFIX}:user:${userId}:codes`
}

function codeKey(code: string): string {
  return `${KEY_PREFIX}:code:${code}`
}

function codePattern(): string {
  return `${KEY_PREFIX}:code:*`
}

function userPattern(): string {
  return `${KEY_PREFIX}:user:*`
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (Number.isNaN(parsed)) return fallback
  return parsed
}

function isTruthy(value: unknown): boolean {
  return String(value ?? '') === '1'
}

function fromCodeHash(code: string, values: Array<string | null>): RedeemCodeRecord {
  return {
    code,
    credits: toInt(values[0]),
    maxUses: toInt(values[1]),
    usedCount: toInt(values[2]),
    active: isTruthy(values[3]),
    createdAt: values[4] || '',
    updatedAt: values[5] || '',
  }
}

function snapshotFromValues(freeUsed: number, paidCredits: number): QuotaSnapshot {
  const freeRemaining = Math.max(0, FREE_QUOTA_LIMIT - freeUsed)
  const paidRemaining = Math.max(0, paidCredits)
  return {
    freeRemaining,
    paidRemaining,
    totalRemaining: freeRemaining + paidRemaining,
  }
}

let initialized = false

async function seedCodesFromEnv() {
  const redis = await getRedisClient()
  const seeds: Array<{ credits: number; codes: string[] }> = [
    { credits: 5, codes: parseSeedCodeList(process.env.REDEEM_CODES_5) },
    { credits: 10, codes: parseSeedCodeList(process.env.REDEEM_CODES_10) },
    { credits: 20, codes: parseSeedCodeList(process.env.REDEEM_CODES_20) },
  ]

  for (const seed of seeds) {
    for (const code of seed.codes) {
      const key = codeKey(code)
      const exists = await redis.exists(key)
      if (exists) continue

      const ts = nowIso()
      await redis.hSet(key, {
        code,
        credits: String(seed.credits),
        maxUses: '1',
        usedCount: '0',
        active: '1',
        createdAt: ts,
        updatedAt: ts,
      })
    }
  }
}

async function ensureInitialized() {
  if (initialized) return
  await seedCodesFromEnv()
  initialized = true
}

export async function getQuotaSnapshot(userId: string): Promise<QuotaSnapshot> {
  await ensureInitialized()
  const redis = await getRedisClient()
  const key = userKey(userId)
  const values = await redis.hmGet(key, ['freeUsed', 'paidCredits'])
  return snapshotFromValues(toInt(values[0]), toInt(values[1]))
}

export async function consumeGenerationCredit(userId: string): Promise<ConsumptionResult> {
  await ensureInitialized()
  const redis = await getRedisClient()
  const key = userKey(userId)
  const timestamp = nowIso()

  const raw = await redis.eval(
    `
      local userKey = KEYS[1]
      local freeLimit = tonumber(ARGV[1])
      local now = ARGV[2]

      local freeUsed = tonumber(redis.call('HGET', userKey, 'freeUsed') or '0')
      local paidCredits = tonumber(redis.call('HGET', userKey, 'paidCredits') or '0')
      local freeRemaining = freeLimit - freeUsed
      if freeRemaining < 0 then freeRemaining = 0 end

      if (freeRemaining + paidCredits) <= 0 then
        return {0, 'none', freeRemaining, paidCredits}
      end

      local consumedFrom = 'free'
      if freeRemaining > 0 then
        freeUsed = freeUsed + 1
      else
        paidCredits = paidCredits - 1
        consumedFrom = 'paid'
      end

      redis.call('HSET', userKey,
        'freeUsed', freeUsed,
        'paidCredits', paidCredits,
        'updatedAt', now
      )
      redis.call('HSETNX', userKey, 'createdAt', now)

      local newFreeRemaining = freeLimit - freeUsed
      if newFreeRemaining < 0 then newFreeRemaining = 0 end
      return {1, consumedFrom, newFreeRemaining, paidCredits}
    `,
    {
      keys: [key],
      arguments: [String(FREE_QUOTA_LIMIT), timestamp],
    }
  )

  const data = raw as Array<string | number>
  const allowed = toInt(data[0]) === 1
  const freeRemaining = toInt(data[2])
  const paidRemaining = toInt(data[3])

  return {
    allowed,
    consumedFrom: allowed ? (String(data[1]) as 'free' | 'paid') : undefined,
    quota: {
      freeRemaining,
      paidRemaining,
      totalRemaining: freeRemaining + paidRemaining,
    },
  }
}

export async function refundGenerationCredit(
  userId: string,
  consumedFrom: 'free' | 'paid'
): Promise<QuotaSnapshot> {
  await ensureInitialized()
  const redis = await getRedisClient()
  const key = userKey(userId)
  const timestamp = nowIso()

  const raw = await redis.eval(
    `
      local userKey = KEYS[1]
      local from = ARGV[1]
      local freeLimit = tonumber(ARGV[2])
      local now = ARGV[3]

      local freeUsed = tonumber(redis.call('HGET', userKey, 'freeUsed') or '0')
      local paidCredits = tonumber(redis.call('HGET', userKey, 'paidCredits') or '0')

      if from == 'free' then
        freeUsed = freeUsed - 1
        if freeUsed < 0 then freeUsed = 0 end
      else
        paidCredits = paidCredits + 1
      end

      redis.call('HSET', userKey,
        'freeUsed', freeUsed,
        'paidCredits', paidCredits,
        'updatedAt', now
      )
      redis.call('HSETNX', userKey, 'createdAt', now)

      local freeRemaining = freeLimit - freeUsed
      if freeRemaining < 0 then freeRemaining = 0 end
      return {freeRemaining, paidCredits}
    `,
    {
      keys: [key],
      arguments: [consumedFrom, String(FREE_QUOTA_LIMIT), timestamp],
    }
  )

  const data = raw as Array<string | number>
  const freeRemaining = toInt(data[0])
  const paidRemaining = toInt(data[1])

  return {
    freeRemaining,
    paidRemaining,
    totalRemaining: freeRemaining + paidRemaining,
  }
}

export async function redeemCodeForUser(userId: string, rawCode: string): Promise<RedeemResult> {
  await ensureInitialized()
  const code = normalizeCode(rawCode)
  if (!code) {
    return {
      ok: false,
      error: '兑换码不能为空',
      quota: await getQuotaSnapshot(userId),
    }
  }

  const redis = await getRedisClient()
  const timestamp = nowIso()
  const userDataKey = userKey(userId)
  const redeemSet = userRedeemSetKey(userId)
  const codeDataKey = codeKey(code)

  const raw = await redis.eval(
    `
      local userKey = KEYS[1]
      local userCodesKey = KEYS[2]
      local codeKey = KEYS[3]
      local code = ARGV[1]
      local freeLimit = tonumber(ARGV[2])
      local now = ARGV[3]

      if redis.call('EXISTS', codeKey) == 0 then
        return {0, '兑换码无效或已失效'}
      end

      local active = tonumber(redis.call('HGET', codeKey, 'active') or '0')
      if active ~= 1 then
        return {0, '兑换码无效或已失效'}
      end

      if redis.call('SISMEMBER', userCodesKey, code) == 1 then
        return {0, '你已使用过该兑换码'}
      end

      local usedCount = tonumber(redis.call('HGET', codeKey, 'usedCount') or '0')
      local maxUses = tonumber(redis.call('HGET', codeKey, 'maxUses') or '0')
      if usedCount >= maxUses then
        return {0, '兑换码已被使用'}
      end

      local credits = tonumber(redis.call('HGET', codeKey, 'credits') or '0')
      redis.call('HINCRBY', codeKey, 'usedCount', 1)
      redis.call('HSET', codeKey, 'updatedAt', now)
      redis.call('SADD', userCodesKey, code)

      local freeUsed = tonumber(redis.call('HGET', userKey, 'freeUsed') or '0')
      local paidCredits = tonumber(redis.call('HGET', userKey, 'paidCredits') or '0')
      paidCredits = paidCredits + credits

      redis.call('HSET', userKey,
        'freeUsed', freeUsed,
        'paidCredits', paidCredits,
        'updatedAt', now
      )
      redis.call('HSETNX', userKey, 'createdAt', now)

      local freeRemaining = freeLimit - freeUsed
      if freeRemaining < 0 then freeRemaining = 0 end
      return {1, '', freeRemaining, paidCredits}
    `,
    {
      keys: [userDataKey, redeemSet, codeDataKey],
      arguments: [code, String(FREE_QUOTA_LIMIT), timestamp],
    }
  )

  const data = raw as Array<string | number>
  const ok = toInt(data[0]) === 1
  if (!ok) {
    return {
      ok: false,
      error: String(data[1] || '兑换失败'),
      quota: await getQuotaSnapshot(userId),
    }
  }

  const freeRemaining = toInt(data[2])
  const paidRemaining = toInt(data[3])
  return {
    ok: true,
    quota: {
      freeRemaining,
      paidRemaining,
      totalRemaining: freeRemaining + paidRemaining,
    },
  }
}

export async function createRedeemCode(input: {
  code?: string
  credits: number
  maxUses?: number
  active?: boolean
}): Promise<RedeemCodeRecord> {
  await ensureInitialized()
  const redis = await getRedisClient()

  const credits = Math.max(1, Math.floor(input.credits))
  const maxUses = Math.max(1, Math.floor(input.maxUses ?? 1))
  const code = normalizeCode(input.code || generateCode())
  if (!code) {
    throw new Error('兑换码不能为空')
  }

  const key = codeKey(code)
  const exists = await redis.exists(key)
  if (exists) {
    throw new Error('兑换码已存在')
  }

  const ts = nowIso()
  await redis.hSet(key, {
    code,
    credits: String(credits),
    maxUses: String(maxUses),
    usedCount: '0',
    active: input.active === false ? '0' : '1',
    createdAt: ts,
    updatedAt: ts,
  })

  return {
    code,
    credits,
    maxUses,
    usedCount: 0,
    active: input.active !== false,
    createdAt: ts,
    updatedAt: ts,
  }
}

export async function createRedeemCodesBatch(input: {
  count: number
  credits: number
  maxUses?: number
  codePrefix?: string
}): Promise<RedeemCodeRecord[]> {
  const result: RedeemCodeRecord[] = []
  const count = Math.max(1, Math.floor(input.count))
  const prefix = normalizeCode(input.codePrefix || '')

  while (result.length < count) {
    const code = prefix ? `${prefix}-${generateCode(8)}` : generateCode(12)
    try {
      const created = await createRedeemCode({
        code,
        credits: input.credits,
        maxUses: input.maxUses,
      })
      result.push(created)
    } catch (err: any) {
      if (String(err?.message || '').includes('已存在')) {
        continue
      }
      throw err
    }
  }

  return result
}

export async function listRedeemCodes(cursor = '0', limit = 50): Promise<AdminCodeListResult> {
  await ensureInitialized()
  const redis = await getRedisClient()

  const scanResult = await redis.scan(Number.parseInt(cursor, 10) || 0, {
    MATCH: codePattern(),
    COUNT: Math.max(1, Math.min(200, Math.floor(limit))),
  })

  const items: RedeemCodeRecord[] = []
  for (const key of scanResult.keys) {
    const code = key.split(':').pop() || ''
    const values = await redis.hmGet(key, [
      'credits',
      'maxUses',
      'usedCount',
      'active',
      'createdAt',
      'updatedAt',
    ])
    items.push(fromCodeHash(code, values))
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return {
    items,
    nextCursor: String(scanResult.cursor),
  }
}

export async function setRedeemCodeActive(code: string, active: boolean): Promise<RedeemCodeRecord> {
  await ensureInitialized()
  const redis = await getRedisClient()
  const normalized = normalizeCode(code)
  const key = codeKey(normalized)

  const exists = await redis.exists(key)
  if (!exists) {
    throw new Error('兑换码不存在')
  }

  const ts = nowIso()
  await redis.hSet(key, {
    active: active ? '1' : '0',
    updatedAt: ts,
  })

  const values = await redis.hmGet(key, [
    'credits',
    'maxUses',
    'usedCount',
    'active',
    'createdAt',
    'updatedAt',
  ])
  return fromCodeHash(normalized, values)
}

export async function getRedeemCode(code: string): Promise<RedeemCodeRecord | null> {
  await ensureInitialized()
  const redis = await getRedisClient()
  const normalized = normalizeCode(code)
  const key = codeKey(normalized)

  const exists = await redis.exists(key)
  if (!exists) return null

  const values = await redis.hmGet(key, [
    'credits',
    'maxUses',
    'usedCount',
    'active',
    'createdAt',
    'updatedAt',
  ])
  return fromCodeHash(normalized, values)
}

export async function grantPaidCredits(userId: string, credits: number): Promise<QuotaSnapshot> {
  await ensureInitialized()
  const redis = await getRedisClient()
  const key = userKey(userId)
  const ts = nowIso()
  const delta = Math.max(1, Math.floor(credits))

  const raw = await redis.eval(
    `
      local userKey = KEYS[1]
      local delta = tonumber(ARGV[1])
      local freeLimit = tonumber(ARGV[2])
      local now = ARGV[3]

      local freeUsed = tonumber(redis.call('HGET', userKey, 'freeUsed') or '0')
      local paidCredits = tonumber(redis.call('HGET', userKey, 'paidCredits') or '0')
      paidCredits = paidCredits + delta

      redis.call('HSET', userKey,
        'freeUsed', freeUsed,
        'paidCredits', paidCredits,
        'updatedAt', now
      )
      redis.call('HSETNX', userKey, 'createdAt', now)

      local freeRemaining = freeLimit - freeUsed
      if freeRemaining < 0 then freeRemaining = 0 end
      return {freeRemaining, paidCredits}
    `,
    {
      keys: [key],
      arguments: [String(delta), String(FREE_QUOTA_LIMIT), ts],
    }
  )

  const data = raw as Array<string | number>
  const freeRemaining = toInt(data[0])
  const paidRemaining = toInt(data[1])
  return {
    freeRemaining,
    paidRemaining,
    totalRemaining: freeRemaining + paidRemaining,
  }
}

export async function getAdminStats(): Promise<AdminStats> {
  await ensureInitialized()
  const redis = await getRedisClient()

  let codeCursor = 0
  let codeCount = 0
  let activeCodeCount = 0
  let exhaustedCodeCount = 0

  do {
    const scanResult = await redis.scan(codeCursor, { MATCH: codePattern(), COUNT: 200 })
    codeCursor = scanResult.cursor
    for (const key of scanResult.keys) {
      codeCount += 1
      const values = await redis.hmGet(key, ['active', 'usedCount', 'maxUses'])
      const active = isTruthy(values[0])
      const usedCount = toInt(values[1])
      const maxUses = toInt(values[2], 1)
      if (active) activeCodeCount += 1
      if (usedCount >= maxUses) exhaustedCodeCount += 1
    }
  } while (codeCursor !== 0)

  let userCursor = 0
  let userCount = 0
  let totalPaidCredits = 0
  do {
    const scanResult = await redis.scan(userCursor, { MATCH: userPattern(), COUNT: 200 })
    userCursor = scanResult.cursor
    for (const key of scanResult.keys) {
      if (key.endsWith(':codes')) continue
      userCount += 1
      const paidCredits = await redis.hGet(key, 'paidCredits')
      totalPaidCredits += toInt(paidCredits)
    }
  } while (userCursor !== 0)

  return {
    codeCount,
    activeCodeCount,
    exhaustedCodeCount,
    userCount,
    totalPaidCredits,
  }
}

function generateCode(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(length)
  let output = ''
  for (let i = 0; i < length; i += 1) {
    output += alphabet[bytes[i] % alphabet.length]
  }
  return output
}
