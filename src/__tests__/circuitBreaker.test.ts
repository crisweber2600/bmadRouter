import { CircuitBreaker, CircuitBreakerOpenError, LLM_CIRCUIT_CONFIGS, CircuitState } from '../providers/circuitBreaker';

// Mock logger
jest.mock('../observability/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  const testConfig = {
    failureThreshold: 3,
    resetTimeout: 100, // Short timeout for testing
    halfOpenSuccessThreshold: 2,
    monitoringWindow: 1000,
    maxHalfOpenRequests: 1,
    requestTimeout: 500,
  };

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-provider', testConfig);
    jest.useFakeTimers();
  });

  afterEach(() => {
    circuitBreaker.destroy();
    jest.useRealTimers();
  });

  describe('CLOSED state (normal operation)', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.isAvailable()).toBe(true);
    });

    it('should execute successful requests normally', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should track successful requests in stats', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(mockFn);
      await circuitBreaker.execute(mockFn);
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.successfulRequests).toBe(2);
      expect(stats.failedRequests).toBe(0);
      expect(stats.consecutiveSuccesses).toBe(2);
    });

    it('should propagate errors but track failures', async () => {
      const error = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(error);
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      
      const stats = circuitBreaker.getStats();
      expect(stats.failedRequests).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
    });

    it('should reset consecutive failures on success', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');
      
      // Fail twice
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      // Success should reset consecutive failures
      await circuitBreaker.execute(successFn);
      
      const stats = circuitBreaker.getStats();
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.consecutiveSuccesses).toBe(1);
    });
  });

  describe('State transitions', () => {
    it('should open circuit after failure threshold', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('fail'));
      
      // Fail up to threshold
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      }
      
      expect(circuitBreaker.getState()).toBe('OPEN');
      expect(circuitBreaker.isAvailable()).toBe(false);
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      }
      
      expect(circuitBreaker.getState()).toBe('OPEN');
      
      // Advance time past reset timeout
      jest.advanceTimersByTime(testConfig.resetTimeout + 10);
      
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');
    });

    it('should close circuit after success threshold in HALF_OPEN', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');
      
      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      }
      
      // Transition to HALF_OPEN
      jest.advanceTimersByTime(testConfig.resetTimeout + 10);
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');
      
      // Success in HALF_OPEN (need halfOpenSuccessThreshold successes)
      for (let i = 0; i < testConfig.halfOpenSuccessThreshold; i++) {
        await circuitBreaker.execute(successFn);
      }
      
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should reopen circuit on failure in HALF_OPEN', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');
      
      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      }
      
      // Transition to HALF_OPEN
      jest.advanceTimersByTime(testConfig.resetTimeout + 10);
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');
      
      // One success, then failure
      await circuitBreaker.execute(successFn);
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      expect(circuitBreaker.getState()).toBe('OPEN');
    });
  });

  describe('OPEN state (fail-fast)', () => {
    beforeEach(async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        await expect(circuitBreaker.execute(failFn)).rejects.toThrow('fail');
      }
    });

    it('should throw CircuitBreakerOpenError when circuit is open', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(CircuitBreakerOpenError);
      expect(mockFn).not.toHaveBeenCalled(); // Request never executed
    });

    it('should use fallback when circuit is open', async () => {
      const mockFn = jest.fn().mockResolvedValue('primary');
      const fallbackFn = jest.fn().mockResolvedValue('fallback');
      
      const result = await circuitBreaker.execute(mockFn, fallbackFn);
      
      expect(result).toBe('fallback');
      expect(mockFn).not.toHaveBeenCalled();
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    it('should throw if fallback also fails', async () => {
      const mockFn = jest.fn().mockResolvedValue('primary');
      const fallbackFn = jest.fn().mockRejectedValue(new Error('fallback error'));
      
      await expect(circuitBreaker.execute(mockFn, fallbackFn)).rejects.toThrow(CircuitBreakerOpenError);
    });

    it('should track opened count', async () => {
      const stats = circuitBreaker.getStats();
      expect(stats.openedCount).toBe(1);
    });
  });

  describe('HALF_OPEN state (testing recovery)', () => {
    beforeEach(async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      }
      
      // Transition to HALF_OPEN
      jest.advanceTimersByTime(testConfig.resetTimeout + 10);
    });

    it('should limit concurrent requests in HALF_OPEN', async () => {
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');
      
      // Start a slow request
      let resolveFirst: (value: string) => void;
      const firstPromise = new Promise<string>(resolve => {
        resolveFirst = resolve;
      });
      const slowFn = jest.fn().mockReturnValue(firstPromise);
      const secondFn = jest.fn().mockResolvedValue('second');
      
      // First request starts
      const executePromise = circuitBreaker.execute(slowFn);
      
      // Second request should be rejected due to concurrency limit
      await expect(circuitBreaker.execute(secondFn)).rejects.toThrow(CircuitBreakerOpenError);
      
      // Complete the first request
      resolveFirst!('first');
      await executePromise;
    });

    it('should use fallback when half-open is full', async () => {
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');
      
      // Start a slow request
      let resolveFirst: (value: string) => void;
      const firstPromise = new Promise<string>(resolve => {
        resolveFirst = resolve;
      });
      const slowFn = jest.fn().mockReturnValue(firstPromise);
      const secondFn = jest.fn().mockResolvedValue('second');
      const fallbackFn = jest.fn().mockResolvedValue('fallback');
      
      // First request starts
      const executePromise = circuitBreaker.execute(slowFn);
      
      // Second request should use fallback
      const result = await circuitBreaker.execute(secondFn, fallbackFn);
      expect(result).toBe('fallback');
      
      // Complete the first request
      resolveFirst!('first');
      await executePromise;
    });
  });

  describe('Timeout handling', () => {
    it('should timeout slow requests', async () => {
      const slowFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000, 'slow'))
      );
      
      const executePromise = circuitBreaker.execute(slowFn);
      
      // Advance past request timeout
      jest.advanceTimersByTime(testConfig.requestTimeout + 10);
      
      await expect(executePromise).rejects.toThrow(/timeout/i);
    });
  });

  describe('Manual controls', () => {
    it('should force open circuit', () => {
      expect(circuitBreaker.getState()).toBe('CLOSED');
      
      circuitBreaker.forceOpen();
      
      expect(circuitBreaker.getState()).toBe('OPEN');
    });

    it('should force close circuit', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      }
      
      expect(circuitBreaker.getState()).toBe('OPEN');
      
      circuitBreaker.forceClose();
      
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should reset all statistics', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(mockFn);
      await circuitBreaker.execute(mockFn);
      
      circuitBreaker.reset();
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.state).toBe('CLOSED');
    });
  });

  describe('Error classification', () => {
    it('should NOT trip circuit for rate limits (429)', () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;
      
      expect(CircuitBreaker.shouldTripCircuit(rateLimitError)).toBe(false);
    });

    it('should NOT trip circuit for client errors (400)', () => {
      const clientError = new Error('Bad request');
      (clientError as any).status = 400;
      
      expect(CircuitBreaker.shouldTripCircuit(clientError)).toBe(false);
    });

    it('should NOT trip circuit for auth errors (401, 403)', () => {
      const authError = new Error('Unauthorized');
      (authError as any).status = 401;
      
      expect(CircuitBreaker.shouldTripCircuit(authError)).toBe(false);
    });

    it('should trip circuit for server errors (5xx)', () => {
      const serverError = new Error('Internal server error');
      (serverError as any).status = 500;
      
      expect(CircuitBreaker.shouldTripCircuit(serverError)).toBe(true);
    });

    it('should trip circuit for timeout errors', () => {
      const timeoutError = new Error('Request timeout');
      
      expect(CircuitBreaker.shouldTripCircuit(timeoutError)).toBe(true);
    });

    it('should trip circuit for unknown errors', () => {
      expect(CircuitBreaker.shouldTripCircuit(new Error('Unknown'))).toBe(true);
      expect(CircuitBreaker.shouldTripCircuit('string error')).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should track all statistics correctly', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      
      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRequests).toBe(2);
      expect(stats.failedRequests).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
      expect(stats.consecutiveSuccesses).toBe(0);
      expect(stats.lastSuccessTime).toBeInstanceOf(Date);
      expect(stats.lastFailureTime).toBeInstanceOf(Date);
    });
  });

  describe('Default configurations', () => {
    it('should have cloud config as default', () => {
      const defaultBreaker = new CircuitBreaker('default');
      const stats = defaultBreaker.getStats();
      
      expect(stats.state).toBe('CLOSED');
      defaultBreaker.destroy();
    });

    it('should have configurations for different provider types', () => {
      expect(LLM_CIRCUIT_CONFIGS.cloud).toBeDefined();
      expect(LLM_CIRCUIT_CONFIGS.local).toBeDefined();
      expect(LLM_CIRCUIT_CONFIGS.enterprise).toBeDefined();
      
      // Cloud should have longer timeouts than local
      expect(LLM_CIRCUIT_CONFIGS.cloud.requestTimeout).toBeGreaterThan(
        LLM_CIRCUIT_CONFIGS.local.requestTimeout
      );
    });
  });
});

describe('CircuitBreakerOpenError', () => {
  it('should contain provider name and state', () => {
    const error = new CircuitBreakerOpenError('openai', 'OPEN', new Date());
    
    expect(error.providerName).toBe('openai');
    expect(error.state).toBe('OPEN');
    expect(error.name).toBe('CircuitBreakerOpenError');
    expect(error.message).toContain('openai');
    expect(error.message).toContain('OPEN');
  });
});
