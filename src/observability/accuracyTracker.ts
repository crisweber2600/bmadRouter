import { ModelTier, RoutingDecision } from '../types';
import { logger } from './logger';

export interface AccuracyFeedback {
  requestId: string;
  timestamp: Date;
  originalDecision: RoutingDecision;
  feedbackType: 'implicit' | 'explicit';
  wasCorrect: boolean;
  actualTierNeeded?: ModelTier;
  reason?: string;
  source: 'user' | 'override' | 'retry' | 'quality-check';
}

export interface AccuracyMetrics {
  totalDecisions: number;
  correctDecisions: number;
  incorrectDecisions: number;
  accuracy: number;
  accuracyByTier: Record<ModelTier, { correct: number; incorrect: number; accuracy: number }>;
  accuracyByDecisionPath: Record<string, { correct: number; incorrect: number; accuracy: number }>;
  overUpgradeRate: number;
  underUpgradeRate: number;
  confidenceCorrelation: number;
}

export interface AccuracyTrend {
  period: 'hourly' | 'daily' | 'weekly';
  dataPoints: Array<{
    timestamp: Date;
    accuracy: number;
    sampleSize: number;
  }>;
  trend: 'improving' | 'stable' | 'declining';
  changePercent: number;
}

export class AccuracyTracker {
  private feedbackHistory: AccuracyFeedback[] = [];
  private decisionHistory: Map<string, RoutingDecision> = new Map();
  private readonly maxHistory: number;
  private readonly minSampleSize: number;

  constructor(options: { maxHistory?: number; minSampleSize?: number } = {}) {
    this.maxHistory = options.maxHistory || 100000;
    this.minSampleSize = options.minSampleSize || 100;
  }

  recordDecision(decision: RoutingDecision): void {
    if (!decision.requestId) {
      decision.requestId = this.generateRequestId();
    }
    this.decisionHistory.set(decision.requestId, decision);

    if (this.decisionHistory.size > this.maxHistory) {
      const oldestKey = this.decisionHistory.keys().next().value;
      if (oldestKey) this.decisionHistory.delete(oldestKey);
    }
  }

  recordFeedback(feedback: Omit<AccuracyFeedback, 'timestamp'>): void {
    const fullFeedback: AccuracyFeedback = {
      ...feedback,
      timestamp: new Date(),
    };

    this.feedbackHistory.push(fullFeedback);

    if (this.feedbackHistory.length > this.maxHistory) {
      this.feedbackHistory = this.feedbackHistory.slice(-this.maxHistory);
    }

    logger.info('Accuracy feedback recorded', {
      requestId: feedback.requestId,
      wasCorrect: feedback.wasCorrect,
      source: feedback.source,
    });
  }

  recordOverride(requestId: string, newTier: ModelTier, reason: string): void {
    const originalDecision = this.decisionHistory.get(requestId);
    if (!originalDecision) {
      logger.warn('Override recorded for unknown decision', { requestId });
      return;
    }

    const wasDowngrade = this.getTierRank(newTier) < this.getTierRank(originalDecision.selectedTier);

    this.recordFeedback({
      requestId,
      originalDecision,
      feedbackType: 'implicit',
      wasCorrect: false,
      actualTierNeeded: newTier,
      reason,
      source: 'override',
    });
  }

  recordRetry(requestId: string, newTier: ModelTier): void {
    const originalDecision = this.decisionHistory.get(requestId);
    if (!originalDecision) return;

    this.recordFeedback({
      requestId,
      originalDecision,
      feedbackType: 'implicit',
      wasCorrect: false,
      actualTierNeeded: newTier,
      reason: 'Retry required - original tier insufficient',
      source: 'retry',
    });
  }

  recordQualityCheck(requestId: string, passed: boolean, actualTierNeeded?: ModelTier): void {
    const originalDecision = this.decisionHistory.get(requestId);
    if (!originalDecision) return;

    this.recordFeedback({
      requestId,
      originalDecision,
      feedbackType: 'implicit',
      wasCorrect: passed,
      actualTierNeeded: passed ? originalDecision.selectedTier : actualTierNeeded,
      source: 'quality-check',
    });
  }

  recordUserFeedback(requestId: string, wasCorrect: boolean, reason?: string): void {
    const originalDecision = this.decisionHistory.get(requestId);
    if (!originalDecision) {
      logger.warn('User feedback for unknown decision', { requestId });
      return;
    }

    this.recordFeedback({
      requestId,
      originalDecision,
      feedbackType: 'explicit',
      wasCorrect,
      reason,
      source: 'user',
    });
  }

  getAccuracyMetrics(since?: Date): AccuracyMetrics {
    const feedback = since 
      ? this.feedbackHistory.filter(f => f.timestamp >= since)
      : this.feedbackHistory;

    if (feedback.length === 0) {
      return this.getEmptyMetrics();
    }

    const accuracyByTier: AccuracyMetrics['accuracyByTier'] = {
      FREE: { correct: 0, incorrect: 0, accuracy: 0 },
      CHEAP: { correct: 0, incorrect: 0, accuracy: 0 },
      BALANCED: { correct: 0, incorrect: 0, accuracy: 0 },
      PREMIUM: { correct: 0, incorrect: 0, accuracy: 0 },
      FALLBACK: { correct: 0, incorrect: 0, accuracy: 0 },
    };

    const accuracyByPath: Record<string, { correct: number; incorrect: number }> = {};
    let overUpgrades = 0;
    let underUpgrades = 0;
    let totalCorrect = 0;
    let confidenceSum = 0;
    let correctConfidenceSum = 0;

    for (const f of feedback) {
      const tier = f.originalDecision.selectedTier;
      const path = f.originalDecision.decisionPath;

      if (f.wasCorrect) {
        totalCorrect++;
        accuracyByTier[tier].correct++;
        correctConfidenceSum += f.originalDecision.confidence;
      } else {
        accuracyByTier[tier].incorrect++;
        
        if (f.actualTierNeeded) {
          const originalRank = this.getTierRank(tier);
          const neededRank = this.getTierRank(f.actualTierNeeded);
          if (originalRank > neededRank) overUpgrades++;
          if (originalRank < neededRank) underUpgrades++;
        }
      }

      confidenceSum += f.originalDecision.confidence;

      if (!accuracyByPath[path]) {
        accuracyByPath[path] = { correct: 0, incorrect: 0 };
      }
      if (f.wasCorrect) {
        accuracyByPath[path].correct++;
      } else {
        accuracyByPath[path].incorrect++;
      }
    }

    for (const tier of Object.keys(accuracyByTier) as ModelTier[]) {
      const { correct, incorrect } = accuracyByTier[tier];
      accuracyByTier[tier].accuracy = correct + incorrect > 0 
        ? correct / (correct + incorrect) 
        : 0;
    }

    const accuracyByDecisionPath: AccuracyMetrics['accuracyByDecisionPath'] = {};
    for (const [path, data] of Object.entries(accuracyByPath)) {
      const total = data.correct + data.incorrect;
      accuracyByDecisionPath[path] = {
        ...data,
        accuracy: total > 0 ? data.correct / total : 0,
      };
    }

    const avgConfidence = confidenceSum / feedback.length;
    const avgCorrectConfidence = totalCorrect > 0 ? correctConfidenceSum / totalCorrect : 0;
    const confidenceCorrelation = avgConfidence > 0 
      ? (avgCorrectConfidence - avgConfidence) / avgConfidence 
      : 0;

    return {
      totalDecisions: feedback.length,
      correctDecisions: totalCorrect,
      incorrectDecisions: feedback.length - totalCorrect,
      accuracy: totalCorrect / feedback.length,
      accuracyByTier,
      accuracyByDecisionPath,
      overUpgradeRate: feedback.length > 0 ? overUpgrades / feedback.length : 0,
      underUpgradeRate: feedback.length > 0 ? underUpgrades / feedback.length : 0,
      confidenceCorrelation,
    };
  }

  getAccuracyTrend(period: AccuracyTrend['period']): AccuracyTrend {
    const now = new Date();
    const periodMs = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
    };

    const bucketSize = periodMs[period];
    const lookback = period === 'hourly' ? 24 : period === 'daily' ? 30 : 12;
    const dataPoints: AccuracyTrend['dataPoints'] = [];

    for (let i = lookback - 1; i >= 0; i--) {
      const bucketEnd = new Date(now.getTime() - i * bucketSize);
      const bucketStart = new Date(bucketEnd.getTime() - bucketSize);

      const bucketFeedback = this.feedbackHistory.filter(
        f => f.timestamp >= bucketStart && f.timestamp < bucketEnd
      );

      if (bucketFeedback.length >= this.minSampleSize) {
        const correct = bucketFeedback.filter(f => f.wasCorrect).length;
        dataPoints.push({
          timestamp: bucketEnd,
          accuracy: correct / bucketFeedback.length,
          sampleSize: bucketFeedback.length,
        });
      }
    }

    let trend: AccuracyTrend['trend'] = 'stable';
    let changePercent = 0;

    if (dataPoints.length >= 2) {
      const recentAvg = dataPoints.slice(-3).reduce((sum, d) => sum + d.accuracy, 0) / 
        Math.min(3, dataPoints.length);
      const olderAvg = dataPoints.slice(0, 3).reduce((sum, d) => sum + d.accuracy, 0) / 
        Math.min(3, dataPoints.length);

      changePercent = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

      if (changePercent > 2) trend = 'improving';
      else if (changePercent < -2) trend = 'declining';
    }

    return { period, dataPoints, trend, changePercent };
  }

  getRecommendations(): string[] {
    const metrics = this.getAccuracyMetrics();
    const recommendations: string[] = [];

    if (metrics.totalDecisions < this.minSampleSize) {
      recommendations.push('Insufficient data for accurate recommendations');
      return recommendations;
    }

    if (metrics.accuracy < 0.85) {
      recommendations.push('Overall accuracy below 85% target - review routing rules');
    }

    if (metrics.underUpgradeRate > 0.1) {
      recommendations.push('High under-upgrade rate (>10%) - consider increasing default tiers');
    }

    if (metrics.overUpgradeRate > 0.15) {
      recommendations.push('High over-upgrade rate (>15%) - consider more aggressive cost optimization');
    }

    for (const [tier, data] of Object.entries(metrics.accuracyByTier)) {
      if (data.correct + data.incorrect > 20 && data.accuracy < 0.8) {
        recommendations.push(`Low accuracy for ${tier} tier (${(data.accuracy * 100).toFixed(1)}%) - review tier criteria`);
      }
    }

    for (const [path, data] of Object.entries(metrics.accuracyByDecisionPath)) {
      if (data.correct + data.incorrect > 20 && data.accuracy < 0.8) {
        recommendations.push(`Low accuracy for "${path}" decision path - consider tuning`);
      }
    }

    if (metrics.confidenceCorrelation < -0.1) {
      recommendations.push('Confidence scores poorly correlate with accuracy - recalibrate confidence estimation');
    }

    return recommendations;
  }

  getFeedbackHistory(limit = 100): AccuracyFeedback[] {
    return this.feedbackHistory.slice(-limit);
  }

  exportData(): string {
    return JSON.stringify({
      feedbackHistory: this.feedbackHistory,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  reset(): void {
    this.feedbackHistory = [];
    this.decisionHistory.clear();
    logger.info('Accuracy tracker reset');
  }

  private getTierRank(tier: ModelTier): number {
    const ranks: Record<ModelTier, number> = {
      FREE: 0,
      CHEAP: 1,
      BALANCED: 2,
      PREMIUM: 3,
      FALLBACK: 4,
    };
    return ranks[tier];
  }

  private getEmptyMetrics(): AccuracyMetrics {
    return {
      totalDecisions: 0,
      correctDecisions: 0,
      incorrectDecisions: 0,
      accuracy: 0,
      accuracyByTier: {
        FREE: { correct: 0, incorrect: 0, accuracy: 0 },
        CHEAP: { correct: 0, incorrect: 0, accuracy: 0 },
        BALANCED: { correct: 0, incorrect: 0, accuracy: 0 },
        PREMIUM: { correct: 0, incorrect: 0, accuracy: 0 },
        FALLBACK: { correct: 0, incorrect: 0, accuracy: 0 },
      },
      accuracyByDecisionPath: {},
      overUpgradeRate: 0,
      underUpgradeRate: 0,
      confidenceCorrelation: 0,
    };
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const accuracyTracker = new AccuracyTracker();
