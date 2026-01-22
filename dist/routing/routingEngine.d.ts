import { LLMRequest, ModelTier, RoutingDecision, RoutingSignals, DecisionPath } from '../types';
export interface CascadeResult {
    tier: ModelTier;
    confidence: number;
    method: DecisionPath;
    attempts: number;
}
export declare class RoutingEngine {
    private tierMappings;
    private readonly CASCADE_THRESHOLD;
    private readonly CONSENSUS_THRESHOLD;
    private readonly MIN_CONFIDENCE;
    makeDecision(request: LLMRequest, signals: RoutingSignals): Promise<RoutingDecision>;
    /**
     * Semantic Agreement Cascading
     *
     * This algorithm implements intelligent tier selection through a cascading
     * confidence-based approach:
     *
     * 1. Start with heuristic-based tier selection
     * 2. If confidence is low (<CASCADE_THRESHOLD), cascade UP to higher tier
     * 3. Apply multi-signal consensus to refine the decision
     * 4. Return the tier with highest agreement confidence
     */
    private applySemanticCascading;
    /**
     * Assess tier based on routing signals
     */
    private assessTierFromSignals;
    /**
     * Calculate confidence for a specific tier given signals
     */
    private calculateTierConfidence;
    /**
     * Cascade to higher tier when confidence is low
     */
    private cascadeToHigherTier;
    /**
     * Apply multi-signal consensus for very ambiguous cases
     */
    private applyMultiSignalConsensus;
    private selectModelFromTier;
    private getProviderForModel;
    private createDecision;
    private handleOverride;
    makeFallbackDecision(): Promise<RoutingDecision>;
    getTierMappings(): Record<ModelTier, string[]>;
    updateTierMapping(tier: ModelTier, models: string[]): void;
    getCascadeThresholds(): {
        cascade: number;
        consensus: number;
        minimum: number;
    };
}
//# sourceMappingURL=routingEngine.d.ts.map