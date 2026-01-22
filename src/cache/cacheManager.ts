import Redis from 'ioredis';
import crypto from 'crypto';
import { LLMRequest, LLMResponse, CacheResult } from '../types';
import { logger } from '../observability/logger';

export class CacheManager {
  private redis: Redis;
  private readonly TTL = 24 * 60 * 60; // 24 hours

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error', { error: error.message });
    });
  }

  async checkCache(request: LLMRequest): Promise<CacheResult> {
    try {
      await this.redis.connect();

      // Create cache key from request
      const cacheKey = this.createCacheKey(request);

      // Check exact match cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        logger.debug('Cache hit', { cacheKey });

        return {
          hit: true,
          response: parsed.response,
          confidence: parsed.confidence || 0.95,
          source: 'exact',
          ttl: await this.redis.ttl(cacheKey),
        };
      }

      // TODO: Implement semantic caching with embeddings
      // For now, return cache miss
      return { hit: false, confidence: 0, source: 'exact' };

    } catch (error) {
      logger.warn('Cache check failed, proceeding without cache', { error });
      return { hit: false, confidence: 0, source: 'exact' };
    }
  }

  async storeResponse(
    request: LLMRequest,
    response: LLMResponse,
    decision: any
  ): Promise<void> {
    try {
      await this.redis.connect();

      const cacheKey = this.createCacheKey(request);
      const cacheValue = JSON.stringify({
        response,
        decision,
        timestamp: new Date().toISOString(),
        confidence: 0.95, // Exact match confidence
      });

      await this.redis.setex(cacheKey, this.TTL, cacheValue);
      logger.debug('Response cached', { cacheKey });

    } catch (error) {
      logger.warn('Cache storage failed', { error });
    }
  }

  private createCacheKey(request: LLMRequest): string {
    // Create deterministic key from request content
    const keyData = {
      messages: request.messages.map(m => ({ role: m.role, content: m.content })),
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
    };

    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex');

    return `cache:${hash}`;
  }

  async getStats(): Promise<{ hits: number; misses: number; hitRate: number }> {
    // TODO: Implement cache statistics
    return { hits: 0, misses: 0, hitRate: 0 };
  }

  async clear(): Promise<void> {
    try {
      await this.redis.flushdb();
      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Cache clear failed', { error });
    }
  }
}