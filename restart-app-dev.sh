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

port="${VITE_PORT:-5173}"
url="http://localhost:${port}/"

# Start the dev server in the background so we can wait for it to come up,
# print the URL to open, then hand the terminal back to the server.
bun run --filter @inkeep/open-knowledge-app dev "$@" &
dev_pid=$!

# Forward Ctrl-C / termination to the dev server.
trap 'kill -TERM "$dev_pid" 2>/dev/null || true' INT TERM

# Wait for the port to start accepting connections (up to ~60s).
for _ in {1..120}; do
  if ! kill -0 "$dev_pid" 2>/dev/null; then
    break
  fi
  if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
    exec 3>&- 3<&-
    echo
    echo "[restart-app-dev] ┌────────────────────────────────────────────────"
    echo "[restart-app-dev] │ App dev server ready — open:"
    echo "[restart-app-dev] │   ${url}"
    echo "[restart-app-dev] └────────────────────────────────────────────────"
    echo
    break
  fi
  sleep 0.5
done

wait "$dev_pid"
