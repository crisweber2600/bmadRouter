export type ModelTier = 'FREE' | 'CHEAP' | 'BALANCED' | 'PREMIUM' | 'FALLBACK';
export interface LLMRequest {
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    bmadRouter?: {
        tier?: ModelTier;
        reason?: string;
        bypass?: boolean;
    };
}
export interface LLMResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
export type DecisionPath = 'heuristic' | 'cascade' | 'consensus' | 'semantic_agreement' | 'override' | 'fallback' | 'bypass' | 'cascade_fallback';
export type ProviderName = 'openai' | 'anthropic' | 'google';
export interface RoutingDecision {
    requestId?: string;
    timestamp?: Date;
    selectedTier: ModelTier;
    selectedModel: string;
    selectedProvider?: ProviderName;
    decisionPath: DecisionPath;
    confidence: number;
    costSavings?: number;
    processingTimeMs?: number;
}
export interface RoutingSignals {
    tokenCount: number;
    complexity: number;
    hasCode: boolean;
    intentCategory: 'factual' | 'reasoning' | 'creative' | 'code' | 'mixed';
    confidence: number;
}
export interface RouterDecisionTrace {
    requestId: string;
    timestamp: Date;
    selectedModel: string;
    selectedTier: ModelTier;
    decisionPath: string;
    signals: RoutingSignals;
    semanticAgreement?: {
        modelsQueried: string[];
        agreementScore: number;
        consensusReached: boolean;
    };
    explanation: {
        decision: string;
        reasoning: string[];
        confidence: number;
        costSavings: string;
        overrideHint: string;
    };
    override?: {
        requestedBy: string;
        reason: string;
        originalDecision: string;
    };
    execution: {
        latencyMs: number;
        cost: number;
        tokenUsage: {
            input: number;
            output: number;
        };
    };
}
export interface ProviderConfig {
    name: string;
    apiKey: string;
    baseUrl: string;
    models: Record<ModelTier, string>;
    rateLimits: {
        requestsPerMinute: number;
        tokensPerMinute: number;
    };
}
export interface CacheResult {
    hit: boolean;
    response?: LLMResponse;
    confidence: number;
    source: 'exact' | 'semantic' | 'provider';
    ttl?: number;
}
//# sourceMappingURL=index.d.ts.map