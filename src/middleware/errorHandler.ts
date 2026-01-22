import { Request, Response, NextFunction } from 'express';
import { logger } from '../observability/logger';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  logger.error('Request error', {
    errorId,
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(500).json({
    error: {
      message: isDevelopment ? error.message : 'Internal server error',
      type: 'internal_error',
      error_id: errorId,
    },
  });
}