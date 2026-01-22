import { AccuracyTracker } from '../observability/accuracyTracker';
import { RoutingDecision } from '../types';

describe('AccuracyTracker', () => {
  let tracker: AccuracyTracker;

  beforeEach(() => {
    tracker = new AccuracyTracker();
  });

  const createDecision = (tier: RoutingDecision['selectedTier'] = 'BALANCED'): RoutingDecision => ({
    requestId: `req-${Date.now()}-${Math.random()}`,
    timestamp: new Date(),
    selectedTier: tier,
    selectedModel: 'test-model',
    selectedProvider: 'openai',
    decisionPath: 'heuristic',
    confidence: 0.85,
  });

  describe('recordDecision', () => {
    it('should record decision', () => {
      const decision = createDecision();
      tracker.recordDecision(decision);
      expect(decision.requestId).toBeDefined();
    });
  });

  describe('recordFeedback', () => {
    it('should record positive feedback', () => {
      const decision = createDecision();
      tracker.recordDecision(decision);
      
      tracker.recordFeedback({
        requestId: decision.requestId!,
        originalDecision: decision,
        feedbackType: 'explicit',
        wasCorrect: true,
        source: 'user',
      });
      
      const metrics = tracker.getAccuracyMetrics();
      expect(metrics.correctDecisions).toBe(1);
    });

    it('should record negative feedback', () => {
      const decision = createDecision('CHEAP');
      tracker.recordDecision(decision);
      
      tracker.recordFeedback({
        requestId: decision.requestId!,
        originalDecision: decision,
        feedbackType: 'implicit',
        wasCorrect: false,
        actualTierNeeded: 'PREMIUM',
        source: 'override',
      });
      
      const metrics = tracker.getAccuracyMetrics();
      expect(metrics.incorrectDecisions).toBe(1);
    });
  });

  describe('recordOverride', () => {
    it('should record override as negative feedback', () => {
      const decision = createDecision('BALANCED');
      tracker.recordDecision(decision);
      
      tracker.recordOverride(decision.requestId!, 'PREMIUM', 'Complexity underestimated');
      
      const metrics = tracker.getAccuracyMetrics();
      expect(metrics.incorrectDecisions).toBe(1);
      expect(metrics.underUpgradeRate).toBeGreaterThan(0);
    });
  });

  describe('getAccuracyMetrics', () => {
    it('should calculate accuracy correctly', () => {
      for (let i = 0; i < 8; i++) {
        const decision = createDecision();
        tracker.recordDecision(decision);
        tracker.recordFeedback({
          requestId: decision.requestId!,
          originalDecision: decision,
          feedbackType: 'implicit',
          wasCorrect: true,
          source: 'quality-check',
        });
      }
      
      for (let i = 0; i < 2; i++) {
        const decision = createDecision();
        tracker.recordDecision(decision);
        tracker.recordFeedback({
          requestId: decision.requestId!,
          originalDecision: decision,
          feedbackType: 'implicit',
          wasCorrect: false,
          source: 'retry',
        });
      }
      
      const metrics = tracker.getAccuracyMetrics();
      expect(metrics.totalDecisions).toBe(10);
      expect(metrics.accuracy).toBeCloseTo(0.8);
    });

    it('should break down accuracy by tier', () => {
      const cheapDecision = createDecision('CHEAP');
      tracker.recordDecision(cheapDecision);
      tracker.recordFeedback({
        requestId: cheapDecision.requestId!,
        originalDecision: cheapDecision,
        feedbackType: 'implicit',
        wasCorrect: true,
        source: 'quality-check',
      });
      
      const premiumDecision = createDecision('PREMIUM');
      tracker.recordDecision(premiumDecision);
      tracker.recordFeedback({
        requestId: premiumDecision.requestId!,
        originalDecision: premiumDecision,
        feedbackType: 'implicit',
        wasCorrect: false,
        source: 'user',
      });
      
      const metrics = tracker.getAccuracyMetrics();
      expect(metrics.accuracyByTier.CHEAP.accuracy).toBe(1);
      expect(metrics.accuracyByTier.PREMIUM.accuracy).toBe(0);
    });
  });

  describe('getAccuracyTrend', () => {
    it('should return empty trend with insufficient data', () => {
      const trend = tracker.getAccuracyTrend('hourly');
      expect(trend.dataPoints.length).toBe(0);
      expect(trend.trend).toBe('stable');
    });
  });

  describe('getRecommendations', () => {
    it('should recommend insufficient data when sample size is low', () => {
      const recommendations = tracker.getRecommendations();
      expect(recommendations[0]).toContain('Insufficient data');
    });

    it('should recommend accuracy improvements when below target', () => {
      for (let i = 0; i < 200; i++) {
        const decision = createDecision();
        tracker.recordDecision(decision);
        tracker.recordFeedback({
          requestId: decision.requestId!,
          originalDecision: decision,
          feedbackType: 'implicit',
          wasCorrect: i < 160,
          source: 'quality-check',
        });
      }
      
      const recommendations = tracker.getRecommendations();
      expect(recommendations.some(r => r.includes('accuracy'))).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all data', () => {
      const decision = createDecision();
      tracker.recordDecision(decision);
      tracker.recordFeedback({
        requestId: decision.requestId!,
        originalDecision: decision,
        feedbackType: 'implicit',
        wasCorrect: true,
        source: 'user',
      });
      
      tracker.reset();
      
      const metrics = tracker.getAccuracyMetrics();
      expect(metrics.totalDecisions).toBe(0);
    });
  });
});
