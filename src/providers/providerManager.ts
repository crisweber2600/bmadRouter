import { LLMRequest, LLMResponse, RoutingDecision, ModelTier } from '../types';
import { logger } from '../observability/logger';
import { OpenAIProvider } from './openaiProvider';
import { AnthropicProvider } from './anthropicProvider';
import { GoogleProvider } from './googleProvider';

export class ProviderManager {
  private providers: Map<string, any> = new Map();
  private tierMappings: Record<ModelTier, string> = {
    FREE: 'local', // TODO: Implement local model provider
    CHEAP: 'openai', // gpt-4o-mini
    BALANCED: 'anthropic', // claude-sonnet
    PREMIUM: 'anthropic', // claude-opus
    FALLBACK: 'anthropic', // claude-opus
  };

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize providers if API keys are available
    if (process.env.OPENAI_API_KEY) {
      this.providers.set('openai', new OpenAIProvider(process.env.OPENAI_API_KEY));
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set('anthropic', new AnthropicProvider(process.env.ANTHROPIC_API_KEY));
    }

    if (process.env.GOOGLE_API_KEY) {
      this.providers.set('google', new GoogleProvider(process.env.GOOGLE_API_KEY));
    }

    logger.info('Providers initialized', {
      availableProviders: Array.from(this.providers.keys()),
    });
  }

  async executeRequest(decision: RoutingDecision, request: LLMRequest): Promise<LLMResponse> {
    const providerName = this.tierMappings[decision.selectedTier];

    if (!providerName) {
      throw new Error(`No provider mapping for tier: ${decision.selectedTier}`);
    }

    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not available: ${providerName}`);
    }

    try {
      logger.debug('Executing request', {
        provider: providerName,
        model: decision.selectedModel,
        tier: decision.selectedTier,
      });

      const response = await provider.executeRequest(decision.selectedModel, request);

      logger.info('Request executed successfully', {
        provider: providerName,
        model: decision.selectedModel,
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      });

      return response;

    } catch (error) {
      logger.error('Provider execution failed', {
        provider: providerName,
        model: decision.selectedModel,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  isProviderAvailable(providerName: string): boolean {
    return this.providers.has(providerName);
  }

  getTierMapping(tier: ModelTier): string | undefined {
    return this.tierMappings[tier];
  }

  updateTierMapping(tier: ModelTier, providerName: string): void {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider not available: ${providerName}`);
    }

    this.tierMappings[tier] = providerName;
    logger.info('Tier mapping updated', { tier, providerName });
  }
}