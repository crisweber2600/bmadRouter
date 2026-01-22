import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../middleware/errorHandler';

// Mock logger
jest.mock('../observability/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('errorHandler middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    
    mockReq = {
      method: 'POST',
      url: '/v1/chat/completions',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
    };
    
    mockRes = {
      status: mockStatus,
      json: mockJson,
    };
    
    mockNext = jest.fn();
  });

  it('should return 500 status code', () => {
    const error = new Error('Test error');
    
    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
    
    expect(mockStatus).toHaveBeenCalledWith(500);
  });

  it('should return error response with error_id', () => {
    const error = new Error('Test error');
    
    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
    
    expect(mockJson).toHaveBeenCalledWith({
      error: {
        message: expect.any(String),
        type: 'internal_error',
        error_id: expect.stringMatching(/^err_\d+_[a-z0-9]+$/),
      },
    });
  });

  it('should log error details', () => {
    const error = new Error('Test error');
    error.stack = 'Error: Test error\n    at test.ts:1:1';
    
    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
    
    const { logger } = require('../observability/logger');
    expect(logger.error).toHaveBeenCalledWith('Request error', {
      errorId: expect.stringMatching(/^err_\d+_[a-z0-9]+$/),
      error: 'Test error',
      stack: error.stack,
      method: 'POST',
      url: '/v1/chat/completions',
      ip: '127.0.0.1',
      userAgent: 'test-user-agent',
    });
  });

  it('should hide error message in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    const error = new Error('Sensitive internal error');
    
    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
    
    expect(mockJson).toHaveBeenCalledWith({
      error: {
        message: 'Internal server error',
        type: 'internal_error',
        error_id: expect.any(String),
      },
    });
    
    process.env.NODE_ENV = originalEnv;
  });

  it('should show error message in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    const error = new Error('Detailed error message');
    
    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
    
    expect(mockJson).toHaveBeenCalledWith({
      error: {
        message: 'Detailed error message',
        type: 'internal_error',
        error_id: expect.any(String),
      },
    });
    
    process.env.NODE_ENV = originalEnv;
  });

  it('should handle errors without stack trace', () => {
    const error = new Error('No stack');
    delete error.stack;
    
    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
    
    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalled();
  });

  it('should generate unique error IDs', () => {
    const error = new Error('Test error');
    const errorIds: string[] = [];
    
    // Call error handler multiple times
    for (let i = 0; i < 3; i++) {
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      const call = mockJson.mock.calls[i][0];
      errorIds.push(call.error.error_id);
    }
    
    // All IDs should be unique
    const uniqueIds = new Set(errorIds);
    expect(uniqueIds.size).toBe(3);
  });

  it('should handle request with missing headers', () => {
    // Create a new mock request without ip
    const reqWithoutHeaders = {
      method: 'POST',
      url: '/v1/chat/completions',
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as Request;
    
    const error = new Error('Test error');
    
    // Should not throw
    expect(() => {
      errorHandler(error, reqWithoutHeaders, mockRes as Response, mockNext);
    }).not.toThrow();
    
    expect(mockStatus).toHaveBeenCalledWith(500);
  });
});
