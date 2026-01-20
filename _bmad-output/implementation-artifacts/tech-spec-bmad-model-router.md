---
title: 'BMAD-Aware Model Router for OpenCode'
slug: 'bmad-model-router'
created: '2026-01-20'
status: 'implemented'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - TypeScript
  - Bun runtime
  - '@opencode-ai/plugin'
  - 'notdiamond (npm)'
  - 'js-yaml (npm)'
files_to_modify:
  - '.opencode/plugins/bmad-router/index.ts'
  - '.opencode/plugins/bmad-router/types.ts'
  - '.opencode/plugins/bmad-router/workflow.ts'
  - '.opencode/plugins/bmad-router/quota.ts'
  - '.opencode/plugins/bmad-router/router.ts'
  - '.opencode/plugins/bmad-router/rules.ts'
  - 'opencode.json'
code_patterns:
  - 'OpenCode plugin with chat.message hook'
  - 'Direct model override via output.message.model mutation'
  - 'Direct auth file parsing (~/.local/share/opencode/auth.json)'
  - 'YAML parsing for workflow status'
  - 'NotDiamond modelRouter.selectModel() API'
  - 'Strategy pattern for quota providers'
test_patterns:
  - 'Unit tests per module'
  - 'Mock NotDiamond responses'
  - 'Mock auth.json fixtures'
---

# Tech-Spec: BMAD-Aware Model Router for OpenCode

**Created:** 2026-01-20

## Overview

### Problem Statement

OpenCode currently lacks workflow-aware model selection. When working through BMAD methodology phases (quick-spec, quick-dev, code-review), there's no intelligent gating of which providers/models should be used. This leads to:

1. Wasting Copilot premium requests on non-dev work (planning, spec-writing)
2. No protection against hitting provider quota limits mid-workflow
3. Manual model switching instead of intelligent routing

### Solution

An OpenCode plugin that **automatically routes models based on BMAD workflow phase** while preserving the user's chosen agent (e.g., `quick-flow-solo-dev`, `architect`, etc.):

1. Intercepts messages via `chat.message` hook
2. Reads `_bmad-output/planning-artifacts/bmm-workflow-status.yaml` to determine active BMAD workflow phase
3. Gates Copilot access based on workflow phase (Copilot only allowed for dev work)
4. Parses auth files directly to check remaining Copilot quota
5. Calls NotDiamond API to select the optimal model from allowed candidates
6. **Directly mutates `output.message.model`** to override the model while preserving the agent

### Key Constraint: Preserve BMAD Agents

The user's chosen agent (e.g., `@quick-flow-solo-dev`) must remain active. The plugin changes the **model** serving that agent, NOT the agent itself. This ensures:

- Agent persona and system prompts remain intact
- Agent-specific tools and permissions preserved
- Agent workflows and slash commands work normally
- Only the underlying LLM model changes based on routing

### Scope

**In Scope:**

- OpenCode plugin with `chat.message` hook for automatic model routing
- BMAD workflow status YAML parsing (Quick Flow + sprint-status)
- Direct quota checking via auth file parsing
- NotDiamond API integration for intelligent model selection
- Provider gating rules: Copilot restricted to dev work only
- Graceful fallback when NotDiamond or quota check fails
- Optional `bmad_route_info` tool for manual inspection/override

**Out of Scope:**

- Modifying existing BMAD agent definitions
- Training custom NotDiamond routers (using default routing)
- Provider authentication (handled by existing OpenCode auth)
- UI/TUI changes to OpenCode

## Architecture

### Automatic Model Routing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ User sends message to @quick-flow-solo-dev                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ chat.message hook fires                                          │
│   input.agent = "quick-flow-solo-dev"                           │
│   input.model = { providerID: "openai", modelID: "gpt-5.2" }    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Detect BMAD Phase                                             │
│    - Parse bmm-workflow-status.yaml                             │
│    - Check sprint-status.yaml for story status                  │
│    - Result: "quick-spec" | "quick-dev" | "in-progress" | etc.  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Filter Candidates by Phase                                    │
│    - Non-dev phase → Remove Copilot models from candidates      │
│    - Dev phase → Include all candidates                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Check Copilot Quota (if dev phase)                           │
│    - Parse ~/.local/share/opencode/auth.json                    │
│    - Call GitHub internal API for quota                         │
│    - Remove Copilot if quota < 10%                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Call NotDiamond for Optimal Selection                        │
│    - Send filtered candidates + message context                 │
│    - Get recommended model                                      │
│    - Fallback to first candidate if API fails                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Mutate output.message.model                                   │
│    - Set providerID and modelID to routed model                 │
│    - Agent remains unchanged!                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ OpenCode processes message with:                                 │
│   - Agent: quick-flow-solo-dev (unchanged)                      │
│   - Model: claude-sonnet-4-5 (routed based on phase)            │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Works

The `chat.message` hook receives a mutable `output` parameter:

```typescript
"chat.message"?: (input: {
  sessionID: string;
  agent?: string;
  model?: { providerID: string; modelID: string };
}, output: {
  message: UserMessage;  // Has model: { providerID, modelID }
  parts: Part[];
}) => Promise<void>;
```

By mutating `output.message.model`, we change which model OpenCode uses for this message without affecting the agent selection. The agent's:
- System prompt
- Tool permissions
- Persona definition
- Mode (primary/subagent)

...all remain intact because we're only changing the model reference.

## Context for Development

### Codebase Patterns

**Plugin Entry with chat.message Hook:**
```typescript
import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";

export const BmadRouterPlugin: Plugin = async ({ client, directory }: PluginInput) => {
  return {
    "chat.message": async (input, output) => {
      // Explicit override: keep current model
      const text = output.parts.find((part) => part.type === "text");
      if (text?.type === "text" && (/^!km\b/i.test(text.text) || /^!keep-model\b/i.test(text.text))) {
        text.text = text.text.replace(/^!km\b\s*/i, "").replace(/^!keep-model\b\s*/i, "");
        return;
      }

      // Skip if user explicitly set model via @model syntax
      if (input.model?.modelID?.includes(':explicit')) return;
      
      // 1. Detect phase
      const phase = await detectCurrentPhase(directory);
      
      // 2. Get allowed candidates based on phase
      const candidates = filterCandidatesByPhase(DEFAULT_CANDIDATES, phase);
      
      // 3. Check quota for Copilot (if still in candidates)
      const availableCandidates = await filterByQuota(candidates);
      
      // 4. Route via NotDiamond
      const selected = await routeModel(availableCandidates, output.parts);
      
      // 5. Override model (preserves agent!)
      output.message.model = {
        providerID: selected.provider,
        modelID: selected.model,
      };
    },
    
    // Optional tool for manual inspection
    tool: {
      bmad_route_info: tool({
        description: "Show current BMAD routing status and recommendations",
        args: {},
        async execute(args, ctx) {
          const phase = await detectCurrentPhase(directory);
          const quota = await getCopilotQuota();
          return JSON.stringify({ phase, quota, copilotAllowed: isDevPhase(phase) });
        }
      })
    }
  };
};

export default BmadRouterPlugin;
```

**Auth File Structure (`~/.local/share/opencode/auth.json`):**
```typescript
interface AuthData {
  "github-copilot"?: {
    type: "oauth";
    refresh: string;  // gho_ format OAuth token
    access: string;
    expires: number;
  };
}
```

**BMAD Workflow Status Structure:**
```yaml
# _bmad-output/planning-artifacts/bmm-workflow-status.yaml
generated: "2026-01-20"
project: "bmadRouter"
selected_track: "quick-flow"
workflow_status:
  quick-spec: "in-progress"
  quick-dev: "pending"
  code-review: "pending"
```

**Sprint Status Structure:**
```yaml
# _bmad-output/planning-artifacts/sprint-status.yaml
development_status:
  epic-1: in-progress
  1-1-story-name: done
  1-2-story-name: in-progress
  1-3-story-name: backlog
```

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts` | Plugin API types and hooks |
| `~/.local/share/opencode/auth.json` | Provider auth tokens for quota checking |
| `_bmad-output/planning-artifacts/bmm-workflow-status.yaml` | BMAD workflow state source |
| `_bmad-output/planning-artifacts/sprint-status.yaml` | Sprint-level status (full Method) |

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Routing mechanism | `chat.message` hook + model mutation | Automatic, zero friction, preserves agent |
| Agent preservation | Mutate only `output.message.model` | Agent persona, tools, permissions unchanged |
| Quota source | Direct auth file parsing | Testability, same approach as mystatus |
| NotDiamond failure | Fallback to first available with quota | Never block user - degrade gracefully |
| YAML missing | No Copilot (conservative) | Unknown phase = non-dev, protect premium |
| Copilot gating | Dev-phases only | Protect premium requests for implementation |
| Selection flow | Phase filter → Quota filter → NotDiamond | Pre-filter before optimization |

## Implementation Plan

### Tasks

#### Task 1: Create type definitions
- [x] **File:** `.opencode/plugins/bmad-router/types.ts`
- [x] **Action:** Define shared TypeScript interfaces
- [x] **Details:**
  - `LLMProvider` interface: `{ provider: string; model: string }`
  - `QuotaResult` interface: `{ provider: string; percentRemaining: number; tier?: string }`
  - `BmadPhase` union type for workflow phases
  - `RouteResult` interface: `{ provider: string; model: string; reason: string }`
  - `AuthData` interface for auth.json parsing

#### Task 2: Implement workflow detection module
- [x] **File:** `.opencode/plugins/bmad-router/workflow.ts`
- [x] **Action:** Create BMAD workflow status parser
- [x] **Details:**
  - `detectCurrentPhase(projectRoot: string): Promise<BmadPhase>` function
  - Parse `bmm-workflow-status.yaml` for Quick Flow phases
  - Parse `sprint-status.yaml` for full Method story status
  - Return `'unknown'` if files missing/unparseable
  - Priority: sprint-status (in-progress/review) > workflow-status

#### Task 3: Implement rules module
- [x] **File:** `.opencode/plugins/bmad-router/rules.ts`
- [x] **Action:** Create phase-based provider filtering
- [x] **Details:**
  - `DEV_PHASES` constant: `['quick-dev', 'code-review', 'in-progress', 'review']`
  - `isDevPhase(phase: string): boolean` function
  - `filterCandidatesByPhase(candidates: LLMProvider[], phase: string): LLMProvider[]`
  - `isCopilotModel(provider: string, model: string): boolean` helper

#### Task 4: Implement quota checking module
- [x] **File:** `.opencode/plugins/bmad-router/quota.ts`
- [x] **Action:** Create quota checking with Strategy pattern
- [x] **Details:**
  - `QuotaProvider` interface with `checkQuota(): Promise<QuotaResult | null>`
  - `CopilotInternalQuotaProvider` class using internal GitHub API
  - `exchangeForCopilotToken(oauthToken: string): Promise<string>` helper
  - `fetchWithTimeout(url, options, timeoutMs)` utility (5s default)
  - `filterCandidatesByQuota(candidates: LLMProvider[], minPercent?: number): Promise<LLMProvider[]>`
  - Default `minPercent = 10` (skip providers below 10% remaining)

#### Task 5: Implement NotDiamond router module
- [x] **File:** `.opencode/plugins/bmad-router/router.ts`
- [x] **Action:** Create NotDiamond API integration with fallback
- [x] **Details:**
  - `NotDiamondRouter` class wrapping SDK
  - `selectModel(messageContext: string, candidates: LLMProvider[], tradeoff?): Promise<LLMProvider>`
  - 5-second timeout for API calls
  - Fallback: return first candidate if API fails
  - Log warnings on fallback (don't throw)

#### Task 6: Implement plugin entry point
- [x] **File:** `.opencode/plugins/bmad-router/index.ts`
- [x] **Action:** Create main plugin with `chat.message` hook
- [x] **Details:**
  - Import all modules
  - Implement `chat.message` hook:
    1. Skip if model explicitly set by user
    2. Detect phase via workflow module
    3. Filter by phase rules (removes Copilot if non-dev)
    4. Filter by quota (removes low-quota providers)
    5. Route via NotDiamond
    6. Mutate `output.message.model` with result
  - Optional `bmad_route_info` tool for debugging/inspection
  - Show toast notification when routing occurs

#### Task 7: Update OpenCode configuration
- [x] **File:** `opencode.json`
- [x] **Action:** Register plugin
- [x] **Details:**
  - Add `"bmad-router"` to plugins array

#### Task 8: Create plugin package.json
- [x] **File:** `.opencode/plugins/bmad-router/package.json`
- [x] **Action:** Define plugin dependencies
- [x] **Details:**
  - `name`: `"bmad-router"`
  - `dependencies`: `notdiamond`, `js-yaml`
  - `devDependencies`: `typescript`, `@types/node`

### Acceptance Criteria

#### Core Functionality (Agent Preservation)

- [x] **AC1:** Given user is in `@quick-flow-solo-dev` agent, when a message is sent, then the agent remains `quick-flow-solo-dev` after routing
- [x] **AC2:** Given user has custom agent prompt/tools configured, when routing occurs, then those configurations are preserved

#### Phase-Based Routing

- [x] **AC3:** Given workflow-status.yaml shows `quick-spec: in-progress`, when message is sent, then Copilot models are NOT used (model switches to Claude/GPT)
- [x] **AC4:** Given workflow-status.yaml shows `quick-dev: in-progress`, when message is sent, then Copilot models ARE available for NotDiamond selection
- [x] **AC5:** Given sprint-status.yaml has a story with `in-progress` status, when message is sent, then Copilot models ARE available
- [x] **AC6:** Given no workflow status files exist, when message is sent, then Copilot models are NOT used (conservative default)

#### Quota Handling

- [x] **AC7:** Given Copilot quota is below 10%, when message is sent during dev phase, then Copilot is filtered out before NotDiamond selection
- [x] **AC8:** Given auth.json is missing or unreadable, when quota check runs, then candidate is NOT filtered (fail open for availability)

#### NotDiamond Integration

- [x] **AC9:** Given valid candidates and message context, when NotDiamond API returns successfully, then selected model is used
- [x] **AC10:** Given NotDiamond API times out (>5s), then fallback to first available candidate
- [x] **AC11:** Given NotDiamond API returns error, then fallback to first available candidate

#### User Feedback

- [x] **AC12:** Given routing occurs, when model is changed from default, then a toast notification shows the routing reason
- [x] **AC13:** Given `bmad_route_info` tool is called, then current phase, quota, and routing status are returned
- [x] **AC14:** Given a message starts with `!km` or `!keep-model`, when sent, then routing is skipped and the prefix is removed before sending to the model

## Additional Context

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `notdiamond` | ^1.x | Model routing API SDK |
| `js-yaml` | ^4.x | YAML parsing for workflow status |
| `@opencode-ai/plugin` | (bundled) | Plugin API |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTDIAMOND_API_KEY` | Yes | NotDiamond API authentication |

### Provider-to-Phase Mapping (Rules)

**Core Rule:** Copilot is reserved ONLY for development work. All non-dev phases = no Copilot.

**Dev Phases (Copilot Allowed):**
| Phase | Source | Description |
|-------|--------|-------------|
| `quick-dev` | bmm-workflow-status.yaml | Active Quick Flow implementation |
| `code-review` | bmm-workflow-status.yaml | Code review phase |
| `in-progress` | sprint-status.yaml | Story actively being implemented |
| `review` | sprint-status.yaml | Story ready for code review |

**Non-Dev Phases (No Copilot):**
| Phase | Source | Description |
|-------|--------|-------------|
| `quick-spec` | bmm-workflow-status.yaml | Planning/spec work |
| `prd` | bmm-workflow-status.yaml | PRD creation |
| `architecture` | bmm-workflow-status.yaml | Architecture design |
| `brainstorm` | bmm-workflow-status.yaml | Brainstorming |
| `research` | bmm-workflow-status.yaml | Research phase |
| `unknown` | (file missing/unparseable) | Safe default |

**Selection Flow:**
```
1. Phase rules → Filter candidates (remove Copilot if non-dev)
2. Quota check → Further filter (skip <10% remaining)
3. NotDiamond → Select best model from remaining
4. Fallback → First available if NotDiamond fails
5. Mutate output.message.model → Route takes effect
```

### Default Candidate Models

```typescript
const DEFAULT_CANDIDATES: LLMProvider[] = [
  { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  { provider: 'openai', model: 'gpt-5-2025-08-07' },
  { provider: 'openai', model: 'gpt-5.2-codex' },      // Copilot backend
  { provider: 'openai', model: 'gpt-5.1-codex-max' },  // Copilot backend
];
```

### Copilot Model Detection

```typescript
const COPILOT_MODELS = ['gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.2'];

function isCopilotModel(provider: string, model: string): boolean {
  return provider === 'openai' && COPILOT_MODELS.some(m => model.includes(m));
}
```

### Testing Strategy

**Unit Tests (per module):**
- `workflow.test.ts` - Mock YAML files, test phase detection logic
- `rules.test.ts` - Test filtering logic for all phase combinations
- `quota.test.ts` - Mock auth.json and API responses
- `router.test.ts` - Mock NotDiamond SDK, test timeout/fallback

**Integration Tests:**
- Full pipeline with mocked external dependencies
- Verify correct model selection for various phase/quota combinations
- Verify agent is preserved in output.message.agent

**Manual E2E:**
- Install plugin in OpenCode
- Test routing during different workflow phases
- Verify Copilot is excluded during quick-spec
- Verify Copilot is included during quick-dev
- Verify agent persona remains unchanged throughout

### Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| NotDiamond API down | Medium - suboptimal model selection | Fallback to first available, log warning |
| YAML malformed | Low - can't detect phase | Return 'unknown', use conservative rules |
| Copilot API changed | Medium - quota check fails | Fail open (assume available), log warning |
| Auth file missing | Low - no quota data | Skip quota filtering, proceed with all candidates |
| Model mutation rejected | High - routing doesn't work | Test thoroughly, have explicit user override option |

### Future Enhancements (v2)

- System prompt injection via `experimental.chat.system.transform` to explain routing
- Model preference learning based on task success
- Public Copilot billing API integration (more stable)
- Anthropic/OpenAI quota checking
- User preference configuration (always use X for spec work)
- Model performance tracking and feedback to NotDiamond

### File Structure

```
.opencode/plugins/bmad-router/
├── package.json      # Plugin metadata and dependencies
├── index.ts          # Plugin entry, chat.message hook
├── types.ts          # Shared type definitions
├── workflow.ts       # BMAD status YAML parsing
├── quota.ts          # Auth file parsing, quota checking
├── router.ts         # NotDiamond API integration
└── rules.ts          # Phase → provider gating rules
```
