import { LLMRequest, RoutingSignals } from '../types';
export declare class PromptProcessor {
    processPrompt(request: LLMRequest): Promise<RoutingSignals>;
    private countTokens;
    private calculateComplexity;
    private detectCode;
    private classifyIntent;
    private calculateConfidence;
}
//# sourceMappingURL=promptProcessor.d.ts.map