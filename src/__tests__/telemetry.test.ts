import { TelemetryCollector } from '../observability/telemetry';
import { RouterDecisionTrace } from '../types';

describe('TelemetryCollector Tests', () => {
  let telemetry: TelemetryCollector;

  beforeEach(() => {
    telemetry = new TelemetryCollector();
  });

  const createMockTrace = (overrides = {}): RouterDecisionTrace => ({
    requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    selectedModel: 'gpt-4-turbo',
    selectedTier: 'CHEAP',
    decisionPath: 'heuristic',
    signals: {
      tokenCount: 50,
      complexity: 0.3,
      hasCode: false,
      intentCategory: 'factual',
      confidence: 0.8,
    },
    explanation: {
      decision: 'Routed to CHEAP tier',
      reasoning: ['Low complexity', 'Factual query'],
      confidence: 0.85,
      costSavings: '75%',
      overrideHint: 'Use PREMIUM for complex analysis',
    },
    execution: {
      latencyMs: 15,
      cost: 0.0001,
      tokenUsage: { input: 50, output: 100 },
    },
    ...overrides,
  });

  describe('recordDecision', () => {
    it('should record a decision trace', async () => {
      const trace = createMockTrace();

      await telemetry.recordDecision(trace);

      const decisions = telemetry.getRecentDecisions();
      expect(decisions.length).toBe(1);
      expect(decisions[0].requestId).toBe(trace.requestId);
    });

    it('should record multiple decisions', async () => {
      const traces = [
        createMockTrace({ selectedTier: 'CHEAP' }),
        createMockTrace({ selectedTier: 'BALANCED' }),
        createMockTrace({ selectedTier: 'PREMIUM' }),
      ];

      for (const trace of traces) {
        await telemetry.recordDecision(trace);
      }

      const decisions = telemetry.getRecentDecisions();
      expect(decisions.length).toBe(3);
    });

    it('should maintain size limit', async () => {
      for (let i = 0; i < 100; i++) {
        await telemetry.recordDecision(createMockTrace());
      }

      const decisions = telemetry.getRecentDecisions(1000);
      expect(decisions.length).toBeLessThanOrEqual(10000);
    });
  });

  describe('getRecentDecisions', () => {
    it('should return empty array when no decisions', () => {
      const decisions = telemetry.getRecentDecisions();
      expect(decisions).toEqual([]);
    });

    it('should limit results based on parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await telemetry.recordDecision(createMockTrace());
      }

      const decisions = telemetry.getRecentDecisions(5);
      expect(decisions.length).toBe(5);
    });

    it('should return most recent decisions', async () => {
      await telemetry.recordDecision(createMockTrace({ requestId: 'old' }));
      await telemetry.recordDecision(createMockTrace({ requestId: 'new' }));

      const decisions = telemetry.getRecentDecisions(1);
      expect(decisions[0].requestId).toBe('new');
    });
  });

  describe('getDecisionStats', () => {
    it('should return empty stats when no decisions', () => {
      const stats = telemetry.getDecisionStats();

      expect(stats.totalDecisions).toBe(0);
      expect(stats.averageLatency).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.tierDistribution).toEqual({});
      expect(stats.decisionPathDistribution).toEqual({});
    });

    it('should calculate tier distribution correctly', async () => {
      await telemetry.recordDecision(createMockTrace({ selectedTier: 'CHEAP' }));
      await telemetry.recordDecision(createMockTrace({ selectedTier: 'CHEAP' }));
      await telemetry.recordDecision(createMockTrace({ selectedTier: 'PREMIUM' }));

      const stats = telemetry.getDecisionStats();

      expect(stats.tierDistribution['CHEAP']).toBe(2);
      expect(stats.tierDistribution['PREMIUM']).toBe(1);
    });

    it('should calculate decision path distribution', async () => {
      await telemetry.recordDecision(createMockTrace({ decisionPath: 'heuristic' }));
      await telemetry.recordDecision(createMockTrace({ decisionPath: 'heuristic' }));
      await telemetry.recordDecision(createMockTrace({ decisionPath: 'override' }));

      const stats = telemetry.getDecisionStats();

      expect(stats.decisionPathDistribution['heuristic']).toBe(2);
      expect(stats.decisionPathDistribution['override']).toBe(1);
    });

    it('should calculate average latency', async () => {
      await telemetry.recordDecision(
        createMockTrace({ execution: { latencyMs: 10, cost: 0.001, tokenUsage: { input: 10, output: 20 } } })
      );
      await telemetry.recordDecision(
        createMockTrace({ execution: { latencyMs: 20, cost: 0.002, tokenUsage: { input: 20, output: 40 } } })
      );

      const stats = telemetry.getDecisionStats();

      expect(stats.averageLatency).toBe(15);
    });

    it('should calculate average confidence', async () => {
      await telemetry.recordDecision(
        createMockTrace({ explanation: { decision: '', reasoning: [], confidence: 0.8, costSavings: '', overrideHint: '' } })
      );
      await telemetry.recordDecision(
        createMockTrace({ explanation: { decision: '', reasoning: [], confidence: 1.0, costSavings: '', overrideHint: '' } })
      );

      const stats = telemetry.getDecisionStats();

      expect(stats.averageConfidence).toBe(0.9);
    });

    it('should return total decisions count', async () => {
      for (let i = 0; i < 5; i++) {
        await telemetry.recordDecision(createMockTrace());
      }

      const stats = telemetry.getDecisionStats();

      expect(stats.totalDecisions).toBe(5);
    });
  });

  describe('exportMetrics', () => {
    it('should export metrics without error', async () => {
      await telemetry.recordDecision(createMockTrace());

      await expect(telemetry.exportMetrics()).resolves.not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all recorded decisions', async () => {
      await telemetry.recordDecision(createMockTrace());
      await telemetry.recordDecision(createMockTrace());

      telemetry.clear();

      const decisions = telemetry.getRecentDecisions();
      expect(decisions).toEqual([]);
    });
  });
});
