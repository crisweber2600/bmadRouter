/**
 * Circuit Breaker States
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
/**
 * Circuit Breaker Configuration
 */
export interface CircuitBreakerConfig {
    /** Number of failures before opening circuit */
    failureThreshold: number;
    /** Time in ms before attempting recovery (OPEN -> HALF_OPEN) */
    resetTimeout: number;
    /** Number of successful requests needed in HALF_OPEN to close circuit */
    halfOpenSuccessThreshold: number;
    /** Sliding window duration in ms for failure counting */
    monitoringWindow: number;
    /** Maximum concurrent requests allowed in HALF_OPEN state */
    maxHalfOpenRequests: number;
    /** Request timeout in ms */
    requestTimeout: number;
}
/**
 * Default configurations for different provider types
 */
export declare const LLM_CIRCUIT_CONFIGS: Record<string, CircuitBreakerConfig>;
/**
 * Circuit Breaker Error - thrown when circuit is OPEN
 */
export declare class CircuitBreakerOpenError extends Error {
    readonly providerName: string;
    readonly state: CircuitState;
    readonly nextRetryTime: Date;
    constructor(providerName: string, state: CircuitState, nextRetryTime: Date);
}
/**
 * Circuit Breaker Statistics
 */
export interface CircuitBreakerStats {
    state: CircuitState;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    lastFailureTime: Date | null;
    lastSuccessTime: Date | null;
    lastStateChange: Date;
    openedCount: number;
}
/**
 * Circuit Breaker Implementation
 *
 * Implements the circuit breaker pattern with:
 * - Sliding window failure tracking
 * - Concurrency control in half-open state
 * - Exponential backoff consideration
 * - LLM-specific error classification
 */
export declare class CircuitBreaker {
    private readonly name;
    private readonly config;
    private state;
    private requests;
    private consecutiveFailures;
    private consecutiveSuccesses;
    private halfOpenPendingRequests;
    private lastFailureTime;
    private lastSuccessTime;
    private lastStateChange;
    private openedAt;
    private openedCount;
    private totalRequests;
    private successfulRequests;
    private failedRequests;
    private resetTimer;
    constructor(name: string, config?: CircuitBreakerConfig);
    /**
     * Execute a request through the circuit breaker
     */
    execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T>;
    /**
     * Handle request when circuit is CLOSED (normal operation)
     */
    private handleClosedState;
    /**
     * Handle request when circuit is OPEN (failing fast)
     */
    private handleOpenState;
    /**
     * Handle request when circuit is HALF_OPEN (testing recovery)
     */
    private handleHalfOpenState;
    /**
     * Execute function with timeout
     */
    private executeWithTimeout;
    /**
     * Record successful request
     */
    private onSuccess;
    /**
     * Record failed request
     */
    private onFailure;
    /**
     * Handle success in HALF_OPEN state
     */
    private onHalfOpenSuccess;
    /**
     * Handle failure in HALF_OPEN state
     */
    private onHalfOpenFailure;
    /**
     * Determine if circuit should open based on failures in window
     */
    private shouldOpenCircuit;
    /**
     * Clean old requests outside the monitoring window
     */
    private cleanOldRequests;
    /**
     * Check if state should transition based on timeouts
     */
    private checkStateTransition;
    /**
     * Transition to a new state
     */
    private transitionTo;
    /**
     * Schedule transition to HALF_OPEN after reset timeout
     */
    private scheduleHalfOpen;
    /**
     * Get the next time a retry will be attempted
     */
    private getNextRetryTime;
    /**
     * Get current circuit breaker statistics
     */
    getStats(): CircuitBreakerStats;
    /**
     * Get current state
     */
    getState(): CircuitState;
    /**
     * Check if circuit is allowing requests
     */
    isAvailable(): boolean;
    /**
     * Force open the circuit (for manual intervention)
     */
    forceOpen(): void;
    /**
     * Force close the circuit (for manual recovery)
     */
    forceClose(): void;
    /**
     * Reset all statistics
     */
    reset(): void;
    /**
     * Cleanup resources
     */
    destroy(): void;
    /**
     * Check if an error should trip the circuit breaker
     * Rate limits (429) should NOT open circuit - use backoff instead
     */
    static shouldTripCircuit(error: unknown): boolean;
}
//# sourceMappingURL=circuitBreaker.d.ts.map