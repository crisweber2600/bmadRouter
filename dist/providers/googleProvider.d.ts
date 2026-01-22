import { LLMRequest, LLMResponse } from '../types';
export declare class GoogleProvider {
    private client;
    private apiKey;
    constructor(apiKey: string);
    executeRequest(model: string, request: LLMRequest): Promise<LLMResponse>;
    private mapModel;
    private convertMessages;
    private convertResponse;
    checkHealth(): Promise<boolean>;
}
//# sourceMappingURL=googleProvider.d.ts.map