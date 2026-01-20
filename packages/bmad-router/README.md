# bmad-router

BMAD-aware model router plugin for OpenCode. Automatically routes models based on BMAD workflow phase while preserving your chosen agent.

## Features

- **Workflow-Aware Routing**: Automatically detects BMAD workflow phase (quick-spec, quick-dev, code-review)
- **Copilot Protection**: Reserves Copilot premium requests for dev work only
- **Quota Management**: Checks Copilot quota and filters when low (<10%)
- **NotDiamond Integration**: Uses NotDiamond API for intelligent model selection
- **Agent Preservation**: Changes only the model, never your agent selection
- **Graceful Fallback**: Works without NotDiamond API key, fails gracefully

## Installation

### Option 1: Local Plugin (Recommended)

Copy the plugin to your project's `.opencode/plugins/` directory:

```bash
mkdir -p .opencode/plugins/bmad-router
cp -r packages/bmad-router/* .opencode/plugins/bmad-router/
cd .opencode/plugins/bmad-router && bun install
```

Add to your project's `opencode.json`:

```json
{
  "plugin": ["bmad-router"]
}
```

### Option 2: Global Installation

```bash
# Coming soon: npm install -g bmad-router
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTDIAMOND_API_KEY` | No | NotDiamond API key for intelligent routing (falls back to first candidate without it) |

### Workflow Status Files

The plugin reads BMAD workflow status from:

- `_bmad-output/planning-artifacts/bmm-workflow-status.yaml` - Quick Flow phases
- `_bmad-output/planning-artifacts/sprint-status.yaml` - Full BMAD Method story status

## Usage

### Automatic Routing

The plugin automatically intercepts messages and routes to the optimal model based on:

1. **Phase Detection**: Reads workflow status to determine current phase
2. **Phase Rules**: Filters Copilot for non-dev phases (spec, PRD, architecture)
3. **Quota Check**: Removes Copilot if quota < 10%
4. **NotDiamond Selection**: Selects optimal model from remaining candidates

### Manual Override

Prefix your message with `!km` or `!keep-model` to skip routing:

```
!km Continue with the current model please
```

### Debugging

Use the `bmad_route_info` tool to inspect current routing status:

```
@bmad_route_info
```

Returns:
```json
{
  "phase": "quick-dev",
  "copilotAllowed": true,
  "quota": { "percentRemaining": 85, "unlimited": false },
  "candidates": [...]
}
```

## Phase Rules

| Phase | Copilot Allowed | Source |
|-------|-----------------|--------|
| `quick-dev` | Yes | bmm-workflow-status.yaml |
| `code-review` | Yes | bmm-workflow-status.yaml |
| `in-progress` | Yes | sprint-status.yaml |
| `review` | Yes | sprint-status.yaml |
| `quick-spec` | No | bmm-workflow-status.yaml |
| `prd` | No | bmm-workflow-status.yaml |
| `architecture` | No | bmm-workflow-status.yaml |
| `unknown` | No | (no files found) |

## License

MIT
