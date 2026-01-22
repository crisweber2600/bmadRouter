import axios from 'axios';
import { OpenAIProvider } from '../providers/openaiProvider';
import { AnthropicProvider } from '../providers/anthropicProvider';
import { GoogleProvider } from '../providers/googleProvider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenAIProvider Tests', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue({
      post: jest.fn(),
      get: jest.fn(),
    } as any);
    provider = new OpenAIProvider('test-api-key');
  });

  describe('constructor', () => {
    it('should create axios client with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.openai.com/v1',
          timeout: 30000,
        })
      );
    });
  });

  describe('executeRequest', () => {
    it('should make POST request with correct payload', async () => {
      const mockResponse = {
        data: {
          id: 'chatcmpl-123',
          choices: [{ message: { content: 'Hello' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        },
      };

      const mockClient = mockedAxios.create();
      (mockClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
        temperature: 0.7,
      };

      const result = await provider.executeRequest('gpt-4', request);

      expect(mockClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          model: 'gpt-4',
          messages: request.messages,
        })
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle API errors', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.post as jest.Mock).mockRejectedValue({
        response: {
          status: 429,
          data: { error: { message: 'Rate limit exceeded' } },
        },
      });

      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(provider.executeRequest('gpt-4', request)).rejects.toThrow(
        'OpenAI API error'
      );
    });

    it('should handle network errors', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.post as jest.Mock).mockRejectedValue(new Error('Network error'));

      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(provider.executeRequest('gpt-4', request)).rejects.toThrow();
    });
  });

  describe('checkHealth', () => {
    it('should return true when API is healthy', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.get as jest.Mock).mockResolvedValue({ status: 200 });

      const result = await provider.checkHealth();

      expect(result).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.get as jest.Mock).mockRejectedValue(new Error('API unavailable'));

      const result = await provider.checkHealth();

      expect(result).toBe(false);
    });
  });
});

describe('AnthropicProvider Tests', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue({
      post: jest.fn(),
      get: jest.fn(),
    } as any);
    provider = new AnthropicProvider('test-api-key');
  });

  describe('constructor', () => {
    it('should create axios client with Anthropic config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.anthropic.com/v1',
        })
      );
    });
  });

  describe('executeRequest', () => {
    it('should make request with correct Anthropic format', async () => {
      const mockResponse = {
        data: {
          id: 'msg-123',
          content: [{ type: 'text', text: 'Hello' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      };

      const mockClient = mockedAxios.create();
      (mockClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await provider.executeRequest('claude-3-sonnet', request);

      expect(mockClient.post).toHaveBeenCalledWith(
        '/messages',
        expect.objectContaining({
          model: expect.any(String),
          messages: expect.any(Array),
        })
      );
    });

    it('should convert Anthropic response to LLM format', async () => {
      const mockResponse = {
        data: {
          id: 'msg-123',
          model: 'claude-3-sonnet',
          content: [{ type: 'text', text: 'Response text' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      };

      const mockClient = mockedAxios.create();
      (mockClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      const result = await provider.executeRequest('claude-3-sonnet', request);

      expect(result.choices).toBeDefined();
      expect(result.choices[0].message.content).toBe('Response text');
    });

    it('should handle Anthropic API errors', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.post as jest.Mock).mockRejectedValue({
        response: {
          status: 400,
          data: { error: { message: 'Invalid request' } },
        },
      });

      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(provider.executeRequest('claude-3-sonnet', request)).rejects.toThrow();
    });
  });

  describe('checkHealth', () => {
    it('should return true when API is healthy', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.get as jest.Mock).mockResolvedValue({ status: 200 });

      const result = await provider.checkHealth();

      expect(result).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.get as jest.Mock).mockRejectedValue(new Error('API unavailable'));

      const result = await provider.checkHealth();

      expect(result).toBe(false);
    });
  });
});

describe('GoogleProvider Tests', () => {
  let provider: GoogleProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue({
      post: jest.fn(),
      get: jest.fn(),
    } as any);
    provider = new GoogleProvider('test-api-key');
  });

  describe('constructor', () => {
    it('should create axios client with Google config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('generativelanguage.googleapis.com'),
        })
      );
    });
  });

  describe('executeRequest', () => {
    it('should make request with correct Google format', async () => {
      const mockResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello' }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        },
      };

      const mockClient = mockedAxios.create();
      (mockClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await provider.executeRequest('gemini-pro', request);

      expect(mockClient.post).toHaveBeenCalled();
    });

    it('should convert Google response to LLM format', async () => {
      const mockResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: 'Response text' }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        },
      };

      const mockClient = mockedAxios.create();
      (mockClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      const result = await provider.executeRequest('gemini-pro', request);

      expect(result.choices).toBeDefined();
      expect(result.choices[0].message.content).toBe('Response text');
    });

    it('should handle Google API errors', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.post as jest.Mock).mockRejectedValue({
        response: {
          status: 500,
          data: { error: { message: 'Server error' } },
        },
      });

      const request = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(provider.executeRequest('gemini-pro', request)).rejects.toThrow();
    });
  });

  describe('checkHealth', () => {
    it('should return true when API is healthy', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.get as jest.Mock).mockResolvedValue({ status: 200 });

      const result = await provider.checkHealth();

      expect(result).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.get as jest.Mock).mockRejectedValue(new Error('API unavailable'));

      const result = await provider.checkHealth();

      expect(result).toBe(false);
    });
  });
});
