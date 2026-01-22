import { LLMRequest, LLMResponse, RoutingDecision, ModelTier } from '../types';
import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerStats } from './circuitBreaker';
export declare class ProviderManager {
    private providers;
    private circuitBreakers;
    private tierMappings;
    private readonly fallbackOrder;
    constructor(circuitBreakerConfig?: CircuitBreakerConfig);
    private initializeProviders;
    executeRequest(decision: RoutingDecision, request: LLMRequest): Promise<LLMResponse>;
    /**
     * Execute request through circuit breaker
     */
    private executeWithCircuitBreaker;
    /**
     * Execute the actual provider request
     */
    private executeProviderRequest;
    /**
     * Execute with fallback providers
     */
    private executeWithFallback;
    /**
     * Get appropriate model for a provider and tier
     */
    private getModelForProvider;
    /**
     * Check if circuit breaker allows requests
     */
    isCircuitBreakerAvailable(providerName: string): boolean;
    /**
     * Check if error is retryable
     */
    private isRetryableError;
    getAvailableProviders(): string[];
    isProviderAvailable(providerName: string): boolean;
    getTierMapping(tier: ModelTier): string | undefined;
    updateTierMapping(tier: ModelTier, providerName: string): void;
    /**
     * Get circuit breaker statistics for all providers
     */
    getCircuitBreakerStats(): Record<string, CircuitBreakerStats>;
    /**
     * Get circuit breaker for a specific provider
     */
    getCircuitBreaker(providerName: string): CircuitBreaker | undefined;
    /**
     * Force open a circuit breaker (for manual intervention)
     */
    forceOpenCircuit(providerName: string): void;
    /**
     * Force close a circuit breaker (for manual recovery)
     */
    forceCloseCircuit(providerName: string): void;
    /**
     * Reset a circuit breaker
     */
    resetCircuitBreaker(providerName: string): void;
    /**
     * Cleanup all circuit breakers
     */
    destroy(): void;
}
//# sourceMappingURL=providerManager.d.ts.map