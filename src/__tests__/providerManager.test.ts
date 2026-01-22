import { ProviderManager } from '../providers/providerManager';

describe('ProviderManager Tests', () => {
  let providerManager: ProviderManager;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('initialization', () => {
    it('should initialize with no providers when no API keys', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      providerManager = new ProviderManager();

      expect(providerManager.getAvailableProviders()).toEqual([]);
    });

    it('should initialize OpenAI provider when API key exists', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      providerManager = new ProviderManager();

      expect(providerManager.isProviderAvailable('openai')).toBe(true);
      expect(providerManager.isProviderAvailable('anthropic')).toBe(false);
    });

    it('should initialize Anthropic provider when API key exists', () => {
      delete process.env.OPENAI_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';
      delete process.env.GOOGLE_API_KEY;

      providerManager = new ProviderManager();

      expect(providerManager.isProviderAvailable('anthropic')).toBe(true);
      expect(providerManager.isProviderAvailable('openai')).toBe(false);
    });

    it('should initialize Google provider when API key exists', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      process.env.GOOGLE_API_KEY = 'test-key';

      providerManager = new ProviderManager();

      expect(providerManager.isProviderAvailable('google')).toBe(true);
    });

    it('should initialize all providers when all API keys exist', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.GOOGLE_API_KEY = 'test-key';

      providerManager = new ProviderManager();

      expect(providerManager.getAvailableProviders()).toContain('openai');
      expect(providerManager.getAvailableProviders()).toContain('anthropic');
      expect(providerManager.getAvailableProviders()).toContain('google');
    });
  });

  describe('tier mappings', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      providerManager = new ProviderManager();
    });

    it('should return provider for CHEAP tier', () => {
      expect(providerManager.getTierMapping('CHEAP')).toBe('openai');
    });

    it('should return provider for BALANCED tier', () => {
      expect(providerManager.getTierMapping('BALANCED')).toBe('anthropic');
    });

    it('should return provider for PREMIUM tier', () => {
      expect(providerManager.getTierMapping('PREMIUM')).toBe('anthropic');
    });

    it('should return provider for FALLBACK tier', () => {
      expect(providerManager.getTierMapping('FALLBACK')).toBe('anthropic');
    });

    it('should update tier mapping successfully', () => {
      providerManager.updateTierMapping('CHEAP', 'anthropic');
      expect(providerManager.getTierMapping('CHEAP')).toBe('anthropic');
    });

    it('should throw error when updating to unavailable provider', () => {
      expect(() => {
        providerManager.updateTierMapping('CHEAP', 'unknown-provider');
      }).toThrow('Provider not available: unknown-provider');
    });
  });

  describe('provider availability', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test-key';
      providerManager = new ProviderManager();
    });

    it('should return true for available provider', () => {
      expect(providerManager.isProviderAvailable('openai')).toBe(true);
    });

    it('should return false for unavailable provider', () => {
      expect(providerManager.isProviderAvailable('nonexistent')).toBe(false);
    });
  });

  describe('executeRequest', () => {
    it('should throw error when tier has no provider mapping', async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      providerManager = new ProviderManager();

      const decision = {
        selectedTier: 'CHEAP' as const,
        selectedModel: 'gpt-4',
        decisionPath: 'heuristic' as const,
        confidence: 0.8,
      };

      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(providerManager.executeRequest(decision, request)).rejects.toThrow(
        'Provider not available'
      );
    });
  });
});
