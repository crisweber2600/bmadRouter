"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../observability/logger");
class GoogleProvider {
    client;
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = axios_1.default.create({
            baseURL: 'https://generativelanguage.googleapis.com/v1beta',
            timeout: 30000,
        });
    }
    async executeRequest(model, request) {
        try {
            const modelName = this.mapModel(model);
            const payload = {
                contents: this.convertMessages(request.messages),
                generationConfig: {
                    temperature: request.temperature || 0.7,
                    maxOutputTokens: request.max_tokens,
                    topP: 0.8,
                    topK: 10,
                },
            };
            logger_1.logger.debug('Google request', { model: modelName, messageCount: request.messages.length });
            const response = await this.client.post(`/models/${modelName}:generateContent?key=${this.apiKey}`, payload);
            return this.convertResponse(response.data, request, modelName);
        }
        catch (error) {
            logger_1.logger.error('Google request failed', {
                model,
                status: error.response?.status,
                error: error.response?.data?.error?.message || error.message,
            });
            throw new Error(`Google API error: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    mapModel(model) {
        const modelMappings = {
            'gemini-flash': 'gemini-1.5-flash',
            'gemini-pro': 'gemini-1.5-pro',
        };
        return modelMappings[model] || model;
    }
    convertMessages(messages) {
        return messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));
    }
    convertResponse(googleResponse, originalRequest, model) {
        const candidate = googleResponse.candidates?.[0];
        const content = candidate?.content?.parts?.[0]?.text || '';
        return {
            id: googleResponse.responseId || `google_${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content,
                    },
                    finish_reason: candidate?.finishReason?.toLowerCase() || 'stop',
                }],
            usage: {
                prompt_tokens: googleResponse.usageMetadata?.promptTokenCount || 0,
                completion_tokens: googleResponse.usageMetadata?.candidatesTokenCount || 0,
                total_tokens: googleResponse.usageMetadata?.totalTokenCount || 0,
            },
        };
    }
    async checkHealth() {
        try {
            // Simple health check
            const response = await this.client.get(`/models?key=${this.apiKey}`);
            return response.status === 200;
        }
        catch (error) {
            logger_1.logger.error('Google health check failed', { error });
            return false;
        }
    }
}
exports.GoogleProvider = GoogleProvider;
//# sourceMappingURL=googleProvider.js.map