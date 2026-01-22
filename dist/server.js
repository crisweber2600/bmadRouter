"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const router_1 = require("./routing/router");
const logger_1 = require("./observability/logger");
const errorHandler_1 = require("./middleware/errorHandler");
async function createServer(app) {
    // Middleware
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
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
    app.post('/v1/chat/completions', router_1.router.handleChatCompletion.bind(router_1.router));
    // Error handling
    app.use(errorHandler_1.errorHandler);
    // 404 handler (Express 5 uses different syntax)
    app.use((req, res) => {
        res.status(404).json({
            error: {
                message: `Route ${req.method} ${req.originalUrl} not found`,
                type: 'not_found'
            }
        });
    });
    logger_1.logger.info('Server configured with routing endpoints');
    return app;
}
//# sourceMappingURL=server.js.map