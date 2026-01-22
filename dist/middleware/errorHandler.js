"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../observability/logger");
function errorHandler(error, req, res, _next) {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger_1.logger.error('Request error', {
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
//# sourceMappingURL=errorHandler.js.map