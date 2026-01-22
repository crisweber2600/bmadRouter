# bmadRouter

An intelligent AI model routing middleware that reduces LLM API costs by **50-85%** while preserving **85-89% routing accuracy**. Built as a sidecar component for BMAD agents.

## Features

- **Intelligent Routing**: Routes queries to optimal model tiers (FREE → CHEAP → BALANCED → PREMIUM)
- **Transparent Integration**: Zero code changes required for existing agents
- **Cost Optimization**: Automatic cost reduction with quality preservation
- **Observability**: Human-readable explanations and comprehensive telemetry
- **Provider Support**: OpenAI, Anthropic, and Google models
- **Caching**: Exact match and semantic caching for improved performance

## Quick Start

### Prerequisites
- Node.js 18+
- Redis (optional, for caching)
- API keys for desired LLM providers

### Installation

```bash
npm install
cp .env.example .env
# Edit .env with your API keys
```

### Development

```bash
npm run dev  # Start development server with hot reload
npm test     # Run tests
npm run lint # Check code quality
```

### Production

```bash
npm run build
npm start
```

## Usage

### Basic Usage (Transparent Proxy)

```typescript
// Agent code remains unchanged
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }]
});

// bmadRouter automatically:
// 1. Analyzes the query
// 2. Routes to optimal tier (e.g., CHEAP instead of PREMIUM)
// 3. Returns response with cost savings info
```

### Explicit Override

```typescript
// Force specific tier when needed
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  // bmadRouter extension
  bmadRouter: {
    tier: "PREMIUM",
    reason: "Critical security analysis required"
  }
});
```

## Architecture

### Core Components

- **Request Interceptor**: Transparent API interception
- **Cache Layer**: Exact match and semantic caching
- **Prompt Processor**: Query analysis and signal detection
- **Routing Engine**: Intelligent tier selection
- **Provider Manager**: Multi-provider abstraction
- **Observability**: Telemetry and monitoring

### Request Flow

```
Agent Request → Cache Check → Prompt Analysis → Routing Decision → Provider Execution → Response + Telemetry
```

## Configuration

### Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Cache (Redis)
REDIS_HOST=localhost
REDIS_PORT=6379

# Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

### Tier Mappings

| Tier | Models | Use Case | Cost Reduction |
|------|--------|----------|----------------|
| FREE | Local models | Simple lookups | 100% |
| CHEAP | GPT-4o Mini, Gemini Flash | Factual Q&A | 80-90% |
| BALANCED | Claude Sonnet, GPT-4o | Reasoning tasks | 50-70% |
| PREMIUM | Claude Opus, GPT-5 | Complex tasks | Baseline |
| FALLBACK | Premium models | Router failure | Safety net |

## API Reference

### Health Check
```http
GET /health
```

### Status
```http
GET /api/status
```

### Chat Completions (OpenAI-compatible)
```http
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "Hello"}],
  "bmadRouter": {
    "tier": "CHEAP",
    "reason": "Simple greeting"
  }
}
```

## Development

### Project Structure

```
src/
├── types/          # TypeScript type definitions
├── providers/      # LLM provider implementations
├── routing/        # Routing logic and engines
├── cache/          # Caching implementations
├── observability/  # Logging and telemetry
├── middleware/     # Express middleware
└── __tests__/      # Test files
```

### Testing

```bash
npm test                    # Run all tests
npm run test:coverage      # Run with coverage
npm run test:watch         # Watch mode
```

### Code Quality

```bash
npm run lint               # ESLint check
npm run lint:fix          # Auto-fix issues
npm run build             # TypeScript compilation
```

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["npm", "start"]
```

### Kubernetes Sidecar

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bmad-agent
spec:
  template:
    spec:
      containers:
      - name: agent
        image: my-agent:latest
      - name: bmad-router
        image: bmad-router:latest
        ports:
        - containerPort: 3000
        env:
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: llm-secrets
              key: openai-key
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

ISC

## Roadmap

- **Phase 1 (Current)**: Core routing with 50-70% cost reduction
- **Phase 1b**: A/B testing and enhanced observability
- **Phase 2**: Agent-aware routing and semantic agreement
- **Phase 3**: Meta-routing and advanced optimization

For questions or contributions, please open an issue or pull request.