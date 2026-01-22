---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-user-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish']
inputDocuments:
   - '_bmad-output/analysis/brainstorming-session-2026-01-21.md'
workflowType: 'prd'
documentCounts:
  briefCount: 0
  researchCount: 0
  brainstormingCount: 1
  projectDocsCount: 0
classification:
  projectType: "Infrastructure/API - Sidecar Middleware Component"
  domain: "AI/ML Systems - LLM Routing & Cost Optimization"
  complexity: "Medium-High"
  projectContext: "Greenfield"
  primaryUsers: "Internal (BMAD system)"
  architecturePattern: "Sidecar/Middleware"
  successMetrics: ["70-85% cost reduction", "85-89% routing accuracy", "p95 <50ms latency"]
  complianceConcerns: "None"
researchValidation:
  routeLLM: "85% cost reduction on MT Bench"
  semanticCascading: "40% of cost with quality parity"
  bestRoute: "60% cost reduction, <1% quality drop"
  ipr: "43.9% cost reduction, sub-150ms latency"
partyModeContributors:
  - "Winston (Architect): p95 latency, fallback tier, semantic agreement architecture"
  - "John (PM): Tiered success metrics (minimum/target/stretch)"
  - "Murat (Test Architect): Quality gates, A/B testing framework"
  - "Amelia (Developer): Per-agent defaults + per-request override"
  - "Victor (Innovation Strategist): Agent-aware routing as novel differentiator"
  - "Sally (UX Designer): Human-readable observability schema"
  - "Carson (Brainstorming Coach): Override learning, self-improving infrastructure"
  - "Dr. Quinn (Problem Solver): Semantic agreement solves cold start"
  - "Paige (Tech Writer): Deployment phases documentation"
  - "Barry (Quick Flow Dev): MVP file structure"
---

# Product Requirements Document - bmadRouter

**Author:** Cris  
**Date:** 2026-01-21  
**Version:** 1.2 (Polished for Architecture)

## Document Status

**PRD Complete** - All 11 workflow steps executed. Ready for Architecture Design phase.

**Research Validation:** Success criteria validated against RouteLLM (85% cost reduction), Semantic Agreement Cascading (quality parity at 40% cost), BEST-Route (60% reduction), and IPR (43.9% reduction) research.

---

## Executive Summary

**bmadRouter** is an intelligent AI model routing middleware component that reduces LLM API costs by **50-85%** while preserving **85-89% routing accuracy** and maintaining **sub-50ms (p95) decision latency**. Built as a configurable sidecar component for internal BMAD system use, it routes queries to optimal model tiers (FREE → CHEAP → BALANCED → PREMIUM) using a hybrid approach: fast heuristics for clear cases and semantic agreement cascading for ambiguous queries.

**Key Differentiators:**
- **Training-free semantic agreement** - No ML training required; uses model consensus for routing
- **Configurable routing strategies** - Agents control routing behavior (cost-focused, quality-focused, balanced)
- **Override capability with learning** - Agent overrides improve future routing decisions
- **Built-in observability** - Human-readable explanations for every routing decision
- **4-tier cost hierarchy** - Matches queries to appropriate model tiers
- **Agent-aware routing** - Novel contribution: routing optimized per agent type

**Business Context:** Each Opus-class LLM call costs 3 credits on GitHub Copilot. Intelligent routing routes 70% of simple queries to free/cheap models, achieving massive cost arbitrage while preserving quality for complex tasks.

---

## Success Criteria

### Tiered Success Metrics (Research-Validated)

| Metric | Minimum | Target | Stretch | Research Basis |
|--------|---------|--------|---------|----------------|
| **Cost Reduction** | 50% | 70% | 85% | RouteLLM: 85%, IPR: 43.9% |
| **Routing Accuracy** | 85% | 89% | 92% | RouteLLM: 95% GPT-4 quality |
| **Decision Latency (p95)** | <100ms | <50ms | <25ms | Allows semantic agreement |
| **Semantic Agreement Rate** | 60% | 70% | 80% | Cascade efficiency metric |
| **Override Rate Trend** | Stable | Decreasing | <5% | System learning indicator |

### User Success (Agent Experience)

Internal BMAD agents experience the router as transparent yet controllable, with routing working automatically while allowing per-agent strategy configuration (cost-focused, quality-focused, balanced). Agents receive trustworthy, human-readable explanations for every routing decision and can override/reject decisions, with overrides feeding back into system learning for continuous improvement.

**User Success Moment:** When an agent realizes it's getting quality results at a fraction of the cost, understands exactly why the router made each decision, and sees that its overrides are making the system smarter.

### Business Success (BMAD System)

The router delivers measurable business value through **cost reduction (primary metric)**: minimum 50% (exceeds IPR baseline of 43.9%), target 70% (realistic for BMAD queries), stretch 85% (matches RouteLLM results).

**Query Intelligence:**
- **CRITICAL Queries:** Code generation, complex reasoning, security → Always Premium
- **SAFE Queries:** Factual lookups, summaries, simple Q&A → Free/Cheap tiers
- **MIXED Queries:** Uncertain cases → Semantic agreement consensus
- **Quality Baseline:** 85-89% accuracy vs. always-premium baseline

**Adoption & Scale:** Integrated with core BMAD agents, supports 3 providers at MVP, extensible architecture, agent-specific routing profiles learned over time.

### Technical Success

The router functions as a reliable, maintainable infrastructure component with:
- **Performance:** p95 <50ms latency (heuristic path: 3-5ms for 90% of queries, semantic agreement: 50-100ms for 10% of ambiguous queries)
- **Reliability:** 99.5% uptime with graceful PREMIUM fallback and agent override capability
- **Architecture:** Semantic agreement cascading (training-free, 60% cost reduction), sidecar pattern, 3 providers at MVP with extensible design
- **Observability:** OpenTelemetry integration, structured telemetry, human-readable explanations, A/B testing framework
- **Maintainability:** Clear audit trails, minimal operational overhead, override-driven optimization

### Quality Gates (Pre-Release Validation)

| Gate | Criteria | Method |
|------|----------|--------|
| **Routing Accuracy** | >85% agreement with "always premium" baseline | 1000 historical BMAD queries |
| **Latency** | p95 <50ms under load | 100 concurrent requests benchmark |
| **Cost Projection** | >50% projected savings | Test traffic pattern analysis |
| **Semantic Agreement** | >60% model consensus rate | Parallel query validation |
| **Override Handling** | 100% overrides logged, 0% data loss | Integration test suite |

---

## Product Scope

### MVP - Minimum Viable Product

**Core Routing Engine:**
- 4-tier cost hierarchy (FREE/CHEAP/BALANCED/PREMIUM) + FALLBACK tier
- Heuristic-based signal detection (lexical complexity, intent fingerprints, keyword patterns)
- Semantic Agreement Cascading for ambiguous queries (training-free consensus approach)
- Multi-provider support (OpenAI, Anthropic, Google)

**Agent Integration (Hybrid Pattern):**
- Transparent proxy mode (default): agents don't change their code
- Explicit override mode: agents specify tier or model when needed
- Per-agent default configuration (cost-focused vs quality-focused)
- Override API with reason logging for system learning

**Observability:**
- Human-readable routing explanations for every decision
- Structured telemetry (request_id, selected_tier, routing_signals, confidence, cost_savings)
- Cost tracking dashboard
- Routing accuracy monitoring
- Alert system for routing failures or cost spikes

**Operations:**
- A/B testing framework (10% control group to PREMIUM)
- Override pattern analysis dashboard
- Deployment phase support (Shadow → Canary → Gradual → Full)

**MVP Success Criteria:** 50-70% cost reduction while maintaining 85% oracle quality and p95 <50ms latency in production with at least 2 BMAD workflows enabled.

### Deployment Phases

| Phase | Duration | Mode | Expected Savings | Purpose |
|-------|----------|------|------------------|---------|
| **Shadow** | 1-2 weeks | Classify but route all to PREMIUM | 0% | Collect baseline, validate accuracy |
| **Canary** | 1 week | Route 10% of traffic | ~5-7% | Validate in production |
| **Gradual** | 2 weeks | Route 50% → 75% → 90% | ~35% → 55% → 65% | Build confidence |
| **Full** | Ongoing | Route 100%, continuous learning | 70%+ | Optimize over time |

### Post-MVP Roadmap

**Phase 1b: Quick Wins (2 weeks)**
- A/B testing framework (Seldon Core v2 patterns)
- OpenLIT/OpenLLMetry auto-instrumentation
- Cost anomaly detection (60-day lookback)

**Phase 2: Growth (6-8 weeks)**
- Agent-specific routing profiles
- Override learning and automatic rule updates
- TinyBERT-4 classification for high-confidence edge cases
- Extended provider support (Mistral, Llama, open-source models)

**Phase 3: Vision (8-12 weeks)**
- Agent-aware routing (novel contribution: per-agent optimization)
- Meta-routing architecture (router-of-routers)
- Domain-specific sub-routers (code, reasoning, creative, analysis)
- Client-side classification (WebAssembly ONNX)
- Predictive cost/quality optimization
- Publication of findings if targets exceeded

---



## User Journeys

### Winston (Architect) - Transparent Routing
Architect agent submits complex system design query → Router analyzes signals → Routes to PREMIUM tier → Returns high-quality response → Architect continues design work unaware of routing → Cost saved automatically.

### Mary (Analyst) - Cost Visibility
Analyst agent submits analysis query → Router routes to CHEAP tier → Returns adequate response with explanation → Analyst sees "$0.08 saved" in logs → Continues work with transparency.

### Amelia (Developer) - Override Path
Developer agent submits query → Router routes to CHEAP tier → Developer reviews explanation → Deems query critical → Overrides to PREMIUM → Logs reason "security implications" → System learns from override.

### Cris (Admin) - Dashboard Management
Admin monitors routing dashboard → Sees 65% cost reduction, 92% accuracy → Reviews anomaly alerts → Adjusts deployment phase from Canary to Gradual → Validates system health.

### New Agent Developer - Integration
Developer integrates new agent → Uses transparent proxy mode → Agent works without code changes → Optionally configures cost-focused strategy → Sees routing explanations in logs.

---

## Functional Requirements

### Query Routing Capabilities

**Core routing decision-making and execution:**

- FR1: Router can analyze incoming LLM queries using heuristic signals (token count, lexical complexity, keyword patterns, code detection)
- FR2: Router can route queries to optimal cost tier (FREE, CHEAP, BALANCED, PREMIUM) based on heuristic analysis
- FR3: Router can use semantic agreement cascading when heuristic signals are ambiguous (query multiple models for consensus)
- FR4: Router can execute routing decisions by forwarding queries to selected model providers
- FR5: Router can provide fallback routing to PREMIUM tier when router is unavailable or encounters errors
- FR6: Router can apply agent-aware routing optimizations based on learned agent behavior patterns

### Provider Management Capabilities

**Multi-provider support and abstraction:**

- FR7: Router can integrate with multiple LLM providers (OpenAI, Anthropic, Google)
- FR8: Router can abstract provider-specific APIs into standardized request/response interfaces
- FR9: Router can handle provider-specific authentication and rate limiting
- FR10: Router can switch between providers based on routing decisions
- FR11: Router can support provider failover when primary provider is unavailable

### Agent Integration Capabilities

**How agents interact with and control the router:**

- FR12: Router can intercept LLM API calls transparently without requiring agent code changes
- FR13: Router can accept explicit override requests from agents specifying desired tier or model
- FR14: Router can apply per-agent default routing strategies (cost-focused, quality-focused, balanced)
- FR15: Router can log override reasons provided by agents for system learning
- FR16: Router can accept agent requests to bypass routing and route directly to specific models

### Cost Optimization Capabilities

**Cost tracking, calculation, and optimization:**

- FR17: Router can calculate real-time API costs for each routing decision
- FR18: Router can track total cost savings achieved through routing optimization
- FR19: Router can provide cost projections and budget utilization monitoring
- FR20: Router can optimize routing decisions based on cost constraints while preserving quality
- FR21: Router can detect and alert on cost anomalies or unexpected spending patterns

### Observability Capabilities

**Monitoring, logging, and transparency:**

- FR22: Router can log detailed routing decisions including selected model, confidence, and reasoning
- FR23: Router can provide human-readable explanations for each routing decision
- FR24: Router can generate structured telemetry for routing performance and accuracy metrics
- FR25: Router can display real-time dashboards showing cost savings, routing accuracy, and system health
- FR26: Router can export observability data in industry-standard formats (OpenTelemetry)
- FR27: Router can track routing accuracy against always-premium baseline

### System Administration Capabilities

**Deployment, configuration, and operational management:**

- FR28: Router can operate in shadow mode (classify but route all to PREMIUM for validation)
- FR29: Router can support canary deployment (route percentage of traffic for testing)
- FR30: Router can support gradual rollout (incrementally increase routed traffic percentage)
- FR31: Router can provide configuration interfaces for per-agent routing preferences
- FR32: Router can conduct A/B testing between different routing strategies
- FR33: Router can analyze override patterns to automatically improve routing heuristics
- FR34: Router can scale routing decisions horizontally across multiple instances

---

## Non-Functional Requirements

### Performance

**Routing decision speed and system responsiveness:**

- Routing decisions complete within 50ms (p95) for heuristic-only path (90% of queries)
- Semantic agreement path completes within 100ms (p95) for ambiguous queries (10% of queries)
- API request forwarding adds less than 10ms latency overhead
- System maintains performance under 100 concurrent routing decisions per second
- Cache hit optimization reduces latency to under 10ms for repeated query patterns

### Security

**API credential protection and routing security:**

- All provider API keys are encrypted at rest and in transit
- Router logs do not expose sensitive API credentials or user data
- Override requests are authenticated and authorized per agent
- Configuration changes require explicit authorization
- No routing decisions are cached or logged in ways that could expose sensitive query content

### Scalability

**Horizontal scaling and capacity handling:**

- Router supports horizontal scaling across multiple instances for load distribution
- System handles 1000+ concurrent BMAD agent connections
- Routing decision throughput scales linearly with additional instances
- Configuration and learning data synchronizes across scaled instances
- No single point of failure in routing decision processing

### Integration

**Reliable multi-provider API connectivity:**

- Provider API integrations maintain 99.9% success rate for individual requests
- Automatic retry logic with exponential backoff for transient API failures
- Provider failover completes within 5 seconds of primary failure detection
- API rate limiting is respected across all providers
- Provider-specific error handling and status code mapping

### Reliability

**System availability and graceful failure handling:**

- Router maintains 99.5% uptime for routing service operations
- Fallback to PREMIUM tier completes within 1 second of router unavailability
- Override requests are queued and processed even during high load
- System recovers automatically from temporary provider outages
- Configuration changes do not require service restart or cause downtime

---

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-Solving MVP - Solves "every chat costs 3 credits" pain by routing 70% of queries to cheaper models while preserving quality for complex tasks.

**Resource Requirements:** 1 developer (Cris) + AI assistance, 4-6 weeks for MVP.

### MVP Feature Set (Phase 1)

**Must-Have Capabilities:**
- 4-tier cost hierarchy (FREE/CHEAP/BALANCED/PREMIUM/FALLBACK)
- Heuristic-based signal detection (token count, complexity, code markers, keywords)
- Semantic Agreement Cascading for ambiguous queries (training-free consensus)
- Transparent proxy mode (zero agent code changes)
- 3 providers: OpenAI, Anthropic, Google
- Shadow → Canary → Gradual deployment phases
- OpenTelemetry GenAI semantic conventions
- RouterDecisionTrace logging with human-readable explanations
- Grafana cost tracking and routing accuracy dashboards
- Basic cost anomaly alerts

**MVP Success Criteria:** 50-70% cost reduction while maintaining 85% oracle quality and p95 <50ms latency in production with at least 2 BMAD workflows enabled.

### Post-MVP Roadmap

**Phase 1b: Quick Wins (2 weeks)**
- A/B testing framework (Seldon Core v2 patterns)
- OpenLIT/OpenLLMetry auto-instrumentation
- Cost anomaly detection (60-day lookback)

**Phase 2: Growth (6-8 weeks)**
- Agent-specific routing profiles
- Override learning and automatic rule updates
- TinyBERT-4 classification for high-confidence edge cases
- Extended provider support (Mistral, Llama, open-source models)

**Phase 3: Vision (8-12 weeks)**
- Agent-aware routing (novel contribution: per-agent optimization)
- Meta-routing architecture (router-of-routers)
- Domain-specific sub-routers (code, reasoning, creative, analysis)
- Client-side classification (WebAssembly ONNX)
- Predictive cost/quality optimization
- Publication of findings if targets exceeded

### Risk Mitigation Strategy

**Technical Risks:**
- Semantic agreement latency: Heuristics handle 90%, only 10% take slow path
- Heuristic accuracy: Shadow mode validates before real routing
- Provider API changes: Abstraction layer with modular adapters

**Market Risks:**
- Agent trust: Observability with human-readable explanations, override capability
- Premium queries routed to cheap: Conservative heuristics, FALLBACK tier, quality monitoring

**Resource Risks:**
- Minimum viable: 1 developer + AI assistance
- Contingency: Drop semantic agreement if resources constrained (Phase 1b instead of MVP)

---

## Research References

### Production Implementations Analyzed
- **RouteLLM** - 85% cost reduction, preference-data trained routers
- **LiteLLM** - 6 routing strategies (simple-shuffle, least-busy, latency-based, cost-based)
- **vLLM Semantic Router** - Signal-decision architecture, real-time dashboard
- **Martian** - Model mapping predicts performance without execution

### Academic Research (2024-2026)
- **RouteLLM** (arXiv:2406.18665) - 85% cost reduction on MT Bench
- **Semantic Agreement Cascading** (EMNLP 2025) - Training-free, 40% of cost, quality parity
- **BEST-Route** (arXiv:2506.22716) - 60% cost reduction, <1% quality drop
- **IPR** (arXiv:2509.06274) - 43.9% cost reduction, sub-150ms latency
- **Cascade Routing** (ICML 2025) - Theoretical optimal quality-cost tradeoff

### Key Technical Findings
- **TinyBERT-4:** 14.5M params, 15-25ms CPU latency, 97% BERT accuracy
- **NVIDIA Complexity Classifier:** 98.1% accuracy, pre-trained on 4,024 prompts
- **ONNX Runtime INT8:** 2-6x speedup with ~1% accuracy loss
- **Semantic Agreement:** Training-free consensus routing, works with black-box APIs

---
