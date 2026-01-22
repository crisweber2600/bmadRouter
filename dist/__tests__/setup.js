"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
jest.mock('redis', () => ({
    createClient: jest.fn(() => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        exists: jest.fn(),
        del: jest.fn(),
    })),
}));
afterEach(() => {
    jest.clearAllMocks();
});
//# sourceMappingURL=setup.js.map