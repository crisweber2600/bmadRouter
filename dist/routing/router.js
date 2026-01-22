"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = exports.Router = void 0;
const logger_1 = require("../observability/logger");
const cacheManager_1 = require("../cache/cacheManager");
const promptProcessor_1 = require("./promptProcessor");
const routingEngine_1 = require("./routingEngine");
const providerManager_1 = require("../providers/providerManager");
const telemetry_1 = require("../observability/telemetry");
class Router {
    cacheManager;
    promptProcessor;
    routingEngine;
    providerManager;
    telemetry;
    constructor() {
        this.cacheManager = new cacheManager_1.CacheManager();
        this.promptProcessor = new promptProcessor_1.PromptProcessor();
        this.routingEngine = new routingEngine_1.RoutingEngine();
        this.providerManager = new providerManager_1.ProviderManager();
        this.telemetry = new telemetry_1.TelemetryCollector();
    }
    async handleChatCompletion(req, res) {
        const startTime = Date.now();
        const requestId = `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            logger_1.logger.info('Processing chat completion request', { requestId });
            // Parse and validate request
            const llmRequest = this.parseRequest(req.body);
            llmRequest.bmadRouter = {
                ...llmRequest.bmadRouter,
                ...this.extractRouterHeaders(req),
            };
            // Check cache first
            const cacheResult = await this.cacheManager.checkCache(llmRequest);
            if (cacheResult.hit && cacheResult.response) {
                logger_1.logger.info('Cache hit, returning cached response', { requestId });
                const trace = this.createDecisionTrace(requestId, llmRequest, 'cache_hit', cacheResult);
                await this.telemetry.recordDecision(trace);
                return res.json(cacheResult.response);
            }
            // Process prompt for routing signals
            const signals = await this.promptProcessor.processPrompt(llmRequest);
            // Make routing decision
            const decision = await this.routingEngine.makeDecision(llmRequest, signals);
            // Execute the request with selected provider
            const response = await this.providerManager.executeRequest(decision, llmRequest);
            // Cache the response
            await this.cacheManager.storeResponse(llmRequest, response, decision);
            // Record telemetry
            const trace = this.createDecisionTrace(requestId, llmRequest, decision, signals, response);
            await this.telemetry.recordDecision(trace);
            const processingTime = Date.now() - startTime;
            logger_1.logger.info('Request completed', {
                requestId,
                processingTime,
                selectedTier: decision.selectedTier,
                selectedModel: decision.selectedModel,
            });
            res.json(response);
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            logger_1.logger.error('Request failed', {
                requestId,
                processingTime,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            // Fallback to PREMIUM tier
            try {
                const fallbackDecision = await this.routingEngine.makeFallbackDecision();
                const response = await this.providerManager.executeRequest(fallbackDecision, req.body);
                const trace = this.createDecisionTrace(requestId, req.body, 'fallback', undefined, response);
                await this.telemetry.recordDecision(trace);
                res.json(response);
            }
            catch (fallbackError) {
                logger_1.logger.error('Fallback also failed', { requestId, error: fallbackError });
                res.status(500).json({
                    error: {
                        message: 'Service temporarily unavailable',
                        type: 'service_unavailable',
                    },
                });
            }
        }
    }
    parseRequest(body) {
        // Basic validation and parsing
        if (!body.messages || !Array.isArray(body.messages)) {
            throw new Error('Invalid request: messages array required');
        }
        return {
            messages: body.messages,
            model: body.model,
            temperature: body.temperature || 0.7,
            max_tokens: body.max_tokens,
            stream: body.stream || false,
        };
    }
    extractRouterHeaders(req) {
        return {
            tier: req.headers['x-router-tier'],
            reason: req.headers['x-router-reason'],
            bypass: req.headers['x-router-bypass'] === 'true',
        };
    }
    createDecisionTrace(requestId, request, decision, signals, response) {
        const trace = {
            requestId,
            timestamp: new Date(),
            selectedModel: typeof decision === 'string' ? 'cached' : decision.selectedModel,
            selectedTier: typeof decision === 'string' ? 'FREE' : decision.selectedTier,
            decisionPath: typeof decision === 'string' ? decision : decision.decisionPath,
            signals: signals || {
                tokenCount: 0,
                complexity: 0,
                hasCode: false,
                intentCategory: 'unknown',
                confidence: 0,
            },
            explanation: {
                decision: 'Decision made',
                reasoning: ['Request processed'],
                confidence: 0.5,
                costSavings: '$0.00',
                overrideHint: 'Override available via headers',
            },
            execution: {
                latencyMs: 0,
                cost: 0,
                tokenUsage: {
                    input: response?.usage?.prompt_tokens || 0,
                    output: response?.usage?.completion_tokens || 0,
                },
            },
        };
        return trace;
    }
}
exports.Router = Router;
exports.router = new Router();
//# sourceMappingURL=router.js.map