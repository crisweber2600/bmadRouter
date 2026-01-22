#!/usr/bin/env node

import 'dotenv/config';
import express from 'express';
import { createServer } from './server';
import { logger } from './observability/logger';

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    const app = express();
    const server = await createServer(app);

    server.listen(PORT, () => {
      logger.info(`bmadRouter server running on port ${PORT}`);
      logger.info('Ready to intercept LLM API calls');
    });
  } catch (error) {
    logger.error('Failed to start bmadRouter server', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}