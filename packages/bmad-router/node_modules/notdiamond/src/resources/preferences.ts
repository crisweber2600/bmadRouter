// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class Preferences extends APIResource {
  /**
   * Create a new preference ID for personalized LLM routing.
   *
   * A preference ID enables personalized routing by tracking your feedback and
   * learning your preferences over time. Once created, you can:
   *
   * 1. Use it in model_select() calls to get personalized routing decisions
   * 2. Train a custom router specific to your use case
   *
   * **Workflow:**
   *
   * 1. Create a preference ID (this endpoint)
   * 2. Use the preference_id in POST /v2/modelRouter/modelSelect requests
   * 3. Optionally train a custom router via POST /v2/pzn/trainCustomRouter
   *
   * **Benefits:**
   *
   * - Personalized routing for your specific use case
   * - Ability to train custom routers on your evaluation data
   *
   * **Note:** If you don't provide a preference_id in model_select() calls, the
   * default router will be used.
   *
   * @example
   * ```ts
   * const preference = await client.preferences.create();
   * ```
   */
  create(body: PreferenceCreateParams, options?: RequestOptions): APIPromise<PreferenceCreateResponse> {
    return this._client.post('/v2/preferences/userPreferenceCreate', { body, ...options });
  }

  /**
   * Update User Preference
   *
   * @example
   * ```ts
   * const preference = await client.preferences.update({
   *   preference_id: 'preference_id',
   * });
   * ```
   */
  update(body: PreferenceUpdateParams, options?: RequestOptions): APIPromise<unknown> {
    return this._client.put('/v2/preferences/userPreferenceUpdate', { body, ...options });
  }

  /**
   * Delete User Preference
   *
   * @example
   * ```ts
   * const preference = await client.preferences.delete(
   *   'preference_id',
   * );
   * ```
   */
  delete(preferenceID: string, options?: RequestOptions): APIPromise<unknown> {
    return this._client.delete(path`/v2/preferences/userPreferenceDelete/${preferenceID}`, options);
  }
}

/**
 * Response model for POST /v2/preferences/userPreferenceCreate endpoint.
 *
 * Returns the newly created preference ID which can be used to enable personalized
 * LLM routing. Store this ID and include it in subsequent model_select() calls to
 * activate personalized routing based on your feedback and usage patterns.
 *
 * **Next steps after creation:**
 *
 * 1. Use the preference_id in POST /v2/modelRouter/modelSelect requests
 * 2. Submit feedback on routing decisions to improve accuracy
 * 3. Optionally train a custom router using your evaluation data
 */
export interface PreferenceCreateResponse {
  /**
   * Unique identifier for the newly created preference. Use this in the
   * 'preference_id' parameter of model_select() calls to enable personalized routing
   */
  preference_id: string;
}

export type PreferenceUpdateResponse = unknown;

export type PreferenceDeleteResponse = unknown;

export interface PreferenceCreateParams {
  /**
   * Optional name for the preference. If not provided, an auto-generated timestamp
   * will be used. Use descriptive names like 'Production API' or 'Customer Support
   * Bot' for easy identification
   */
  name?: string | null;
}

export interface PreferenceUpdateParams {
  preference_id: string;

  name?: string | null;
}

export declare namespace Preferences {
  export {
    type PreferenceCreateResponse as PreferenceCreateResponse,
    type PreferenceUpdateResponse as PreferenceUpdateResponse,
    type PreferenceDeleteResponse as PreferenceDeleteResponse,
    type PreferenceCreateParams as PreferenceCreateParams,
    type PreferenceUpdateParams as PreferenceUpdateParams,
  };
}
