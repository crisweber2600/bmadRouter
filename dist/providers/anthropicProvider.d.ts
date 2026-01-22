import { LLMRequest, LLMResponse } from '../types';
export declare class AnthropicProvider {
    private client;
    private apiKey;
    constructor(apiKey: string);
    executeRequest(model: string, request: LLMRequest): Promise<LLMResponse>;
    private mapModel;
    private extractSystemMessage;
    private convertMessages;
    private convertResponse;
    checkHealth(): Promise<boolean>;
}
//# sourceMappingURL=anthropicProvider.d.ts.map