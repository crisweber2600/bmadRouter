"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = exports.CircuitBreakerOpenError = exports.LLM_CIRCUIT_CONFIGS = void 0;
const logger_1 = require("../observability/logger");
/**
 * Default configurations for different provider types
 */
exports.LLM_CIRCUIT_CONFIGS = {
    // Cloud LLM providers (OpenAI, Anthropic) - variable latency
    cloud: {
        failureThreshold: 5,
        resetTimeout: 30000, // 30s
        halfOpenSuccessThreshold: 2,
        monitoringWindow: 300000, // 5 minutes
        maxHalfOpenRequests: 1,
        requestTimeout: 60000, // 60s for complex prompts
    },
    // Local LLMs - more predictable
    local: {
        failureThreshold: 10,
        resetTimeout: 10000, // 10s
        halfOpenSuccessThreshold: 3,
        monitoringWindow: 60000, // 1 minute
        maxHalfOpenRequests: 2,
        requestTimeout: 30000,
    },
    // Enterprise/Batch APIs - more reliable but slower
    enterprise: {
        failureThreshold: 3,
        resetTimeout: 60000, // 1min
        halfOpenSuccessThreshold: 1,
        monitoringWindow: 600000, // 10 minutes
        maxHalfOpenRequests: 1,
        requestTimeout: 120000, // 2min
    },
};
/**
 * Circuit Breaker Error - thrown when circuit is OPEN
 */
class CircuitBreakerOpenError extends Error {
    providerName;
    state;
    nextRetryTime;
    constructor(providerName, state, nextRetryTime) {
        super(`Circuit breaker for ${providerName} is ${state}. Retry after ${nextRetryTime.toISOString()}`);
        this.providerName = providerName;
        this.state = state;
        this.nextRetryTime = nextRetryTime;
        this.name = 'CircuitBreakerOpenError';
    }
}
exports.CircuitBreakerOpenError = CircuitBreakerOpenError;
/**
 * Circuit Breaker Implementation
 *
 * Implements the circuit breaker pattern with:
 * - Sliding window failure tracking
 * - Concurrency control in half-open state
 * - Exponential backoff consideration
 * - LLM-specific error classification
 */
class CircuitBreaker {
    name;
    config;
    state = 'CLOSED';
    requests = [];
    consecutiveFailures = 0;
    consecutiveSuccesses = 0;
    halfOpenPendingRequests = 0;
    lastFailureTime = null;
    lastSuccessTime = null;
    lastStateChange = new Date();
    openedAt = null;
    openedCount = 0;
    totalRequests = 0;
    successfulRequests = 0;
    failedRequests = 0;
    resetTimer = null;
    constructor(name, config = exports.LLM_CIRCUIT_CONFIGS.cloud) {
        this.name = name;
        this.config = config;
        logger_1.logger.debug(`Circuit breaker initialized for ${name}`, { config });
    }
    /**
     * Execute a request through the circuit breaker
     */
    async execute(fn, fallback) {
        // Clean old requests from sliding window
        this.cleanOldRequests();
        // Check and update state based on timeouts
        this.checkStateTransition();
        // Handle based on current state
        switch (this.state) {
            case 'OPEN':
                return this.handleOpenState(fn, fallback);
            case 'HALF_OPEN':
                return this.handleHalfOpenState(fn, fallback);
            case 'CLOSED':
                return this.handleClosedState(fn);
        }
    }
    /**
     * Handle request when circuit is CLOSED (normal operation)
     */
    async handleClosedState(fn) {
        try {
            const result = await this.executeWithTimeout(fn);
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure(error);
            throw error;
        }
    }
    /**
     * Handle request when circuit is OPEN (failing fast)
     */
    async handleOpenState(_fn, fallback) {
        const nextRetryTime = this.getNextRetryTime();
        logger_1.logger.warn(`Circuit breaker OPEN for ${this.name}`, {
            nextRetryTime,
            consecutiveFailures: this.consecutiveFailures,
        });
        // Try fallback if provided
        if (fallback) {
            logger_1.logger.info(`Using fallback for ${this.name}`);
            try {
                return await fallback();
            }
            catch (fallbackError) {
                logger_1.logger.error(`Fallback also failed for ${this.name}`, {
                    error: fallbackError instanceof Error ? fallbackError.message : 'Unknown'
                });
            }
        }
        throw new CircuitBreakerOpenError(this.name, this.state, nextRetryTime);
    }
    /**
     * Handle request when circuit is HALF_OPEN (testing recovery)
     */
    async handleHalfOpenState(fn, fallback) {
        // Concurrency control - prevent thundering herd
        if (this.halfOpenPendingRequests >= this.config.maxHalfOpenRequests) {
            logger_1.logger.debug(`Circuit breaker ${this.name} HALF_OPEN, rejecting excess request`);
            if (fallback) {
                return fallback();
            }
            throw new CircuitBreakerOpenError(this.name, 'HALF_OPEN', new Date(Date.now() + 1000));
        }
        this.halfOpenPendingRequests++;
        try {
            const result = await this.executeWithTimeout(fn);
            this.onHalfOpenSuccess();
            return result;
        }
        catch (error) {
            this.onHalfOpenFailure(error);
            throw error;
        }
        finally {
            this.halfOpenPendingRequests--;
        }
    }
    /**
     * Execute function with timeout
     */
    async executeWithTimeout(fn) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Request timeout after ${this.config.requestTimeout}ms`));
            }, this.config.requestTimeout);
            fn()
                .then((result) => {
                clearTimeout(timeout);
                resolve(result);
            })
                .catch((error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
    /**
     * Record successful request
     */
    onSuccess() {
        this.totalRequests++;
        this.successfulRequests++;
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;
        this.lastSuccessTime = new Date();
        this.requests.push({
            timestamp: Date.now(),
            success: true,
        });
        logger_1.logger.debug(`Circuit breaker ${this.name} success`, {
            consecutiveSuccesses: this.consecutiveSuccesses,
        });
    }
    /**
     * Record failed request
     */
    onFailure(error) {
        this.totalRequests++;
        this.failedRequests++;
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;
        this.lastFailureTime = new Date();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.requests.push({
            timestamp: Date.now(),
            success: false,
            error: errorMessage,
        });
        logger_1.logger.warn(`Circuit breaker ${this.name} failure`, {
            consecutiveFailures: this.consecutiveFailures,
            error: errorMessage,
        });
        // Check if we should open the circuit
        if (this.shouldOpenCircuit()) {
            this.transitionTo('OPEN');
        }
    }
    /**
     * Handle success in HALF_OPEN state
     */
    onHalfOpenSuccess() {
        this.onSuccess();
        // Check if we've met the success threshold to close the circuit
        if (this.consecutiveSuccesses >= this.config.halfOpenSuccessThreshold) {
            logger_1.logger.info(`Circuit breaker ${this.name} recovered, closing circuit`);
            this.transitionTo('CLOSED');
        }
    }
    /**
     * Handle failure in HALF_OPEN state
     */
    onHalfOpenFailure(error) {
        this.onFailure(error);
        // Any failure in HALF_OPEN immediately opens the circuit
        logger_1.logger.warn(`Circuit breaker ${this.name} failed in HALF_OPEN, reopening`);
        this.transitionTo('OPEN');
    }
    /**
     * Determine if circuit should open based on failures in window
     */
    shouldOpenCircuit() {
        const failures = this.requests.filter(r => !r.success).length;
        return failures >= this.config.failureThreshold;
    }
    /**
     * Clean old requests outside the monitoring window
     */
    cleanOldRequests() {
        const cutoff = Date.now() - this.config.monitoringWindow;
        this.requests = this.requests.filter(r => r.timestamp > cutoff);
    }
    /**
     * Check if state should transition based on timeouts
     */
    checkStateTransition() {
        if (this.state === 'OPEN' && this.openedAt) {
            const elapsed = Date.now() - this.openedAt.getTime();
            if (elapsed >= this.config.resetTimeout) {
                logger_1.logger.info(`Circuit breaker ${this.name} reset timeout elapsed, transitioning to HALF_OPEN`);
                this.transitionTo('HALF_OPEN');
            }
        }
    }
    /**
     * Transition to a new state
     */
    transitionTo(newState) {
        if (this.state === newState)
            return;
        const previousState = this.state;
        this.state = newState;
        this.lastStateChange = new Date();
        logger_1.logger.info(`Circuit breaker ${this.name} state change`, {
            from: previousState,
            to: newState,
        });
        // Clear any existing timer
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
        switch (newState) {
            case 'OPEN':
                this.openedAt = new Date();
                this.openedCount++;
                this.consecutiveSuccesses = 0;
                this.scheduleHalfOpen();
                break;
            case 'HALF_OPEN':
                this.halfOpenPendingRequests = 0;
                break;
            case 'CLOSED':
                this.openedAt = null;
                this.consecutiveFailures = 0;
                this.requests = []; // Clear window on close
                break;
        }
    }
    /**
     * Schedule transition to HALF_OPEN after reset timeout
     */
    scheduleHalfOpen() {
        this.resetTimer = setTimeout(() => {
            if (this.state === 'OPEN') {
                this.transitionTo('HALF_OPEN');
            }
        }, this.config.resetTimeout);
    }
    /**
     * Get the next time a retry will be attempted
     */
    getNextRetryTime() {
        if (this.openedAt) {
            return new Date(this.openedAt.getTime() + this.config.resetTimeout);
        }
        return new Date(Date.now() + this.config.resetTimeout);
    }
    /**
     * Get current circuit breaker statistics
     */
    getStats() {
        return {
            state: this.state,
            totalRequests: this.totalRequests,
            successfulRequests: this.successfulRequests,
            failedRequests: this.failedRequests,
            consecutiveFailures: this.consecutiveFailures,
            consecutiveSuccesses: this.consecutiveSuccesses,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            lastStateChange: this.lastStateChange,
            openedCount: this.openedCount,
        };
    }
    /**
     * Get current state
     */
    getState() {
        this.checkStateTransition();
        return this.state;
    }
    /**
     * Check if circuit is allowing requests
     */
    isAvailable() {
        this.checkStateTransition();
        return this.state !== 'OPEN';
    }
    /**
     * Force open the circuit (for manual intervention)
     */
    forceOpen() {
        logger_1.logger.warn(`Circuit breaker ${this.name} force opened`);
        this.transitionTo('OPEN');
    }
    /**
     * Force close the circuit (for manual recovery)
     */
    forceClose() {
        logger_1.logger.info(`Circuit breaker ${this.name} force closed`);
        this.transitionTo('CLOSED');
    }
    /**
     * Reset all statistics
     */
    reset() {
        logger_1.logger.info(`Circuit breaker ${this.name} reset`);
        this.state = 'CLOSED';
        this.requests = [];
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.halfOpenPendingRequests = 0;
        this.lastFailureTime = null;
        this.lastSuccessTime = null;
        this.lastStateChange = new Date();
        this.openedAt = null;
        this.totalRequests = 0;
        this.successfulRequests = 0;
        this.failedRequests = 0;
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
    }
    /**
     * Cleanup resources
     */
    destroy() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
    }
    /**
     * Check if an error should trip the circuit breaker
     * Rate limits (429) should NOT open circuit - use backoff instead
     */
    static shouldTripCircuit(error) {
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            const statusCode = error.status || error.statusCode;
            // Rate limits - don't trip, use backoff
            if (statusCode === 429 || message.includes('rate limit')) {
                return false;
            }
            // Client errors - don't trip (bad request, auth issues)
            if (statusCode === 400 || statusCode === 401 || statusCode === 403 || statusCode === 404) {
                return false;
            }
            // These SHOULD trip the circuit:
            // - Timeouts
            // - Connection errors  
            // - Server errors (5xx)
            return true;
        }
        return true; // Unknown errors trip the circuit
    }
}
exports.CircuitBreaker = CircuitBreaker;
//# sourceMappingURL=circuitBreaker.js.map