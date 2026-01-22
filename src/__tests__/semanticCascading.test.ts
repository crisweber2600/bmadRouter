import { RoutingEngine, CascadeResult } from '../routing/routingEngine';
import { RoutingSignals, ModelTier } from '../types';

jest.mock('../observability/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Semantic Agreement Cascading', () => {
  let engine: RoutingEngine;

  beforeEach(() => {
    engine = new RoutingEngine();
  });

  describe('Cascade Thresholds', () => {
    it('should expose cascade threshold configuration', () => {
      const thresholds = engine.getCascadeThresholds();
      
      expect(thresholds.cascade).toBe(0.7);
      expect(thresholds.consensus).toBe(0.85);
      expect(thresholds.minimum).toBe(0.5);
    });
  });

  describe('High Confidence Decisions', () => {
    it('should return immediately for high confidence signals', async () => {
      const signals: RoutingSignals = {
        tokenCount: 20,
        complexity: 0.2,
        hasCode: false,
        intentCategory: 'factual',
        confidence: 0.9,
      };

      const decision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, signals);

      expect(decision.decisionPath).toBe('heuristic');
      expect(decision.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should route code queries to PREMIUM with high confidence', async () => {
      const signals: RoutingSignals = {
        tokenCount: 100,
        complexity: 0.6,
        hasCode: true,
        intentCategory: 'code',
        confidence: 0.9,
      };

      const decision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, signals);

      expect(decision.selectedTier).toBe('PREMIUM');
      expect(decision.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Cascade Escalation', () => {
    it('should cascade to higher tier when confidence is below threshold', async () => {
      const signals: RoutingSignals = {
        tokenCount: 50,
        complexity: 0.4,
        hasCode: false,
        intentCategory: 'mixed',
        confidence: 0.5,
      };

      const decision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, signals);

      expect(['cascade', 'consensus']).toContain(decision.decisionPath);
    });

    it('should use multi-signal consensus for very ambiguous queries', async () => {
      const signals: RoutingSignals = {
        tokenCount: 75,
        complexity: 0.55,
        hasCode: false,
        intentCategory: 'mixed',
        confidence: 0.4,
      };

      const decision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, signals);

      expect(['cascade', 'consensus']).toContain(decision.decisionPath);
      expect(decision.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('Intent-Based Routing', () => {
    it('should route factual queries efficiently', async () => {
      const signals: RoutingSignals = {
        tokenCount: 30,
        complexity: 0.25,
        hasCode: false,
        intentCategory: 'factual',
        confidence: 0.85,
      };

      const decision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, signals);

      expect(['FREE', 'CHEAP']).toContain(decision.selectedTier);
    });

    it('should route reasoning queries to BALANCED tier', async () => {
      const signals: RoutingSignals = {
        tokenCount: 100,
        complexity: 0.55,
        hasCode: false,
        intentCategory: 'reasoning',
        confidence: 0.8,
      };

      const decision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, signals);

      expect(['BALANCED', 'PREMIUM']).toContain(decision.selectedTier);
    });

    it('should route creative queries appropriately', async () => {
      const signals: RoutingSignals = {
        tokenCount: 80,
        complexity: 0.5,
        hasCode: false,
        intentCategory: 'creative',
        confidence: 0.75,
      };

      const decision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, signals);

      expect(['CHEAP', 'BALANCED', 'PREMIUM']).toContain(decision.selectedTier);
    });
  });

  describe('Multi-Signal Consensus', () => {
    it('should weigh token count in consensus scoring', async () => {
      const shortSignals: RoutingSignals = {
        tokenCount: 10,
        complexity: 0.5,
        hasCode: false,
        intentCategory: 'mixed',
        confidence: 0.5,
      };

      const longSignals: RoutingSignals = {
        tokenCount: 500,
        complexity: 0.5,
        hasCode: false,
        intentCategory: 'mixed',
        confidence: 0.5,
      };

      const shortDecision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, shortSignals);
      const longDecision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, longSignals);

      const tierOrder: ModelTier[] = ['FREE', 'CHEAP', 'BALANCED', 'PREMIUM', 'FALLBACK'];
      const shortIndex = tierOrder.indexOf(shortDecision.selectedTier);
      const longIndex = tierOrder.indexOf(longDecision.selectedTier);

      expect(longIndex).toBeGreaterThanOrEqual(shortIndex);
    });

    it('should prioritize code detection in consensus', async () => {
      const withCode: RoutingSignals = {
        tokenCount: 50,
        complexity: 0.3,
        hasCode: true,
        intentCategory: 'code',
        confidence: 0.6,
      };

      const withoutCode: RoutingSignals = {
        tokenCount: 50,
        complexity: 0.3,
        hasCode: false,
        intentCategory: 'factual',
        confidence: 0.6,
      };

      const codeDecision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, withCode);
      const noCodeDecision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, withoutCode);

      expect(codeDecision.selectedTier).toBe('PREMIUM');
      
      const tierOrder: ModelTier[] = ['FREE', 'CHEAP', 'BALANCED', 'PREMIUM', 'FALLBACK'];
      expect(tierOrder.indexOf(codeDecision.selectedTier)).toBeGreaterThan(
        tierOrder.indexOf(noCodeDecision.selectedTier)
      );
    });
  });

  describe('Override and Bypass Handling', () => {
    it('should respect explicit tier override', async () => {
      const signals: RoutingSignals = {
        tokenCount: 20,
        complexity: 0.2,
        hasCode: false,
        intentCategory: 'factual',
        confidence: 0.9,
      };

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
        bmadRouter: {
          tier: 'PREMIUM' as ModelTier,
          reason: 'Testing override',
        },
      };

      const decision = await engine.makeDecision(request, signals);

      expect(decision.selectedTier).toBe('PREMIUM');
      expect(decision.decisionPath).toBe('override');
      expect(decision.confidence).toBe(0.95);
    });

    it('should respect bypass flag', async () => {
      const signals: RoutingSignals = {
        tokenCount: 20,
        complexity: 0.2,
        hasCode: false,
        intentCategory: 'factual',
        confidence: 0.9,
      };

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
        bmadRouter: {
          bypass: true,
        },
      };

      const decision = await engine.makeDecision(request, signals);

      expect(decision.selectedTier).toBe('PREMIUM');
      expect(decision.decisionPath).toBe('bypass');
    });

    it('should cascade on invalid tier override', async () => {
      const signals: RoutingSignals = {
        tokenCount: 50,
        complexity: 0.5,
        hasCode: false,
        intentCategory: 'mixed',
        confidence: 0.6,
      };

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
        bmadRouter: {
          tier: 'INVALID_TIER' as ModelTier,
        },
      };

      const decision = await engine.makeDecision(request, signals);

      expect(decision.decisionPath).toBe('cascade_fallback');
    });
  });

  describe('Fallback Decision', () => {
    it('should return FALLBACK tier with high confidence', async () => {
      const decision = await engine.makeFallbackDecision();

      expect(decision.selectedTier).toBe('FALLBACK');
      expect(decision.selectedModel).toBe('claude-opus');
      expect(decision.selectedProvider).toBe('anthropic');
      expect(decision.confidence).toBe(0.99);
      expect(decision.decisionPath).toBe('fallback');
    });
  });

  describe('Provider Selection', () => {
    it('should select correct provider for each model', async () => {
      const openaiSignals: RoutingSignals = {
        tokenCount: 30,
        complexity: 0.25,
        hasCode: false,
        intentCategory: 'factual',
        confidence: 0.9,
      };

      const decision = await engine.makeDecision({ messages: [{ role: 'user', content: 'test' }] }, openaiSignals);

      expect(decision.selectedProvider).toBeDefined();
      expect(['openai', 'anthropic', 'google']).toContain(decision.selectedProvider);
    });
  });
});
