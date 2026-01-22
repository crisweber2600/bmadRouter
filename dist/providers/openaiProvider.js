"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../observability/logger");
class OpenAIProvider {
    client;
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = axios_1.default.create({
            baseURL: 'https://api.openai.com/v1',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 seconds
        });
    }
    async executeRequest(model, request) {
        try {
            const payload = {
                model: this.mapModel(model),
                messages: request.messages,
                temperature: request.temperature || 0.7,
                max_tokens: request.max_tokens,
                stream: false, // TODO: Implement streaming support
            };
            logger_1.logger.debug('OpenAI request', { model, messageCount: request.messages.length });
            const response = await this.client.post('/chat/completions', payload);
            return response.data;
        }
        catch (error) {
            logger_1.logger.error('OpenAI request failed', {
                model,
                status: error.response?.status,
                error: error.response?.data?.error?.message || error.message,
            });
            throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    mapModel(model) {
        // Map our internal model names to OpenAI model IDs
        const modelMappings = {
            'gpt-4o-mini': 'gpt-4o-mini',
            'gpt-4o': 'gpt-4o',
            'gpt-5': 'gpt-4', // Fallback until GPT-5 is available
        };
        return modelMappings[model] || model;
    }
    async checkHealth() {
        try {
            const response = await this.client.get('/models');
            return response.status === 200;
        }
        catch (error) {
            logger_1.logger.error('OpenAI health check failed', { error });
            return false;
        }
    }
}
exports.OpenAIProvider = OpenAIProvider;
//# sourceMappingURL=openaiProvider.js.map