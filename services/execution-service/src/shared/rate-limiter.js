import { getRedisClient } from './redis.js'
import { AppError } from './errors/AppError.js'

export async function checkExecutionRateLimit(userId) {
  const redis = getRedisClient()
  const key = `rate_limit:token_bucket:${userId}`

  const CAPACITY = 10             
  const REFILL_RATE = 10 / 60     
  const NOW = Date.now() / 1000   

  const luaScript = `
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local refill_rate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])

    local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
    local tokens = tonumber(bucket[1])
    local last_refill = tonumber(bucket[2])

    if not tokens then
      tokens = capacity
      last_refill = now
    else
      local time_passed = math.max(0, now - last_refill)
      local tokens_to_add = time_passed * refill_rate
      tokens = math.min(capacity, tokens + tokens_to_add)
      last_refill = now
    end

    local allowed = 0
    if tokens >= 1 then
      tokens = tokens - 1
      allowed = 1
    end

    -- Yahan tostring use kiya hai taaki Redis safely string save kare
    redis.call('HSET', key, 'tokens', tostring(tokens), 'last_refill', tostring(last_refill))
    
    local ttl = math.ceil(capacity / refill_rate) + 60
    redis.call('EXPIRE', key, ttl)

    -- DEBUG: Save hone ke baad, seedha hash wapas read karke bhej rahe hain
    local checkHash = redis.call('HGETALL', key)

    return {allowed, tostring(tokens), checkHash}
  `

  try {
    const result = await redis.eval(luaScript, {
      keys: [key],
      arguments: [CAPACITY.toString(), REFILL_RATE.toString(), NOW.toString()]
    })
    
    const allowed = Number(result[0])
    
    if (allowed === 0) {
      throw new AppError('Execution limit exceeded. Please wait before retrying.', {
        code: 'RATE_LIMIT_EXCEEDED',
        status: 429,
      })
    }
  } catch (error) {
    
    throw error;
  }
}