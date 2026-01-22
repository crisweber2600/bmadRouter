"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoutingEngine = void 0;
const logger_1 = require("../observability/logger");
class RoutingEngine {
    tierMappings = {
        FREE: ['local-model'],
        CHEAP: ['gpt-4o-mini', 'gemini-flash'],
        BALANCED: ['claude-sonnet', 'gpt-4o'],
        PREMIUM: ['claude-opus', 'gpt-5'],
        FALLBACK: ['claude-opus'], // Always fall back to highest quality
    };
    // Confidence thresholds for cascading decisions
    CASCADE_THRESHOLD = 0.7; // Below this, cascade to higher tier
    CONSENSUS_THRESHOLD = 0.85; // Above this, high confidence decision
    MIN_CONFIDENCE = 0.5; // Minimum acceptable confidence
    async makeDecision(request, signals) {
        const startTime = Date.now();
        try {
            // Check for explicit override
            if (request.bmadRouter?.tier) {
                const overrideDecision = await this.handleOverride(request, signals);
                logger_1.logger.info('Override applied', { tier: overrideDecision.selectedTier });
                return overrideDecision;
            }
            // Check for bypass flag - go straight to PREMIUM
            if (request.bmadRouter?.bypass) {
                logger_1.logger.info('Bypass mode - routing to PREMIUM');
                return this.createDecision('PREMIUM', 0.99, 'bypass');
            }
            // Apply semantic agreement cascading for intelligent routing
            const cascadeResult = this.applySemanticCascading(signals);
            const processingTime = Date.now() - startTime;
            logger_1.logger.debug('Routing decision made', {
                decisionPath: cascadeResult.method,
                selectedTier: cascadeResult.tier,
                confidence: cascadeResult.confidence,
                cascadeAttempts: cascadeResult.attempts,
                processingTime,
            });
            return {
                requestId: `decision_${Date.now()}`,
                timestamp: new Date(),
                selectedTier: cascadeResult.tier,
                selectedModel: this.selectModelFromTier(cascadeResult.tier),
                selectedProvider: this.getProviderForModel(this.selectModelFromTier(cascadeResult.tier)),
                decisionPath: cascadeResult.method,
                confidence: cascadeResult.confidence,
                processingTimeMs: processingTime,
            };
        }
        catch (error) {
            logger_1.logger.error('Routing decision failed, using fallback', { error });
            return this.makeFallbackDecision();
        }
    }
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
    applySemanticCascading(signals) {
        let attempts = 1;
        // Phase 1: Initial heuristic assessment
        const initialTier = this.assessTierFromSignals(signals);
        let currentConfidence = this.calculateTierConfidence(initialTier, signals);
        logger_1.logger.debug('Cascade Phase 1 - Initial assessment', {
            tier: initialTier,
            confidence: currentConfidence,
        });
        // Phase 2: Check if cascading is needed
        if (currentConfidence >= this.CONSENSUS_THRESHOLD) {
            // High confidence - return immediately
            return {
                tier: initialTier,
                confidence: currentConfidence,
                method: 'heuristic',
                attempts,
            };
        }
        // Phase 3: Apply semantic cascading for ambiguous cases
        if (currentConfidence < this.CASCADE_THRESHOLD) {
            attempts++;
            const cascadedResult = this.cascadeToHigherTier(initialTier, signals);
            logger_1.logger.debug('Cascade Phase 3 - Cascading up', {
                fromTier: initialTier,
                toTier: cascadedResult.tier,
                newConfidence: cascadedResult.confidence,
            });
            if (cascadedResult.confidence > currentConfidence) {
                return {
                    ...cascadedResult,
                    method: 'cascade',
                    attempts,
                };
            }
        }
        // Phase 4: Multi-signal consensus for edge cases
        if (currentConfidence < this.CASCADE_THRESHOLD) {
            attempts++;
            const consensusResult = this.applyMultiSignalConsensus(signals);
            logger_1.logger.debug('Cascade Phase 4 - Consensus', {
                tier: consensusResult.tier,
                confidence: consensusResult.confidence,
            });
            return {
                ...consensusResult,
                method: 'consensus',
                attempts,
            };
        }
        return {
            tier: initialTier,
            confidence: currentConfidence,
            method: 'heuristic',
            attempts,
        };
    }
    /**
     * Assess tier based on routing signals
     */
    assessTierFromSignals(signals) {
        // Code always gets PREMIUM (safety-first for code generation)
        if (signals.hasCode) {
            return 'PREMIUM';
        }
        // Complexity-based tier mapping
        if (signals.complexity < 0.3) {
            return 'CHEAP';
        }
        else if (signals.complexity < 0.5) {
            return signals.intentCategory === 'factual' ? 'CHEAP' : 'BALANCED';
        }
        else if (signals.complexity < 0.7) {
            return 'BALANCED';
        }
        else {
            return 'PREMIUM';
        }
    }
    /**
     * Calculate confidence for a specific tier given signals
     */
    calculateTierConfidence(tier, signals) {
        let confidence = signals.confidence;
        // Boost confidence for clear tier matches
        switch (tier) {
            case 'CHEAP':
                if (signals.complexity < 0.3 && signals.intentCategory === 'factual') {
                    confidence = Math.min(confidence + 0.2, 0.95);
                }
                break;
            case 'BALANCED':
                if (signals.complexity >= 0.3 && signals.complexity < 0.7 &&
                    signals.intentCategory === 'reasoning') {
                    confidence = Math.min(confidence + 0.15, 0.95);
                }
                break;
            case 'PREMIUM':
                if (signals.hasCode || signals.complexity >= 0.7) {
                    confidence = Math.min(confidence + 0.2, 0.99);
                }
                break;
        }
        // Reduce confidence for ambiguous signals
        if (signals.intentCategory === 'mixed') {
            confidence = Math.max(confidence - 0.1, this.MIN_CONFIDENCE);
        }
        return confidence;
    }
    /**
     * Cascade to higher tier when confidence is low
     */
    cascadeToHigherTier(currentTier, signals) {
        const tierOrder = ['FREE', 'CHEAP', 'BALANCED', 'PREMIUM'];
        const currentIndex = tierOrder.indexOf(currentTier);
        // Can't cascade above PREMIUM
        if (currentIndex >= tierOrder.length - 1 || currentTier === 'PREMIUM') {
            return { tier: 'PREMIUM', confidence: 0.9 };
        }
        // Move up one tier
        const nextTier = tierOrder[currentIndex + 1];
        const newConfidence = this.calculateTierConfidence(nextTier, signals);
        // Cascading up inherently increases confidence
        return {
            tier: nextTier,
            confidence: Math.min(newConfidence + 0.1, 0.95),
        };
    }
    /**
     * Apply multi-signal consensus for very ambiguous cases
     */
    applyMultiSignalConsensus(signals) {
        // Score each tier based on multiple signals
        const tierScores = {
            FREE: 0,
            CHEAP: 0,
            BALANCED: 0,
            PREMIUM: 0,
            FALLBACK: 0,
        };
        // Signal 1: Token count scoring
        if (signals.tokenCount < 50) {
            tierScores.CHEAP += 2;
        }
        else if (signals.tokenCount < 200) {
            tierScores.BALANCED += 1;
            tierScores.CHEAP += 1;
        }
        else {
            tierScores.PREMIUM += 2;
        }
        // Signal 2: Complexity scoring
        if (signals.complexity < 0.3) {
            tierScores.CHEAP += 3;
        }
        else if (signals.complexity < 0.5) {
            tierScores.CHEAP += 1;
            tierScores.BALANCED += 2;
        }
        else if (signals.complexity < 0.7) {
            tierScores.BALANCED += 2;
            tierScores.PREMIUM += 1;
        }
        else {
            tierScores.PREMIUM += 3;
        }
        // Signal 3: Intent category scoring
        switch (signals.intentCategory) {
            case 'factual':
                tierScores.CHEAP += 2;
                break;
            case 'reasoning':
                tierScores.BALANCED += 2;
                break;
            case 'creative':
                tierScores.BALANCED += 1;
                tierScores.PREMIUM += 1;
                break;
            case 'code':
                tierScores.PREMIUM += 3;
                break;
            case 'mixed':
                tierScores.BALANCED += 1;
                break;
        }
        // Signal 4: Code presence (strongest signal)
        if (signals.hasCode) {
            tierScores.PREMIUM += 5;
        }
        // Find highest scoring tier
        let maxScore = 0;
        let selectedTier = 'BALANCED';
        for (const [tier, score] of Object.entries(tierScores)) {
            if (tier !== 'FALLBACK' && tier !== 'FREE' && score > maxScore) {
                maxScore = score;
                selectedTier = tier;
            }
        }
        // Calculate confidence from consensus strength
        const totalScore = Object.values(tierScores).reduce((a, b) => a + b, 0);
        const consensusStrength = totalScore > 0 ? maxScore / totalScore : 0.5;
        const confidence = Math.min(0.6 + (consensusStrength * 0.3), 0.9);
        return { tier: selectedTier, confidence };
    }
    selectModelFromTier(tier) {
        const models = this.tierMappings[tier];
        if (!models || models.length === 0) {
            return 'claude-opus'; // Safe fallback
        }
        // For now, return the first model in the tier
        // TODO: Implement load balancing and availability checking
        return models[0];
    }
    getProviderForModel(model) {
        if (model.includes('gpt') || model.includes('openai'))
            return 'openai';
        if (model.includes('claude') || model.includes('anthropic'))
            return 'anthropic';
        if (model.includes('gemini') || model.includes('google'))
            return 'google';
        return 'anthropic';
    }
    createDecision(tier, confidence, path) {
        const model = this.selectModelFromTier(tier);
        return {
            requestId: `decision_${Date.now()}`,
            timestamp: new Date(),
            selectedTier: tier,
            selectedModel: model,
            selectedProvider: this.getProviderForModel(model),
            decisionPath: path,
            confidence,
            processingTimeMs: 0,
        };
    }
    async handleOverride(request, signals) {
        const requestedTier = request.bmadRouter.tier;
        const reason = request.bmadRouter.reason || 'User override';
        logger_1.logger.info('Processing override request', { requestedTier, reason });
        // Validate requested tier
        if (!this.tierMappings[requestedTier]) {
            logger_1.logger.warn('Invalid tier requested, using heuristic cascade', { requestedTier });
            const cascadeResult = this.applySemanticCascading(signals);
            return this.createDecision(cascadeResult.tier, cascadeResult.confidence, 'cascade_fallback');
        }
        const selectedModel = this.selectModelFromTier(requestedTier);
        return {
            requestId: `override_${Date.now()}`,
            timestamp: new Date(),
            selectedTier: requestedTier,
            selectedModel,
            selectedProvider: this.getProviderForModel(selectedModel),
            decisionPath: 'override',
            confidence: 0.95, // User overrides are high confidence
            processingTimeMs: 0,
        };
    }
    async makeFallbackDecision() {
        logger_1.logger.warn('Using fallback routing decision');
        return {
            requestId: `fallback_${Date.now()}`,
            timestamp: new Date(),
            selectedTier: 'FALLBACK',
            selectedModel: 'claude-opus', // Always use highest quality for fallbacks
            selectedProvider: 'anthropic',
            decisionPath: 'fallback',
            confidence: 0.99, // Fallbacks are certain
            processingTimeMs: 0,
        };
    }
    getTierMappings() {
        return { ...this.tierMappings };
    }
    updateTierMapping(tier, models) {
        this.tierMappings[tier] = models;
        logger_1.logger.info('Tier mapping updated', { tier, models });
    }
    // Expose cascade thresholds for testing
    getCascadeThresholds() {
        return {
            cascade: this.CASCADE_THRESHOLD,
            consensus: this.CONSENSUS_THRESHOLD,
            minimum: this.MIN_CONFIDENCE,
        };
    }
}
exports.RoutingEngine = RoutingEngine;
//# sourceMappingURL=routingEngine.js.map