import { LLMRequest, LLMResponse, RoutingDecision } from '../types';
import { logger } from '../observability/logger';

export interface RolloutStage {
  name: string;
  percent: number;
  criteria?: {
    minRequests?: number;
    maxErrorRate?: number;
    minDurationMs?: number;
  };
  autoProgress: boolean;
}

export interface RolloutConfig {
  stages: RolloutStage[];
  pauseOnError: boolean;
  rollbackOnFailure: boolean;
  cooldownMs: number;
}

export interface RolloutStatus {
  state: 'inactive' | 'rolling-out' | 'paused' | 'completed' | 'rolled-back';
  currentStage: number;
  currentPercent: number;
  startTime?: Date;
  stageStartTime?: Date;
  totalRequests: number;
  newVersionRequests: number;
  oldVersionRequests: number;
  errorCount: number;
  stageHistory: Array<{
    stage: number;
    name: string;
    startTime: Date;
    endTime?: Date;
    result: 'completed' | 'failed' | 'skipped';
  }>;
}

type RouterFunction = (request: LLMRequest) => Promise<{
  decision: RoutingDecision;
  response: LLMResponse;
}>;

export class GradualRollout {
  private config: RolloutConfig;
  private oldRouter: RouterFunction;
  private newRouter: RouterFunction;
  private status: RolloutStatus;
  private progressTimer?: NodeJS.Timeout;
  private agentOverrides: Map<string, 'new' | 'old'> = new Map();
  private userBuckets: Map<string, number> = new Map();

  constructor(
    oldRouter: RouterFunction,
    newRouter: RouterFunction,
    config: Partial<RolloutConfig> = {}
  ) {
    this.oldRouter = oldRouter;
    this.newRouter = newRouter;
    this.config = {
      stages: [
        { name: '1%', percent: 1, criteria: { minRequests: 100 }, autoProgress: true },
        { name: '5%', percent: 5, criteria: { minRequests: 500 }, autoProgress: true },
        { name: '10%', percent: 10, criteria: { minRequests: 1000 }, autoProgress: true },
        { name: '25%', percent: 25, criteria: { minRequests: 2500 }, autoProgress: true },
        { name: '50%', percent: 50, criteria: { minRequests: 5000 }, autoProgress: true },
        { name: '100%', percent: 100, criteria: { minRequests: 10000 }, autoProgress: false },
      ],
      pauseOnError: true,
      rollbackOnFailure: true,
      cooldownMs: 30000,
      ...config,
    };

    this.status = this.createInitialStatus();
  }

  async processRequest(request: LLMRequest, context?: { agentId?: string; userId?: string }): Promise<{
    response: LLMResponse;
    decision: RoutingDecision;
    usedNewVersion: boolean;
  }> {
    const useNewVersion = this.shouldUseNewVersion(context);

    try {
      const result = useNewVersion 
        ? await this.newRouter(request) 
        : await this.oldRouter(request);

      this.recordRequest(useNewVersion, false);

      return {
        response: result.response,
        decision: result.decision,
        usedNewVersion: useNewVersion,
      };
    } catch (error) {
      this.recordRequest(useNewVersion, true);

      if (this.config.pauseOnError && useNewVersion) {
        this.pause('Error in new version');
      }

      throw error;
    }
  }

  private shouldUseNewVersion(context?: { agentId?: string; userId?: string }): boolean {
    if (this.status.state !== 'rolling-out') {
      return this.status.state === 'completed';
    }

    if (context?.agentId && this.agentOverrides.has(context.agentId)) {
      return this.agentOverrides.get(context.agentId) === 'new';
    }

    if (context?.userId) {
      return this.getUserBucket(context.userId) < this.status.currentPercent;
    }

    return Math.random() * 100 < this.status.currentPercent;
  }

  private getUserBucket(userId: string): number {
    if (!this.userBuckets.has(userId)) {
      const hash = this.hashString(userId);
      this.userBuckets.set(userId, hash % 100);
    }
    return this.userBuckets.get(userId)!;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private recordRequest(usedNewVersion: boolean, isError: boolean): void {
    this.status.totalRequests++;

    if (usedNewVersion) {
      this.status.newVersionRequests++;
    } else {
      this.status.oldVersionRequests++;
    }

    if (isError) {
      this.status.errorCount++;
    }

    this.checkStageProgress();
  }

  private checkStageProgress(): void {
    if (this.status.state !== 'rolling-out') return;

    const stage = this.config.stages[this.status.currentStage];
    if (!stage || !stage.autoProgress) return;

    const criteria = stage.criteria;
    if (!criteria) return;

    const stageRequests = this.status.newVersionRequests;
    const errorRate = stageRequests > 0 ? this.status.errorCount / stageRequests : 0;

    if (criteria.maxErrorRate && errorRate > criteria.maxErrorRate) {
      if (this.config.rollbackOnFailure) {
        this.rollback(`Error rate ${(errorRate * 100).toFixed(1)}% exceeded threshold`);
      } else {
        this.pause(`Error rate ${(errorRate * 100).toFixed(1)}% exceeded threshold`);
      }
      return;
    }

    if (criteria.minRequests && stageRequests < criteria.minRequests) {
      return;
    }

    if (criteria.minDurationMs && this.status.stageStartTime) {
      const elapsed = Date.now() - this.status.stageStartTime.getTime();
      if (elapsed < criteria.minDurationMs) {
        return;
      }
    }

    this.nextStage();
  }

  start(): void {
    if (this.status.state === 'rolling-out') {
      logger.warn('Rollout already in progress');
      return;
    }

    this.status = this.createInitialStatus();
    this.status.state = 'rolling-out';
    this.status.startTime = new Date();
    this.status.stageStartTime = new Date();

    const firstStage = this.config.stages[0];
    this.status.currentPercent = firstStage?.percent || 0;

    this.status.stageHistory.push({
      stage: 0,
      name: firstStage?.name || 'initial',
      startTime: new Date(),
      result: 'completed',
    });

    logger.info('Gradual rollout started', {
      stages: this.config.stages.length,
      initialPercent: this.status.currentPercent,
    });
  }

  pause(reason: string): void {
    if (this.status.state !== 'rolling-out') return;

    this.status.state = 'paused';
    logger.warn('Rollout paused', { reason, stage: this.status.currentStage });
  }

  resume(): void {
    if (this.status.state !== 'paused') {
      logger.warn('Cannot resume - rollout not paused');
      return;
    }

    this.status.state = 'rolling-out';
    logger.info('Rollout resumed', { stage: this.status.currentStage });
  }

  nextStage(): void {
    if (this.status.state !== 'rolling-out') return;

    const lastStage = this.status.stageHistory[this.status.stageHistory.length - 1];
    if (lastStage) {
      lastStage.endTime = new Date();
    }

    this.status.currentStage++;

    if (this.status.currentStage >= this.config.stages.length) {
      this.complete();
      return;
    }

    const stage = this.config.stages[this.status.currentStage];
    this.status.currentPercent = stage.percent;
    this.status.stageStartTime = new Date();

    this.status.stageHistory.push({
      stage: this.status.currentStage,
      name: stage.name,
      startTime: new Date(),
      result: 'completed',
    });

    logger.info('Advanced to next stage', {
      stage: this.status.currentStage,
      name: stage.name,
      percent: stage.percent,
    });
  }

  skipToStage(stageIndex: number): void {
    if (stageIndex < 0 || stageIndex >= this.config.stages.length) {
      throw new Error('Invalid stage index');
    }

    const stage = this.config.stages[stageIndex];
    this.status.currentStage = stageIndex;
    this.status.currentPercent = stage.percent;
    this.status.stageStartTime = new Date();
    this.status.state = 'rolling-out';

    logger.info('Skipped to stage', {
      stage: stageIndex,
      name: stage.name,
      percent: stage.percent,
    });
  }

  complete(): void {
    this.status.state = 'completed';
    this.status.currentPercent = 100;

    const lastStage = this.status.stageHistory[this.status.stageHistory.length - 1];
    if (lastStage) {
      lastStage.endTime = new Date();
    }

    logger.info('Rollout completed', {
      totalRequests: this.status.totalRequests,
      newVersionRequests: this.status.newVersionRequests,
      duration: this.status.startTime 
        ? Date.now() - this.status.startTime.getTime() 
        : 0,
    });
  }

  rollback(reason: string): void {
    this.status.state = 'rolled-back';
    this.status.currentPercent = 0;

    const lastStage = this.status.stageHistory[this.status.stageHistory.length - 1];
    if (lastStage) {
      lastStage.endTime = new Date();
      lastStage.result = 'failed';
    }

    logger.warn('Rollout rolled back', {
      reason,
      stage: this.status.currentStage,
      totalRequests: this.status.totalRequests,
      errorCount: this.status.errorCount,
    });
  }

  setAgentOverride(agentId: string, version: 'new' | 'old'): void {
    this.agentOverrides.set(agentId, version);
    logger.info('Agent override set', { agentId, version });
  }

  removeAgentOverride(agentId: string): void {
    this.agentOverrides.delete(agentId);
  }

  getStatus(): RolloutStatus {
    return { ...this.status };
  }

  getConfig(): RolloutConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<RolloutConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Rollout config updated', updates);
  }

  private createInitialStatus(): RolloutStatus {
    return {
      state: 'inactive',
      currentStage: 0,
      currentPercent: 0,
      totalRequests: 0,
      newVersionRequests: 0,
      oldVersionRequests: 0,
      errorCount: 0,
      stageHistory: [],
    };
  }
}
