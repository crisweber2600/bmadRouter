import { ModelTier, ProviderName, RouterDecisionTrace } from '../types';
import { TelemetryCollector } from './telemetry';
import { CostTracker, CostSummary } from '../cost/costTracker';
import { AgentConfigManager } from '../config/agentConfig';
import { logger } from './logger';

export interface DashboardMetrics {
  timestamp: Date;
  requestsPerMinute: number;
  requestsPerHour: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  successRate: number;
  cacheHitRate: number;
  tierDistribution: Record<ModelTier, number>;
  providerDistribution: Record<ProviderName, number>;
  costSavingsPercent: number;
  totalCostSaved: number;
  activeAgents: number;
  circuitBreakerStatus: Record<string, 'closed' | 'open' | 'half-open'>;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  lastCheck: Date;
  components: {
    routing: ComponentHealth;
    providers: Record<ProviderName, ComponentHealth>;
    cache: ComponentHealth;
    costTracking: ComponentHealth;
  };
  alerts: Alert[];
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  errorRate?: number;
  lastError?: string;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  source: string;
}

export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
}

export interface DashboardSnapshot {
  metrics: DashboardMetrics;
  health: HealthStatus;
  recentDecisions: RouterDecisionTrace[];
  costSummary: CostSummary;
  timeSeries: {
    latency: TimeSeriesDataPoint[];
    requests: TimeSeriesDataPoint[];
    errors: TimeSeriesDataPoint[];
    costSavings: TimeSeriesDataPoint[];
  };
}

export class Dashboard {
  private startTime: Date;
  private alerts: Alert[] = [];
  private latencyHistory: number[] = [];
  private requestTimestamps: Date[] = [];
  private errorTimestamps: Date[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private circuitBreakerStates: Map<string, 'closed' | 'open' | 'half-open'> = new Map();
  private timeSeriesData: {
    latency: TimeSeriesDataPoint[];
    requests: TimeSeriesDataPoint[];
    errors: TimeSeriesDataPoint[];
    costSavings: TimeSeriesDataPoint[];
  } = {
    latency: [],
    requests: [],
    errors: [],
    costSavings: [],
  };

  constructor(
    private telemetry: TelemetryCollector,
    private costTracker: CostTracker,
    private agentConfig: AgentConfigManager
  ) {
    this.startTime = new Date();
  }

  recordRequest(latencyMs: number, success: boolean, cacheHit: boolean): void {
    const now = new Date();
    this.requestTimestamps.push(now);
    this.latencyHistory.push(latencyMs);

    if (!success) {
      this.errorTimestamps.push(now);
    }

    if (cacheHit) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }

    if (this.latencyHistory.length > 10000) {
      this.latencyHistory = this.latencyHistory.slice(-10000);
    }

    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    this.requestTimestamps = this.requestTimestamps.filter(t => t >= oneHourAgo);
    this.errorTimestamps = this.errorTimestamps.filter(t => t >= oneHourAgo);
  }

  updateCircuitBreaker(provider: string, state: 'closed' | 'open' | 'half-open'): void {
    const previous = this.circuitBreakerStates.get(provider);
    this.circuitBreakerStates.set(provider, state);

    if (state === 'open' && previous !== 'open') {
      this.addAlert({
        severity: 'error',
        message: `Circuit breaker opened for provider: ${provider}`,
        source: 'circuit-breaker',
      });
    }
  }

  addAlert(params: { severity: Alert['severity']; message: string; source: string }): void {
    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...params,
      timestamp: new Date(),
      acknowledged: false,
    };

    this.alerts.push(alert);

    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }

    logger.warn('Dashboard alert', { alertId: alert.id, severity: alert.severity, message: alert.message });
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  getMetrics(): DashboardMetrics {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const requestsLastMinute = this.requestTimestamps.filter(t => t >= oneMinuteAgo).length;
    const requestsLastHour = this.requestTimestamps.filter(t => t >= oneHourAgo).length;
    const errorsLastHour = this.errorTimestamps.filter(t => t >= oneHourAgo).length;

    const stats = this.telemetry.getDecisionStats();
    const savings = this.costTracker.getTotalSavings();

    return {
      timestamp: now,
      requestsPerMinute: requestsLastMinute,
      requestsPerHour: requestsLastHour,
      averageLatencyMs: this.calculateAverageLatency(),
      p95LatencyMs: this.calculatePercentileLatency(95),
      p99LatencyMs: this.calculatePercentileLatency(99),
      errorRate: requestsLastHour > 0 ? errorsLastHour / requestsLastHour : 0,
      successRate: requestsLastHour > 0 ? (requestsLastHour - errorsLastHour) / requestsLastHour : 1,
      cacheHitRate: this.cacheHits + this.cacheMisses > 0 
        ? this.cacheHits / (this.cacheHits + this.cacheMisses) 
        : 0,
      tierDistribution: stats.tierDistribution as Record<ModelTier, number>,
      providerDistribution: {} as Record<ProviderName, number>,
      costSavingsPercent: savings.percent,
      totalCostSaved: savings.amount,
      activeAgents: this.agentConfig.getAllConfigs().length,
      circuitBreakerStatus: Object.fromEntries(this.circuitBreakerStates),
    };
  }

  getHealth(): HealthStatus {
    const metrics = this.getMetrics();
    const now = new Date();

    const routingHealth = this.assessComponentHealth(metrics.errorRate, metrics.averageLatencyMs);
    
    const providerHealth: Record<ProviderName, ComponentHealth> = {
      openai: this.getProviderHealth('openai'),
      anthropic: this.getProviderHealth('anthropic'),
      google: this.getProviderHealth('google'),
    };

    const overallStatus = this.determineOverallStatus([
      routingHealth.status,
      ...Object.values(providerHealth).map(p => p.status),
    ]);

    return {
      status: overallStatus,
      uptime: now.getTime() - this.startTime.getTime(),
      lastCheck: now,
      components: {
        routing: routingHealth,
        providers: providerHealth,
        cache: { status: metrics.cacheHitRate > 0.1 ? 'healthy' : 'degraded' },
        costTracking: { status: 'healthy' },
      },
      alerts: this.alerts.filter(a => !a.acknowledged),
    };
  }

  getSnapshot(): DashboardSnapshot {
    return {
      metrics: this.getMetrics(),
      health: this.getHealth(),
      recentDecisions: this.telemetry.getRecentDecisions(20),
      costSummary: this.costTracker.getSummary('hourly'),
      timeSeries: this.timeSeriesData,
    };
  }

  getAlerts(includeAcknowledged = false): Alert[] {
    return includeAcknowledged 
      ? [...this.alerts] 
      : this.alerts.filter(a => !a.acknowledged);
  }

  recordTimeSeriesDataPoint(): void {
    const now = new Date();
    const metrics = this.getMetrics();
    const savings = this.costTracker.getTotalSavings();

    this.timeSeriesData.latency.push({ timestamp: now, value: metrics.averageLatencyMs });
    this.timeSeriesData.requests.push({ timestamp: now, value: metrics.requestsPerMinute });
    this.timeSeriesData.errors.push({ timestamp: now, value: metrics.errorRate });
    this.timeSeriesData.costSavings.push({ timestamp: now, value: savings.amount });

    const maxPoints = 1440;
    for (const key of Object.keys(this.timeSeriesData) as (keyof typeof this.timeSeriesData)[]) {
      if (this.timeSeriesData[key].length > maxPoints) {
        this.timeSeriesData[key] = this.timeSeriesData[key].slice(-maxPoints);
      }
    }
  }

  private calculateAverageLatency(): number {
    if (this.latencyHistory.length === 0) return 0;
    return this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
  }

  private calculatePercentileLatency(percentile: number): number {
    if (this.latencyHistory.length === 0) return 0;
    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private assessComponentHealth(errorRate: number, latencyMs: number): ComponentHealth {
    if (errorRate > 0.1 || latencyMs > 5000) {
      return { status: 'unhealthy', errorRate, latencyMs };
    }
    if (errorRate > 0.05 || latencyMs > 2000) {
      return { status: 'degraded', errorRate, latencyMs };
    }
    return { status: 'healthy', errorRate, latencyMs };
  }

  private getProviderHealth(provider: string): ComponentHealth {
    const cbState = this.circuitBreakerStates.get(provider);
    if (cbState === 'open') {
      return { status: 'unhealthy', lastError: 'Circuit breaker open' };
    }
    if (cbState === 'half-open') {
      return { status: 'degraded' };
    }
    return { status: 'healthy' };
  }

  private determineOverallStatus(statuses: ComponentHealth['status'][]): HealthStatus['status'] {
    if (statuses.some(s => s === 'unhealthy')) return 'unhealthy';
    if (statuses.some(s => s === 'degraded')) return 'degraded';
    return 'healthy';
  }

  reset(): void {
    this.alerts = [];
    this.latencyHistory = [];
    this.requestTimestamps = [];
    this.errorTimestamps = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.timeSeriesData = { latency: [], requests: [], errors: [], costSavings: [] };
  }
}
