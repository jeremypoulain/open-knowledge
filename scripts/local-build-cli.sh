#!/usr/bin/env bash
#
# Build the OpenKnowledge CLI from this local fork and expose it globally
# as `ok` / `open-knowledge`, replacing any version installed from npm.
#
# Usage:
#   scripts/local-build-cli.sh           # install deps, build, and link globally
#   scripts/local-build-cli.sh --rebuild # just rebuild (after you change code)
#
# After the first run, `ok` / `open-knowledge` on your PATH point at this
# checkout's build. Re-run with --rebuild after editing source.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_DIR="$REPO_ROOT/packages/cli"

cd "$REPO_ROOT"

REBUILD_ONLY=0
[[ "${1:-}" == "--rebuild" ]] && REBUILD_ONLY=1

# --- Toolchain sanity check ----------------------------------------------
node_major="$(node -v 2>/dev/null | sed -E 's/^v?([0-9]+).*/\1/' || echo 0)"
if (( node_major < 24 )); then
  echo "warning: Node 24+ is required (found $(node -v 2>/dev/null || echo none))." >&2
  echo "         Use fnm/volta/mise to pin Node 24 (see .node-version), then re-run." >&2
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is not installed. Install Bun 1.3.13+ first: https://bun.sh" >&2
  exit 1
fi

# --- Install + build ------------------------------------------------------
if (( REBUILD_ONLY == 0 )); then
  echo "==> Installing workspace dependencies (bun install)"
  bun install
fi

echo "==> Building CLI and its workspace deps (turbo --filter @inkeep/open-knowledge)"
# turbo builds core/app/server in the right order, then the cli bundle
# (dist/cli.mjs) plus the web app, skill assets, and config schema.
bunx turbo run build --filter=@inkeep/open-knowledge

if (( REBUILD_ONLY == 1 )); then
  echo "==> Rebuild complete. Your global 'ok' already points at this build."
  exit 0
fi

# --- Replace the npm-installed CLI with a link to this build --------------
echo "==> Removing any globally npm-installed @inkeep/open-knowledge"
npm uninstall -g @inkeep/open-knowledge >/dev/null 2>&1 || true

echo "==> Linking this build globally (npm link)"
cd "$CLI_DIR"
npm link

echo
echo "Done. 'ok' and 'open-knowledge' now run your local build:"
echo "  $(command -v ok || echo '(ok not on PATH — check npm global bin is on PATH)')"
echo
echo "Verify:  ok --version"
echo "Rebuild after code changes:  scripts/local-build-cli.sh --rebuild"
