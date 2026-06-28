#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
app_dir="$repo_root/packages/app"

find_dev_server_pids() {
  local proc pid cmdline cwd
  for proc in /proc/[0-9]*; do
    pid="${proc##*/}"
    [[ -r "$proc/cmdline" ]] || continue
    [[ -L "$proc/cwd" ]] || continue

    cmdline="$(tr '\0' ' ' < "$proc/cmdline" 2>/dev/null || true)"
    [[ "$cmdline" == *vite* ]] || continue

    cwd="$(readlink -f "$proc/cwd" 2>/dev/null || true)"
    if [[ "$cwd" == "$repo_root" || "$cwd" == "$app_dir" ]]; then
      printf '%s\n' "$pid"
    fi
  done
}

stop_existing_dev_servers() {
  mapfile -t pids < <(find_dev_server_pids | sort -u)
  if ((${#pids[@]} == 0)); then
    echo "[restart-app-dev] No existing repo Vite dev server found."
    return
  fi

  echo "[restart-app-dev] Stopping existing repo Vite dev server(s): ${pids[*]}"
  kill -TERM "${pids[@]}" 2>/dev/null || true

  for _ in {1..20}; do
    local remaining=()
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        remaining+=("$pid")
      fi
    done
    if ((${#remaining[@]} == 0)); then
      echo "[restart-app-dev] Existing dev server stopped."
      return
    fi
    sleep 0.5
  done

  echo "[restart-app-dev] Escalating to SIGKILL for: ${pids[*]}"
  kill -KILL "${pids[@]}" 2>/dev/null || true
}

stop_existing_dev_servers

cd "$repo_root"
exec bun run --filter @inkeep/open-knowledge-app dev "$@"
