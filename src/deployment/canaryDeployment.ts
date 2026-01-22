import { LLMRequest, LLMResponse, RoutingDecision, ModelTier } from '../types';
import { logger } from '../observability/logger';

export interface CanaryConfig {
  enabled: boolean;
  canaryPercent: number;
  minSampleSize: number;
  maxErrorRate: number;
  maxLatencyIncrease: number;
  autoRollback: boolean;
  autoPromote: boolean;
  promotionThreshold: number;
  evaluationPeriodMs: number;
}

export interface CanaryMetrics {
  controlRequests: number;
  canaryRequests: number;
  controlErrors: number;
  canaryErrors: number;
  controlAvgLatency: number;
  canaryAvgLatency: number;
  controlTierDistribution: Record<ModelTier, number>;
  canaryTierDistribution: Record<ModelTier, number>;
  controlCostSavings: number;
  canaryCostSavings: number;
}

export interface CanaryStatus {
  state: 'inactive' | 'running' | 'promoted' | 'rolled-back';
  startTime?: Date;
  endTime?: Date;
  currentPercent: number;
  metrics: CanaryMetrics;
  healthScore: number;
  recommendation: 'continue' | 'promote' | 'rollback' | 'insufficient-data';
}

type RouterFunction = (request: LLMRequest) => Promise<{
  decision: RoutingDecision;
  response: LLMResponse;
}>;

export class CanaryDeployment {
  private config: CanaryConfig;
  private controlRouter: RouterFunction;
  private canaryRouter: RouterFunction;
  private status: CanaryStatus;
  private controlLatencies: number[] = [];
  private canaryLatencies: number[] = [];
  private evaluationTimer?: NodeJS.Timeout;

  constructor(
    controlRouter: RouterFunction,
    canaryRouter: RouterFunction,
    config: Partial<CanaryConfig> = {}
  ) {
    this.controlRouter = controlRouter;
    this.canaryRouter = canaryRouter;
    this.config = {
      enabled: false,
      canaryPercent: 5,
      minSampleSize: 100,
      maxErrorRate: 0.05,
      maxLatencyIncrease: 0.2,
      autoRollback: true,
      autoPromote: false,
      promotionThreshold: 0.95,
      evaluationPeriodMs: 60000,
      ...config,
    };

    this.status = this.createInitialStatus();
  }

  async processRequest(request: LLMRequest): Promise<{
    response: LLMResponse;
    decision: RoutingDecision;
    isCanary: boolean;
  }> {
    const isCanary = this.shouldUseCanary();

    try {
      const start = Date.now();
      const result = isCanary 
        ? await this.canaryRouter(request) 
        : await this.controlRouter(request);
      const latency = Date.now() - start;

      this.recordRequest(isCanary, latency, false);

      return {
        response: result.response,
        decision: result.decision,
        isCanary,
      };
    } catch (error) {
      this.recordRequest(isCanary, 0, true);
      throw error;
    }
  }

  private shouldUseCanary(): boolean {
    if (!this.config.enabled || this.status.state !== 'running') {
      return false;
    }
    return Math.random() * 100 < this.status.currentPercent;
  }

  private recordRequest(isCanary: boolean, latencyMs: number, isError: boolean): void {
    if (isCanary) {
      this.status.metrics.canaryRequests++;
      if (isError) this.status.metrics.canaryErrors++;
      if (latencyMs > 0) {
        this.canaryLatencies.push(latencyMs);
        this.updateCanaryLatency();
      }
    } else {
      this.status.metrics.controlRequests++;
      if (isError) this.status.metrics.controlErrors++;
      if (latencyMs > 0) {
        this.controlLatencies.push(latencyMs);
        this.updateControlLatency();
      }
    }

    this.updateHealthScore();
  }

  private updateControlLatency(): void {
    if (this.controlLatencies.length > 0) {
      this.status.metrics.controlAvgLatency = 
        this.controlLatencies.reduce((a, b) => a + b, 0) / this.controlLatencies.length;
    }
    if (this.controlLatencies.length > 10000) {
      this.controlLatencies = this.controlLatencies.slice(-10000);
    }
  }

  private updateCanaryLatency(): void {
    if (this.canaryLatencies.length > 0) {
      this.status.metrics.canaryAvgLatency = 
        this.canaryLatencies.reduce((a, b) => a + b, 0) / this.canaryLatencies.length;
    }
    if (this.canaryLatencies.length > 10000) {
      this.canaryLatencies = this.canaryLatencies.slice(-10000);
    }
  }

  private updateHealthScore(): void {
    const { metrics } = this.status;
    
    if (metrics.canaryRequests < this.config.minSampleSize) {
      this.status.healthScore = 1;
      this.status.recommendation = 'insufficient-data';
      return;
    }

    const controlErrorRate = metrics.controlRequests > 0 
      ? metrics.controlErrors / metrics.controlRequests 
      : 0;
    const canaryErrorRate = metrics.canaryRequests > 0 
      ? metrics.canaryErrors / metrics.canaryRequests 
      : 0;

    const latencyIncrease = metrics.controlAvgLatency > 0
      ? (metrics.canaryAvgLatency - metrics.controlAvgLatency) / metrics.controlAvgLatency
      : 0;

    let healthScore = 1;

    if (canaryErrorRate > this.config.maxErrorRate) {
      healthScore -= (canaryErrorRate - this.config.maxErrorRate) * 10;
    }

    if (canaryErrorRate > controlErrorRate * 1.5) {
      healthScore -= 0.2;
    }

    if (latencyIncrease > this.config.maxLatencyIncrease) {
      healthScore -= (latencyIncrease - this.config.maxLatencyIncrease) * 2;
    }

    this.status.healthScore = Math.max(0, Math.min(1, healthScore));

    if (this.status.healthScore < 0.5) {
      this.status.recommendation = 'rollback';
      if (this.config.autoRollback) {
        this.rollback('Health score below threshold');
      }
    } else if (this.status.healthScore >= this.config.promotionThreshold && 
               metrics.canaryRequests >= this.config.minSampleSize * 5) {
      this.status.recommendation = 'promote';
      if (this.config.autoPromote) {
        this.promote('Health score above promotion threshold');
      }
    } else {
      this.status.recommendation = 'continue';
    }
  }

  start(initialPercent?: number): void {
    if (this.status.state === 'running') {
      logger.warn('Canary deployment already running');
      return;
    }

    this.config.enabled = true;
    this.status = this.createInitialStatus();
    this.status.state = 'running';
    this.status.startTime = new Date();
    this.status.currentPercent = initialPercent ?? this.config.canaryPercent;

    this.startEvaluationTimer();

    logger.info('Canary deployment started', {
      percent: this.status.currentPercent,
    });
  }

  stop(): void {
    this.config.enabled = false;
    this.status.state = 'inactive';
    this.status.endTime = new Date();
    this.stopEvaluationTimer();

    logger.info('Canary deployment stopped');
  }

  promote(reason: string): void {
    this.status.state = 'promoted';
    this.status.endTime = new Date();
    this.status.currentPercent = 100;
    this.stopEvaluationTimer();

    logger.info('Canary promoted to production', {
      reason,
      metrics: this.status.metrics,
    });
  }

  rollback(reason: string): void {
    this.config.enabled = false;
    this.status.state = 'rolled-back';
    this.status.endTime = new Date();
    this.status.currentPercent = 0;
    this.stopEvaluationTimer();

    logger.warn('Canary rolled back', {
      reason,
      metrics: this.status.metrics,
      healthScore: this.status.healthScore,
    });
  }

  adjustPercent(newPercent: number): void {
    if (newPercent < 0 || newPercent > 100) {
      throw new Error('Percent must be between 0 and 100');
    }

    this.status.currentPercent = newPercent;
    logger.info('Canary percent adjusted', { newPercent });
  }

  getStatus(): CanaryStatus {
    return { ...this.status };
  }

  getConfig(): CanaryConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<CanaryConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Canary config updated', updates);
  }

  private createInitialStatus(): CanaryStatus {
    return {
      state: 'inactive',
      currentPercent: 0,
      metrics: {
        controlRequests: 0,
        canaryRequests: 0,
        controlErrors: 0,
        canaryErrors: 0,
        controlAvgLatency: 0,
        canaryAvgLatency: 0,
        controlTierDistribution: { FREE: 0, CHEAP: 0, BALANCED: 0, PREMIUM: 0, FALLBACK: 0 },
        canaryTierDistribution: { FREE: 0, CHEAP: 0, BALANCED: 0, PREMIUM: 0, FALLBACK: 0 },
        controlCostSavings: 0,
        canaryCostSavings: 0,
      },
      healthScore: 1,
      recommendation: 'insufficient-data',
    };
  }

  private startEvaluationTimer(): void {
    this.evaluationTimer = setInterval(() => {
      this.runEvaluation();
    }, this.config.evaluationPeriodMs);
  }

  private stopEvaluationTimer(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = undefined;
    }
  }

  private runEvaluation(): void {
    this.updateHealthScore();

    logger.info('Canary evaluation', {
      state: this.status.state,
      healthScore: this.status.healthScore,
      recommendation: this.status.recommendation,
      controlRequests: this.status.metrics.controlRequests,
      canaryRequests: this.status.metrics.canaryRequests,
    });
  }
}
