import { RouterDecisionTrace } from '../types';
export declare class TelemetryCollector {
    private decisionTraces;
    private readonly maxTraces;
    recordDecision(trace: RouterDecisionTrace): Promise<void>;
    getRecentDecisions(limit?: number): RouterDecisionTrace[];
    getDecisionStats(): {
        totalDecisions: number;
        averageLatency: number;
        tierDistribution: Record<string, number>;
        decisionPathDistribution: Record<string, number>;
        averageConfidence: number;
    };
    exportMetrics(): Promise<void>;
    clear(): void;
}
//# sourceMappingURL=telemetry.d.ts.map