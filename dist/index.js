#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const server_1 = require("./server");
const logger_1 = require("./observability/logger");
const PORT = process.env.PORT || 3000;
async function main() {
    try {
        const app = (0, express_1.default)();
        const server = await (0, server_1.createServer)(app);
        server.listen(PORT, () => {
            logger_1.logger.info(`bmadRouter server running on port ${PORT}`);
            logger_1.logger.info('Ready to intercept LLM API calls');
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to start bmadRouter server', { error });
        process.exit(1);
    }
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=index.js.map