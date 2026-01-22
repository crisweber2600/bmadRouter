import { ModelTier } from '../types';
import { logger } from '../observability/logger';

export type RoutingStrategy = 'cost-focused' | 'quality-focused' | 'balanced' | 'custom';

export interface AgentRoutingConfig {
  agentId: string;
  agentName?: string;
  strategy: RoutingStrategy;
  defaultTier?: ModelTier;
  tierOverrides?: {
    code?: ModelTier;
    reasoning?: ModelTier;
    creative?: ModelTier;
    factual?: ModelTier;
  };
  costBudget?: {
    dailyLimit?: number;
    monthlyLimit?: number;
    currentSpend?: number;
  };
  qualityThreshold?: number;
  bypassEnabled?: boolean;
  learningEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AgentPerformanceMetrics {
  totalRequests: number;
  successfulRequests: number;
  overrideCount: number;
  overrideReasons: Record<string, number>;
  tierDistribution: Record<ModelTier, number>;
  averageLatency: number;
  totalCostSavings: number;
  qualityScore: number;
  lastUpdated: Date;
}

const DEFAULT_STRATEGY_CONFIGS: Record<RoutingStrategy, Partial<AgentRoutingConfig>> = {
  'cost-focused': {
    defaultTier: 'CHEAP',
    tierOverrides: {
      code: 'BALANCED',
      reasoning: 'BALANCED',
      creative: 'CHEAP',
      factual: 'FREE',
    },
    qualityThreshold: 0.75,
  },
  'quality-focused': {
    defaultTier: 'BALANCED',
    tierOverrides: {
      code: 'PREMIUM',
      reasoning: 'PREMIUM',
      creative: 'BALANCED',
      factual: 'CHEAP',
    },
    qualityThreshold: 0.9,
  },
  'balanced': {
    defaultTier: 'BALANCED',
    tierOverrides: {
      code: 'PREMIUM',
      reasoning: 'BALANCED',
      creative: 'BALANCED',
      factual: 'CHEAP',
    },
    qualityThreshold: 0.85,
  },
  'custom': {
    defaultTier: 'BALANCED',
    qualityThreshold: 0.85,
  },
};

export class AgentConfigManager {
  private configs: Map<string, AgentRoutingConfig> = new Map();
  private metrics: Map<string, AgentPerformanceMetrics> = new Map();
  private defaultConfig: AgentRoutingConfig = {
    agentId: 'default',
    strategy: 'balanced',
    ...DEFAULT_STRATEGY_CONFIGS['balanced'],
    learningEnabled: true,
  };

  constructor(initialConfigs?: AgentRoutingConfig[]) {
    if (initialConfigs) {
      initialConfigs.forEach(config => this.registerAgent(config));
    }
  }

  registerAgent(config: AgentRoutingConfig): void {
    const strategyDefaults = DEFAULT_STRATEGY_CONFIGS[config.strategy] || {};
    const mergedConfig: AgentRoutingConfig = {
      ...strategyDefaults,
      ...config,
      tierOverrides: {
        ...strategyDefaults.tierOverrides,
        ...config.tierOverrides,
      },
    };
    
    this.configs.set(config.agentId, mergedConfig);
    this.initializeMetrics(config.agentId);
    
    logger.info('Agent registered', { 
      agentId: config.agentId, 
      strategy: config.strategy 
    });
  }

  updateAgent(agentId: string, updates: Partial<AgentRoutingConfig>): void {
    const existing = this.configs.get(agentId);
    if (!existing) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const updated: AgentRoutingConfig = {
      ...existing,
      ...updates,
      tierOverrides: {
        ...existing.tierOverrides,
        ...updates.tierOverrides,
      },
    };
    
    this.configs.set(agentId, updated);
    logger.info('Agent config updated', { agentId, updates });
  }

  removeAgent(agentId: string): void {
    this.configs.delete(agentId);
    this.metrics.delete(agentId);
    logger.info('Agent removed', { agentId });
  }

  getConfig(agentId: string): AgentRoutingConfig {
    return this.configs.get(agentId) || this.defaultConfig;
  }

  getAllConfigs(): AgentRoutingConfig[] {
    return Array.from(this.configs.values());
  }

  getRecommendedTier(
    agentId: string, 
    intentCategory: string, 
    complexity: number
  ): ModelTier {
    const config = this.getConfig(agentId);
    
    if (config.tierOverrides && config.tierOverrides[intentCategory as keyof typeof config.tierOverrides]) {
      return config.tierOverrides[intentCategory as keyof typeof config.tierOverrides]!;
    }

    if (config.strategy === 'cost-focused') {
      if (complexity < 0.3) return 'FREE';
      if (complexity < 0.5) return 'CHEAP';
      if (complexity < 0.7) return 'BALANCED';
      return 'PREMIUM';
    }

    if (config.strategy === 'quality-focused') {
      if (complexity < 0.2) return 'CHEAP';
      if (complexity < 0.5) return 'BALANCED';
      return 'PREMIUM';
    }

    if (complexity < 0.3) return 'CHEAP';
    if (complexity < 0.6) return 'BALANCED';
    return 'PREMIUM';
  }

  shouldBypass(agentId: string): boolean {
    const config = this.getConfig(agentId);
    return config.bypassEnabled === true;
  }

  checkBudget(agentId: string, estimatedCost: number): { allowed: boolean; reason?: string } {
    const config = this.getConfig(agentId);
    
    if (!config.costBudget) {
      return { allowed: true };
    }

    const currentSpend = config.costBudget.currentSpend || 0;
    
    if (config.costBudget.dailyLimit && currentSpend + estimatedCost > config.costBudget.dailyLimit) {
      return { 
        allowed: false, 
        reason: `Daily budget exceeded: $${currentSpend.toFixed(2)}/$${config.costBudget.dailyLimit.toFixed(2)}` 
      };
    }

    if (config.costBudget.monthlyLimit && currentSpend + estimatedCost > config.costBudget.monthlyLimit) {
      return { 
        allowed: false, 
        reason: `Monthly budget exceeded: $${currentSpend.toFixed(2)}/$${config.costBudget.monthlyLimit.toFixed(2)}` 
      };
    }

    return { allowed: true };
  }

  private initializeMetrics(agentId: string): void {
    this.metrics.set(agentId, {
      totalRequests: 0,
      successfulRequests: 0,
      overrideCount: 0,
      overrideReasons: {},
      tierDistribution: {
        FREE: 0,
        CHEAP: 0,
        BALANCED: 0,
        PREMIUM: 0,
        FALLBACK: 0,
      },
      averageLatency: 0,
      totalCostSavings: 0,
      qualityScore: 1.0,
      lastUpdated: new Date(),
    });
  }

  recordRequest(
    agentId: string,
    tier: ModelTier,
    latencyMs: number,
    costSavings: number,
    wasOverride: boolean,
    overrideReason?: string
  ): void {
    let metrics = this.metrics.get(agentId);
    if (!metrics) {
      this.initializeMetrics(agentId);
      metrics = this.metrics.get(agentId)!;
    }

    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.tierDistribution[tier]++;
    metrics.totalCostSavings += costSavings;
    
    metrics.averageLatency = (
      (metrics.averageLatency * (metrics.totalRequests - 1) + latencyMs) / 
      metrics.totalRequests
    );

    if (wasOverride) {
      metrics.overrideCount++;
      if (overrideReason) {
        metrics.overrideReasons[overrideReason] = 
          (metrics.overrideReasons[overrideReason] || 0) + 1;
      }
    }

    metrics.lastUpdated = new Date();
  }

  recordOverride(agentId: string, reason: string): void {
    let metrics = this.metrics.get(agentId);
    if (!metrics) {
      this.initializeMetrics(agentId);
      metrics = this.metrics.get(agentId)!;
    }

    metrics.overrideCount++;
    metrics.overrideReasons[reason] = (metrics.overrideReasons[reason] || 0) + 1;
    metrics.lastUpdated = new Date();

    if (this.getConfig(agentId).learningEnabled) {
      this.applyLearningFromOverride(agentId, reason);
    }
  }

  private applyLearningFromOverride(agentId: string, reason: string): void {
    const metrics = this.metrics.get(agentId);
    if (!metrics) return;

    const overrideRate = metrics.overrideCount / Math.max(metrics.totalRequests, 1);
    
    if (overrideRate > 0.15) {
      logger.warn('High override rate detected, consider adjusting strategy', {
        agentId,
        overrideRate: `${(overrideRate * 100).toFixed(1)}%`,
        topReasons: Object.entries(metrics.overrideReasons)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3),
      });
    }
  }

  getMetrics(agentId: string): AgentPerformanceMetrics | undefined {
    return this.metrics.get(agentId);
  }

  getAllMetrics(): Map<string, AgentPerformanceMetrics> {
    return new Map(this.metrics);
  }

  getOverrideAnalysis(agentId?: string): {
    totalOverrides: number;
    overrideRate: number;
    topReasons: [string, number][];
    recommendations: string[];
  } {
    const metricsToAnalyze = agentId 
      ? [this.metrics.get(agentId)].filter(Boolean) as AgentPerformanceMetrics[]
      : Array.from(this.metrics.values());

    let totalOverrides = 0;
    let totalRequests = 0;
    const aggregatedReasons: Record<string, number> = {};

    for (const metrics of metricsToAnalyze) {
      totalOverrides += metrics.overrideCount;
      totalRequests += metrics.totalRequests;
      
      for (const [reason, count] of Object.entries(metrics.overrideReasons)) {
        aggregatedReasons[reason] = (aggregatedReasons[reason] || 0) + count;
      }
    }

    const overrideRate = totalRequests > 0 ? totalOverrides / totalRequests : 0;
    const topReasons = Object.entries(aggregatedReasons)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5) as [string, number][];

    const recommendations: string[] = [];
    
    if (overrideRate > 0.2) {
      recommendations.push('Override rate >20% - consider switching to quality-focused strategy');
    }
    if (topReasons.some(([reason]) => reason.toLowerCase().includes('security'))) {
      recommendations.push('Security-related overrides detected - add security keyword detection');
    }
    if (topReasons.some(([reason]) => reason.toLowerCase().includes('code'))) {
      recommendations.push('Code-related overrides detected - increase code tier defaults');
    }

    return { totalOverrides, overrideRate, topReasons, recommendations };
  }

  exportConfig(): string {
    return JSON.stringify({
      configs: Array.from(this.configs.entries()),
      metrics: Array.from(this.metrics.entries()),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  importConfig(jsonString: string): void {
    const data = JSON.parse(jsonString);
    
    if (data.configs) {
      this.configs = new Map(data.configs);
    }
    if (data.metrics) {
      this.metrics = new Map(data.metrics.map(([k, v]: [string, AgentPerformanceMetrics]) => [
        k,
        { ...v, lastUpdated: new Date(v.lastUpdated) }
      ]));
    }
    
    logger.info('Agent configs imported', { 
      configCount: this.configs.size,
      metricsCount: this.metrics.size 
    });
  }
}

export const agentConfigManager = new AgentConfigManager();
