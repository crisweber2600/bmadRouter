import { logger } from '../observability/logger';

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
export const LLM_CIRCUIT_CONFIGS: Record<string, CircuitBreakerConfig> = {
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
 * Request entry for sliding window tracking
 */
interface RequestEntry {
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Circuit Breaker Error - thrown when circuit is OPEN
 */
export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly providerName: string,
    public readonly state: CircuitState,
    public readonly nextRetryTime: Date
  ) {
    super(`Circuit breaker for ${providerName} is ${state}. Retry after ${nextRetryTime.toISOString()}`);
    this.name = 'CircuitBreakerOpenError';
  }
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
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private requests: RequestEntry[] = [];
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private halfOpenPendingRequests = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private lastStateChange: Date = new Date();
  private openedAt: Date | null = null;
  private openedCount = 0;
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig = LLM_CIRCUIT_CONFIGS.cloud
  ) {
    logger.debug(`Circuit breaker initialized for ${name}`, { config });
  }

  /**
   * Execute a request through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
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
  private async handleClosedState<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle request when circuit is OPEN (failing fast)
   */
  private async handleOpenState<T>(
    _fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const nextRetryTime = this.getNextRetryTime();
    
    logger.warn(`Circuit breaker OPEN for ${this.name}`, {
      nextRetryTime,
      consecutiveFailures: this.consecutiveFailures,
    });

    // Try fallback if provided
    if (fallback) {
      logger.info(`Using fallback for ${this.name}`);
      try {
        return await fallback();
      } catch (fallbackError) {
        logger.error(`Fallback also failed for ${this.name}`, { 
          error: fallbackError instanceof Error ? fallbackError.message : 'Unknown' 
        });
      }
    }

    throw new CircuitBreakerOpenError(this.name, this.state, nextRetryTime);
  }

  /**
   * Handle request when circuit is HALF_OPEN (testing recovery)
   */
  private async handleHalfOpenState<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    // Concurrency control - prevent thundering herd
    if (this.halfOpenPendingRequests >= this.config.maxHalfOpenRequests) {
      logger.debug(`Circuit breaker ${this.name} HALF_OPEN, rejecting excess request`);
      
      if (fallback) {
        return fallback();
      }
      
      throw new CircuitBreakerOpenError(
        this.name,
        'HALF_OPEN',
        new Date(Date.now() + 1000)
      );
    }

    this.halfOpenPendingRequests++;

    try {
      const result = await this.executeWithTimeout(fn);
      this.onHalfOpenSuccess();
      return result;
    } catch (error) {
      this.onHalfOpenFailure(error);
      throw error;
    } finally {
      this.halfOpenPendingRequests--;
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
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
  private onSuccess(): void {
    this.totalRequests++;
    this.successfulRequests++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = new Date();
    
    this.requests.push({
      timestamp: Date.now(),
      success: true,
    });

    logger.debug(`Circuit breaker ${this.name} success`, {
      consecutiveSuccesses: this.consecutiveSuccesses,
    });
  }

  /**
   * Record failed request
   */
  private onFailure(error: unknown): void {
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

    logger.warn(`Circuit breaker ${this.name} failure`, {
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
  private onHalfOpenSuccess(): void {
    this.onSuccess();

    // Check if we've met the success threshold to close the circuit
    if (this.consecutiveSuccesses >= this.config.halfOpenSuccessThreshold) {
      logger.info(`Circuit breaker ${this.name} recovered, closing circuit`);
      this.transitionTo('CLOSED');
    }
  }

  /**
   * Handle failure in HALF_OPEN state
   */
  private onHalfOpenFailure(error: unknown): void {
    this.onFailure(error);
    
    // Any failure in HALF_OPEN immediately opens the circuit
    logger.warn(`Circuit breaker ${this.name} failed in HALF_OPEN, reopening`);
    this.transitionTo('OPEN');
  }

  /**
   * Determine if circuit should open based on failures in window
   */
  private shouldOpenCircuit(): boolean {
    const failures = this.requests.filter(r => !r.success).length;
    return failures >= this.config.failureThreshold;
  }

  /**
   * Clean old requests outside the monitoring window
   */
  private cleanOldRequests(): void {
    const cutoff = Date.now() - this.config.monitoringWindow;
    this.requests = this.requests.filter(r => r.timestamp > cutoff);
  }

  /**
   * Check if state should transition based on timeouts
   */
  private checkStateTransition(): void {
    if (this.state === 'OPEN' && this.openedAt) {
      const elapsed = Date.now() - this.openedAt.getTime();
      if (elapsed >= this.config.resetTimeout) {
        logger.info(`Circuit breaker ${this.name} reset timeout elapsed, transitioning to HALF_OPEN`);
        this.transitionTo('HALF_OPEN');
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const previousState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();

    logger.info(`Circuit breaker ${this.name} state change`, {
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
  private scheduleHalfOpen(): void {
    this.resetTimer = setTimeout(() => {
      if (this.state === 'OPEN') {
        this.transitionTo('HALF_OPEN');
      }
    }, this.config.resetTimeout);
  }

  /**
   * Get the next time a retry will be attempted
   */
  private getNextRetryTime(): Date {
    if (this.openedAt) {
      return new Date(this.openedAt.getTime() + this.config.resetTimeout);
    }
    return new Date(Date.now() + this.config.resetTimeout);
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
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
  getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Check if circuit is allowing requests
   */
  isAvailable(): boolean {
    this.checkStateTransition();
    return this.state !== 'OPEN';
  }

  /**
   * Force open the circuit (for manual intervention)
   */
  forceOpen(): void {
    logger.warn(`Circuit breaker ${this.name} force opened`);
    this.transitionTo('OPEN');
  }

  /**
   * Force close the circuit (for manual recovery)
   */
  forceClose(): void {
    logger.info(`Circuit breaker ${this.name} force closed`);
    this.transitionTo('CLOSED');
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    logger.info(`Circuit breaker ${this.name} reset`);
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
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  /**
   * Check if an error should trip the circuit breaker
   * Rate limits (429) should NOT open circuit - use backoff instead
   */
  static shouldTripCircuit(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      const statusCode = (error as any).status || (error as any).statusCode;

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
