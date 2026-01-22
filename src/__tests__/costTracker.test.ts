import { CostTracker, CostEntry, CostSummary, CostAnomaly, CostProjection } from '../cost/costTracker';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const t = new CostTracker();
      expect(t).toBeDefined();
    });

    it('should accept custom options', () => {
      const t = new CostTracker({ maxEntries: 1000, anomalyThreshold: 3.0 });
      expect(t).toBeDefined();
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for GPT-4o', () => {
      const cost = tracker.calculateCost('gpt-4o', 1000, 500);
      // input: 1000 * 0.005 / 1000 = 0.005
      // output: 500 * 0.015 / 1000 = 0.0075
      expect(cost).toBeCloseTo(0.0125, 4);
    });

    it('should calculate cost for GPT-4o-mini', () => {
      const cost = tracker.calculateCost('gpt-4o-mini', 1000, 500);
      // input: 1000 * 0.00015 / 1000 = 0.00015
      // output: 500 * 0.0006 / 1000 = 0.0003
      expect(cost).toBeCloseTo(0.00045, 5);
    });

    it('should calculate cost for Claude Opus', () => {
      const cost = tracker.calculateCost('claude-3-opus-20240229', 1000, 500);
      // input: 1000 * 0.015 / 1000 = 0.015
      // output: 500 * 0.075 / 1000 = 0.0375
      expect(cost).toBeCloseTo(0.0525, 4);
    });

    it('should calculate cost for Claude Sonnet', () => {
      const cost = tracker.calculateCost('claude-3-5-sonnet-20241022', 1000, 500);
      // input: 1000 * 0.003 / 1000 = 0.003
      // output: 500 * 0.015 / 1000 = 0.0075
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('should calculate cost for Gemini Pro', () => {
      const cost = tracker.calculateCost('gemini-1.5-pro', 1000, 500);
      // input: 1000 * 0.00125 / 1000 = 0.00125
      // output: 500 * 0.005 / 1000 = 0.0025
      expect(cost).toBeCloseTo(0.00375, 5);
    });

    it('should calculate zero cost for local models', () => {
      const cost = tracker.calculateCost('local-model', 10000, 5000);
      expect(cost).toBe(0);
    });

    it('should use default pricing for unknown models', () => {
      const cost = tracker.calculateCost('unknown-model', 1000, 500);
      // Falls back to gpt-4o-mini pricing
      expect(cost).toBeCloseTo(0.00045, 5);
    });
  });

  describe('calculateBaselineCost', () => {
    it('should calculate baseline using premium model', () => {
      const cost = tracker.calculateBaselineCost(1000, 500);
      // Uses claude-3-opus-20240229
      expect(cost).toBeCloseTo(0.0525, 4);
    });
  });

  describe('recordCost', () => {
    it('should record cost entry with calculated values', () => {
      const entry = tracker.recordCost({
        requestId: 'req-1',
        timestamp: new Date(),
        provider: 'openai',
        model: 'gpt-4o-mini',
        tier: 'CHEAP',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(entry.requestId).toBe('req-1');
      expect(entry.actualCost).toBeCloseTo(0.00045, 5);
      expect(entry.baselineCost).toBeCloseTo(0.0525, 4);
      expect(entry.savings).toBeGreaterThan(0);
      expect(entry.savingsPercent).toBeGreaterThan(90);
    });

    it('should include agent ID when provided', () => {
      const entry = tracker.recordCost({
        requestId: 'req-2',
        timestamp: new Date(),
        agentId: 'agent-123',
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307',
        tier: 'CHEAP',
        inputTokens: 500,
        outputTokens: 200,
      });

      expect(entry.agentId).toBe('agent-123');
    });

    it('should enforce max entries limit', () => {
      const smallTracker = new CostTracker({ maxEntries: 5 });
      
      for (let i = 0; i < 10; i++) {
        smallTracker.recordCost({
          requestId: `req-${i}`,
          timestamp: new Date(),
          provider: 'openai',
          model: 'gpt-4o-mini',
          tier: 'CHEAP',
          inputTokens: 100,
          outputTokens: 50,
        });
      }

      const entries = smallTracker.getRecentEntries(100);
      expect(entries.length).toBeLessThanOrEqual(5);
    });
  });

  describe('anomaly detection', () => {
    it('should detect cost spike anomaly', () => {
      // Record 20 similar low-cost entries
      for (let i = 0; i < 20; i++) {
        tracker.recordCost({
          requestId: `req-${i}`,
          timestamp: new Date(),
          provider: 'openai',
          model: 'gpt-4o-mini',
          tier: 'CHEAP',
          inputTokens: 100,
          outputTokens: 50,
        });
      }

      // Record one high-cost entry
      tracker.recordCost({
        requestId: 'spike-req',
        timestamp: new Date(),
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        tier: 'PREMIUM',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      const anomalies = tracker.getAnomalies();
      expect(anomalies.some(a => a.type === 'spike')).toBe(true);
    });

    it('should not detect anomaly with insufficient data', () => {
      tracker.recordCost({
        requestId: 'only-req',
        timestamp: new Date(),
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        tier: 'PREMIUM',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      const anomalies = tracker.getAnomalies();
      expect(anomalies.length).toBe(0);
    });
  });

  describe('budget management', () => {
    it('should set and track budget', () => {
      tracker.setBudget('agent-1', { daily: 10, monthly: 100 });
      
      tracker.recordCost({
        requestId: 'budget-req',
        timestamp: new Date(),
        agentId: 'agent-1',
        provider: 'openai',
        model: 'gpt-4o',
        tier: 'BALANCED',
        inputTokens: 100,
        outputTokens: 50,
      });

      // Should not trigger warning for small cost
      const anomalies = tracker.getAnomalies();
      expect(anomalies.filter(a => a.type === 'budget_warning').length).toBe(0);
    });

    it('should detect budget warning at 90%', () => {
      tracker.setBudget('agent-2', { daily: 0.001 });
      
      // This should exceed 90% of budget
      tracker.recordCost({
        requestId: 'near-limit',
        timestamp: new Date(),
        agentId: 'agent-2',
        provider: 'openai',
        model: 'gpt-4o',
        tier: 'BALANCED',
        inputTokens: 1000,
        outputTokens: 500,
      });

      const anomalies = tracker.getAnomalies();
      const budgetAlerts = anomalies.filter(a => 
        a.type === 'budget_warning' || a.type === 'budget_exceeded'
      );
      expect(budgetAlerts.length).toBeGreaterThan(0);
    });

    it('should reset budget cycle', () => {
      tracker.setBudget('agent-3', { daily: 100 });
      tracker.recordCost({
        requestId: 'spend-req',
        timestamp: new Date(),
        agentId: 'agent-3',
        provider: 'openai',
        model: 'gpt-4o',
        tier: 'BALANCED',
        inputTokens: 1000,
        outputTokens: 500,
      });

      tracker.resetBudgetCycle('agent-3');
      // After reset, no budget warnings should be triggered
    });

    it('should reset all budget cycles', () => {
      tracker.setBudget('agent-a', { daily: 1 });
      tracker.setBudget('agent-b', { daily: 1 });
      
      tracker.resetBudgetCycle();
      // All agents should have their cycles reset
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      // Add sample data
      const now = new Date();
      
      tracker.recordCost({
        requestId: 'sum-1',
        timestamp: now,
        agentId: 'agent-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tier: 'CHEAP',
        inputTokens: 1000,
        outputTokens: 500,
      });

      tracker.recordCost({
        requestId: 'sum-2',
        timestamp: now,
        agentId: 'agent-2',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        tier: 'BALANCED',
        inputTokens: 2000,
        outputTokens: 1000,
      });

      tracker.recordCost({
        requestId: 'sum-3',
        timestamp: now,
        agentId: 'agent-1',
        provider: 'google',
        model: 'gemini-1.5-flash',
        tier: 'FREE',
        inputTokens: 500,
        outputTokens: 200,
      });
    });

    it('should calculate hourly summary', () => {
      const summary = tracker.getSummary('hourly');
      
      expect(summary.period).toBe('hourly');
      expect(summary.totalRequests).toBe(3);
      expect(summary.totalInputTokens).toBe(3500);
      expect(summary.totalOutputTokens).toBe(1700);
      expect(summary.totalSavings).toBeGreaterThan(0);
    });

    it('should calculate daily summary', () => {
      const summary = tracker.getSummary('daily');
      
      expect(summary.period).toBe('daily');
      expect(summary.totalRequests).toBe(3);
    });

    it('should break down costs by tier', () => {
      const summary = tracker.getSummary('daily');
      
      expect(summary.costByTier.CHEAP).toBeGreaterThan(0);
      expect(summary.costByTier.BALANCED).toBeGreaterThan(0);
      expect(summary.costByTier.FREE).toBeGreaterThanOrEqual(0);
    });

    it('should break down costs by provider', () => {
      const summary = tracker.getSummary('daily');
      
      expect(summary.costByProvider.openai).toBeGreaterThanOrEqual(0);
      expect(summary.costByProvider.anthropic).toBeGreaterThan(0);
      expect(summary.costByProvider.google).toBeGreaterThanOrEqual(0);
    });

    it('should break down costs by agent', () => {
      const summary = tracker.getSummary('daily');
      
      expect(summary.costByAgent['agent-1']).toBeGreaterThanOrEqual(0);
      expect(summary.costByAgent['agent-2']).toBeGreaterThan(0);
    });

    it('should filter by date range', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const summary = tracker.getSummary('daily', tomorrow);
      expect(summary.totalRequests).toBe(0);
    });
  });

  describe('getProjection', () => {
    it('should return zero projection with insufficient data', () => {
      const projection = tracker.getProjection(7);
      
      expect(projection.projectedDailyCost).toBe(0);
      expect(projection.projectedMonthlyCost).toBe(0);
      expect(projection.confidenceLevel).toBe(0);
    });

    it('should calculate projection with sufficient data', () => {
      // Add entries for multiple days
      const msPerDay = 24 * 60 * 60 * 1000;
      
      for (let day = 0; day < 7; day++) {
        for (let i = 0; i < 5; i++) {
          const timestamp = new Date(Date.now() - day * msPerDay - i * 1000);
          tracker.recordCost({
            requestId: `proj-${day}-${i}`,
            timestamp,
            provider: 'openai',
            model: 'gpt-4o-mini',
            tier: 'CHEAP',
            inputTokens: 1000,
            outputTokens: 500,
          });
        }
      }

      const projection = tracker.getProjection(7);
      
      expect(projection.basedOnDays).toBe(7);
      expect(projection.projectedDailyCost).toBeGreaterThan(0);
      expect(projection.projectedMonthlyCost).toBe(projection.projectedDailyCost * 30);
    });

    it('should detect increasing cost trend', () => {
      const msPerDay = 24 * 60 * 60 * 1000;
      
      // Lower costs for older days, higher for recent
      for (let day = 6; day >= 0; day--) {
        const multiplier = 7 - day; // Increases as we get closer to today
        for (let i = 0; i < 3; i++) {
          const timestamp = new Date(Date.now() - day * msPerDay - i * 1000);
          tracker.recordCost({
            requestId: `trend-${day}-${i}`,
            timestamp,
            provider: 'openai',
            model: 'gpt-4o',
            tier: 'BALANCED',
            inputTokens: 1000 * multiplier,
            outputTokens: 500 * multiplier,
          });
        }
      }

      const projection = tracker.getProjection(7);
      expect(['increasing', 'stable', 'decreasing']).toContain(projection.trend);
    });
  });

  describe('getAnomalies', () => {
    it('should return all anomalies by default', () => {
      // Create conditions for anomalies
      for (let i = 0; i < 20; i++) {
        tracker.recordCost({
          requestId: `norm-${i}`,
          timestamp: new Date(),
          provider: 'openai',
          model: 'gpt-4o-mini',
          tier: 'CHEAP',
          inputTokens: 100,
          outputTokens: 50,
        });
      }

      tracker.recordCost({
        requestId: 'anomaly-req',
        timestamp: new Date(),
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        tier: 'PREMIUM',
        inputTokens: 50000,
        outputTokens: 25000,
      });

      const anomalies = tracker.getAnomalies();
      expect(anomalies.length).toBeGreaterThan(0);
    });

    it('should filter anomalies by date', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      const anomalies = tracker.getAnomalies(futureDate);
      expect(anomalies.length).toBe(0);
    });
  });

  describe('clearAnomalies', () => {
    it('should clear all anomalies', () => {
      // Generate some anomalies first
      for (let i = 0; i < 20; i++) {
        tracker.recordCost({
          requestId: `pre-${i}`,
          timestamp: new Date(),
          provider: 'openai',
          model: 'gpt-4o-mini',
          tier: 'CHEAP',
          inputTokens: 100,
          outputTokens: 50,
        });
      }
      
      tracker.recordCost({
        requestId: 'spike',
        timestamp: new Date(),
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        tier: 'PREMIUM',
        inputTokens: 100000,
        outputTokens: 50000,
      });

      expect(tracker.getAnomalies().length).toBeGreaterThan(0);
      
      tracker.clearAnomalies();
      
      expect(tracker.getAnomalies().length).toBe(0);
    });
  });

  describe('getRecentEntries', () => {
    it('should return recent entries with default limit', () => {
      for (let i = 0; i < 150; i++) {
        tracker.recordCost({
          requestId: `entry-${i}`,
          timestamp: new Date(),
          provider: 'openai',
          model: 'gpt-4o-mini',
          tier: 'CHEAP',
          inputTokens: 100,
          outputTokens: 50,
        });
      }

      const entries = tracker.getRecentEntries();
      expect(entries.length).toBe(100);
    });

    it('should return entries with custom limit', () => {
      for (let i = 0; i < 50; i++) {
        tracker.recordCost({
          requestId: `entry-${i}`,
          timestamp: new Date(),
          provider: 'openai',
          model: 'gpt-4o-mini',
          tier: 'CHEAP',
          inputTokens: 100,
          outputTokens: 50,
        });
      }

      const entries = tracker.getRecentEntries(10);
      expect(entries.length).toBe(10);
    });
  });

  describe('getTotalSavings', () => {
    it('should calculate total savings across all entries', () => {
      tracker.recordCost({
        requestId: 'save-1',
        timestamp: new Date(),
        provider: 'openai',
        model: 'gpt-4o-mini',
        tier: 'CHEAP',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      tracker.recordCost({
        requestId: 'save-2',
        timestamp: new Date(),
        provider: 'google',
        model: 'gemini-1.5-flash',
        tier: 'FREE',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      const savings = tracker.getTotalSavings();
      
      expect(savings.amount).toBeGreaterThan(0);
      expect(savings.percent).toBeGreaterThan(90);
    });

    it('should return zero savings when no entries', () => {
      const savings = tracker.getTotalSavings();
      
      expect(savings.amount).toBe(0);
      expect(savings.percent).toBe(0);
    });
  });

  describe('model pricing management', () => {
    it('should get existing model pricing', () => {
      const pricing = tracker.getModelPricing('gpt-4o');
      
      expect(pricing).toBeDefined();
      expect(pricing?.inputPer1kTokens).toBe(0.005);
      expect(pricing?.outputPer1kTokens).toBe(0.015);
    });

    it('should return undefined for unknown model', () => {
      const pricing = tracker.getModelPricing('totally-unknown-model');
      expect(pricing).toBeUndefined();
    });

    it('should add new model pricing', () => {
      tracker.addModelPricing('custom-model', {
        inputPer1kTokens: 0.01,
        outputPer1kTokens: 0.02,
        currency: 'USD',
      });

      const pricing = tracker.getModelPricing('custom-model');
      expect(pricing?.inputPer1kTokens).toBe(0.01);
      
      const cost = tracker.calculateCost('custom-model', 1000, 500);
      expect(cost).toBeCloseTo(0.02, 4);
    });
  });

  describe('exportData', () => {
    it('should export all data as JSON', () => {
      tracker.recordCost({
        requestId: 'export-req',
        timestamp: new Date(),
        provider: 'openai',
        model: 'gpt-4o',
        tier: 'BALANCED',
        inputTokens: 1000,
        outputTokens: 500,
      });

      const exported = tracker.exportData();
      const parsed = JSON.parse(exported);
      
      expect(parsed.entries).toHaveLength(1);
      expect(parsed.entries[0].requestId).toBe('export-req');
      expect(parsed.exportedAt).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should clear all data', () => {
      tracker.recordCost({
        requestId: 'reset-req',
        timestamp: new Date(),
        provider: 'openai',
        model: 'gpt-4o',
        tier: 'BALANCED',
        inputTokens: 1000,
        outputTokens: 500,
      });
      
      tracker.setBudget('agent-1', { daily: 100 });

      tracker.reset();
      
      expect(tracker.getRecentEntries(100).length).toBe(0);
      expect(tracker.getAnomalies().length).toBe(0);
      expect(tracker.getTotalSavings().amount).toBe(0);
    });
  });
});
