// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import type { NotDiamond } from '../client';

export abstract class APIResource {
  protected _client: NotDiamond;

  constructor(client: NotDiamond) {
    this._client = client;
  }
}
