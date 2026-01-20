#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_SOURCE="${SCRIPT_DIR}/packages/bmad-router"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS] <target-project-dir>

Install bmad-router plugin to an OpenCode project.

Options:
  -k, --api-key KEY    Set NOTDIAMOND_API_KEY (optional, can also use env var)
  -g, --global         Add API key to ~/.bashrc
  -h, --help           Show this help

Examples:
  $(basename "$0") ~/myproject
  $(basename "$0") -k sk-xxx ~/myproject
  $(basename "$0") -k sk-xxx -g ~/myproject
EOF
  exit 0
}

API_KEY=""
GLOBAL_KEY=false
TARGET_DIR=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -k|--api-key)
      API_KEY="$2"
      shift 2
      ;;
    -g|--global)
      GLOBAL_KEY=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      TARGET_DIR="$1"
      shift
      ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "Error: Target project directory required"
  usage
fi

TARGET_DIR="$(realpath "$TARGET_DIR")"

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Error: Directory does not exist: $TARGET_DIR"
  exit 1
fi

echo "Installing bmad-router to: $TARGET_DIR"

PLUGIN_DIR="$TARGET_DIR/.opencode/plugins/bmad-router"
mkdir -p "$PLUGIN_DIR"

cp "$PLUGIN_SOURCE"/*.ts "$PLUGIN_DIR/"
cp "$PLUGIN_SOURCE/package.json" "$PLUGIN_DIR/"

echo "Installing dependencies..."
cd "$PLUGIN_DIR"
if command -v bun &> /dev/null; then
  bun install
elif command -v npm &> /dev/null; then
  npm install
else
  echo "Warning: Neither bun nor npm found. Run 'npm install' in $PLUGIN_DIR manually."
fi

CONFIG_FILE="$TARGET_DIR/opencode.json"
if [[ -f "$CONFIG_FILE" ]]; then
  if grep -q '"bmad-router"' "$CONFIG_FILE"; then
    echo "Plugin already registered in opencode.json"
  else
    echo "Adding bmad-router to existing opencode.json..."
    if grep -q '"plugin"' "$CONFIG_FILE"; then
      sed -i 's/"plugin":\s*\[/"plugin": ["bmad-router", /' "$CONFIG_FILE"
    else
      tmp=$(mktemp)
      jq '. + {"plugin": ["bmad-router"]}' "$CONFIG_FILE" > "$tmp" && mv "$tmp" "$CONFIG_FILE"
    fi
  fi
else
  echo "Creating opencode.json..."
  cat > "$CONFIG_FILE" <<CONF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["bmad-router"]
}
CONF
fi

if [[ -n "$API_KEY" ]]; then
  if [[ "$GLOBAL_KEY" == true ]]; then
    echo "Adding NOTDIAMOND_API_KEY to ~/.bashrc..."
    if ! grep -q "NOTDIAMOND_API_KEY" ~/.bashrc 2>/dev/null; then
      echo "export NOTDIAMOND_API_KEY=\"$API_KEY\"" >> ~/.bashrc
    else
      sed -i "s/export NOTDIAMOND_API_KEY=.*/export NOTDIAMOND_API_KEY=\"$API_KEY\"/" ~/.bashrc
    fi
    echo "Run 'source ~/.bashrc' or restart your shell to load the key."
  else
    ENV_FILE="$TARGET_DIR/.env"
    echo "Adding NOTDIAMOND_API_KEY to $ENV_FILE..."
    if [[ -f "$ENV_FILE" ]] && grep -q "NOTDIAMOND_API_KEY" "$ENV_FILE"; then
      sed -i "s/NOTDIAMOND_API_KEY=.*/NOTDIAMOND_API_KEY=$API_KEY/" "$ENV_FILE"
    else
      echo "NOTDIAMOND_API_KEY=$API_KEY" >> "$ENV_FILE"
    fi
  fi
fi

echo ""
echo "✅ bmad-router installed successfully!"
echo ""
echo "Plugin location: $PLUGIN_DIR"
echo "Config: $CONFIG_FILE"
if [[ -n "$API_KEY" ]]; then
  if [[ "$GLOBAL_KEY" == true ]]; then
    echo "API key: Added to ~/.bashrc (run 'source ~/.bashrc')"
  else
    echo "API key: Added to $TARGET_DIR/.env"
  fi
else
  echo "API key: Not set (optional - plugin works without it)"
fi
echo ""
echo "Restart OpenCode to activate the plugin."
