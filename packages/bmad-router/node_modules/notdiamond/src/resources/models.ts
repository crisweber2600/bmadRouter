// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';

export class Models extends APIResource {
  /**
   * List all supported text generation models with optional filtering.
   *
   * including pricing, context length, latency, and OpenRouter availability.
   *
   * **Note:** Image generation models are excluded from this endpoint.
   *
   * **Examples:**
   *
   * - Get all models: `/v2/models`
   * - OpenRouter only: `/v2/models?openrouter_only=true`
   * - Specific provider: `/v2/models?provider=openai`
   * - Multiple providers: `/v2/models?provider=openai&provider=anthropic`
   *
   * **Query Parameters:**
   *
   * - **provider**: Filter by provider name(s). Can specify multiple times for
   *   multiple providers (e.g., `?provider=openai&provider=anthropic`)
   * - **openrouter_only**: Return only models that have OpenRouter support (default:
   *   false)
   *
   * **Returns:**
   *
   * - **models**: List of active text generation model objects with metadata
   * - **total**: Total number of active models returned
   * - **deprecated_models**: List of deprecated text generation model objects with
   *   metadata (respects the same filters as active models)
   *
   * **Caching:**
   *
   * - Response is cacheable for 1 hour (model list rarely changes)
   *
   * @example
   * ```ts
   * const models = await client.models.list();
   * ```
   */
  list(
    query: ModelListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ModelListResponse> {
    return this._client.get('/v2/models', { query, ...options });
  }
}

/**
 * Response model for a single LLM model from GET /v2/models endpoint.
 *
 * Contains metadata about a supported text generation model including pricing,
 * context limits, and availability information.
 */
export interface Model {
  /**
   * Maximum context window size in tokens
   */
  context_length: number;

  /**
   * Price per million input tokens in USD
   */
  input_price: number;

  /**
   * Model identifier (e.g., 'gpt-4', 'claude-3-opus-20240229')
   */
  model: string;

  /**
   * Price per million output tokens in USD
   */
  output_price: number;

  /**
   * Provider name (e.g., 'openai', 'anthropic', 'google')
   */
  provider: string;

  /**
   * OpenRouter model identifier if available, null if not supported via OpenRouter
   */
  openrouter_model?: string | null;
}

/**
 * Response model for GET /v2/models endpoint.
 *
 * Returns a list of all supported text generation models with their metadata,
 * separated into active and deprecated models.
 */
export interface ModelListResponse {
  /**
   * List of deprecated models that are no longer recommended but may still work
   */
  deprecated_models: Array<Model>;

  /**
   * List of active/supported text generation models with their metadata
   */
  models: Array<Model>;

  /**
   * Total count of active models in the response
   */
  total: number;
}

export interface ModelListParams {
  /**
   * Return only OpenRouter-supported models
   */
  openrouter_only?: boolean;

  /**
   * Filter by provider name(s). Can specify multiple providers (e.g., 'openai',
   * 'anthropic')
   */
  provider?: Array<string> | null;
}

export declare namespace Models {
  export {
    type Model as Model,
    type ModelListResponse as ModelListResponse,
    type ModelListParams as ModelListParams,
  };
}
