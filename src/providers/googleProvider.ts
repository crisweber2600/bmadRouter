import axios, { AxiosInstance } from 'axios';
import { LLMRequest, LLMResponse } from '../types';
import { logger } from '../observability/logger';

export class GoogleProvider {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      timeout: 30000,
    });
  }

  async executeRequest(model: string, request: LLMRequest): Promise<LLMResponse> {
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

      logger.debug('Google request', { model: modelName, messageCount: request.messages.length });

      const response = await this.client.post(
        `/models/${modelName}:generateContent?key=${this.apiKey}`,
        payload
      );

      return this.convertResponse(response.data, request, modelName);

    } catch (error: any) {
      logger.error('Google request failed', {
        model,
        status: error.response?.status,
        error: error.response?.data?.error?.message || error.message,
      });

      throw new Error(`Google API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  private mapModel(model: string): string {
    const modelMappings: Record<string, string> = {
      'gemini-flash': 'gemini-1.5-flash',
      'gemini-pro': 'gemini-1.5-pro',
    };

    return modelMappings[model] || model;
  }

  private convertMessages(messages: LLMRequest['messages']): any[] {
    return messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  }

  private convertResponse(googleResponse: any, originalRequest: LLMRequest, model: string): LLMResponse {
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

  async checkHealth(): Promise<boolean> {
    try {
      // Simple health check
      const response = await this.client.get(`/models?key=${this.apiKey}`);
      return response.status === 200;
    } catch (error) {
      logger.error('Google health check failed', { error });
      return false;
    }
  }
}