import { PromptProcessor } from '../routing/promptProcessor';
import { RoutingEngine } from '../routing/routingEngine';

jest.mock('../observability/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('PromptProcessor', () => {
  let processor: PromptProcessor;

  beforeEach(() => {
    processor = new PromptProcessor();
  });

  describe('processPrompt', () => {
    it('should classify simple factual queries as low complexity', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'What is the capital of France?' }],
      };

      const signals = await processor.processPrompt(request);

      expect(signals.complexity).toBeLessThan(0.5);
      expect(signals.intentCategory).toBe('factual');
      expect(signals.hasCode).toBe(false);
    });

    it('should detect code in queries', async () => {
      const request = {
        messages: [{
          role: 'user' as const,
          content: 'function calculateSum(a, b) { return a + b; }',
        }],
      };

      const signals = await processor.processPrompt(request);

      expect(signals.hasCode).toBe(true);
      expect(signals.intentCategory).toBe('code');
    });

    it('should classify reasoning queries as higher complexity', async () => {
      const request = {
        messages: [{
          role: 'user' as const,
          content: 'Explain why the sky is blue and analyze the physics behind light scattering.',
        }],
      };

      const signals = await processor.processPrompt(request);

      expect(signals.intentCategory).toBe('reasoning');
    });
  });
});

describe('RoutingEngine', () => {
  let engine: RoutingEngine;

  beforeEach(() => {
    engine = new RoutingEngine();
  });

  describe('makeDecision', () => {
    it('should route low complexity queries to CHEAP tier', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };
      const signals = {
        tokenCount: 10,
        complexity: 0.2,
        hasCode: false,
        intentCategory: 'factual' as const,
        confidence: 0.8,
      };

      const decision = await engine.makeDecision(request, signals);

      expect(decision.selectedTier).toBe('CHEAP');
      expect(decision.decisionPath).toBe('heuristic');
    });

    it('should route high complexity queries to PREMIUM tier', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'Design a distributed system' }],
      };
      const signals = {
        tokenCount: 500,
        complexity: 0.9,
        hasCode: false,
        intentCategory: 'reasoning' as const,
        confidence: 0.7,
      };

      const decision = await engine.makeDecision(request, signals);

      expect(decision.selectedTier).toBe('PREMIUM');
    });

    it('should route code queries to PREMIUM tier', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'Write a function' }],
      };
      const signals = {
        tokenCount: 100,
        complexity: 0.5,
        hasCode: true,
        intentCategory: 'code' as const,
        confidence: 0.9,
      };

      const decision = await engine.makeDecision(request, signals);

      expect(decision.selectedTier).toBe('PREMIUM');
    });

    it('should respect override requests', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
        bmadRouter: {
          tier: 'PREMIUM' as const,
          reason: 'Critical query',
        },
      };
      const signals = {
        tokenCount: 10,
        complexity: 0.1,
        hasCode: false,
        intentCategory: 'factual' as const,
        confidence: 0.9,
      };

      const decision = await engine.makeDecision(request, signals);

      expect(decision.selectedTier).toBe('PREMIUM');
      expect(decision.decisionPath).toBe('override');
    });
  });

  describe('makeFallbackDecision', () => {
    it('should return FALLBACK tier with high confidence', async () => {
      const decision = await engine.makeFallbackDecision();

      expect(decision.selectedTier).toBe('FALLBACK');
      expect(decision.decisionPath).toBe('fallback');
      expect(decision.confidence).toBe(0.99);
    });
  });
});
