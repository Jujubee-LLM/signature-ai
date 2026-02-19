import { createClient } from 'redis'

type RedisClient = ReturnType<typeof createClient>

let client: RedisClient | null = null
let connectPromise: Promise<RedisClient> | null = null

function getRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    throw new Error('Missing REDIS_URL in environment')
  }
  return redisUrl
}

export async function getRedisClient(): Promise<RedisClient> {
  if (client?.isOpen) {
    return client
  }

  if (connectPromise) {
    return connectPromise
  }

  const redis = createClient({
    url: getRedisUrl(),
  })

  redis.on('error', (err: unknown) => {
    console.error('Redis client error:', err)
  })

  connectPromise = redis.connect().then(() => {
    client = redis
    connectPromise = null
    return redis
  }).catch((err: unknown) => {
    connectPromise = null
    throw err
  })

  return connectPromise
}
