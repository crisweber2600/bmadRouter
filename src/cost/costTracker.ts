import { ModelTier, ProviderName } from '../types';
import { logger } from '../observability/logger';

export interface ModelPricing {
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  currency: string;
}

export interface CostEntry {
  requestId: string;
  timestamp: Date;
  agentId?: string;
  provider: ProviderName;
  model: string;
  tier: ModelTier;
  inputTokens: number;
  outputTokens: number;
  actualCost: number;
  baselineCost: number;
  savings: number;
  savingsPercent: number;
}

export interface CostSummary {
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalActualCost: number;
  totalBaselineCost: number;
  totalSavings: number;
  averageSavingsPercent: number;
  costByTier: Record<ModelTier, number>;
  costByProvider: Record<string, number>;
  costByAgent: Record<string, number>;
}

export interface CostAnomaly {
  timestamp: Date;
  type: 'spike' | 'unusual_pattern' | 'budget_warning' | 'budget_exceeded';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  currentValue: number;
  expectedValue: number;
  deviation: number;
}

export interface CostProjection {
  projectedDailyCost: number;
  projectedMonthlyCost: number;
  projectedSavings: number;
  confidenceLevel: number;
  basedOnDays: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputPer1kTokens: 0.005, outputPer1kTokens: 0.015, currency: 'USD' },
  'gpt-4o-mini': { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006, currency: 'USD' },
  'gpt-4': { inputPer1kTokens: 0.03, outputPer1kTokens: 0.06, currency: 'USD' },
  'gpt-3.5-turbo': { inputPer1kTokens: 0.0005, outputPer1kTokens: 0.0015, currency: 'USD' },
  'claude-3-opus-20240229': { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075, currency: 'USD' },
  'claude-3-5-sonnet-20241022': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015, currency: 'USD' },
  'claude-3-haiku-20240307': { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.00125, currency: 'USD' },
  'claude-opus': { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075, currency: 'USD' },
  'claude-sonnet': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015, currency: 'USD' },
  'gemini-1.5-pro': { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005, currency: 'USD' },
  'gemini-1.5-flash': { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003, currency: 'USD' },
  'gemini-pro': { inputPer1kTokens: 0.0005, outputPer1kTokens: 0.0015, currency: 'USD' },
  'local-model': { inputPer1kTokens: 0, outputPer1kTokens: 0, currency: 'USD' },
};

const PREMIUM_BASELINE_MODEL = 'claude-3-opus-20240229';

export class CostTracker {
  private entries: CostEntry[] = [];
  private anomalies: CostAnomaly[] = [];
  private budgets: Map<string, { daily?: number; monthly?: number; current: number }> = new Map();
  private readonly maxEntries: number;
  private readonly anomalyThreshold: number;

  constructor(options: { maxEntries?: number; anomalyThreshold?: number } = {}) {
    this.maxEntries = options.maxEntries || 100000;
    this.anomalyThreshold = options.anomalyThreshold || 2.0;
  }

  calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
    return (
      (inputTokens / 1000) * pricing.inputPer1kTokens +
      (outputTokens / 1000) * pricing.outputPer1kTokens
    );
  }

  calculateBaselineCost(inputTokens: number, outputTokens: number): number {
    return this.calculateCost(PREMIUM_BASELINE_MODEL, inputTokens, outputTokens);
  }

  recordCost(entry: Omit<CostEntry, 'actualCost' | 'baselineCost' | 'savings' | 'savingsPercent'>): CostEntry {
    const actualCost = this.calculateCost(entry.model, entry.inputTokens, entry.outputTokens);
    const baselineCost = this.calculateBaselineCost(entry.inputTokens, entry.outputTokens);
    const savings = baselineCost - actualCost;
    const savingsPercent = baselineCost > 0 ? (savings / baselineCost) * 100 : 0;

    const fullEntry: CostEntry = {
      ...entry,
      actualCost,
      baselineCost,
      savings,
      savingsPercent,
    };

    this.entries.push(fullEntry);
    
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    this.checkForAnomalies(fullEntry);
    this.updateBudget(entry.agentId, actualCost);

    logger.debug('Cost recorded', {
      requestId: entry.requestId,
      actualCost: actualCost.toFixed(6),
      savings: savings.toFixed(6),
      savingsPercent: savingsPercent.toFixed(1),
    });

    return fullEntry;
  }

  private checkForAnomalies(entry: CostEntry): void {
    const recentEntries = this.entries.slice(-100);
    if (recentEntries.length < 10) return;

    const avgCost = recentEntries.reduce((sum, e) => sum + e.actualCost, 0) / recentEntries.length;
    const stdDev = Math.sqrt(
      recentEntries.reduce((sum, e) => sum + Math.pow(e.actualCost - avgCost, 2), 0) / recentEntries.length
    );

    const deviation = stdDev > 0 ? (entry.actualCost - avgCost) / stdDev : 0;

    if (Math.abs(deviation) > this.anomalyThreshold) {
      const anomaly: CostAnomaly = {
        timestamp: new Date(),
        type: 'spike',
        severity: Math.abs(deviation) > 3 ? 'high' : 'medium',
        description: `Cost ${deviation > 0 ? 'spike' : 'drop'} detected: ${entry.actualCost.toFixed(4)} vs avg ${avgCost.toFixed(4)}`,
        currentValue: entry.actualCost,
        expectedValue: avgCost,
        deviation,
      };

      this.anomalies.push(anomaly);
      logger.warn('Cost anomaly detected', anomaly);
    }
  }

  private updateBudget(agentId: string | undefined, cost: number): void {
    const key = agentId || 'global';
    let budget = this.budgets.get(key);
    
    if (!budget) {
      budget = { current: 0 };
      this.budgets.set(key, budget);
    }

    budget.current += cost;

    if (budget.daily && budget.current > budget.daily * 0.9) {
      const anomaly: CostAnomaly = {
        timestamp: new Date(),
        type: budget.current > budget.daily ? 'budget_exceeded' : 'budget_warning',
        severity: budget.current > budget.daily ? 'critical' : 'high',
        description: `Budget ${budget.current > budget.daily ? 'exceeded' : 'warning'} for ${key}`,
        currentValue: budget.current,
        expectedValue: budget.daily,
        deviation: (budget.current - budget.daily) / budget.daily,
      };
      
      this.anomalies.push(anomaly);
      logger.warn('Budget alert', anomaly);
    }
  }

  setBudget(agentId: string | undefined, limits: { daily?: number; monthly?: number }): void {
    const key = agentId || 'global';
    const existing = this.budgets.get(key);
    this.budgets.set(key, {
      ...limits,
      current: existing?.current || 0,
    });
  }

  resetBudgetCycle(agentId?: string): void {
    if (agentId) {
      const budget = this.budgets.get(agentId);
      if (budget) budget.current = 0;
    } else {
      for (const budget of this.budgets.values()) {
        budget.current = 0;
      }
    }
  }

  getSummary(
    period: CostSummary['period'],
    startDate?: Date,
    endDate?: Date
  ): CostSummary {
    const now = new Date();
    const periodMs = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
    };

    const effectiveStartDate = startDate || new Date(now.getTime() - periodMs[period]);
    const effectiveEndDate = endDate || now;

    const filteredEntries = this.entries.filter(
      e => e.timestamp >= effectiveStartDate && e.timestamp <= effectiveEndDate
    );

    const costByTier: Record<ModelTier, number> = {
      FREE: 0, CHEAP: 0, BALANCED: 0, PREMIUM: 0, FALLBACK: 0
    };
    const costByProvider: Record<string, number> = {};
    const costByAgent: Record<string, number> = {};

    let totalActualCost = 0;
    let totalBaselineCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const entry of filteredEntries) {
      totalActualCost += entry.actualCost;
      totalBaselineCost += entry.baselineCost;
      totalInputTokens += entry.inputTokens;
      totalOutputTokens += entry.outputTokens;
      
      costByTier[entry.tier] += entry.actualCost;
      costByProvider[entry.provider] = (costByProvider[entry.provider] || 0) + entry.actualCost;
      
      if (entry.agentId) {
        costByAgent[entry.agentId] = (costByAgent[entry.agentId] || 0) + entry.actualCost;
      }
    }

    const totalSavings = totalBaselineCost - totalActualCost;
    const averageSavingsPercent = totalBaselineCost > 0 
      ? (totalSavings / totalBaselineCost) * 100 
      : 0;

    return {
      period,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      totalRequests: filteredEntries.length,
      totalInputTokens,
      totalOutputTokens,
      totalActualCost,
      totalBaselineCost,
      totalSavings,
      averageSavingsPercent,
      costByTier,
      costByProvider,
      costByAgent,
    };
  }

  getProjection(basedOnDays: number = 7): CostProjection {
    const msPerDay = 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - basedOnDays * msPerDay);
    
    const recentEntries = this.entries.filter(e => e.timestamp >= cutoffDate);
    
    if (recentEntries.length < 10) {
      return {
        projectedDailyCost: 0,
        projectedMonthlyCost: 0,
        projectedSavings: 0,
        confidenceLevel: 0,
        basedOnDays,
        trend: 'stable',
      };
    }

    const dailyCosts: number[] = [];
    const dailySavings: number[] = [];
    
    for (let i = 0; i < basedOnDays; i++) {
      const dayStart = new Date(Date.now() - (i + 1) * msPerDay);
      const dayEnd = new Date(Date.now() - i * msPerDay);
      
      const dayEntries = recentEntries.filter(
        e => e.timestamp >= dayStart && e.timestamp < dayEnd
      );
      
      dailyCosts.push(dayEntries.reduce((sum, e) => sum + e.actualCost, 0));
      dailySavings.push(dayEntries.reduce((sum, e) => sum + e.savings, 0));
    }

    const avgDailyCost = dailyCosts.reduce((a, b) => a + b, 0) / dailyCosts.length;
    const avgDailySavings = dailySavings.reduce((a, b) => a + b, 0) / dailySavings.length;
    
    let trend: CostProjection['trend'] = 'stable';
    if (dailyCosts.length >= 3) {
      const recentAvg = (dailyCosts[0] + dailyCosts[1] + dailyCosts[2]) / 3;
      const oldAvg = dailyCosts.slice(-3).reduce((a, b) => a + b, 0) / 3;
      
      if (recentAvg > oldAvg * 1.1) trend = 'increasing';
      else if (recentAvg < oldAvg * 0.9) trend = 'decreasing';
    }

    const stdDev = Math.sqrt(
      dailyCosts.reduce((sum, c) => sum + Math.pow(c - avgDailyCost, 2), 0) / dailyCosts.length
    );
    const confidenceLevel = Math.max(0, Math.min(1, 1 - (stdDev / (avgDailyCost || 1))));

    return {
      projectedDailyCost: avgDailyCost,
      projectedMonthlyCost: avgDailyCost * 30,
      projectedSavings: avgDailySavings * 30,
      confidenceLevel,
      basedOnDays,
      trend,
    };
  }

  getAnomalies(since?: Date): CostAnomaly[] {
    if (!since) return [...this.anomalies];
    return this.anomalies.filter(a => a.timestamp >= since);
  }

  clearAnomalies(): void {
    this.anomalies = [];
  }

  getRecentEntries(limit: number = 100): CostEntry[] {
    return this.entries.slice(-limit);
  }

  getTotalSavings(): { amount: number; percent: number } {
    const totalActual = this.entries.reduce((sum, e) => sum + e.actualCost, 0);
    const totalBaseline = this.entries.reduce((sum, e) => sum + e.baselineCost, 0);
    const savings = totalBaseline - totalActual;
    
    return {
      amount: savings,
      percent: totalBaseline > 0 ? (savings / totalBaseline) * 100 : 0,
    };
  }

  getModelPricing(model: string): ModelPricing | undefined {
    return MODEL_PRICING[model];
  }

  addModelPricing(model: string, pricing: ModelPricing): void {
    MODEL_PRICING[model] = pricing;
  }

  exportData(): string {
    return JSON.stringify({
      entries: this.entries,
      anomalies: this.anomalies,
      budgets: Array.from(this.budgets.entries()),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  reset(): void {
    this.entries = [];
    this.anomalies = [];
    this.budgets.clear();
  }
}

export const costTracker = new CostTracker();
