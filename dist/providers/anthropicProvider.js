"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../observability/logger");
class AnthropicProvider {
    client;
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = axios_1.default.create({
            baseURL: 'https://api.anthropic.com/v1',
            headers: {
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01',
            },
            timeout: 60000, // 60 seconds (Claude can be slower)
        });
    }
    async executeRequest(model, request) {
        try {
            // Convert OpenAI format to Anthropic format
            const payload = {
                model: this.mapModel(model),
                max_tokens: request.max_tokens || 4096,
                temperature: request.temperature || 0.7,
                system: this.extractSystemMessage(request.messages),
                messages: this.convertMessages(request.messages),
                stream: false, // TODO: Implement streaming support
            };
            logger_1.logger.debug('Anthropic request', { model, messageCount: request.messages.length });
            const response = await this.client.post('/messages', payload);
            // Convert Anthropic response to OpenAI-compatible format
            return this.convertResponse(response.data, request);
        }
        catch (error) {
            logger_1.logger.error('Anthropic request failed', {
                model,
                status: error.response?.status,
                error: error.response?.data?.error?.message || error.message,
            });
            throw new Error(`Anthropic API error: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    mapModel(model) {
        const modelMappings = {
            'claude-sonnet': 'claude-3-5-sonnet-20241022',
            'claude-opus': 'claude-3-5-haiku-20241022', // Using Haiku for speed/cost, upgrade to Opus when needed
        };
        return modelMappings[model] || model;
    }
    extractSystemMessage(messages) {
        const systemMessage = messages.find(m => m.role === 'system');
        return systemMessage?.content || '';
    }
    convertMessages(messages) {
        return messages
            .filter(m => m.role !== 'system')
            .map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
        }));
    }
    convertResponse(anthropicResponse, _originalRequest) {
        return {
            id: anthropicResponse.id || `anthropic_${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: anthropicResponse.model,
            choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: anthropicResponse.content?.[0]?.text || '',
                    },
                    finish_reason: anthropicResponse.stop_reason || 'stop',
                }],
            usage: {
                prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
                completion_tokens: anthropicResponse.usage?.output_tokens || 0,
                total_tokens: (anthropicResponse.usage?.input_tokens || 0) + (anthropicResponse.usage?.output_tokens || 0),
            },
        };
    }
    async checkHealth() {
        try {
            // Simple health check - try to get models
            const response = await this.client.get('/models');
            return response.status === 200;
        }
        catch (error) {
            logger_1.logger.error('Anthropic health check failed', { error });
            return false;
        }
    }
}
exports.AnthropicProvider = AnthropicProvider;
//# sourceMappingURL=anthropicProvider.js.map