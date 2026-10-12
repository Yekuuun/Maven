#!/usr/bin/env bash
# Install Maven plugins with the Claude Code CLI.
#
# Usage:
#   scripts/install-plugins.sh [-s user|project|local] [-m <source>] [-n] <plugin>...
#
#   -s  install scope (default: user). Use "project" to share the setup with a repo.
#   -m  marketplace source: owner/repo, git URL or local path (default: Yekuuun/Maven).
#       Pass "." or the path of a clone to install from a local working copy.
#   -n  dry run: print the commands without running them.
#
# Dependencies (for example ebpf -> c) are resolved by the CLI itself.
set -euo pipefail

MARKETPLACE="maven"
SOURCE="Yekuuun/Maven"
SCOPE="user"
DRY_RUN=0

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while getopts ":s:m:nh" opt; do
  case "$opt" in
    s) SCOPE="$OPTARG" ;;
    m) SOURCE="$OPTARG" ;;
    n) DRY_RUN=1 ;;
    h) usage 0 ;;
    *) echo "Unknown option: -$OPTARG" >&2; usage 1 ;;
  esac
done
shift $((OPTIND - 1))

if [ "$#" -eq 0 ]; then
  echo "Error: name at least one plugin (core, csharp, c, ebpf)." >&2
  usage 1
fi

case "$SCOPE" in
  user|project|local) ;;
  *) echo "Error: scope must be user, project or local (got '$SCOPE')." >&2; exit 1 ;;
esac

if ! command -v claude >/dev/null 2>&1; then
  echo "Error: the 'claude' CLI is not on PATH." >&2
  exit 1
fi

for plugin in "$@"; do
  # --marketplace adds the marketplace on first use, then installs from it.
  cmd=(claude plugin install "${plugin}@${MARKETPLACE}" --marketplace "$SOURCE" --scope "$SCOPE" --yes)
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '%q ' "${cmd[@]}"; echo
  else
    echo "Installing ${plugin}@${MARKETPLACE} (scope: ${SCOPE})..."
    "${cmd[@]}"
  fi
done
