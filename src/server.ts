import express from 'express';
import { router } from './routing/router';
import { logger } from './observability/logger';
import { errorHandler } from './middleware/errorHandler';

export async function createServer(app: express.Application) {
  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  // API status
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'operational',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  // Main routing endpoint - intercepts OpenAI-compatible requests
  app.post('/v1/chat/completions', router.handleChatCompletion.bind(router));

  // Error handling
  app.use(errorHandler);

  // 404 handler (Express 5 uses different syntax)
  app.use((req, res) => {
    res.status(404).json({
      error: {
        message: `Route ${req.method} ${req.originalUrl} not found`,
        type: 'not_found'
      }
    });
  });

  logger.info('Server configured with routing endpoints');

  return app;
}