import { LLMRequest, LLMResponse, RoutingDecision, ModelTier } from '../types';
import { logger } from '../observability/logger';

export interface ABVariant {
  id: string;
  name: string;
  weight: number;
  config: Record<string, unknown>;
}

export interface ABExperiment {
  id: string;
  name: string;
  description: string;
  variants: ABVariant[];
  status: 'draft' | 'running' | 'paused' | 'completed';
  startDate?: Date;
  endDate?: Date;
  targetSampleSize: number;
  metrics: string[];
}

export interface ABAssignment {
  experimentId: string;
  variantId: string;
  userId?: string;
  agentId?: string;
  timestamp: Date;
}

export interface ABResult {
  experimentId: string;
  variantId: string;
  requestId: string;
  timestamp: Date;
  metrics: {
    latencyMs: number;
    tier: ModelTier;
    costSavings: number;
    success: boolean;
    confidence: number;
  };
}

export interface ABAnalysis {
  experimentId: string;
  totalSamples: number;
  variants: Array<{
    variantId: string;
    name: string;
    samples: number;
    avgLatency: number;
    avgCostSavings: number;
    successRate: number;
    avgConfidence: number;
    tierDistribution: Record<ModelTier, number>;
  }>;
  winner?: string;
  statisticalSignificance: number;
  recommendation: string;
}

type VariantRouter = (request: LLMRequest, config: Record<string, unknown>) => Promise<{
  decision: RoutingDecision;
  response: LLMResponse;
}>;

export class ABTestingFramework {
  private experiments: Map<string, ABExperiment> = new Map();
  private assignments: Map<string, ABAssignment> = new Map();
  private results: ABResult[] = [];
  private router: VariantRouter;
  private readonly maxResults = 100000;

  constructor(router: VariantRouter) {
    this.router = router;
  }

  createExperiment(experiment: Omit<ABExperiment, 'status'>): ABExperiment {
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new Error('Variant weights must sum to 100');
    }

    const fullExperiment: ABExperiment = {
      ...experiment,
      status: 'draft',
    };

    this.experiments.set(experiment.id, fullExperiment);
    logger.info('Experiment created', { experimentId: experiment.id, name: experiment.name });

    return fullExperiment;
  }

  startExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    experiment.status = 'running';
    experiment.startDate = new Date();
    logger.info('Experiment started', { experimentId });
  }

  pauseExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    experiment.status = 'paused';
    logger.info('Experiment paused', { experimentId });
  }

  completeExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    experiment.status = 'completed';
    experiment.endDate = new Date();
    logger.info('Experiment completed', { experimentId });
  }

  async processRequest(
    request: LLMRequest,
    experimentId: string,
    context?: { userId?: string; agentId?: string }
  ): Promise<{
    response: LLMResponse;
    decision: RoutingDecision;
    variantId: string;
    experimentId: string;
  }> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      throw new Error(`Experiment not available: ${experimentId}`);
    }

    const variant = this.assignVariant(experiment, context);
    const start = Date.now();

    try {
      const result = await this.router(request, variant.config);
      const latencyMs = Date.now() - start;

      this.recordResult({
        experimentId,
        variantId: variant.id,
        requestId: result.decision.requestId || this.generateRequestId(),
        timestamp: new Date(),
        metrics: {
          latencyMs,
          tier: result.decision.selectedTier,
          costSavings: result.decision.costSavings || 0,
          success: true,
          confidence: result.decision.confidence,
        },
      });

      return {
        response: result.response,
        decision: result.decision,
        variantId: variant.id,
        experimentId,
      };
    } catch (error) {
      this.recordResult({
        experimentId,
        variantId: variant.id,
        requestId: this.generateRequestId(),
        timestamp: new Date(),
        metrics: {
          latencyMs: Date.now() - start,
          tier: 'FALLBACK',
          costSavings: 0,
          success: false,
          confidence: 0,
        },
      });

      throw error;
    }
  }

  private assignVariant(experiment: ABExperiment, context?: { userId?: string; agentId?: string }): ABVariant {
    const assignmentKey = this.getAssignmentKey(experiment.id, context);
    const existing = this.assignments.get(assignmentKey);

    if (existing) {
      const variant = experiment.variants.find(v => v.id === existing.variantId);
      if (variant) return variant;
    }

    const random = context?.userId 
      ? this.hashToPercent(context.userId + experiment.id)
      : Math.random() * 100;

    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (random < cumulative) {
        this.assignments.set(assignmentKey, {
          experimentId: experiment.id,
          variantId: variant.id,
          userId: context?.userId,
          agentId: context?.agentId,
          timestamp: new Date(),
        });
        return variant;
      }
    }

    return experiment.variants[experiment.variants.length - 1];
  }

  private getAssignmentKey(experimentId: string, context?: { userId?: string; agentId?: string }): string {
    if (context?.userId) return `${experimentId}:user:${context.userId}`;
    if (context?.agentId) return `${experimentId}:agent:${context.agentId}`;
    return `${experimentId}:random:${Math.random()}`;
  }

  private hashToPercent(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % 100;
  }

  private recordResult(result: ABResult): void {
    this.results.push(result);

    if (this.results.length > this.maxResults) {
      this.results = this.results.slice(-this.maxResults);
    }
  }

  getAnalysis(experimentId: string): ABAnalysis {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    const experimentResults = this.results.filter(r => r.experimentId === experimentId);

    const variantAnalyses = experiment.variants.map(variant => {
      const variantResults = experimentResults.filter(r => r.variantId === variant.id);
      
      if (variantResults.length === 0) {
        return {
          variantId: variant.id,
          name: variant.name,
          samples: 0,
          avgLatency: 0,
          avgCostSavings: 0,
          successRate: 0,
          avgConfidence: 0,
          tierDistribution: { FREE: 0, CHEAP: 0, BALANCED: 0, PREMIUM: 0, FALLBACK: 0 } as Record<ModelTier, number>,
        };
      }

      const tierDist: Record<ModelTier, number> = { FREE: 0, CHEAP: 0, BALANCED: 0, PREMIUM: 0, FALLBACK: 0 };
      let totalLatency = 0;
      let totalCostSavings = 0;
      let totalConfidence = 0;
      let successes = 0;

      for (const r of variantResults) {
        totalLatency += r.metrics.latencyMs;
        totalCostSavings += r.metrics.costSavings;
        totalConfidence += r.metrics.confidence;
        if (r.metrics.success) successes++;
        tierDist[r.metrics.tier]++;
      }

      return {
        variantId: variant.id,
        name: variant.name,
        samples: variantResults.length,
        avgLatency: totalLatency / variantResults.length,
        avgCostSavings: totalCostSavings / variantResults.length,
        successRate: successes / variantResults.length,
        avgConfidence: totalConfidence / variantResults.length,
        tierDistribution: tierDist,
      };
    });

    const significance = this.calculateSignificance(variantAnalyses);
    const winner = this.determineWinner(variantAnalyses, significance);
    const recommendation = this.generateRecommendation(experiment, variantAnalyses, significance);

    return {
      experimentId,
      totalSamples: experimentResults.length,
      variants: variantAnalyses,
      winner,
      statisticalSignificance: significance,
      recommendation,
    };
  }

  private calculateSignificance(variants: ABAnalysis['variants']): number {
    if (variants.length < 2) return 0;
    if (variants.some(v => v.samples < 30)) return 0;

    const control = variants[0];
    const treatment = variants[1];

    const p1 = control.successRate;
    const p2 = treatment.successRate;
    const n1 = control.samples;
    const n2 = treatment.samples;

    const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1/n1 + 1/n2));
    
    if (se === 0) return 0;

    const z = Math.abs(p1 - p2) / se;
    const significance = 1 - 2 * (1 - this.normalCDF(z));

    return Math.max(0, Math.min(1, significance));
  }

  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  private determineWinner(variants: ABAnalysis['variants'], significance: number): string | undefined {
    if (significance < 0.95 || variants.length < 2) return undefined;

    let best = variants[0];
    for (const variant of variants.slice(1)) {
      if (variant.successRate > best.successRate && variant.avgCostSavings >= best.avgCostSavings) {
        best = variant;
      }
    }

    return best.variantId;
  }

  private generateRecommendation(
    experiment: ABExperiment,
    variants: ABAnalysis['variants'],
    significance: number
  ): string {
    const totalSamples = variants.reduce((sum, v) => sum + v.samples, 0);

    if (totalSamples < experiment.targetSampleSize * 0.5) {
      return `Continue experiment - only ${totalSamples}/${experiment.targetSampleSize} samples collected`;
    }

    if (significance < 0.95) {
      return `Continue experiment - statistical significance ${(significance * 100).toFixed(1)}% (need 95%)`;
    }

    const winner = this.determineWinner(variants, significance);
    if (winner) {
      const winnerData = variants.find(v => v.variantId === winner);
      return `Promote variant "${winnerData?.name}" - ${(significance * 100).toFixed(1)}% confidence, ${(winnerData?.successRate || 0) * 100}% success rate`;
    }

    return 'No clear winner - consider extending experiment or adding variants';
  }

  getExperiment(experimentId: string): ABExperiment | undefined {
    return this.experiments.get(experimentId);
  }

  getAllExperiments(): ABExperiment[] {
    return Array.from(this.experiments.values());
  }

  getRunningExperiments(): ABExperiment[] {
    return Array.from(this.experiments.values()).filter(e => e.status === 'running');
  }

  deleteExperiment(experimentId: string): void {
    this.experiments.delete(experimentId);
    this.results = this.results.filter(r => r.experimentId !== experimentId);
    
    for (const [key, assignment] of this.assignments) {
      if (assignment.experimentId === experimentId) {
        this.assignments.delete(key);
      }
    }

    logger.info('Experiment deleted', { experimentId });
  }

  exportResults(experimentId: string): string {
    const experiment = this.experiments.get(experimentId);
    const results = this.results.filter(r => r.experimentId === experimentId);
    const analysis = this.getAnalysis(experimentId);

    return JSON.stringify({
      experiment,
      results,
      analysis,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  private generateRequestId(): string {
    return `ab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
