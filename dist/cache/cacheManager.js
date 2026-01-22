"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../observability/logger");
class CacheManager {
    redis;
    TTL = 24 * 60 * 60; // 24 hours
    constructor() {
        this.redis = new ioredis_1.default({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            lazyConnect: true,
        });
        this.redis.on('error', (error) => {
            logger_1.logger.error('Redis connection error', { error: error.message });
        });
    }
    async checkCache(request) {
        try {
            await this.redis.connect();
            // Create cache key from request
            const cacheKey = this.createCacheKey(request);
            // Check exact match cache
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                logger_1.logger.debug('Cache hit', { cacheKey });
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
        }
        catch (error) {
            logger_1.logger.warn('Cache check failed, proceeding without cache', { error });
            return { hit: false, confidence: 0, source: 'exact' };
        }
    }
    async storeResponse(request, response, decision) {
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
            logger_1.logger.debug('Response cached', { cacheKey });
        }
        catch (error) {
            logger_1.logger.warn('Cache storage failed', { error });
        }
    }
    createCacheKey(request) {
        // Create deterministic key from request content
        const keyData = {
            messages: request.messages.map(m => ({ role: m.role, content: m.content })),
            model: request.model,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
        };
        const hash = crypto_1.default.createHash('sha256')
            .update(JSON.stringify(keyData))
            .digest('hex');
        return `cache:${hash}`;
    }
    async getStats() {
        // TODO: Implement cache statistics
        return { hits: 0, misses: 0, hitRate: 0 };
    }
    async clear() {
        try {
            await this.redis.flushdb();
            logger_1.logger.info('Cache cleared');
        }
        catch (error) {
            logger_1.logger.error('Cache clear failed', { error });
        }
    }
}
exports.CacheManager = CacheManager;
//# sourceMappingURL=cacheManager.js.map