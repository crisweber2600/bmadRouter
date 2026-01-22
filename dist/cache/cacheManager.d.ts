import { LLMRequest, LLMResponse, CacheResult } from '../types';
export declare class CacheManager {
    private redis;
    private readonly TTL;
    constructor();
    checkCache(request: LLMRequest): Promise<CacheResult>;
    storeResponse(request: LLMRequest, response: LLMResponse, decision: any): Promise<void>;
    private createCacheKey;
    getStats(): Promise<{
        hits: number;
        misses: number;
        hitRate: number;
    }>;
    clear(): Promise<void>;
}
//# sourceMappingURL=cacheManager.d.ts.map