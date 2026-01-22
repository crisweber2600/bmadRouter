"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryCollector = void 0;
const logger_1 = require("./logger");
class TelemetryCollector {
    decisionTraces = [];
    maxTraces = 10000; // Keep last 10k decisions in memory
    async recordDecision(trace) {
        try {
            // Add to in-memory store
            this.decisionTraces.push(trace);
            // Maintain size limit
            if (this.decisionTraces.length > this.maxTraces) {
                this.decisionTraces = this.decisionTraces.slice(-this.maxTraces);
            }
            // Log the decision
            logger_1.logger.info('Decision recorded', {
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
        }
        catch (error) {
            logger_1.logger.error('Telemetry recording failed', { error, requestId: trace.requestId });
        }
    }
    getRecentDecisions(limit = 100) {
        return this.decisionTraces.slice(-limit);
    }
    getDecisionStats() {
        if (this.decisionTraces.length === 0) {
            return {
                totalDecisions: 0,
                averageLatency: 0,
                tierDistribution: {},
                decisionPathDistribution: {},
                averageConfidence: 0,
            };
        }
        const tierDistribution = {};
        const decisionPathDistribution = {};
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
    async exportMetrics() {
        // TODO: Export to monitoring system (Prometheus, DataDog, etc.)
        const stats = this.getDecisionStats();
        logger_1.logger.info('Metrics export', stats);
    }
    clear() {
        this.decisionTraces = [];
        logger_1.logger.info('Telemetry cleared');
    }
}
exports.TelemetryCollector = TelemetryCollector;
//# sourceMappingURL=telemetry.js.map