import { LLMRequest, LLMResponse, RoutingDecision, ModelTier } from '../types';
import { logger } from '../observability/logger';

export interface ShadowResult {
  requestId: string;
  timestamp: Date;
  primaryDecision: RoutingDecision;
  shadowDecision: RoutingDecision;
  primaryResponse: LLMResponse;
  shadowResponse?: LLMResponse;
  comparison: ShadowComparison;
}

export interface ShadowComparison {
  tierMatch: boolean;
  modelMatch: boolean;
  confidenceDiff: number;
  latencyDiff: number;
  costDiff: number;
  responseQualityScore?: number;
  divergenceReason?: string;
}

export interface ShadowModeConfig {
  enabled: boolean;
  sampleRate: number;
  compareResponses: boolean;
  logDivergences: boolean;
  maxConcurrentShadow: number;
  timeoutMs: number;
}

export interface ShadowStats {
  totalShadowRequests: number;
  tierMatchRate: number;
  modelMatchRate: number;
  avgConfidenceDiff: number;
  avgLatencyDiff: number;
  avgCostDiff: number;
  divergenceReasons: Record<string, number>;
}

type ShadowRouter = (request: LLMRequest) => Promise<{
  decision: RoutingDecision;
  response?: LLMResponse;
}>;

export class ShadowMode {
  private config: ShadowModeConfig;
  private results: ShadowResult[] = [];
  private activeShadowRequests = 0;
  private primaryRouter: ShadowRouter;
  private shadowRouter: ShadowRouter;
  private readonly maxResults = 10000;

  constructor(
    primaryRouter: ShadowRouter,
    shadowRouter: ShadowRouter,
    config: Partial<ShadowModeConfig> = {}
  ) {
    this.primaryRouter = primaryRouter;
    this.shadowRouter = shadowRouter;
    this.config = {
      enabled: true,
      sampleRate: 0.1,
      compareResponses: false,
      logDivergences: true,
      maxConcurrentShadow: 10,
      timeoutMs: 30000,
      ...config,
    };
  }

  async processRequest(request: LLMRequest): Promise<{
    response: LLMResponse;
    decision: RoutingDecision;
    shadowResult?: ShadowResult;
  }> {
    const primaryResult = await this.primaryRouter(request);

    if (!primaryResult.response) {
      throw new Error('Primary router did not return a response');
    }

    let shadowResult: ShadowResult | undefined;

    if (this.shouldRunShadow()) {
      shadowResult = await this.runShadow(request, {
        decision: primaryResult.decision,
        response: primaryResult.response
      });
    }

    return {
      response: primaryResult.response,
      decision: primaryResult.decision,
      shadowResult,
    };
  }

  private shouldRunShadow(): boolean {
    if (!this.config.enabled) return false;
    if (this.activeShadowRequests >= this.config.maxConcurrentShadow) return false;
    return Math.random() < this.config.sampleRate;
  }

  private async runShadow(
    request: LLMRequest,
    primaryResult: { decision: RoutingDecision; response: LLMResponse }
  ): Promise<ShadowResult> {
    this.activeShadowRequests++;
    const requestId = primaryResult.decision.requestId || this.generateRequestId();

    try {
      const shadowPromise = this.shadowRouter(request);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Shadow timeout')), this.config.timeoutMs);
      });

      const shadowResult = await Promise.race([shadowPromise, timeoutPromise]);

      const comparison = this.compareResults(primaryResult, {
        decision: shadowResult.decision,
        response: shadowResult.response
      });

      const result: ShadowResult = {
        requestId,
        timestamp: new Date(),
        primaryDecision: primaryResult.decision,
        shadowDecision: shadowResult.decision,
        primaryResponse: primaryResult.response,
        shadowResponse: shadowResult.response,
        comparison,
      };

      this.recordResult(result);
      return result;

    } catch (error) {
      const errorResult: ShadowResult = {
        requestId,
        timestamp: new Date(),
        primaryDecision: primaryResult.decision,
        shadowDecision: {
          selectedTier: 'FALLBACK' as ModelTier,
          selectedModel: 'error',
          decisionPath: 'fallback',
          confidence: 0,
        },
        primaryResponse: primaryResult.response,
        comparison: {
          tierMatch: false,
          modelMatch: false,
          confidenceDiff: 1,
          latencyDiff: 0,
          costDiff: 0,
          divergenceReason: `Shadow error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      };

      this.recordResult(errorResult);
      return errorResult;

    } finally {
      this.activeShadowRequests--;
    }
  }

  private compareResults(
    primary: { decision: RoutingDecision; response: LLMResponse },
    shadow: { decision: RoutingDecision; response: LLMResponse | undefined }
  ): ShadowComparison {
    const tierMatch = primary.decision.selectedTier === shadow.decision.selectedTier;
    const modelMatch = primary.decision.selectedModel === shadow.decision.selectedModel;
    const confidenceDiff = Math.abs(primary.decision.confidence - shadow.decision.confidence);
    const latencyDiff = (primary.decision.processingTimeMs || 0) - (shadow.decision.processingTimeMs || 0);
    const costDiff = (primary.decision.costSavings || 0) - (shadow.decision.costSavings || 0);

    let divergenceReason: string | undefined;
    if (!tierMatch) {
      divergenceReason = `Tier divergence: primary=${primary.decision.selectedTier}, shadow=${shadow.decision.selectedTier}`;
    } else if (!modelMatch) {
      divergenceReason = `Model divergence: primary=${primary.decision.selectedModel}, shadow=${shadow.decision.selectedModel}`;
    }

    if (this.config.logDivergences && divergenceReason) {
      logger.warn('Shadow mode divergence', {
        primaryTier: primary.decision.selectedTier,
        shadowTier: shadow.decision.selectedTier,
        primaryModel: primary.decision.selectedModel,
        shadowModel: shadow.decision.selectedModel,
        divergenceReason,
      });
    }

    return {
      tierMatch,
      modelMatch,
      confidenceDiff,
      latencyDiff,
      costDiff,
      divergenceReason,
    };
  }

  private recordResult(result: ShadowResult): void {
    this.results.push(result);

    if (this.results.length > this.maxResults) {
      this.results = this.results.slice(-this.maxResults);
    }
  }

  getStats(): ShadowStats {
    if (this.results.length === 0) {
      return {
        totalShadowRequests: 0,
        tierMatchRate: 0,
        modelMatchRate: 0,
        avgConfidenceDiff: 0,
        avgLatencyDiff: 0,
        avgCostDiff: 0,
        divergenceReasons: {},
      };
    }

    let tierMatches = 0;
    let modelMatches = 0;
    let totalConfidenceDiff = 0;
    let totalLatencyDiff = 0;
    let totalCostDiff = 0;
    const divergenceReasons: Record<string, number> = {};

    for (const result of this.results) {
      if (result.comparison.tierMatch) tierMatches++;
      if (result.comparison.modelMatch) modelMatches++;
      totalConfidenceDiff += result.comparison.confidenceDiff;
      totalLatencyDiff += result.comparison.latencyDiff;
      totalCostDiff += result.comparison.costDiff;

      if (result.comparison.divergenceReason) {
        const reason = result.comparison.divergenceReason.split(':')[0];
        divergenceReasons[reason] = (divergenceReasons[reason] || 0) + 1;
      }
    }

    return {
      totalShadowRequests: this.results.length,
      tierMatchRate: tierMatches / this.results.length,
      modelMatchRate: modelMatches / this.results.length,
      avgConfidenceDiff: totalConfidenceDiff / this.results.length,
      avgLatencyDiff: totalLatencyDiff / this.results.length,
      avgCostDiff: totalCostDiff / this.results.length,
      divergenceReasons,
    };
  }

  getResults(limit = 100): ShadowResult[] {
    return this.results.slice(-limit);
  }

  getDivergentResults(limit = 50): ShadowResult[] {
    return this.results
      .filter(r => !r.comparison.tierMatch || !r.comparison.modelMatch)
      .slice(-limit);
  }

  updateConfig(updates: Partial<ShadowModeConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Shadow mode config updated', updates);
  }

  getConfig(): ShadowModeConfig {
    return { ...this.config };
  }

  enable(): void {
    this.config.enabled = true;
    logger.info('Shadow mode enabled');
  }

  disable(): void {
    this.config.enabled = false;
    logger.info('Shadow mode disabled');
  }

  reset(): void {
    this.results = [];
    logger.info('Shadow mode results reset');
  }

  private generateRequestId(): string {
    return `shadow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
