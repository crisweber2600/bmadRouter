import axios, { AxiosInstance } from 'axios';
import { LLMRequest, LLMResponse } from '../types';
import { logger } from '../observability/logger';

export class OpenAIProvider {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://api.openai.com/v1',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });
  }

  async executeRequest(model: string, request: LLMRequest): Promise<LLMResponse> {
    try {
      const payload = {
        model: this.mapModel(model),
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.max_tokens,
        stream: false, // TODO: Implement streaming support
      };

      logger.debug('OpenAI request', { model, messageCount: request.messages.length });

      const response = await this.client.post('/chat/completions', payload);

      return response.data;

    } catch (error: any) {
      logger.error('OpenAI request failed', {
        model,
        status: error.response?.status,
        error: error.response?.data?.error?.message || error.message,
      });

      throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  private mapModel(model: string): string {
    // Map our internal model names to OpenAI model IDs
    const modelMappings: Record<string, string> = {
      'gpt-4o-mini': 'gpt-4o-mini',
      'gpt-4o': 'gpt-4o',
      'gpt-5': 'gpt-4', // Fallback until GPT-5 is available
    };

    return modelMappings[model] || model;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/models');
      return response.status === 200;
    } catch (error) {
      logger.error('OpenAI health check failed', { error });
      return false;
    }
  }
}