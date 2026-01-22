import { Dashboard } from '../observability/dashboard';
import { TelemetryCollector } from '../observability/telemetry';
import { CostTracker } from '../cost/costTracker';
import { AgentConfigManager } from '../config/agentConfig';
import { RouterDecisionTrace } from '../types';

describe('Dashboard', () => {
  let dashboard: Dashboard;
  let telemetry: TelemetryCollector;
  let costTracker: CostTracker;
  let agentConfig: AgentConfigManager;

  beforeEach(() => {
    telemetry = new TelemetryCollector();
    costTracker = new CostTracker();
    agentConfig = new AgentConfigManager();
    dashboard = new Dashboard(telemetry, costTracker, agentConfig);
  });

  describe('recordRequest', () => {
    it('should record successful request', () => {
      dashboard.recordRequest(100, true, false);
      const metrics = dashboard.getMetrics();
      expect(metrics.requestsPerMinute).toBeGreaterThan(0);
    });

    it('should record cache hit', () => {
      dashboard.recordRequest(50, true, true);
      const metrics = dashboard.getMetrics();
      expect(metrics.cacheHitRate).toBeGreaterThan(0);
    });

    it('should track errors', () => {
      dashboard.recordRequest(100, false, false);
      const metrics = dashboard.getMetrics();
      expect(metrics.errorRate).toBeGreaterThan(0);
    });
  });

  describe('getMetrics', () => {
    it('should return comprehensive metrics', () => {
      dashboard.recordRequest(100, true, false);
      dashboard.recordRequest(200, true, true);
      
      const metrics = dashboard.getMetrics();
      expect(metrics.timestamp).toBeInstanceOf(Date);
      expect(metrics.averageLatencyMs).toBeGreaterThan(0);
      expect(metrics.successRate).toBeGreaterThan(0);
    });

    it('should calculate percentile latencies', () => {
      for (let i = 0; i < 100; i++) {
        dashboard.recordRequest(i * 10, true, false);
      }
      
      const metrics = dashboard.getMetrics();
      expect(metrics.p95LatencyMs).toBeGreaterThan(metrics.averageLatencyMs);
      expect(metrics.p99LatencyMs).toBeGreaterThan(metrics.p95LatencyMs);
    });
  });

  describe('circuit breaker tracking', () => {
    it('should update circuit breaker state', () => {
      dashboard.updateCircuitBreaker('openai', 'open');
      const metrics = dashboard.getMetrics();
      expect(metrics.circuitBreakerStatus.openai).toBe('open');
    });

    it('should create alert when circuit opens', () => {
      dashboard.updateCircuitBreaker('anthropic', 'closed');
      dashboard.updateCircuitBreaker('anthropic', 'open');
      
      const alerts = dashboard.getAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].severity).toBe('error');
    });
  });

  describe('alerts', () => {
    it('should add and retrieve alerts', () => {
      dashboard.addAlert({
        severity: 'warning',
        message: 'Test alert',
        source: 'test',
      });
      
      const alerts = dashboard.getAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].message).toBe('Test alert');
      expect(alerts[0].acknowledged).toBe(false);
    });

    it('should acknowledge alerts', () => {
      dashboard.addAlert({
        severity: 'info',
        message: 'Info alert',
        source: 'test',
      });
      
      const alerts = dashboard.getAlerts();
      const alertId = alerts[0].id;
      
      const acknowledged = dashboard.acknowledgeAlert(alertId);
      expect(acknowledged).toBe(true);
      
      const remaining = dashboard.getAlerts(false);
      expect(remaining.length).toBe(0);
    });

    it('should filter acknowledged alerts', () => {
      dashboard.addAlert({ severity: 'info', message: 'Alert 1', source: 'test' });
      dashboard.addAlert({ severity: 'warning', message: 'Alert 2', source: 'test' });
      
      const allAlerts = dashboard.getAlerts(true);
      expect(allAlerts.length).toBe(2);
      
      dashboard.acknowledgeAlert(allAlerts[0].id);
      
      const unacknowledged = dashboard.getAlerts(false);
      expect(unacknowledged.length).toBe(1);
    });
  });

  describe('health status', () => {
    it('should return healthy status with low error rate', () => {
      for (let i = 0; i < 100; i++) {
        dashboard.recordRequest(100, true, false);
      }
      
      const health = dashboard.getHealth();
      expect(health.status).toBe('healthy');
    });

    it('should return unhealthy status with high error rate', () => {
      for (let i = 0; i < 100; i++) {
        dashboard.recordRequest(100, false, false);
      }
      
      const health = dashboard.getHealth();
      expect(health.status).toBe('unhealthy');
    });

    it('should track uptime', () => {
      const health = dashboard.getHealth();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.lastCheck).toBeInstanceOf(Date);
    });
  });

  describe('snapshot', () => {
    it('should provide complete dashboard snapshot', () => {
      dashboard.recordRequest(100, true, false);
      
      const snapshot = dashboard.getSnapshot();
      expect(snapshot.metrics).toBeDefined();
      expect(snapshot.health).toBeDefined();
      expect(snapshot.recentDecisions).toBeDefined();
      expect(snapshot.costSummary).toBeDefined();
      expect(snapshot.timeSeries).toBeDefined();
    });
  });

  describe('time series', () => {
    it('should record time series data', () => {
      dashboard.recordRequest(100, true, false);
      dashboard.recordTimeSeriesDataPoint();
      
      const snapshot = dashboard.getSnapshot();
      expect(snapshot.timeSeries.latency.length).toBeGreaterThan(0);
      expect(snapshot.timeSeries.requests.length).toBeGreaterThan(0);
    });

    it('should limit time series data points', () => {
      for (let i = 0; i < 1500; i++) {
        dashboard.recordTimeSeriesDataPoint();
      }
      
      const snapshot = dashboard.getSnapshot();
      expect(snapshot.timeSeries.latency.length).toBeLessThanOrEqual(1440);
    });
  });

  describe('reset', () => {
    it('should clear all dashboard data', () => {
      dashboard.recordRequest(100, true, false);
      dashboard.addAlert({ severity: 'info', message: 'Test', source: 'test' });
      
      dashboard.reset();
      
      const metrics = dashboard.getMetrics();
      const alerts = dashboard.getAlerts();
      
      expect(metrics.requestsPerMinute).toBe(0);
      expect(alerts.length).toBe(0);
    });
  });
});
