"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const logLevel = process.env.LOG_LEVEL || 'info';
exports.logger = winston_1.default.createLogger({
    level: logLevel,
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    defaultMeta: { service: 'bmad-router' },
    transports: [
        // Console transport for development
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple()),
        }),
        // File transport for production
        ...(process.env.NODE_ENV === 'production' ? [
            new winston_1.default.transports.File({
                filename: 'logs/error.log',
                level: 'error',
            }),
            new winston_1.default.transports.File({
                filename: 'logs/combined.log',
            }),
        ] : []),
    ],
});
// Handle uncaught exceptions
exports.logger.exceptions.handle(new winston_1.default.transports.Console(), new winston_1.default.transports.File({ filename: 'logs/exceptions.log' }));
// Handle unhandled promise rejections
exports.logger.rejections.handle(new winston_1.default.transports.Console(), new winston_1.default.transports.File({ filename: 'logs/rejections.log' }));
//# sourceMappingURL=logger.js.map