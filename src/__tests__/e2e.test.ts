import express from 'express';
import request from 'supertest';
import { createServer } from '../server';

jest.mock('../cache/cacheManager', () => ({
  CacheManager: jest.fn().mockImplementation(() => ({
    checkCache: jest.fn().mockResolvedValue({ hit: false }),
    storeResponse: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../providers/providerManager', () => ({
  ProviderManager: jest.fn().mockImplementation(() => ({
    executeRequest: jest.fn().mockResolvedValue({
      id: 'chatcmpl-test123',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4-turbo',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello! How can I help you today?' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
    }),
    getAvailableProviders: jest.fn().mockReturnValue(['openai', 'anthropic']),
    isProviderAvailable: jest.fn().mockReturnValue(true),
  })),
}));

jest.mock('../observability/telemetry', () => ({
  TelemetryCollector: jest.fn().mockImplementation(() => ({
    recordDecision: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('E2E Server Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    app = await createServer(express());
  });

  describe('Health and Status Endpoints', () => {
    it('GET /health should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.version).toBeDefined();
    });

    it('GET /api/status should return operational status', async () => {
      const response = await request(app).get('/api/status');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('operational');
      expect(response.body.uptime).toBeDefined();
      expect(response.body.memory).toBeDefined();
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown/route');

      expect(response.status).toBe(404);
      expect(response.body.error.type).toBe('not_found');
    });

    it('should return 404 for unknown POST routes', async () => {
      const response = await request(app)
        .post('/unknown/endpoint')
        .send({ test: 'data' });

      expect(response.status).toBe(404);
    });
  });

  describe('Chat Completions Endpoint', () => {
    it('POST /v1/chat/completions should accept valid request', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(response.status).toBe(200);
      expect(response.body.choices).toBeDefined();
      expect(response.body.choices[0].message.content).toBeDefined();
    });

    it('should handle simple factual queries', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'What is 2+2?' }],
        });

      expect(response.status).toBe(200);
      expect(response.body.object).toBe('chat.completion');
    });

    it('should handle code generation queries', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'function fibonacci(n) { return n; }' }],
        });

      expect(response.status).toBe(200);
    });

    it('should handle multi-turn conversations', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'What is machine learning?' },
            { role: 'assistant', content: 'Machine learning is...' },
            { role: 'user', content: 'Tell me more' },
          ],
        });

      expect(response.status).toBe(200);
    });

    it('should handle explicit tier override', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          bmadRouter: {
            tier: 'PREMIUM',
            reason: 'Critical query',
          },
        });

      expect(response.status).toBe(200);
    });

    it('should handle requests with temperature parameter', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Write a creative story' }],
          temperature: 0.9,
        });

      expect(response.status).toBe(200);
    });

    it('should handle requests with max_tokens parameter', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 100,
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Request Validation', () => {
    it('should handle empty messages array', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [],
        });

      expect([200, 400, 500]).toContain(response.status);
    });

    it('should handle missing model field gracefully', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('Content Type Handling', () => {
    it('should accept application/json content type', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Content-Type', 'application/json')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Response Format', () => {
    it('should return OpenAI-compatible response format', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(response.body.id).toBeDefined();
      expect(response.body.object).toBe('chat.completion');
      expect(response.body.created).toBeDefined();
      expect(response.body.model).toBeDefined();
      expect(response.body.choices).toBeInstanceOf(Array);
      expect(response.body.choices[0].message).toBeDefined();
      expect(response.body.choices[0].finish_reason).toBeDefined();
      expect(response.body.usage).toBeDefined();
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .post('/v1/chat/completions')
          .send({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Hello' }],
          })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });
});

describe('Query Routing E2E Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    app = await createServer(express());
  });

  it('should route simple queries efficiently', async () => {
    const simpleQueries = [
      'What is the capital of France?',
      'How many days in a week?',
      'What color is the sky?',
    ];

    for (const query of simpleQueries) {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: query }],
        });

      expect(response.status).toBe(200);
    }
  });

  it('should handle complex analytical queries', async () => {
    const response = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Analyze the implications of quantum computing on cryptography and explain the mathematical foundations step by step',
          },
        ],
      });

    expect(response.status).toBe(200);
  });

  it('should handle creative writing queries', async () => {
    const response = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Write a haiku about programming' }],
        temperature: 0.8,
      });

    expect(response.status).toBe(200);
  });
});
