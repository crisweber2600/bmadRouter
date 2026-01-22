"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderManager = void 0;
const logger_1 = require("../observability/logger");
const openaiProvider_1 = require("./openaiProvider");
const anthropicProvider_1 = require("./anthropicProvider");
const googleProvider_1 = require("./googleProvider");
const circuitBreaker_1 = require("./circuitBreaker");
class ProviderManager {
    providers = new Map();
    circuitBreakers = new Map();
    tierMappings = {
        FREE: 'local', // TODO: Implement local model provider
        CHEAP: 'openai', // gpt-4o-mini
        BALANCED: 'anthropic', // claude-sonnet
        PREMIUM: 'anthropic', // claude-opus
        FALLBACK: 'anthropic', // claude-opus
    };
    // Fallback order for providers
    fallbackOrder = ['anthropic', 'openai', 'google'];
    constructor(circuitBreakerConfig) {
        this.initializeProviders(circuitBreakerConfig);
    }
    initializeProviders(circuitBreakerConfig) {
        const config = circuitBreakerConfig || circuitBreaker_1.LLM_CIRCUIT_CONFIGS.cloud;
        // Initialize providers if API keys are available
        if (process.env.OPENAI_API_KEY) {
            this.providers.set('openai', new openaiProvider_1.OpenAIProvider(process.env.OPENAI_API_KEY));
            this.circuitBreakers.set('openai', new circuitBreaker_1.CircuitBreaker('openai', config));
        }
        if (process.env.ANTHROPIC_API_KEY) {
            this.providers.set('anthropic', new anthropicProvider_1.AnthropicProvider(process.env.ANTHROPIC_API_KEY));
            this.circuitBreakers.set('anthropic', new circuitBreaker_1.CircuitBreaker('anthropic', config));
        }
        if (process.env.GOOGLE_API_KEY) {
            this.providers.set('google', new googleProvider_1.GoogleProvider(process.env.GOOGLE_API_KEY));
            this.circuitBreakers.set('google', new circuitBreaker_1.CircuitBreaker('google', config));
        }
        logger_1.logger.info('Providers initialized with circuit breakers', {
            availableProviders: Array.from(this.providers.keys()),
        });
    }
    async executeRequest(decision, request) {
        const primaryProvider = this.tierMappings[decision.selectedTier];
        if (!primaryProvider) {
            throw new Error(`No provider mapping for tier: ${decision.selectedTier}`);
        }
        // Try primary provider first
        try {
            return await this.executeWithCircuitBreaker(primaryProvider, decision, request);
        }
        catch (error) {
            // If circuit breaker is open or primary failed, try fallbacks
            if (error instanceof circuitBreaker_1.CircuitBreakerOpenError || this.isRetryableError(error)) {
                logger_1.logger.warn(`Primary provider ${primaryProvider} unavailable, trying fallbacks`, {
                    error: error instanceof Error ? error.message : 'Unknown',
                });
                return await this.executeWithFallback(decision, request, primaryProvider);
            }
            throw error;
        }
    }
    /**
     * Execute request through circuit breaker
     */
    async executeWithCircuitBreaker(providerName, decision, request) {
        const provider = this.providers.get(providerName);
        const circuitBreaker = this.circuitBreakers.get(providerName);
        if (!provider) {
            throw new Error(`Provider not available: ${providerName}`);
        }
        if (!circuitBreaker) {
            // No circuit breaker - execute directly (shouldn't happen in normal operation)
            return this.executeProviderRequest(provider, providerName, decision, request);
        }
        // Execute through circuit breaker
        return circuitBreaker.execute(() => this.executeProviderRequest(provider, providerName, decision, request));
    }
    /**
     * Execute the actual provider request
     */
    async executeProviderRequest(provider, providerName, decision, request) {
        logger_1.logger.debug('Executing request', {
            provider: providerName,
            model: decision.selectedModel,
            tier: decision.selectedTier,
        });
        const response = await provider.executeRequest(decision.selectedModel, request);
        logger_1.logger.info('Request executed successfully', {
            provider: providerName,
            model: decision.selectedModel,
            inputTokens: response.usage?.prompt_tokens,
            outputTokens: response.usage?.completion_tokens,
        });
        return response;
    }
    /**
     * Execute with fallback providers
     */
    async executeWithFallback(decision, request, excludeProvider) {
        const availableFallbacks = this.fallbackOrder.filter(p => p !== excludeProvider && this.isProviderAvailable(p) && this.isCircuitBreakerAvailable(p));
        for (const fallbackProvider of availableFallbacks) {
            try {
                logger_1.logger.info(`Trying fallback provider: ${fallbackProvider}`);
                // Create a modified decision for the fallback provider
                const fallbackDecision = {
                    ...decision,
                    selectedProvider: fallbackProvider,
                    selectedModel: this.getModelForProvider(fallbackProvider, decision.selectedTier),
                };
                return await this.executeWithCircuitBreaker(fallbackProvider, fallbackDecision, request);
            }
            catch (error) {
                logger_1.logger.warn(`Fallback provider ${fallbackProvider} also failed`, {
                    error: error instanceof Error ? error.message : 'Unknown',
                });
                // Continue to next fallback
            }
        }
        // All fallbacks exhausted
        throw new Error('All providers unavailable. Primary and all fallback providers failed.');
    }
    /**
     * Get appropriate model for a provider and tier
     */
    getModelForProvider(providerName, tier) {
        const providerModels = {
            openai: {
                FREE: 'gpt-4o-mini',
                CHEAP: 'gpt-4o-mini',
                BALANCED: 'gpt-4o',
                PREMIUM: 'gpt-4o',
                FALLBACK: 'gpt-4o',
            },
            anthropic: {
                FREE: 'claude-3-haiku-20240307',
                CHEAP: 'claude-3-haiku-20240307',
                BALANCED: 'claude-3-5-sonnet-20241022',
                PREMIUM: 'claude-3-opus-20240229',
                FALLBACK: 'claude-3-opus-20240229',
            },
            google: {
                FREE: 'gemini-1.5-flash',
                CHEAP: 'gemini-1.5-flash',
                BALANCED: 'gemini-1.5-pro',
                PREMIUM: 'gemini-1.5-pro',
                FALLBACK: 'gemini-1.5-pro',
            },
        };
        return providerModels[providerName]?.[tier] || 'gpt-4o-mini';
    }
    /**
     * Check if circuit breaker allows requests
     */
    isCircuitBreakerAvailable(providerName) {
        const circuitBreaker = this.circuitBreakers.get(providerName);
        return circuitBreaker ? circuitBreaker.isAvailable() : true;
    }
    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            const statusCode = error.status || error.statusCode;
            // Retryable: 5xx, timeouts, connection errors
            if (statusCode >= 500)
                return true;
            if (message.includes('timeout'))
                return true;
            if (message.includes('econnrefused'))
                return true;
            if (message.includes('network'))
                return true;
        }
        return false;
    }
    getAvailableProviders() {
        return Array.from(this.providers.keys());
    }
    isProviderAvailable(providerName) {
        return this.providers.has(providerName);
    }
    getTierMapping(tier) {
        return this.tierMappings[tier];
    }
    updateTierMapping(tier, providerName) {
        if (!this.providers.has(providerName)) {
            throw new Error(`Provider not available: ${providerName}`);
        }
        this.tierMappings[tier] = providerName;
        logger_1.logger.info('Tier mapping updated', { tier, providerName });
    }
    /**
     * Get circuit breaker statistics for all providers
     */
    getCircuitBreakerStats() {
        const stats = {};
        for (const [name, breaker] of this.circuitBreakers) {
            stats[name] = breaker.getStats();
        }
        return stats;
    }
    /**
     * Get circuit breaker for a specific provider
     */
    getCircuitBreaker(providerName) {
        return this.circuitBreakers.get(providerName);
    }
    /**
     * Force open a circuit breaker (for manual intervention)
     */
    forceOpenCircuit(providerName) {
        const breaker = this.circuitBreakers.get(providerName);
        if (breaker) {
            breaker.forceOpen();
        }
    }
    /**
     * Force close a circuit breaker (for manual recovery)
     */
    forceCloseCircuit(providerName) {
        const breaker = this.circuitBreakers.get(providerName);
        if (breaker) {
            breaker.forceClose();
        }
    }
    /**
     * Reset a circuit breaker
     */
    resetCircuitBreaker(providerName) {
        const breaker = this.circuitBreakers.get(providerName);
        if (breaker) {
            breaker.reset();
        }
    }
    /**
     * Cleanup all circuit breakers
     */
    destroy() {
        for (const breaker of this.circuitBreakers.values()) {
            breaker.destroy();
        }
        this.circuitBreakers.clear();
    }
}
exports.ProviderManager = ProviderManager;
//# sourceMappingURL=providerManager.js.map