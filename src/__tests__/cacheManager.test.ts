import { LLMRequest, LLMResponse } from '../types';

// Create mock instance that persists across tests
const mockRedisInstance = {
  on: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue('OK'),
  ttl: jest.fn().mockResolvedValue(3600),
  flushdb: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn(),
};

// Mock ioredis before importing CacheManager
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

// Mock logger to prevent console noise
jest.mock('../observability/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import AFTER mocks are set up
import { CacheManager } from '../cache/cacheManager';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  const mockRequest: LLMRequest = {
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'What is 2+2?' },
    ],
    temperature: 0.7,
    max_tokens: 100,
  };

  const mockResponse: LLMResponse = {
    id: 'resp-123',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: '4' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 1,
      total_tokens: 11,
    },
  };

  beforeEach(() => {
    // Reset all mocks but keep implementations
    mockRedisInstance.on.mockClear();
    mockRedisInstance.connect.mockClear().mockResolvedValue(undefined);
    mockRedisInstance.get.mockClear();
    mockRedisInstance.setex.mockClear().mockResolvedValue('OK');
    mockRedisInstance.ttl.mockClear().mockResolvedValue(3600);
    mockRedisInstance.flushdb.mockClear().mockResolvedValue('OK');
    
    cacheManager = new CacheManager();
  });

  describe('constructor', () => {
    it('should initialize Redis client with default config', () => {
      expect(cacheManager).toBeDefined();
      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should handle Redis connection errors', () => {
      // Get the error handler that was registered
      const errorHandler = mockRedisInstance.on.mock.calls.find(
        (call: [string, (...args: unknown[]) => void]) => call[0] === 'error'
      )?.[1];
      
      // Simulate error
      if (errorHandler) {
        errorHandler(new Error('Connection refused'));
      }
      
      // Logger should have been called (mocked)
      const { logger } = require('../observability/logger');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('checkCache', () => {
    it('should return cache hit when data exists', async () => {
      const cachedData = {
        response: mockResponse,
        confidence: 0.95,
      };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(cachedData));
      mockRedisInstance.ttl.mockResolvedValue(3600);

      const result = await cacheManager.checkCache(mockRequest);

      expect(result.hit).toBe(true);
      expect(result.response).toEqual(mockResponse);
      expect(result.confidence).toBe(0.95);
      expect(result.source).toBe('exact');
      expect(result.ttl).toBe(3600);
    });

    it('should return cache miss when no data exists', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await cacheManager.checkCache(mockRequest);

      expect(result.hit).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.source).toBe('exact');
    });

    it('should handle cache check errors gracefully', async () => {
      mockRedisInstance.connect.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await cacheManager.checkCache(mockRequest);

      expect(result.hit).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should use default confidence when not stored', async () => {
      const cachedData = {
        response: mockResponse,
        // No confidence field
      };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await cacheManager.checkCache(mockRequest);

      expect(result.hit).toBe(true);
      expect(result.confidence).toBe(0.95); // Default value
    });
  });

  describe('storeResponse', () => {
    it('should store response in cache', async () => {
      const decision = { tier: 'CHEAP', confidence: 0.9 };

      await cacheManager.storeResponse(mockRequest, mockResponse, decision);

      expect(mockRedisInstance.connect).toHaveBeenCalled();
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        expect.stringContaining('cache:'),
        86400, // 24 hours in seconds
        expect.any(String)
      );
    });

    it('should handle storage errors gracefully', async () => {
      mockRedisInstance.setex.mockRejectedValueOnce(new Error('Storage failed'));

      // Should not throw
      await expect(
        cacheManager.storeResponse(mockRequest, mockResponse, {})
      ).resolves.not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return default stats (not yet implemented)', async () => {
      const stats = await cacheManager.getStats();

      expect(stats).toEqual({ hits: 0, misses: 0, hitRate: 0 });
    });
  });

  describe('clear', () => {
    it('should flush the cache database', async () => {
      await cacheManager.clear();

      expect(mockRedisInstance.flushdb).toHaveBeenCalled();
    });

    it('should handle clear errors gracefully', async () => {
      mockRedisInstance.flushdb.mockRejectedValueOnce(new Error('Flush failed'));

      // Should not throw
      await expect(cacheManager.clear()).resolves.not.toThrow();
    });
  });

  describe('createCacheKey (via checkCache)', () => {
    it('should create deterministic cache keys', async () => {
      mockRedisInstance.get.mockResolvedValue(null);
      
      // First call
      await cacheManager.checkCache(mockRequest);
      expect(mockRedisInstance.get).toHaveBeenCalledTimes(1);
      const firstCall = mockRedisInstance.get.mock.calls[0][0] as string;
      
      // Second call with same request
      await cacheManager.checkCache(mockRequest);
      expect(mockRedisInstance.get).toHaveBeenCalledTimes(2);
      const secondCall = mockRedisInstance.get.mock.calls[1][0] as string;

      expect(firstCall).toBe(secondCall);
      expect(firstCall).toMatch(/^cache:[a-f0-9]{64}$/);
    });

    it('should create different keys for different requests', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      await cacheManager.checkCache(mockRequest);
      const firstKey = mockRedisInstance.get.mock.calls[0][0] as string;

      const differentRequest: LLMRequest = {
        ...mockRequest,
        messages: [{ role: 'user', content: 'Different question' }],
      };
      await cacheManager.checkCache(differentRequest);
      const secondKey = mockRedisInstance.get.mock.calls[1][0] as string;

      expect(firstKey).not.toBe(secondKey);
    });
  });
});
