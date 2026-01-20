// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import * as PromptOptimizationAPI from './prompt-optimization';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class PromptOptimization extends APIResource {
  /**
   * Retrieve the complete results of a prompt optimization run, including optimized
   * prompts for all target models.
   *
   * This endpoint returns the optimized prompts and evaluation metrics for each
   * target model in your optimization request. Call this endpoint after the
   * optimization status is 'completed' to get your optimized prompts.
   *
   * **Response Structure:**
   *
   * - **origin_model**: Baseline performance of your original prompt on the origin
   *   model
   *   - Includes: system_prompt, user_message_template, score, evaluation metrics,
   *     cost
   * - **target_models**: Array of results for each target model
   *   - Includes: optimized system_prompt, user_message_template, template_fields
   *   - pre_optimization_score: Performance before optimization
   *   - post_optimization_score: Performance after optimization
   *   - Evaluation metrics and cost information
   *
   * **Using Optimized Prompts:**
   *
   * 1. Extract the `system_prompt` and `user_message_template` from each target
   *    model result
   * 2. Use `user_message_template_fields` to know which fields to substitute
   * 3. Apply the optimized prompts when calling the respective target models
   * 4. Compare pre/post optimization scores to see improvement
   *
   * **Status Handling:**
   *
   * - If optimization is still processing, target model results will have
   *   `result_status: "processing"`
   * - Only completed target models will have system_prompt and template values
   * - Failed target models will have `result_status: "failed"` with null values
   *
   * **Cost Information:**
   *
   * - Each model result includes cost in USD for the optimization process
   * - Costs vary based on model pricing and number of evaluation examples
   * - Typical range: $0.10 - $2.00 per target model
   *
   * **Best Practices:**
   *
   * 1. Wait for status 'completed' before calling this endpoint
   * 2. Check result_status for each target model
   * 3. Validate that post_optimization_score > pre_optimization_score
   * 4. Save optimized prompts for production use
   * 5. A/B test optimized prompts against originals in production
   *
   * @example
   * ```ts
   * const response =
   *   await client.promptOptimization.getOptimizationResults(
   *     'optimization_run_id',
   *   );
   * ```
   */
  getOptimizationResults(
    optimizationRunID: string,
    options?: RequestOptions,
  ): APIPromise<PromptOptimizationGetOptimizationResultsResponse> {
    return this._client.get(path`/v2/prompt/optimizeResults/${optimizationRunID}`, options);
  }

  /**
   * Check the status of a prompt optimization run.
   *
   * Use this endpoint to poll the status of your optimization request. Processing is
   * asynchronous, so you'll need to check periodically until the status indicates
   * completion.
   *
   * **Status Values:**
   *
   * - `created`: Initial state, not yet processing
   * - `queued`: Waiting for processing capacity (check queue_position)
   * - `processing`: Currently optimizing prompts
   * - `completed`: All target models have been processed successfully
   * - `failed`: One or more target models failed to process
   *
   * **Polling Recommendations:**
   *
   * - Poll every 30-60 seconds during processing
   * - Check queue_position if status is 'queued' to estimate wait time
   * - Stop polling once status is 'completed' or 'failed'
   * - Use GET /v2/prompt/optimizeResults to retrieve results after completion
   *
   * **Queue Position:**
   *
   * - Only present when status is 'queued'
   * - Lower numbers mean earlier processing (position 1 is next)
   * - Typical wait time: 1-5 minutes per position
   *
   * **Note:** This endpoint only returns status information. To get the actual
   * optimized prompts and evaluation results, use GET /v2/prompt/optimizeResults
   * once status is 'completed'.
   *
   * @example
   * ```ts
   * const response =
   *   await client.promptOptimization.getOptimziationStatus(
   *     'optimization_run_id',
   *   );
   * ```
   */
  getOptimziationStatus(
    optimizationRunID: string,
    options?: RequestOptions,
  ): APIPromise<PromptOptimizationGetOptimziationStatusResponse> {
    return this._client.get(path`/v2/prompt/optimizeStatus/${optimizationRunID}`, options);
  }

  /**
   * Adapt your prompt from one LLM to work optimally across different target LLMs.
   *
   * This endpoint automatically optimizes your prompt (system prompt + user message
   * template) to improve accuracy on your use case across various models. Each model
   * has unique characteristics, and what works well for GPT-5 might not work as well
   * for Claude or Gemini.
   *
   * **How Prompt Adaptation Works:**
   *
   * 1. You provide your current prompt and optionally your current origin model
   * 2. You specify the target models you want to adapt your prompt to
   * 3. You provide evaluation examples (golden records) with expected answers
   * 4. The system runs optimization to find the best prompt for each target model
   * 5. You receive adapted prompts that perform well on your target models
   *
   * **Evaluation Metrics:** Choose either a standard metric or provide custom
   * evaluation:
   *
   * - **Standard metrics**: LLMaaJ:Sem_Sim_1 (semantic similarity), JSON_Match
   * - **Custom evaluation**: Provide evaluation_config with your own LLM judge,
   *   prompt, and cutoff
   *
   * **Dataset Requirements:**
   *
   * - Minimum 25 examples in train_goldens (more examples = better optimization)
   * - **Prototype mode**: Set `prototype_mode: true` to use as few as 3 examples for
   *   prototyping
   *   - Recommended when you don't have enough data yet to build a proof-of-concept
   *   - Note: Performance may be degraded compared to standard mode (25+ examples)
   *   - Trade-off: Faster iteration with less data vs. potentially less
   *     generalizability
   * - Each example must have fields matching your template placeholders
   * - Supervised evaluation requires 'answer' field in each golden record
   * - Unsupervised evaluation can work without answers
   *
   * **Training Time:**
   *
   * - Processing is asynchronous and typically takes 10-30 minutes
   * - Time depends on: number of target models, dataset size, model availability
   * - Use the returned optimization_run_id to check status and retrieve results
   *
   * **Example Workflow:**
   *
   * ```
   * 1. POST /v2/prompt/optimize - Submit optimization request
   * 2. GET /v2/prompt/optimizeStatus/{id} - Poll status until completed
   * 3. GET /v2/prompt/optimizeResults/{id} - Retrieve optimized prompts
   * 4. Use optimized prompts in production with target models
   * ```
   *
   * **Related Documentation:** See
   * https://docs.notdiamond.ai/docs/adapting-prompts-to-new-models for detailed
   * guide.
   *
   * @example
   * ```ts
   * const response = await client.promptOptimization.optimize({
   *   fields: ['question'],
   *   system_prompt: 'You are a mathematical assistant that counts digits accurately.',
   *   target_models: [
   *     { model: 'claude-sonnet-4-5-20250929', provider: 'anthropic' },
   *     { model: 'gemini-2.5-flash', provider: 'google' },
   *   ],
   *   template: 'Question: {question}\nAnswer:',
   *   evaluation_metric: 'LLMaaJ:Sem_Sim_1',
   *   prototype_mode: true,
   *   test_goldens: [
   *     {
   *       fields: { ... },
   *       answer: '15',
   *     },
   *     {
   *       fields: { ... },
   *       answer: '8',
   *     },
   *     {
   *       fields: { ... },
   *       answer: '1',
   *     },
   *     {
   *       fields: { ... },
   *       answer: '10',
   *     },
   *     {
   *       fields: { ... },
   *       answer: '11',
   *     },
   *   ],
   *   train_goldens: [
   *     {
   *       fields: { ... },
   *       answer: '20',
   *     },
   *     {
   *       fields: { ... },
   *       answer: '10',
   *     },
   *     {
   *       fields: { ... },
   *       answer: '0',
   *     },
   *     {
   *       fields: { ... },
   *       answer: '16',
   *     },
   *     {
   *       fields: { ... },
   *       answer: '2',
   *     },
   *   ],
   * });
   * ```
   */
  optimize(
    body: PromptOptimizationOptimizeParams,
    options?: RequestOptions,
  ): APIPromise<PromptOptimizationOptimizeResponse> {
    return this._client.post('/v2/prompt/optimize', { body, ...options });
  }
}

/**
 * A training or test example for prompt adaptation.
 */
export interface GoldenRecord {
  /**
   * Dictionary mapping field names to their values. Keys must match the fields
   * specified in the template
   */
  fields: { [key: string]: string };

  /**
   * Expected answer for supervised evaluation. Required for supervised metrics,
   * optional for unsupervised
   */
  answer?: string | null;
}

/**
 * Status enum for asynchronous jobs (prompt adaptation, custom router training,
 * etc.).
 *
 * Represents the current state of a long-running operation:
 *
 * - **created**: Job has been initialized but not yet queued
 * - **queued**: Job is waiting in the queue to be processed
 * - **processing**: Job is currently being executed
 * - **completed**: Job finished successfully and results are available
 * - **failed**: Job encountered an error and did not complete
 * - **cancelled**: Job was cancelled due to a restart operation
 */
export type JobStatus = 'created' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Model for specifying an LLM provider in API requests.
 */
export interface RequestProvider {
  /**
   * Model name (e.g., 'gpt-4o', 'claude-sonnet-4-5-20250929')
   */
  model: string;

  /**
   * Provider name (e.g., 'openai', 'anthropic', 'google')
   */
  provider: string;

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

/**
 * Response model for GET /v2/prompt/adaptResults/{adaptation_run_id} endpoint.
 *
 * Contains the complete results of a prompt adaptation run, including optimized
 * prompts and evaluation metrics for all target models. Use this to retrieve your
 * adapted prompts after the adaptation status is 'completed'.
 *
 * The response includes:
 *
 * - Baseline performance of your original prompt on the origin model
 * - Optimized prompts for each target model with pre/post optimization scores
 * - Evaluation metrics and cost information for each model
 */
export interface PromptOptimizationGetOptimizationResultsResponse {
  /**
   * Unique ID for this adaptation run
   */
  id: string;

  /**
   * Timestamp when this adaptation run was created
   */
  created_at: string;

  /**
   * Overall status of the adaptation run (queued, running, completed, failed)
   */
  job_status: JobStatus;

  /**
   * Results for each target model with optimized prompts and improvement scores
   */
  target_models: Array<PromptOptimizationGetOptimizationResultsResponse.TargetModel>;

  /**
   * Timestamp of last update to this adaptation run
   */
  updated_at: string | null;

  evaluation_config?: string | null;

  evaluation_metric?: string | null;

  /**
   * Metrics for the LLM requests made during the adaptation run. List of {model:
   * str, num_requests: int}.
   */
  llm_request_metrics?: Array<{ [key: string]: unknown }> | null;

  /**
   * Baseline results for the origin model in prompt adaptation.
   *
   * Part of AdaptationRunResultsResponse. Contains the performance metrics and
   * prompt configuration for your original prompt on the origin model. This serves
   * as the baseline to compare against optimized prompts for target models.
   *
   * **Fields include:**
   *
   * - Original system prompt and user message template
   * - Baseline performance score and evaluation metrics
   * - Cost of running the baseline evaluation
   * - Job status for the origin model evaluation
   */
  origin_model?: PromptOptimizationGetOptimizationResultsResponse.OriginModel | null;

  /**
   * Whether this adaptation run was created with prototype mode (3-24 training
   * examples allowed). Prototype mode may have degraded performance compared to
   * standard mode (25+ examples)
   */
  prototype_mode?: boolean;
}

export namespace PromptOptimizationGetOptimizationResultsResponse {
  /**
   * Optimized prompt results for a single target model in prompt adaptation.
   *
   * Part of AdaptationRunResultsResponse. Contains the optimized system prompt and
   * user message template for a specific target model, along with performance scores
   * before and after optimization. Use these optimized prompts with the target model
   * to achieve better performance than the original prompt.
   *
   * **Key metrics:**
   *
   * - **pre_optimization_score**: Performance with original prompt on this target
   *   model
   * - **post_optimization_score**: Performance with optimized prompt on this target
   *   model
   * - **Score improvement**: post - pre shows how much optimization helped
   *
   * **Usage:**
   *
   * 1. Extract the optimized system_prompt and user_message_template
   * 2. Replace placeholders in user_message_template using fields from your data
   * 3. Use these prompts when calling this target model
   * 4. Compare pre/post scores to see improvement gained
   */
  export interface TargetModel {
    cost: number | null;

    model_name: string;

    post_optimization_evals: { [key: string]: unknown } | null;

    post_optimization_score: number | null;

    pre_optimization_evals: { [key: string]: unknown } | null;

    pre_optimization_score: number | null;

    task_type: string | null;

    /**
     * Status enum for asynchronous jobs (prompt adaptation, custom router training,
     * etc.).
     *
     * Represents the current state of a long-running operation:
     *
     * - **created**: Job has been initialized but not yet queued
     * - **queued**: Job is waiting in the queue to be processed
     * - **processing**: Job is currently being executed
     * - **completed**: Job finished successfully and results are available
     * - **failed**: Job encountered an error and did not complete
     * - **cancelled**: Job was cancelled due to a restart operation
     */
    result_status?: PromptOptimizationAPI.JobStatus | null;

    /**
     * Optimized system prompt for this target model. Use this as the system message in
     * your LLM calls
     */
    system_prompt?: string | null;

    /**
     * Optimized user message template with placeholders. Substitute fields using your
     * data before calling the LLM
     */
    user_message_template?: string | null;

    /**
     * List of field names to substitute in the template (e.g., ['question',
     * 'context']). These match the curly-brace placeholders in user_message_template
     */
    user_message_template_fields?: Array<string> | null;
  }

  /**
   * Baseline results for the origin model in prompt adaptation.
   *
   * Part of AdaptationRunResultsResponse. Contains the performance metrics and
   * prompt configuration for your original prompt on the origin model. This serves
   * as the baseline to compare against optimized prompts for target models.
   *
   * **Fields include:**
   *
   * - Original system prompt and user message template
   * - Baseline performance score and evaluation metrics
   * - Cost of running the baseline evaluation
   * - Job status for the origin model evaluation
   */
  export interface OriginModel {
    cost: number | null;

    evals: { [key: string]: unknown } | null;

    model_name: string | null;

    score: number | null;

    /**
     * Status enum for asynchronous jobs (prompt adaptation, custom router training,
     * etc.).
     *
     * Represents the current state of a long-running operation:
     *
     * - **created**: Job has been initialized but not yet queued
     * - **queued**: Job is waiting in the queue to be processed
     * - **processing**: Job is currently being executed
     * - **completed**: Job finished successfully and results are available
     * - **failed**: Job encountered an error and did not complete
     * - **cancelled**: Job was cancelled due to a restart operation
     */
    result_status?: PromptOptimizationAPI.JobStatus | null;

    /**
     * Original system prompt used for the origin model
     */
    system_prompt?: string | null;

    /**
     * Original user message template used for the origin model
     */
    user_message_template?: string | null;
  }
}

/**
 * Response model for GET /v2/prompt/optimizeStatus/{optimization_run_id} endpoint.
 *
 * Returns the current status of an asynchronous prompt optimization job. Poll this
 * endpoint periodically to track progress. When status is 'completed', you can
 * retrieve the optimized prompts using the /optimizeResults endpoint.
 *
 * **Status values:**
 *
 * - **created**: Job has been initialized
 * - **queued**: Waiting in queue (check queue_position for your place in line)
 * - **processing**: Currently running optimization
 * - **completed**: Finished successfully, results available via /optimizeResults
 * - **failed**: Encountered an error during processing
 *
 * **Polling recommendations:**
 *
 * - Poll every 30-60 seconds while status is incomplete
 * - Stop polling once status is 'completed' or 'failed'
 * - Optimization typically takes 10-30 minutes total
 */
export interface PromptOptimizationGetOptimziationStatusResponse {
  /**
   * Unique identifier for this optimization run. Use this to poll status and
   * retrieve optimized prompts when complete
   */
  optimization_run_id: string;

  /**
   * Current status of the optimization run. Poll until this is 'completed' or
   * 'failed'
   */
  status: JobStatus;

  /**
   * Position in queue when status is 'queued'. Lower numbers process sooner. Null
   * when not queued
   */
  queue_position?: number | null;
}

/**
 * Response model for POST /v2/prompt/optimize endpoint.
 *
 * Returned immediately after submitting a prompt optimization request. The
 * optimization process runs asynchronously, so use the returned
 * optimization_run_id to track progress and retrieve results when complete.
 *
 * **Next steps:**
 *
 * 1. Store the optimization_run_id
 * 2. Poll GET /v2/prompt/optimizeStatus/{optimization_run_id} to check progress
 * 3. When status is 'completed', retrieve optimized prompts from GET
 *    /v2/prompt/optimizeResults/{optimization_run_id}
 * 4. Use the optimized prompts with your target models
 */
export interface PromptOptimizationOptimizeResponse {
  /**
   * Unique identifier for this optimization run. Use this to poll status and
   * retrieve optimized prompts when complete
   */
  optimization_run_id: string;
}

export interface PromptOptimizationOptimizeParams {
  /**
   * List of field names that will be substituted into the template. Must match keys
   * in golden records
   */
  fields: Array<string>;

  /**
   * System prompt to use with the origin model. This sets the context and role for
   * the LLM
   */
  system_prompt: string;

  /**
   * List of models to adapt the prompt for. Maximum count depends on your
   * subscription tier (Free: 1, Starter: 3, Startup: 5, Enterprise: 10)
   */
  target_models: Array<RequestProvider>;

  /**
   * User message template with placeholders for fields. Use curly braces for field
   * substitution
   */
  template: string;

  evaluation_config?: string | null;

  evaluation_metric?: string | null;

  /**
   * Training examples (legacy parameter). Use train_goldens and test_goldens for
   * better control. Minimum 25 examples (or 3 with prototype_mode=true)
   */
  goldens?: Array<GoldenRecord> | null;

  /**
   * Model for specifying an LLM provider in API requests.
   */
  origin_model?: RequestProvider | null;

  /**
   * Optional baseline score for the origin model. If provided, can skip origin model
   * evaluation
   */
  origin_model_evaluation_score?: number | null;

  /**
   * Enable prototype mode to use as few as 3 training examples (instead of 25).
   * Note: Performance may be degraded with fewer examples. Recommended for
   * prototyping AI applications when you don't have enough data yet
   */
  prototype_mode?: boolean;

  /**
   * Test examples for evaluation. Required if train_goldens is provided. Used to
   * measure final performance on held-out data
   */
  test_goldens?: Array<GoldenRecord> | null;

  /**
   * Training examples for prompt optimization. Minimum 25 examples required (or 3
   * with prototype_mode=true). Cannot be used with 'goldens' parameter
   */
  train_goldens?: Array<GoldenRecord> | null;
}

export declare namespace PromptOptimization {
  export {
    type GoldenRecord as GoldenRecord,
    type JobStatus as JobStatus,
    type RequestProvider as RequestProvider,
    type PromptOptimizationGetOptimizationResultsResponse as PromptOptimizationGetOptimizationResultsResponse,
    type PromptOptimizationGetOptimziationStatusResponse as PromptOptimizationGetOptimziationStatusResponse,
    type PromptOptimizationOptimizeResponse as PromptOptimizationOptimizeResponse,
    type PromptOptimizationOptimizeParams as PromptOptimizationOptimizeParams,
  };
}
