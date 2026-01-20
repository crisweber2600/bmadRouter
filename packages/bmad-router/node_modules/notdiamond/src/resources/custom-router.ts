// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import { APIPromise } from '../core/api-promise';
import { type Uploadable } from '../core/uploads';
import { RequestOptions } from '../internal/request-options';
import { multipartFormRequestOptions } from '../internal/uploads';

export class CustomRouter extends APIResource {
  /**
   * Train a custom router on your evaluation data to optimize routing for your
   * specific use case.
   *
   * This endpoint allows you to train a domain-specific router that learns which
   * models perform best for different types of queries in your application. The
   * router analyzes your evaluation dataset, clusters similar queries, and learns
   * model performance patterns.
   *
   * **Training Process:**
   *
   * 1. Upload a CSV file with your evaluation data
   * 2. Specify which models to route between
   * 3. Define the evaluation metric (score column)
   * 4. The system trains asynchronously and returns a preference_id
   * 5. Use the preference_id in model_select() calls once training completes
   *
   * **Dataset Requirements:**
   *
   * - Format: CSV file
   * - Minimum samples: 25 (more is better for accuracy)
   * - Required columns:
   *   - Prompt column (specified in prompt_column parameter)
   *   - For each model: `{provider}/{model}/score` and `{provider}/{model}/response`
   *
   * **Example CSV structure:**
   *
   * ```
   * prompt,openai/gpt-4o/score,openai/gpt-4o/response,anthropic/claude-sonnet-4-5-20250929/score,anthropic/claude-sonnet-4-5-20250929/response
   * "Explain quantum computing",0.95,"Quantum computing uses...",0.87,"Quantum computers leverage..."
   * "Write a Python function",0.82,"def my_function()...",0.91,"Here's a Python function..."
   * ```
   *
   * **Model Selection:**
   *
   * - Specify standard models: `{"provider": "openai", "model": "gpt-4o"}`
   * - Or custom models with pricing:
   *   `{"provider": "custom", "model": "my-model", "is_custom": true, "input_price": 10.0, "output_price": 30.0, "context_length": 8192, "latency": 1.5}`
   *
   * **Training Time:**
   *
   * - Training is asynchronous and typically takes 5-15 minutes
   * - Larger datasets or more models take longer
   * - You'll receive a preference_id immediately
   * - Check training status by attempting to use the preference_id in model_select()
   *
   * **Best Practices:**
   *
   * 1. Use diverse, representative examples from your production workload
   * 2. Include at least 50-100 samples for best results
   * 3. Ensure consistent evaluation metrics across all models
   * 4. Use the same models you plan to route between in production
   *
   * **Related Documentation:** See
   * https://docs.notdiamond.ai/docs/adapting-prompts-to-new-models for detailed
   * guide.
   *
   * @example
   * ```ts
   * const response =
   *   await client.customRouter.trainCustomRouter({
   *     dataset_file: fs.createReadStream('path/to/file'),
   *     language: 'english',
   *     llm_providers:
   *       '[{"provider": "openai", "model": "gpt-4o"}, {"provider": "anthropic", "model": "claude-sonnet-4-5-20250929"}]',
   *     maximize: true,
   *     prompt_column: 'prompt',
   *   });
   * ```
   */
  trainCustomRouter(
    body: CustomRouterTrainCustomRouterParams,
    options?: RequestOptions,
  ): APIPromise<CustomRouterTrainCustomRouterResponse> {
    return this._client.post(
      '/v2/pzn/trainCustomRouter',
      multipartFormRequestOptions({ body, ...options }, this._client),
    );
  }
}

/**
 * Response model for POST /v2/pzn/trainCustomRouter endpoint.
 *
 * Returned immediately after submitting a custom router training request. The
 * training process runs asynchronously (typically 5-15 minutes), so use the
 * returned preference_id to make routing calls once training completes.
 *
 * **Next steps:**
 *
 * 1. Store the preference_id
 * 2. Wait for training to complete (typically 5-15 minutes)
 * 3. Use this preference_id in POST /v2/modelRouter/modelSelect requests
 * 4. The router will use your custom-trained model to make routing decisions
 *
 * **How to use the preference_id:**
 *
 * - Include it in the 'preference_id' field of model_select() calls
 * - The system automatically uses your custom router once training is complete
 * - No need to poll status - you can start using it immediately (will use default
 *   until ready)
 */
export interface CustomRouterTrainCustomRouterResponse {
  /**
   * Unique identifier for the custom router. Use this in model_select() calls to
   * enable routing with your custom-trained router
   */
  preference_id: string;
}

export interface CustomRouterTrainCustomRouterParams {
  /**
   * CSV file containing evaluation data with prompt column and score/response
   * columns for each model
   */
  dataset_file: Uploadable;

  /**
   * Language of the evaluation data. Use 'english' for English-only data or
   * 'multilingual' for multi-language support
   */
  language: string;

  /**
   * JSON string array of LLM providers to train the router on. Format:
   * '[{"provider": "openai", "model": "gpt-4o"}, {"provider": "anthropic", "model":
   * "claude-sonnet-4-5-20250929"}]'
   */
  llm_providers: string;

  /**
   * Whether higher scores are better. Set to true if higher scores indicate better
   * performance, false otherwise
   */
  maximize: boolean;

  /**
   * Name of the column in the CSV file that contains the prompts
   */
  prompt_column: string;

  /**
   * Whether to override an existing custom router for this preference_id
   */
  override?: boolean | null;

  /**
   * Optional preference ID to update an existing router. If not provided, a new
   * preference will be created
   */
  preference_id?: string | null;
}

export declare namespace CustomRouter {
  export {
    type CustomRouterTrainCustomRouterResponse as CustomRouterTrainCustomRouterResponse,
    type CustomRouterTrainCustomRouterParams as CustomRouterTrainCustomRouterParams,
  };
}
