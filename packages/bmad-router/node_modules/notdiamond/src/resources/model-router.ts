// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import * as PromptOptimizationAPI from './prompt-optimization';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';

export class ModelRouter extends APIResource {
  /**
   * Select the optimal LLM to handle your query based on Not Diamond's routing
   * algorithm.
   *
   * This endpoint analyzes your messages and returns the best-suited model from your
   * specified models. The router considers factors like query complexity, model
   * capabilities, cost, and latency based on your preferences.
   *
   * **Key Features:**
   *
   * - Intelligent routing across multiple LLM providers
   * - Support for custom routers trained on your evaluation data
   * - Optional cost/latency optimization
   * - Function calling support for compatible models
   *
   * **Usage:**
   *
   * 1. Pass your messages in OpenAI format (array of objects with 'role' and
   *    'content')
   * 2. Specify which LLM providers you want to route between
   * 3. Optionally provide a preference_id to use a custom router that you've trained
   * 4. Receive a recommended model and session_id
   * 5. Use the session_id to submit feedback and improve routing
   *
   * **Related Endpoints:**
   *
   * - `POST /v2/preferences/userPreferenceCreate` - Create a preference ID for
   *   personalized routing
   * - `POST /v2/pzn/trainCustomRouter` - Train a custom router on your evaluation
   *   data
   *
   * @example
   * ```ts
   * const response = await client.modelRouter.selectModel({
   *   llm_providers: [
   *     { provider: 'openai', model: 'gpt-4o' },
   *     {
   *       provider: 'anthropic',
   *       model: 'claude-sonnet-4-5-20250929',
   *     },
   *     { provider: 'google', model: 'gemini-2.5-flash' },
   *   ],
   *   messages: [
   *     {
   *       role: 'system',
   *       content: 'You are a helpful assistant.',
   *     },
   *     {
   *       role: 'user',
   *       content: 'Explain quantum computing in simple terms',
   *     },
   *   ],
   * });
   * ```
   */
  selectModel(
    params: ModelRouterSelectModelParams,
    options?: RequestOptions,
  ): APIPromise<ModelRouterSelectModelResponse> {
    const { type, ...body } = params;
    return this._client.post('/v2/modelRouter/modelSelect', { query: { type }, body, ...options });
  }
}

/**
 * Response from model selection endpoint.
 */
export interface ModelRouterSelectModelResponse {
  /**
   * List containing the selected provider
   */
  providers: Array<ModelRouterSelectModelResponse.Provider>;

  /**
   * Unique session ID for this routing decision
   */
  session_id: string;
}

export namespace ModelRouterSelectModelResponse {
  /**
   * Selected LLM provider information from model selection endpoints.
   *
   * Part of ModelSelectResponse. Contains the provider and model that Not Diamond's
   * routing algorithm selected as optimal for your query. Use these values to make
   * your LLM API call to the recommended model.
   */
  export interface Provider {
    /**
     * Model identifier for the selected model (e.g., 'gpt-4o',
     * 'claude-3-opus-20240229')
     */
    model: string;

    /**
     * Provider name for the selected model (e.g., 'openai', 'anthropic', 'google')
     */
    provider: string;
  }
}

export interface ModelRouterSelectModelParams {
  /**
   * Body param: List of LLM providers to route between. Specify at least one
   * provider in format {provider, model}
   */
  llm_providers: Array<
    PromptOptimizationAPI.RequestProvider | ModelRouterSelectModelParams.OpenRouterProvider
  >;

  /**
   * Body param: Array of message objects in OpenAI format (with 'role' and 'content'
   * keys)
   */
  messages: Array<{ [key: string]: string | Array<unknown> }> | string;

  /**
   * Query param: Optional format type. Use 'openrouter' to accept and return
   * OpenRouter-format model identifiers
   */
  type?: string | null;

  /**
   * Body param: Whether to hash message content for privacy
   */
  hash_content?: boolean;

  /**
   * Body param: Maximum number of models to consider for routing. If not specified,
   * considers all provided models
   */
  max_model_depth?: number | null;

  /**
   * Body param: Optimization metric for model selection
   */
  metric?: string;

  /**
   * Body param: Preference ID for personalized routing. Create one via POST
   * /v2/preferences/userPreferenceCreate
   */
  preference_id?: string | null;

  /**
   * Body param: Previous session ID to link related requests
   */
  previous_session?: string | null;

  /**
   * Body param: OpenAI-format function calling tools
   */
  tools?: Array<{ [key: string]: unknown }> | null;

  /**
   * Body param: Optimization tradeoff strategy. Use 'cost' to prioritize cost
   * savings or 'latency' to prioritize speed
   */
  tradeoff?: string | null;
}

export namespace ModelRouterSelectModelParams {
  /**
   * Model for specifying an LLM provider using OpenRouter format.
   *
   * Used in model routing requests when you want to specify providers using the
   * OpenRouter naming convention (combined 'provider/model' format). This is an
   * alternative to the standard RequestProvider which uses separate provider and
   * model fields.
   *
   * **When to use:**
   *
   * - When working with OpenRouter-compatible systems
   * - When you prefer the unified 'provider/model' format
   * - For models accessed via OpenRouter proxy
   */
  export interface OpenRouterProvider {
    /**
     * OpenRouter model identifier in 'provider/model' format (e.g., 'openai/gpt-4o',
     * 'anthropic/claude-sonnet-4-5-20250929')
     */
    model: string;

    /**
     * Maximum context length for the model (required for custom models)
     */
    context_length?: number | null;

    /**
     * Input token price per million tokens in USD (required for custom models)
     */
    input_price?: number | null;

    /**
     * Whether this is a custom model not in Not Diamond's supported model list
     */
    is_custom?: boolean;

    /**
     * Average latency in seconds (required for custom models)
     */
    latency?: number | null;

    /**
     * Output token price per million tokens in USD (required for custom models)
     */
    output_price?: number | null;
  }
}

export declare namespace ModelRouter {
  export {
    type ModelRouterSelectModelResponse as ModelRouterSelectModelResponse,
    type ModelRouterSelectModelParams as ModelRouterSelectModelParams,
  };
}
