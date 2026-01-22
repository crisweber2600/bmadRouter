import { ModelTier, ProviderName, RouterDecisionTrace } from '../types';
import { logger } from './logger';

export interface OTelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, string | number | boolean>;
  events: OTelEvent[];
}

export interface OTelEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, string | number | boolean>;
}

export interface OTelMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  value: number;
  unit: string;
  labels: Record<string, string>;
  timestamp: number;
}

export interface OTelExporterConfig {
  endpoint?: string;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  headers?: Record<string, string>;
  batchSize?: number;
  flushInterval?: number;
  enabled?: boolean;
}

type MetricUpdateCallback = (metric: OTelMetric) => void;

export class OpenTelemetryExporter {
  private config: OTelExporterConfig;
  private pendingSpans: OTelSpan[] = [];
  private pendingMetrics: OTelMetric[] = [];
  private metricCallbacks: MetricUpdateCallback[] = [];
  private flushTimer?: NodeJS.Timeout;
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  constructor(config: OTelExporterConfig) {
    this.config = {
      batchSize: 100,
      flushInterval: 10000,
      enabled: true,
      ...config,
    };

    if (this.config.enabled && this.config.flushInterval) {
      this.startAutoFlush();
    }
  }

  createSpanFromDecision(trace: RouterDecisionTrace): OTelSpan {
    const startTime = trace.timestamp.getTime();
    const endTime = startTime + trace.execution.latencyMs;

    return {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      operationName: 'bmad-router.route',
      serviceName: this.config.serviceName,
      startTime,
      endTime,
      duration: trace.execution.latencyMs,
      status: 'ok',
      attributes: {
        'bmad.request_id': trace.requestId,
        'bmad.selected_tier': trace.selectedTier,
        'bmad.selected_model': trace.selectedModel,
        'bmad.decision_path': trace.decisionPath,
        'bmad.confidence': trace.explanation.confidence,
        'bmad.cost': trace.execution.cost,
        'bmad.input_tokens': trace.execution.tokenUsage.input,
        'bmad.output_tokens': trace.execution.tokenUsage.output,
        'bmad.complexity': trace.signals.complexity,
        'bmad.intent_category': trace.signals.intentCategory,
        'bmad.has_code': trace.signals.hasCode,
      },
      events: this.createEventsFromDecision(trace),
    };
  }

  recordSpan(span: OTelSpan): void {
    if (!this.config.enabled) return;

    this.pendingSpans.push(span);

    if (this.pendingSpans.length >= (this.config.batchSize || 100)) {
      this.flush();
    }
  }

  recordDecision(trace: RouterDecisionTrace): void {
    const span = this.createSpanFromDecision(trace);
    this.recordSpan(span);

    this.incrementCounter('bmad_router_requests_total', {
      tier: trace.selectedTier,
      decision_path: trace.decisionPath,
    });

    this.recordHistogram('bmad_router_latency_ms', trace.execution.latencyMs, {
      tier: trace.selectedTier,
    });

    this.setGauge('bmad_router_confidence', trace.explanation.confidence, {
      tier: trace.selectedTier,
    });
  }

  incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    const key = this.buildMetricKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);

    this.recordMetric({
      name,
      type: 'counter',
      value: current + value,
      unit: '',
      labels,
      timestamp: Date.now(),
    });
  }

  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.buildMetricKey(name, labels);
    this.gauges.set(key, value);

    this.recordMetric({
      name,
      type: 'gauge',
      value,
      unit: '',
      labels,
      timestamp: Date.now(),
    });
  }

  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.buildMetricKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    
    if (values.length > 10000) {
      this.histograms.set(key, values.slice(-10000));
    } else {
      this.histograms.set(key, values);
    }

    this.recordMetric({
      name,
      type: 'histogram',
      value,
      unit: 'ms',
      labels,
      timestamp: Date.now(),
    });
  }

  getHistogramStats(name: string, labels: Record<string, string> = {}): {
    count: number;
    sum: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const key = this.buildMetricKey(name, labels);
    const values = this.histograms.get(key);
    
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count: sorted.length,
      sum,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  onMetricUpdate(callback: MetricUpdateCallback): void {
    this.metricCallbacks.push(callback);
  }

  async flush(): Promise<void> {
    if (!this.config.enabled || (this.pendingSpans.length === 0 && this.pendingMetrics.length === 0)) {
      return;
    }

    const spansToExport = [...this.pendingSpans];
    const metricsToExport = [...this.pendingMetrics];
    this.pendingSpans = [];
    this.pendingMetrics = [];

    if (this.config.endpoint) {
      await this.exportToEndpoint(spansToExport, metricsToExport);
    } else {
      logger.debug('OTel export (no endpoint)', {
        spansCount: spansToExport.length,
        metricsCount: metricsToExport.length,
      });
    }
  }

  exportPrometheusMetrics(): string {
    const lines: string[] = [];

    for (const [key, value] of this.counters) {
      const { name, labels } = this.parseMetricKey(key);
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`${name}{${labelStr}} ${value}`);
    }

    for (const [key, value] of this.gauges) {
      const { name, labels } = this.parseMetricKey(key);
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`${name}{${labelStr}} ${value}`);
    }

    for (const [key, values] of this.histograms) {
      const { name, labels } = this.parseMetricKey(key);
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
      const sum = values.reduce((a, b) => a + b, 0);
      lines.push(`${name}_sum{${labelStr}} ${sum}`);
      lines.push(`${name}_count{${labelStr}} ${values.length}`);
    }

    return lines.join('\n');
  }

  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private recordMetric(metric: OTelMetric): void {
    this.pendingMetrics.push(metric);
    this.metricCallbacks.forEach(cb => cb(metric));
  }

  private createEventsFromDecision(trace: RouterDecisionTrace): OTelEvent[] {
    const events: OTelEvent[] = [];

    events.push({
      name: 'routing_decision',
      timestamp: trace.timestamp.getTime(),
      attributes: {
        decision: trace.explanation.decision,
        confidence: trace.explanation.confidence,
      },
    });

    if (trace.semanticAgreement) {
      events.push({
        name: 'semantic_agreement',
        timestamp: trace.timestamp.getTime(),
        attributes: {
          models_queried: trace.semanticAgreement.modelsQueried.join(','),
          agreement_score: trace.semanticAgreement.agreementScore,
          consensus_reached: trace.semanticAgreement.consensusReached,
        },
      });
    }

    if (trace.override) {
      events.push({
        name: 'override_applied',
        timestamp: trace.timestamp.getTime(),
        attributes: {
          requested_by: trace.override.requestedBy,
          reason: trace.override.reason,
          original_decision: trace.override.originalDecision,
        },
      });
    }

    return events;
  }

  private async exportToEndpoint(spans: OTelSpan[], metrics: OTelMetric[]): Promise<void> {
    try {
      const payload = {
        resourceSpans: [{
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: this.config.serviceName } },
              { key: 'service.version', value: { stringValue: this.config.serviceVersion } },
              { key: 'deployment.environment', value: { stringValue: this.config.environment } },
            ],
          },
          scopeSpans: [{
            spans: spans.map(s => this.convertSpanToOTLP(s)),
          }],
        }],
      };

      logger.debug('Exporting to OTel endpoint', {
        endpoint: this.config.endpoint,
        spansCount: spans.length,
        metricsCount: metrics.length,
      });

    } catch (error) {
      logger.error('OTel export failed', { error });
    }
  }

  private convertSpanToOTLP(span: OTelSpan): Record<string, unknown> {
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.operationName,
      startTimeUnixNano: span.startTime * 1000000,
      endTimeUnixNano: span.endTime * 1000000,
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? { stringValue: value } :
               typeof value === 'number' ? { intValue: value } :
               { boolValue: value },
      })),
      events: span.events.map(e => ({
        name: e.name,
        timeUnixNano: e.timestamp * 1000000,
        attributes: Object.entries(e.attributes).map(([key, value]) => ({
          key,
          value: typeof value === 'string' ? { stringValue: value } :
                 typeof value === 'number' ? { intValue: value } :
                 { boolValue: value },
        })),
      })),
      status: { code: span.status === 'ok' ? 1 : span.status === 'error' ? 2 : 0 },
    };
  }

  private generateTraceId(): string {
    return Array.from({ length: 32 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private generateSpanId(): string {
    return Array.from({ length: 16 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private buildMetricKey(name: string, labels: Record<string, string>): string {
    const sortedLabels = Object.keys(labels).sort().map(k => `${k}=${labels[k]}`).join(',');
    return `${name}|${sortedLabels}`;
  }

  private parseMetricKey(key: string): { name: string; labels: Record<string, string> } {
    const [name, labelStr] = key.split('|');
    const labels: Record<string, string> = {};
    if (labelStr) {
      labelStr.split(',').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) labels[k] = v;
      });
    }
    return { name, labels };
  }
}
