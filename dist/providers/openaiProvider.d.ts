import { LLMRequest, LLMResponse } from '../types';
export declare class OpenAIProvider {
    private client;
    private apiKey;
    constructor(apiKey: string);
    executeRequest(model: string, request: LLMRequest): Promise<LLMResponse>;
    private mapModel;
    checkHealth(): Promise<boolean>;
}
//# sourceMappingURL=openaiProvider.d.ts.map