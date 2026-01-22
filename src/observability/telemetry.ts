import { RouterDecisionTrace } from '../types';
import { logger } from './logger';

export class TelemetryCollector {
  private decisionTraces: RouterDecisionTrace[] = [];
  private readonly maxTraces = 10000; // Keep last 10k decisions in memory

  async recordDecision(trace: RouterDecisionTrace): Promise<void> {
    try {
      // Add to in-memory store
      this.decisionTraces.push(trace);

      // Maintain size limit
      if (this.decisionTraces.length > this.maxTraces) {
        this.decisionTraces = this.decisionTraces.slice(-this.maxTraces);
      }

      // Log the decision
      logger.info('Decision recorded', {
        requestId: trace.requestId,
        selectedTier: trace.selectedTier,
        selectedModel: trace.selectedModel,
        decisionPath: trace.decisionPath,
        confidence: trace.explanation.confidence,
        latencyMs: trace.execution.latencyMs,
        costSavings: trace.explanation.costSavings,
      });

      // TODO: Implement persistent storage (database/file)
      // TODO: Implement metrics export (Prometheus)
      // TODO: Implement alerting (cost anomalies, accuracy drops)

    } catch (error) {
      logger.error('Telemetry recording failed', { error, requestId: trace.requestId });
    }
  }

  getRecentDecisions(limit: number = 100): RouterDecisionTrace[] {
    return this.decisionTraces.slice(-limit);
  }

  getDecisionStats(): {
    totalDecisions: number;
    averageLatency: number;
    tierDistribution: Record<string, number>;
    decisionPathDistribution: Record<string, number>;
    averageConfidence: number;
  } {
    if (this.decisionTraces.length === 0) {
      return {
        totalDecisions: 0,
        averageLatency: 0,
        tierDistribution: {},
        decisionPathDistribution: {},
        averageConfidence: 0,
      };
    }

    const tierDistribution: Record<string, number> = {};
    const decisionPathDistribution: Record<string, number> = {};
    let totalLatency = 0;
    let totalConfidence = 0;

    for (const trace of this.decisionTraces) {
      // Tier distribution
      tierDistribution[trace.selectedTier] = (tierDistribution[trace.selectedTier] || 0) + 1;

      // Decision path distribution
      decisionPathDistribution[trace.decisionPath] = (decisionPathDistribution[trace.decisionPath] || 0) + 1;

      // Latency and confidence
      totalLatency += trace.execution.latencyMs;
      totalConfidence += trace.explanation.confidence;
    }

    return {
      totalDecisions: this.decisionTraces.length,
      averageLatency: totalLatency / this.decisionTraces.length,
      tierDistribution,
      decisionPathDistribution,
      averageConfidence: totalConfidence / this.decisionTraces.length,
    };
  }

  async exportMetrics(): Promise<void> {
    // TODO: Export to monitoring system (Prometheus, DataDog, etc.)
    const stats = this.getDecisionStats();
    logger.info('Metrics export', stats);
  }

  clear(): void {
    this.decisionTraces = [];
    logger.info('Telemetry cleared');
  }
}