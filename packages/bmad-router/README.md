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

### Option 1: npx (Recommended)

```bash
npx bmad-router ~/myproject
npx bmad-router -k sk-xxx ~/myproject          # with API key
npx bmad-router -k sk-xxx -g ~/myproject       # API key in ~/.bashrc
```

### Option 2: Global Install

```bash
npm install -g bmad-router
bmad-router ~/myproject
```

### Option 3: Manual

```bash
git clone https://github.com/bmad/bmad-router
cd bmad-router
./install-bmad-router.sh ~/myproject
```

The installer:
1. Copies plugin files to `.opencode/plugins/bmad-router/`
2. Installs dependencies (bun or npm)
3. Adds `"bmad-router"` to your `opencode.json`
4. Optionally sets `NOTDIAMOND_API_KEY`

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
