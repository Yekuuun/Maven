#!/usr/bin/env bash
# Scaffold a new plugin in plugins/<name> and register it in the marketplace.
#
# Usage:
#   scripts/new-plugin.sh <name> "<one-line description>" [dependency...]
#
# Example:
#   scripts/new-plugin.sh aspnet "ASP.NET Core conventions and review." csharp
#
# Creates:
#   plugins/<name>/.claude-plugin/plugin.json
#   plugins/<name>/skills/            (empty, add skills/<skill>/SKILL.md)
# and appends an entry to .claude-plugin/marketplace.json.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARKETPLACE_FILE="$ROOT/.claude-plugin/marketplace.json"

if [ "$#" -lt 2 ]; then
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

name="$1"
description="$2"
shift 2
deps=("$@")

if ! [[ "$name" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "Error: name must be kebab-case, starting with a letter (got '$name')." >&2
  exit 1
fi

plugin_dir="$ROOT/plugins/$name"
if [ -e "$plugin_dir" ]; then
  echo "Error: plugins/$name already exists." >&2
  exit 1
fi

for dep in "${deps[@]}"; do
  if [ ! -f "$ROOT/plugins/$dep/.claude-plugin/plugin.json" ]; then
    echo "Error: dependency '$dep' is not a plugin in this marketplace." >&2
    exit 1
  fi
done

mkdir -p "$plugin_dir/.claude-plugin" "$plugin_dir/skills"

# Build plugin.json, adding "dependencies" only when some were given.
if [ "${#deps[@]}" -gt 0 ]; then
  dep_json=$(printf '%s\n' "${deps[@]}" | jq -R . | jq -s .)
  jq -n --arg name "$name" --arg desc "$description" --argjson deps "$dep_json" \
    '{name: $name, version: "0.1.0", description: $desc, author: {name: "Yekuuun"}, dependencies: $deps}' \
    > "$plugin_dir/.claude-plugin/plugin.json"
else
  jq -n --arg name "$name" --arg desc "$description" \
    '{name: $name, version: "0.1.0", description: $desc, author: {name: "Yekuuun"}}' \
    > "$plugin_dir/.claude-plugin/plugin.json"
fi

# Append the marketplace entry, keeping the file's formatting readable.
tmp="$(mktemp)"
jq --arg name "$name" --arg desc "$description" \
  '.plugins += [{name: $name, source: ("./plugins/" + $name), description: $desc}]' \
  "$MARKETPLACE_FILE" > "$tmp"
mv "$tmp" "$MARKETPLACE_FILE"

echo "Created plugins/$name and registered it in .claude-plugin/marketplace.json."
echo "Next: add skills under plugins/$name/skills/<skill>/SKILL.md, then run python scripts/validate.py."
echo "Also add it to the plugin table in README.md."
