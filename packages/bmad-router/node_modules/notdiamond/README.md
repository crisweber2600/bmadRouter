# Notdiamond TypeScript API Library

[![NPM version](<https://img.shields.io/npm/v/notdiamond.svg?label=npm%20(stable)>)](https://npmjs.org/package/notdiamond) ![npm bundle size](https://img.shields.io/bundlephobia/minzip/notdiamond)

This library provides convenient access to the Notdiamond REST API from server-side TypeScript or JavaScript.

The library includes type definitions for all request params and response fields.

## What is Prompt Optimization?

Not Diamond specializes in **Prompt Optimization** - automatically optimizing your prompts to work optimally across different LLMs. Each language model has unique characteristics, instruction-following patterns, and preferred prompt formats. A prompt that works perfectly for GPT-5 might perform poorly on Claude or Gemini.
Manually rewriting prompts for each model is time-consuming and requires deep expertise in each model's quirks.

**The Solution**: Not Diamond automatically adapts your prompts with:

- Automatic optimization of both system and user prompts
- Built-in evaluation metrics
- Minimum 25 training examples recommended
- Processing time: typically 10–30 minutes

## Documentation

The REST API documentation can be found on [docs.notdiamond.ai](https://docs.notdiamond.ai). The full API of this library can be found in [api.md](api.md).

## Installation

```sh
npm install notdiamond
```

## Usage

#### Quick Start

<!-- prettier-ignore -->

```ts
import NotDiamond from 'notdiamond';

const client = new Notdiamond({
  apiKey: process.env['NOTDIAMOND_API_KEY'], // This is the default and can be omitted
});

// Step 1: Start a prompt optimization job with prototype mode
const optimization = await client.promptOptimization.optimize({
  fields: ['question'],
  system_prompt: 'You are a mathematical assistant that counts digits accurately.',
  target_models: [
    {
      model: 'claude-sonnet-4-5-20250929',
      provider: 'anthropic',
    },
    {
      model: 'gemini-2.5-flash',
      provider: 'google',
    },
  ],
  template: 'Question: {question}\nAnswer:',
  train_goldens: [
    {
      fields: { question: 'How many digits are in (23874045494*2789392485)?' },
      answer: '20',
    },
    {
      fields: { question: 'How many odd digits are in (999*777*555*333*111)?' },
      answer: '10',
    },
    {
      fields: { question: "How often does the number '17' appear in the digits of (287558*17)?" },
      answer: '0',
    },
    {
      fields: { question: 'How many even digits are in (222*444*666*888)?' },
      answer: '16',
    },
    {
      fields: { question: 'How many 0s are in (1234567890*1357908642)?' },
      answer: '2',
    },
  ],
  test_goldens: [
    {
      fields: { question: 'How many digits are in (9876543210*123456)?' },
      answer: '15',
    },
    {
      fields: { question: 'How many odd digits are in (135*579*246)?' },
      answer: '8',
    },
    {
      fields: { question: "How often does the number '42' appear in the digits of (123456789*42)?" },
      answer: '1',
    },
    {
      fields: { question: 'How many even digits are in (1111*2222*3333)?' },
      answer: '10',
    },
    {
      fields: { question: 'How many 9s are in (999999*888888)?' },
      answer: '11',
    },
  ],
  evaluation_metric: 'LLMaaJ:Sem_Sim_1', // Or use custom evaluation
  prototype_mode: true, // Enable faster prototype mode for quick experimentation
});

console.log(`Optimization started: ${optimization.optimization_run_id}`);

// Step 2: Poll for completion (typically takes 10-30 minutes)
let status;
while (true) {
  status = await client.promptOptimization.getOptimziationStatus(optimization.optimization_run_id);
  console.log(`Status: ${status.status}`);
  
  if (status.status === 'queued') {
    console.log(`Queue position: ${status.queue_position}`);
  }
  
  if (status.status === 'completed' || status.status === 'failed') {
    break;
  }
  
  await new Promise(resolve => setTimeout(resolve, 30000)); // Poll every 30 seconds
}

// Step 3: Get the optimized prompts
if (status.status === 'completed') {
  const results = await client.promptOptimization.getOptimizationResults(optimization.optimization_run_id);
  
  console.log(`\nOrigin model baseline: ${results.origin_model.score.toFixed(2)}`);
  
  for (const target of results.target_models) {
    console.log('\n' + '='.repeat(50));
    console.log(`Model: ${target.model.model} (${target.model.provider})`);
    console.log(`Optimized System Prompt:\n${target.system_prompt}`);
    console.log(`Optimized Template:\n${target.user_message_template}`);
    console.log(`Pre-optimization score: ${target.pre_optimization_score.toFixed(2)}`);
    console.log(`Post-optimization score: ${target.post_optimization_score.toFixed(2)}`);
    console.log(`Improvement: ${((target.post_optimization_score / target.pre_optimization_score - 1) * 100).toFixed(1)}%`);
    console.log(`Cost: $${target.cost.toFixed(4)}`);
  }
}
```

For more details, see the [Prompt Optimization documentation](https://docs.notdiamond.ai/docs/adapting-prompts-to-new-models).

### Model Routing

Select the best model automatically:

<!-- prettier-ignore -->
```ts
import NotDiamond from 'notdiamond';

const client = new NotDiamond({
  apiKey: process.env['NOTDIAMOND_API_KEY'], // This is the default and can be omitted
});

const response = await client.modelRouter.selectModel({
  llm_providers: [
    { model: 'gpt-4o', provider: 'openai' },
    { model: 'claude-sonnet-4-5-20250929', provider: 'anthropic' },
    { model: 'gemini-2.5-flash', provider: 'google' },
  ],
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain quantum computing in simple terms' },
  ],
});

console.log(response.providers);
```

### Train Custom Router

For even better performance, you can train a custom router on your own dataset. This allows the router to learn the specific patterns and preferences of your use case:

```ts
import fs from 'fs';
import NotDiamond from 'notdiamond';

const client = new NotDiamond({
  apiKey: process.env['NOTDIAMOND_API_KEY'], // This is the default and can be omitted
});

await client.customRouter.trainCustomRouter({
  dataset_file: fs.createReadStream('/path/to/file'),
  language: 'english',
  llm_providers:
    '[{"provider": "openai", "model": "gpt-4o"}, {"provider": "anthropic", "model": "claude-sonnet-4-5-20250929"}]',
  maximize: true,
  prompt_column: 'prompt',
});cust
```

### Request & Response types

This library includes TypeScript definitions for all request params and response fields. You may import and use them like so:

<!-- prettier-ignore -->
```ts
import Notdiamond from 'notdiamond';

const client = new Notdiamond({
  apiKey: process.env['NOTDIAMOND_API_KEY'], // This is the default and can be omitted
});

const params: NotDiamond.PromptOptimizationOptimizeParams = {
  fields: ['question', 'context'],
  system_prompt: 'You are a helpful assistant.',
  target_models: [
    {
      model: 'claude-sonnet-4-5-20250929',
      provider: 'anthropic',
    },
  ],
  template: 'Context: {context}\nQuestion: {question}\nAnswer:',
  train_goldens: [
    {
      fields: {
        question: 'What is 2+2?',
        context: 'Basic arithmetic',
      },
      answer: '4',
    },
    // Add at least 25 examples for best results
  ],
  test_goldens: [
    {
      fields: {
        question: 'What is 3*3?',
        context: 'Basic arithmetic',
      },
      answer: '9',
    },
  ],
};
const response: NotDiamond.PromptOptimizationOptimizeResponse = await client.promptOptimization.optimize(
  params,
);
console.log(response.optimization_run_id);
```

Documentation for each method, request param, and response field are available in docstrings and will appear on hover in most modern editors.

## Handling errors

When the library is unable to connect to the API,
or if the API returns a non-success status code (i.e., 4xx or 5xx response),
a subclass of `APIError` will be thrown:

<!-- prettier-ignore -->
```ts
import NotDiamond from 'notdiamond';

const client = new NotDiamond();

try {
  await client.promptOptimization.optimize({
    fields: ['question'],
    system_prompt: 'You are a helpful assistant.',
    target_models: [
      {
        model: 'claude-sonnet-4-5-20250929',
        provider: 'anthropic',
      },
      {
        model: 'gemini-2.5-flash',
        provider: 'google',
      },
    ],
    template: 'Question: {question}\nAnswer:',
    train_goldens: [
      { fields: { question: 'What is 2+2?' }, answer: '4' },
      // Add at least 25 examples...
    ],
    test_goldens: [
      { fields: { question: 'What is 3*3?' }, answer: '9' },
    ],
  });
} catch (err) {
  if (err instanceof NotDiamond.APIConnectionError) {
    console.log('The server could not be reached');
    console.log(err.cause); // an underlying Error, likely from fetch()
  } else if (err instanceof NotDiamond.RateLimitError) {
    console.log('A 429 status code was received; we should back off a bit.');
  } else if (err instanceof NotDiamond.APIError) {
    console.log(err.status); // 400
    console.log(err.name); // BadRequestError
    console.log(err.headers); // {server: 'nginx', ...}
  } else {
    throw err;
  }
}
```

Error codes are as follows:

| Status Code | Error Type                 |
| ----------- | -------------------------- |
| 400         | `BadRequestError`          |
| 401         | `AuthenticationError`      |
| 403         | `PermissionDeniedError`    |
| 404         | `NotFoundError`            |
| 422         | `UnprocessableEntityError` |
| 429         | `RateLimitError`           |
| >=500       | `InternalServerError`      |
| N/A         | `APIConnectionError`       |

### Timeouts

Requests time out after 1 minute by default. You can configure this with a `timeout` option:

<!-- prettier-ignore -->
```ts
// Configure the default for all requests:
const client = new NotDiamond({
  timeout: 20 * 1000, // 20 seconds (default is 1 minute)
});

// Override per-request (note: prompt optimization may take 10-30 minutes, so increase timeout accordingly):
await client.promptOptimization.getOptimziationStatus('your-optimization-run-id', {
  timeout: 120 * 1000, // 2 minutes
});
```

On timeout, an `APIConnectionTimeoutError` is thrown.

Note that requests which time out will be [retried twice by default](#retries).

## Advanced Usage

### Accessing raw Response data (e.g., headers)

The "raw" `Response` returned by `fetch()` can be accessed through the `.asResponse()` method on the `APIPromise` type that all methods return.
This method returns as soon as the headers for a successful response are received and does not consume the response body, so you are free to write custom parsing or streaming logic.

You can also use the `.withResponse()` method to get the raw `Response` along with the parsed data.
Unlike `.asResponse()` this method consumes the body, returning once it is parsed.

<!-- prettier-ignore -->
```ts
const client = new NotDiamond();

const response = await client.promptOptimization
  .optimize({
    fields: ['question'],
    system_prompt: 'You are a helpful assistant.',
    target_models: [
      {
        model: 'claude-sonnet-4-5-20250929',
        provider: 'anthropic',
      },
      {
        model: 'gemini-2.5-flash',
        provider: 'google',
      },
    ],
    template: 'Question: {question}\nAnswer:',
    train_goldens: [
      { fields: { question: 'What is 2+2?' }, answer: '4' },
      //Add at least 25 examples...
    ],
    test_goldens: [
      { fields: { question: 'What is 3*3?' }, answer: '9' },
    ],
  })
  .asResponse();
console.log(response.headers.get('X-My-Header'));
console.log(response.statusText); // access the underlying Response object

const { data: optimizeResponse, response: raw } = await client.promptOptimization
  .optimize({
    fields: ['question'],
    system_prompt: 'You are a helpful assistant.',
    target_models: [
      {
        model: 'claude-sonnet-4-5-20250929',
        provider: 'anthropic',
      },
      {
        model: 'gemini-2.5-flash',
        provider: 'google',
      },
    ],
    template: 'Question: {question}\nAnswer:',
    train_goldens: [
      { fields: { question: 'What is 2+2?' }, answer: '4' },
      // Add at least 25 examples...
    ],
    test_goldens: [
      { fields: { question: 'What is 3*3?' }, answer: '9' },
    ],
  })
  .withResponse();
console.log(raw.headers.get('X-My-Header'));
console.log(optimizeResponse.optimization_run_id);
```

### Logging

> [!IMPORTANT]
> All log messages are intended for debugging only. The format and content of log messages
> may change between releases.

#### Log levels

The log level can be configured in two ways:

1. Via the `NOTDIAMOND_LOG` environment variable
2. Using the `logLevel` client option (overrides the environment variable if set)

```ts
import NotDiamond from 'notdiamond';

const client = new NotDiamond({
  logLevel: 'debug', // Show all log messages
});
```

Available log levels, from most to least verbose:

- `'debug'` - Show debug messages, info, warnings, and errors
- `'info'` - Show info messages, warnings, and errors
- `'warn'` - Show warnings and errors (default)
- `'error'` - Show only errors
- `'off'` - Disable all logging

At the `'debug'` level, all HTTP requests and responses are logged, including headers and bodies.
Some authentication-related headers are redacted, but sensitive data in request and response bodies
may still be visible.

#### Custom logger

By default, this library logs to `globalThis.console`. You can also provide a custom logger.
Most logging libraries are supported, including [pino](https://www.npmjs.com/package/pino), [winston](https://www.npmjs.com/package/winston), [bunyan](https://www.npmjs.com/package/bunyan), [consola](https://www.npmjs.com/package/consola), [signale](https://www.npmjs.com/package/signale), and [@std/log](https://jsr.io/@std/log). If your logger doesn't work, please open an issue.

When providing a custom logger, the `logLevel` option still controls which messages are emitted, messages
below the configured level will not be sent to your logger.

```ts
import NotDiamond from 'notdiamond';
import pino from 'pino';

const logger = pino();

const client = new NotDiamond({
  logger: logger.child({ name: 'NotDiamond' }),
  logLevel: 'debug', // Send all messages to pino, allowing it to filter
});
```

### Making custom/undocumented requests

This library is typed for convenient access to the documented API. If you need to access undocumented
endpoints, params, or response properties, the library can still be used.

#### Undocumented endpoints

To make requests to undocumented endpoints, you can use `client.get`, `client.post`, and other HTTP verbs.
Options on the client, such as retries, will be respected when making these requests.

```ts
await client.post('/some/path', {
  body: { some_prop: 'foo' },
  query: { some_query_arg: 'bar' },
});
```

#### Undocumented request params

To make requests using undocumented parameters, you may use `// @ts-expect-error` on the undocumented
parameter. This library doesn't validate at runtime that the request matches the type, so any extra values you
send will be sent as-is.

```ts
client.promptOptimization.optimize({
  fields: ['question'],
  system_prompt: 'You are a helpful assistant.',
  target_models: [{ model: 'claude-sonnet-4-5-20250929', provider: 'anthropic' }],
  template: 'Question: {question}\nAnswer:',
  train_goldens: [{ fields: { question: 'What is 2+2?' }, answer: '4' }],
  // @ts-expect-error experimental_feature is not yet public
  experimental_feature: true,
});
```

For requests with the `GET` verb, any extra params will be in the query, all other requests will send the
extra param in the body.

If you want to explicitly send an extra argument, you can do so with the `query`, `body`, and `headers` request
options.

#### Undocumented response properties

To access undocumented response properties, you may access the response object with `// @ts-expect-error` on
the response object, or cast the response object to the requisite type. Like the request params, we do not
validate or strip extra properties from the response from the API.

### Customizing the fetch client

By default, this library expects a global `fetch` function is defined.

If you want to use a different `fetch` function, you can either polyfill the global:

```ts
import fetch from 'my-fetch';

globalThis.fetch = fetch;
```

Or pass it to the client:

```ts
import NotDiamond from 'notdiamond';
import fetch from 'my-fetch';

const client = new NotDiamond({ fetch });
```

### Fetch options

If you want to set custom `fetch` options without overriding the `fetch` function, you can provide a `fetchOptions` object when instantiating the client or making a request. (Request-specific options override client options.)

```ts
import NotDiamond from 'notdiamond';

const client = new NotDiamond({
  fetchOptions: {
    // `RequestInit` options
  },
});
```

#### Configuring proxies

To modify proxy behavior, you can provide custom `fetchOptions` that add runtime-specific proxy
options to requests:

<img src="https://raw.githubusercontent.com/stainless-api/sdk-assets/refs/heads/main/node.svg" align="top" width="18" height="21"> **Node** <sup>[[docs](https://github.com/nodejs/undici/blob/main/docs/docs/api/ProxyAgent.md#example---proxyagent-with-fetch)]</sup>

```ts
import NotDiamond from 'notdiamond';
import * as undici from 'undici';

const proxyAgent = new undici.ProxyAgent('http://localhost:8888');
const client = new NotDiamond({
  fetchOptions: {
    dispatcher: proxyAgent,
  },
});
```

<img src="https://raw.githubusercontent.com/stainless-api/sdk-assets/refs/heads/main/bun.svg" align="top" width="18" height="21"> **Bun** <sup>[[docs](https://bun.sh/guides/http/proxy)]</sup>

```ts
import NotDiamond from 'notdiamond';

const client = new NotDiamond({
  fetchOptions: {
    proxy: 'http://localhost:8888',
  },
});
```

<img src="https://raw.githubusercontent.com/stainless-api/sdk-assets/refs/heads/main/deno.svg" align="top" width="18" height="21"> **Deno** <sup>[[docs](https://docs.deno.com/api/deno/~/Deno.createHttpClient)]</sup>

```ts
import NotDiamond from 'npm:notdiamond';

const httpClient = Deno.createHttpClient({ proxy: { url: 'http://localhost:8888' } });
const client = new NotDiamond({
  fetchOptions: {
    client: httpClient,
  },
});
```

## Frequently Asked Questions

## Semantic versioning

This package generally follows [SemVer](https://semver.org/spec/v2.0.0.html) conventions, though certain backwards-incompatible changes may be released as minor versions:

1. Changes that only affect static types, without breaking runtime behavior.
2. Changes to library internals which are technically public but not intended or documented for external use. _(Please open a GitHub issue to let us know if you are relying on such internals.)_
3. Changes that we do not expect to impact the vast majority of users in practice.

We take backwards-compatibility seriously and work hard to ensure you can rely on a smooth upgrade experience.

We are keen for your feedback; please open an [issue](https://www.github.com/Not-Diamond/not-diamond-typescript/issues) with questions, bugs, or suggestions.

## Requirements

TypeScript >= 4.9 is supported.

The following runtimes are supported:

- Web browsers (Up-to-date Chrome, Firefox, Safari, Edge, and more)
- Node.js 20 LTS or later ([non-EOL](https://endoflife.date/nodejs)) versions.
- Deno v1.28.0 or higher.
- Bun 1.0 or later.
- Cloudflare Workers.
- Vercel Edge Runtime.
- Jest 28 or greater with the `"node"` environment (`"jsdom"` is not supported at this time).
- Nitro v2.6 or greater.

Note that React Native is not supported at this time.

If you are interested in other runtime environments, please open or upvote an issue on GitHub.

## Contributing

See [the contributing documentation](./CONTRIBUTING.md).
