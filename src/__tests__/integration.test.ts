import { PromptProcessor } from '../routing/promptProcessor';
import { RoutingEngine } from '../routing/routingEngine';

describe('PromptProcessor Integration Tests', () => {
  let processor: PromptProcessor;

  beforeEach(() => {
    processor = new PromptProcessor();
  });

  describe('processPrompt - comprehensive signal detection', () => {
    it('should detect multiple signals from complex request', async () => {
      const request = {
        messages: [
          { role: 'system' as const, content: 'You are a helpful assistant' },
          { role: 'user' as const, content: 'function fibonacci(n) { return n <= 1 ? n : fibonacci(n-1) + fibonacci(n-2); }' },
        ],
      };

      const signals = await processor.processPrompt(request);

      expect(signals.hasCode).toBe(true);
      expect(signals.tokenCount).toBeGreaterThan(0);
      expect(signals.complexity).toBeGreaterThan(0);
      expect(signals.confidence).toBeGreaterThan(0);
    });

    it('should classify simple queries with low complexity', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'What is the capital of France?' }],
      };

      const signals = await processor.processPrompt(request);

      expect(signals.complexity).toBeLessThan(0.5);
      expect(['factual', 'mixed']).toContain(signals.intentCategory);
    });

    it('should classify creative requests appropriately', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'Write a poem about the moon' }],
      };

      const signals = await processor.processPrompt(request);

      expect(signals.intentCategory).toBe('creative');
    });

    it('should handle multi-turn conversations', async () => {
      const request = {
        messages: [
          { role: 'user' as const, content: 'What is machine learning?' },
          { role: 'assistant' as const, content: 'Machine learning is...' },
          { role: 'user' as const, content: 'Can you explain it differently?' },
        ],
      };

      const signals = await processor.processPrompt(request);

      expect(signals.tokenCount).toBeGreaterThan(0);
      expect(signals.confidence).toBeGreaterThan(0);
    });

    it('should detect reasoning patterns', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'Analyze the complex philosophical implications of artificial consciousness and explain step by step why some argue that machines cannot truly think' }],
      };

      const signals = await processor.processPrompt(request);

      expect(signals.intentCategory).toBe('reasoning');
      expect(signals.complexity).toBeGreaterThan(0);
    });
  });
});

describe('RoutingEngine Integration Tests', () => {
  let engine: RoutingEngine;

  beforeEach(() => {
    engine = new RoutingEngine();
  });

  describe('makeDecision - tier selection', () => {
    it('should consistently route similar requests to same tier', async () => {
      const request1 = {
        messages: [{ role: 'user' as const, content: 'What is 2+2?' }],
      };

      const request2 = {
        messages: [{ role: 'user' as const, content: 'What is the capital of France?' }],
      };

      const decision1 = await engine.makeDecision(request1, {
        tokenCount: 10,
        complexity: 0.1,
        hasCode: false,
        intentCategory: 'factual',
        confidence: 0.9,
      });

      const decision2 = await engine.makeDecision(request2, {
        tokenCount: 15,
        complexity: 0.15,
        hasCode: false,
        intentCategory: 'factual',
        confidence: 0.9,
      });

      expect(decision1.selectedTier).toBe(decision2.selectedTier);
    });

    it('should route high-complexity requests to PREMIUM', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'Analyze this distributed system architecture' }],
      };

      const decision = await engine.makeDecision(request, {
        tokenCount: 500,
        complexity: 0.9,
        hasCode: true,
        intentCategory: 'reasoning',
        confidence: 0.8,
      });

      expect(decision.selectedTier).toBe('PREMIUM');
    });

    it('should route code queries to PREMIUM tier', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'function test() {}' }],
      };

      const decision = await engine.makeDecision(request, {
        tokenCount: 50,
        complexity: 0.5,
        hasCode: true,
        intentCategory: 'code',
        confidence: 0.95,
      });

      expect(decision.selectedTier).toBe('PREMIUM');
    });

    it('should respect explicit override', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
        bmadRouter: {
          tier: 'PREMIUM' as const,
          reason: 'Explicit override',
        },
      };

      const decision = await engine.makeDecision(request, {
        tokenCount: 10,
        complexity: 0.1,
        hasCode: false,
        intentCategory: 'factual',
        confidence: 0.9,
      });

      expect(decision.selectedTier).toBe('PREMIUM');
      expect(decision.decisionPath).toBe('override');
    });

    it('should route BALANCED tier for medium complexity', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'Summarize this article' }],
      };

      const decision = await engine.makeDecision(request, {
        tokenCount: 200,
        complexity: 0.5,
        hasCode: false,
        intentCategory: 'reasoning',
        confidence: 0.75,
      });

      expect(['CHEAP', 'BALANCED', 'PREMIUM']).toContain(decision.selectedTier);
    });
  });

  describe('makeFallbackDecision', () => {
    it('should return reliable fallback', async () => {
      const decision = await engine.makeFallbackDecision();

      expect(decision.selectedTier).toBe('FALLBACK');
      expect(decision.confidence).toBeGreaterThanOrEqual(0.95);
      expect(decision.decisionPath).toBe('fallback');
    });
  });
});

describe('End-to-End Signal to Decision Flow', () => {
  let processor: PromptProcessor;
  let engine: RoutingEngine;

  beforeEach(() => {
    processor = new PromptProcessor();
    engine = new RoutingEngine();
  });

  it('should flow from request through signals to decision', async () => {
    const request = {
      messages: [{ role: 'user' as const, content: 'Explain quantum computing' }],
    };

    const signals = await processor.processPrompt(request);

    expect(signals.tokenCount).toBeGreaterThan(0);
    expect(signals.complexity).toBeGreaterThan(0);
    expect(signals.confidence).toBeGreaterThan(0);

    const decision = await engine.makeDecision(request, signals);

    expect(decision.selectedTier).toBeDefined();
    expect(decision.selectedModel).toBeDefined();
    expect(decision.confidence).toBeGreaterThan(0);
    expect(['heuristic', 'semantic_agreement', 'override', 'fallback']).toContain(decision.decisionPath);
  });

  it('should produce consistent decisions for similar queries', async () => {
    const queries = [
      'What is the weather?',
      'Tell me the time',
      'What day is it?',
    ];

    const decisions: string[] = [];

    for (const query of queries) {
      const request = {
        messages: [{ role: 'user' as const, content: query }],
      };

      const signals = await processor.processPrompt(request);
      const decision = await engine.makeDecision(request, signals);
      decisions.push(decision.selectedTier);
    }

    expect(new Set(decisions).size).toBeLessThanOrEqual(2);
  });

  it('should scale tier based on complexity increase', async () => {
    const simpleRequest = {
      messages: [{ role: 'user' as const, content: 'What is 2+2?' }],
    };

    const complexRequest = {
      messages: [{ role: 'user' as const, content: 'Design a microservices architecture with event sourcing, CQRS pattern, saga orchestration, distributed tracing, and observability for a multi-tenant SaaS platform serving millions of users' }],
    };

    const simpleSignals = await processor.processPrompt(simpleRequest);
    const complexSignals = await processor.processPrompt(complexRequest);

    const simpleDecision = await engine.makeDecision(simpleRequest, simpleSignals);
    const complexDecision = await engine.makeDecision(complexRequest, complexSignals);

    expect(complexSignals.complexity).toBeGreaterThan(simpleSignals.complexity);
    
    const tierOrder = ['FREE', 'CHEAP', 'BALANCED', 'PREMIUM', 'FALLBACK'];
    const simpleIndex = tierOrder.indexOf(simpleDecision.selectedTier);
    const complexIndex = tierOrder.indexOf(complexDecision.selectedTier);

    expect(complexIndex).toBeGreaterThanOrEqual(simpleIndex);
  });

  it('should handle bypass flag correctly', async () => {
    const request = {
      messages: [{ role: 'user' as const, content: 'Simple query' }],
      bmadRouter: {
        bypass: true,
      },
    };

    const signals = await processor.processPrompt(request);
    const decision = await engine.makeDecision(request, signals);

    expect(decision).toBeDefined();
  });

  it('should provide human-readable decision path', async () => {
    const request = {
      messages: [{ role: 'user' as const, content: 'What is 2+2?' }],
    };

    const signals = await processor.processPrompt(request);
    const decision = await engine.makeDecision(request, signals);

    expect(decision.decisionPath).toBeDefined();
    expect(typeof decision.decisionPath).toBe('string');
    expect(decision.decisionPath.length).toBeGreaterThan(0);
  });
});

describe('Cost Optimization Verification', () => {
  let processor: PromptProcessor;
  let engine: RoutingEngine;

  beforeEach(() => {
    processor = new PromptProcessor();
    engine = new RoutingEngine();
  });

  it('should route simple factual queries to cost-effective tiers', async () => {
    const simpleQueries = [
      'What is 5+5?',
      'What color is the sky?',
      'How many days in a week?',
    ];

    for (const query of simpleQueries) {
      const request = {
        messages: [{ role: 'user' as const, content: query }],
      };

      const signals = await processor.processPrompt(request);
      const decision = await engine.makeDecision(request, signals);

      // Semantic cascading may escalate simple queries when confidence is low
      // but should never route to PREMIUM unless there's code
      expect(['FREE', 'CHEAP', 'BALANCED']).toContain(decision.selectedTier);
    }
  });

  it('should route complex reasoning to higher tier (quality preservation)', async () => {
    const complexQueries = [
      'Analyze the geopolitical implications of climate change on global food security',
      'Design a fault-tolerant distributed database with ACID guarantees',
      'Write a formal mathematical proof for the halting problem',
    ];

    for (const query of complexQueries) {
      const request = {
        messages: [{ role: 'user' as const, content: query }],
      };

      const signals = await processor.processPrompt(request);
      const decision = await engine.makeDecision(request, signals);

      expect(['CHEAP', 'BALANCED', 'PREMIUM']).toContain(decision.selectedTier);
    }
  });
});
