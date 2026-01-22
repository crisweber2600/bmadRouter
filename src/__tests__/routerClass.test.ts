import { Request, Response } from 'express';

jest.mock('../observability/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Router Class', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let Router: any;
  let CacheManagerMock: jest.Mock;
  let PromptProcessorMock: jest.Mock;
  let RoutingEngineMock: jest.Mock;
  let ProviderManagerMock: jest.Mock;
  let TelemetryCollectorMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    
    mockReq = {
      body: {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4',
      },
      headers: {},
    };
    
    mockRes = {
      json: jsonMock,
      status: statusMock,
    };
  });

  const setupRouter = (options: {
    cacheHit?: boolean;
    providerFails?: boolean;
    providerAlwaysFails?: boolean;
  } = {}) => {
    CacheManagerMock = jest.fn().mockImplementation(() => ({
      checkCache: jest.fn().mockResolvedValue(
        options.cacheHit
          ? {
              hit: true,
              response: {
                id: 'cached_123',
                object: 'chat.completion',
                created: Date.now(),
                model: 'cached-model',
                choices: [{ index: 0, message: { role: 'assistant', content: 'Cached' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
              },
              confidence: 0.95,
              source: 'exact',
            }
          : { hit: false }
      ),
      storeResponse: jest.fn().mockResolvedValue(undefined),
    }));

    PromptProcessorMock = jest.fn().mockImplementation(() => ({
      processPrompt: jest.fn().mockResolvedValue({
        tokenCount: 50,
        complexity: 0.3,
        hasCode: false,
        intentCategory: 'factual',
        confidence: 0.8,
      }),
    }));

    RoutingEngineMock = jest.fn().mockImplementation(() => ({
      makeDecision: jest.fn().mockResolvedValue({
        selectedTier: 'CHEAP',
        selectedModel: 'gpt-4o-mini',
        selectedProvider: 'openai',
        decisionPath: 'heuristic',
        confidence: 0.85,
      }),
      makeFallbackDecision: jest.fn().mockResolvedValue({
        selectedTier: 'FALLBACK',
        selectedModel: 'claude-opus',
        selectedProvider: 'anthropic',
        decisionPath: 'fallback',
        confidence: 0.99,
      }),
    }));

    let providerCallCount = 0;
    ProviderManagerMock = jest.fn().mockImplementation(() => ({
      executeRequest: jest.fn().mockImplementation(() => {
        providerCallCount++;
        if (options.providerAlwaysFails) {
          return Promise.reject(new Error('All providers down'));
        }
        if (options.providerFails && providerCallCount === 1) {
          return Promise.reject(new Error('Provider failed'));
        }
        return Promise.resolve({
          id: 'resp_123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4o-mini',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
      }),
    }));

    TelemetryCollectorMock = jest.fn().mockImplementation(() => ({
      recordDecision: jest.fn().mockResolvedValue(undefined),
    }));

    jest.doMock('../cache/cacheManager', () => ({ CacheManager: CacheManagerMock }));
    jest.doMock('../routing/promptProcessor', () => ({ PromptProcessor: PromptProcessorMock }));
    jest.doMock('../routing/routingEngine', () => ({ RoutingEngine: RoutingEngineMock }));
    jest.doMock('../providers/providerManager', () => ({ ProviderManager: ProviderManagerMock }));
    jest.doMock('../observability/telemetry', () => ({ TelemetryCollector: TelemetryCollectorMock }));

    Router = require('../routing/router').Router;
    return new Router();
  };

  describe('handleChatCompletion', () => {
    it('should process valid request successfully', async () => {
      const router = setupRouter();
      await router.handleChatCompletion(mockReq as Request, mockRes as Response);
      
      expect(jsonMock).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return cached response on cache hit', async () => {
      const router = setupRouter({ cacheHit: true });
      await router.handleChatCompletion(mockReq as Request, mockRes as Response);
      
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cached_123' })
      );
    });

    it('should handle invalid request without messages via fallback', async () => {
      mockReq.body = { model: 'gpt-4' };
      const router = setupRouter();
      
      await router.handleChatCompletion(mockReq as Request, mockRes as Response);
      
      expect(jsonMock).toHaveBeenCalled();
    });

    it('should use fallback when primary request fails', async () => {
      const router = setupRouter({ providerFails: true });
      await router.handleChatCompletion(mockReq as Request, mockRes as Response);
      
      expect(jsonMock).toHaveBeenCalled();
    });

    it('should return 500 when both primary and fallback fail', async () => {
      const router = setupRouter({ providerAlwaysFails: true });
      await router.handleChatCompletion(mockReq as Request, mockRes as Response);
      
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            type: 'service_unavailable',
          }),
        })
      );
    });

    it('should extract router headers', async () => {
      mockReq.headers = {
        'x-router-tier': 'PREMIUM',
        'x-router-reason': 'Critical query',
        'x-router-bypass': 'true',
      };
      const router = setupRouter();
      
      await router.handleChatCompletion(mockReq as Request, mockRes as Response);
      
      expect(jsonMock).toHaveBeenCalled();
    });
  });
});
