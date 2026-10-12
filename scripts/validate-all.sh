#!/usr/bin/env bash
# Validate the marketplace manifest and every plugin in plugins/.
#
# Usage:
#   scripts/validate-all.sh [--strict]
#
#   --strict  treat warnings as errors (use before committing or in CI).
#
# Exit code is non-zero if any manifest fails validation.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STRICT_FLAG=()

case "${1:-}" in
  "") ;;
  --strict) STRICT_FLAG=(--strict) ;;
  -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "Unknown argument: $1" >&2; exit 1 ;;
esac

if ! command -v claude >/dev/null 2>&1; then
  echo "Error: the 'claude' CLI is not on PATH." >&2
  exit 1
fi

failures=0

check() {
  local target="$1"
  if claude plugin validate "${STRICT_FLAG[@]}" "$target" >/tmp/maven-validate.$$ 2>&1; then
    echo "ok    $target"
  else
    echo "FAIL  $target"
    sed 's/^/      /' /tmp/maven-validate.$$
    failures=$((failures + 1))
  fi
  rm -f /tmp/maven-validate.$$
}

check "$ROOT"

for plugin_dir in "$ROOT"/plugins/*/; do
  [ -d "$plugin_dir" ] || continue
  check "${plugin_dir%/}"
done

if [ "$failures" -gt 0 ]; then
  echo "$failures target(s) failed validation." >&2
  exit 1
fi
echo "All targets passed."
