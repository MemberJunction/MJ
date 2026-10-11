#!/bin/bash
# ==============================================================================
# MemberJunction Citizen Agent Builder - container entrypoint
#
# First start: installs MemberJunction into the workspace volume, loads the
# sample business data, pushes the starter agent, then runs the API and the
# Explorer web app. Later starts skip the steps that already finished.
#
# Progress is written to .mj-status.json in the workspace folder: the current
# step, how long that step usually takes, and on failure what went wrong and
# what to do. A failed step is retried once. If it fails again the container
# stays up and says so in .mj-status.json instead of exiting, because exiting
# makes Docker restart it and repeat the same failure in a loop.
# ==============================================================================
set -uo pipefail

# Paths and timings can be overridden (MJ_*) so the script can be tested without Docker.
SCRIPTS="${MJ_SCRIPTS_DIR:-/work/scripts}"
METADATA_DIR="${MJ_METADATA_DIR:-/work/metadata}"
WORKSPACE="${MJ_WORKSPACE_DIR:-/workspace}"
STATE_DIR="$WORKSPACE/.citizen-builder"
LOG_DIR="$STATE_DIR/logs"
STEPS=6
RETRY_DELAY_SECONDS="${MJ_RETRY_DELAY_SECONDS:-30}"
EXPLORER_INTERNAL_PORT="${MJ_EXPLORER_INTERNAL_PORT:-4200}" # what docker-compose.yml publishes as EXPLORER_PORT
DB_HOST="${DB_HOST:-sqlserver}"
DB_PORT="${DB_PORT:-1433}"
DB_DATABASE="${DB_DATABASE:-MemberJunction}"
API_PORT="${API_PORT:-4000}"
EXPLORER_PORT="${EXPLORER_PORT:-4202}"
API_URL="http://localhost:${API_PORT}"
EXPLORER_URL="http://localhost:${EXPLORER_PORT}"
DEFAULT_APP_URL="https://github.com/MemberJunction/more-cheese"
# GitHub API calls to have left before installing an Open App without a GITHUB_TOKEN (the anonymous
# limit is 60 an hour, shared by everyone behind the same public IP). Installing More Cheese and its
# dependencies takes about 21 (the Open App engine's install-github-api-budget test measures it);
# the rest is headroom for apps with more dependencies.
MIN_ANONYMOUS_GITHUB_CALLS=30
MAX_GITHUB_WAITS=3
EXPORTED_SETTINGS="" # names load_settings exported; start_services drops them

# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------

status() {
  node "$SCRIPTS/builder-status.mjs" "$@" || echo "warning: could not update .mj-status.json" >&2
}

# Stop setup without exiting: report the failure and keep the container up so it can be inspected.
park() {
  local summary="$1" what_to_do="$2" log_file="${3:-}"
  status fail "$summary" "$what_to_do" "$log_file"
  echo ""
  echo "========================================================================"
  echo " SETUP STOPPED: $summary"
  echo " What to do: $what_to_do"
  echo " The container stays up so you can look around (docker compose exec mj bash)."
  echo " Retry with: docker compose restart mj"
  echo "========================================================================"
  if [ -n "${MJ_EXIT_ON_PARK:-}" ]; then
    exit 3
  fi
  exec sleep infinity
}

# Re-read .env so a key or token added while setup runs is picked up without recreating the container.
load_settings() {
  local exports
  if ! exports="$(node "$SCRIPTS/workspace-settings.mjs" shell-env)"; then
    park "Could not read the settings in .env." "Check that .env is a valid KEY=value file." ""
  fi
  eval "$exports"
  EXPORTED_SETTINGS="$(sed -nE 's/^export ([A-Za-z_][A-Za-z0-9_]*)=.*/\1/p' <<<"$exports")"
}

# Run a command with its output in the container log and in a log file, refreshing the status
# heartbeat while it runs so a reader can tell a long step from a stopped one.
run_logged() {
  local log_file="$1"; shift
  ( "$@" 2>&1 | tee -a "$log_file"; exit "${PIPESTATUS[0]}" ) &
  local pid=$! ticks=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    ticks=$((ticks + 1))
    if (( ticks % 15 == 0 )); then
      status heartbeat
    fi
  done
  wait "$pid"
}

# run_step <id> <step> <label> <typical> <advice> <command...>
# Runs a setup step, retrying once after a short pause, and parks setup if it still fails.
run_step() {
  local id="$1" step="$2" label="$3" typical="$4" advice="$5"; shift 5
  local log_file="$LOG_DIR/$id.log" attempt
  for attempt in 1 2; do
    status phase "$id" "$step" "$STEPS" "$label" "$typical"
    echo ""
    echo "[$step/$STEPS] $label (usually $typical)"
    if run_logged "$log_file" "$@"; then
      return 0
    fi
    if (( attempt == 1 )); then
      echo "Step '$label' failed. Retrying once in ${RETRY_DELAY_SECONDS}s; it resumes where it stopped."
      sleep "$RETRY_DELAY_SECONDS"
    fi
  done
  park "$label failed twice." "$advice" "$log_file"
}

# ------------------------------------------------------------------------------
# Steps
# ------------------------------------------------------------------------------

wait_for_database() {
  status phase database 1 "$STEPS" "Waiting for the database" "under a minute"
  echo "[1/$STEPS] Waiting for the database at ${DB_HOST}:${DB_PORT}..."
  local tries=0
  until node -e "
    const socket = require('net').connect(${DB_PORT}, '${DB_HOST}', () => { socket.destroy(); process.exit(0); });
    socket.on('error', () => process.exit(1));
    setTimeout(() => process.exit(1), 2000);
  " 2>/dev/null; do
    tries=$((tries + 1))
    if (( tries >= 60 )); then
      park "The database did not answer within 5 minutes." \
        "Check the sqlserver container: docker compose logs sqlserver. It needs about 2 GB of Docker memory." ""
    fi
    sleep 3
  done
}

# A workspace provisioned by an earlier version of this script kept no state. Its package.json means
# `mj install` completed and every later step ran, so treat it as provisioned: re-running
# `mj app install` against its already-installed app would fail.
adopt_legacy_workspace() {
  if [ -f "$WORKSPACE/package.json" ] && [ ! -d "$STATE_DIR" ]; then
    mkdir -p "$STATE_DIR"
    touch "$STATE_DIR/core-installed" "$STATE_DIR/app-installed" "$STATE_DIR/provisioned"
  fi
  mkdir -p "$STATE_DIR" "$LOG_DIR"
}

install_core() {
  local config="${TMPDIR:-/tmp}/mj-install.config.json"
  node "$SCRIPTS/workspace-settings.mjs" install-config "$config" || return 1
  # The release this workspace is pinned to: the same release as the CLI in this container.
  mj install --yes --fast --config "$config" --dir "$WORKSPACE" --tag "v${MJ_VERSION}"
  local result=$?
  rm -f "$config"
  return $result
}

install_or_update_core() {
  if [ ! -f "$STATE_DIR/core-installed" ]; then
    run_step install 2 "Installing MemberJunction" "10 to 25 minutes the first time" \
      "Read the error in .mj-status.json. 'Login failed' or a connection error means the database is not reachable: check 'docker compose logs sqlserver'. An out-of-memory kill means Docker needs at least 12 GB of memory." \
      install_core
    touch "$STATE_DIR/core-installed"
  else
    run_step install 2 "Checking for MemberJunction database updates" "under a minute" \
      "Read the error in .mj-status.json, then retry with 'docker compose restart mj'." \
      mj migrate
  fi
}

apply_settings() {
  status phase settings 3 "$STEPS" "Applying your settings from .env" "a few seconds"
  echo "[3/$STEPS] Applying your settings from .env..."
  node "$SCRIPTS/workspace-settings.mjs" sync >/dev/null \
    || park "Could not apply the settings in .env to the installed workspace." \
      "Read the error above in 'docker compose logs mj'." ""
}

# Explorer's build imports every client package an Open App lists. Packages that are not Angular
# libraries cannot be bundled for the browser (one sample app lists a standalone web widget whose
# published package has no entry file), so leave only the -ng packages enabled on the client.
disable_unbundleable_client_packages() {
  node -e "
    const fs = require('fs');
    const file = '$WORKSPACE/mj.config.cjs';
    if (!fs.existsSync(file)) process.exit(0);
    const config = require(file);
    const client = config.dynamicPackages && config.dynamicPackages.client;
    if (!Array.isArray(client)) process.exit(0);
    let changed = false;
    for (const entry of client) {
      const bundleable = entry.PackageName.endsWith('-ng') && entry.PackageName !== '@mj-biz-apps/sonar-ng';
      if (!bundleable && entry.Enabled !== false) { entry.Enabled = false; changed = true; }
    }
    if (!changed) process.exit(0);
    const code = fs.readFileSync(file, 'utf8')
      .replace(/client:\s*\[[\s\S]*?\]\s*\},/m, 'client: ' + JSON.stringify(client, null, 2) + '\n  },');
    fs.writeFileSync(file, code);
  " || status warn "Could not check which Open App packages Explorer can bundle."
}

# "<remaining> <reset-epoch-seconds>" for the GitHub token in use, or nothing when GitHub is unreachable.
github_quota() {
  node -e "
    const headers = { 'User-Agent': 'mj-citizen-builder', Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
    fetch('https://api.github.com/rate_limit', { headers, signal: AbortSignal.timeout(10000) })
      .then((r) => r.json())
      .then((j) => console.log(j.resources.core.remaining, j.resources.core.reset))
      .catch(() => {});
  " 2>/dev/null
}

# Without a token GitHub allows 60 API requests an hour. Wait for the allowance to reset instead of
# failing part way, and continue at once if a GITHUB_TOKEN appears in .env meanwhile.
wait_for_github_allowance() {
  local waits=0 quota remaining reset until
  while [ -z "${GITHUB_TOKEN:-}" ]; do
    quota="$(github_quota)"
    remaining="${quota%% *}"; reset="${quota##* }"
    if [ -z "$quota" ] || (( remaining >= MIN_ANONYMOUS_GITHUB_CALLS )); then
      return 0
    fi
    waits=$((waits + 1))
    if (( waits > MAX_GITHUB_WAITS * 60 )); then
      status resume
      return 1
    fi
    until="$(date -u -d "@${reset}" +%Y-%m-%dT%H:%M:%SZ)"
    status waiting "GitHub allows 60 requests an hour without a token, and $remaining are left. Setup continues on its own at $until (UTC), or at once if you add a GITHUB_TOKEN to .env." "$until"
    sleep 60
    load_settings
  done
  if (( waits > 0 )); then
    status resume
  fi
}

install_app() {
  local url="$1" output_file="$LOG_DIR/app-install-last.log"
  wait_for_github_allowance || return 1
  # Stream the output as it arrives (the install can take half an hour) and keep a copy to inspect.
  mj app install "$url" 2>&1 | tee "$output_file"
  local result="${PIPESTATUS[0]}"
  if (( result != 0 )) && grep -qE "already installed with status '(Active|Disabled)'" "$output_file"; then
    return 0 # An earlier attempt finished the install before the container stopped.
  fi
  return "$result"
}

install_sample_data() {
  local url="${OPEN_APP_INSTALL_URL:-$DEFAULT_APP_URL}"
  if [ -f "$STATE_DIR/app-installed" ]; then
    return 0
  fi
  if [ "$url" = "none" ]; then
    status warn "No sample data app is installed (OPEN_APP_INSTALL_URL=none)."
    touch "$STATE_DIR/app-installed"
    return 0
  fi
  run_step sample-data 4 "Loading the sample business data ($url)" "10 to 30 minutes the first time" \
    "Read the error in .mj-status.json. 'rate limit' means GitHub's hourly allowance ran out: add a GITHUB_TOKEN to .env (a token with read access to public repositories is enough), then 'docker compose restart mj'." \
    install_app "$url"
  touch "$STATE_DIR/app-installed"
}

# Pushed on the first start only: a push on every start would overwrite edits made in Explorer with
# the files' contents. The starter agent is an example, so a failure here is a warning, not a stop.
push_starter_metadata() {
  local log_file="$LOG_DIR/starter-agent.log"
  if [ -f "$STATE_DIR/provisioned" ]; then
    return 0
  fi
  status phase starter-agent 5 "$STEPS" "Loading the starter agent" "under a minute"
  echo "[5/$STEPS] Loading the starter agent from metadata/..."
  # --ci: never prompt (there is no terminal here) and exit non-zero on error.
  if ! run_logged "$log_file" mj sync push --dir "$METADATA_DIR" --ci; then
    status warn "Pushing metadata/ failed, so the agents in it are not in the database. Fix the error in $log_file, then run ./scripts/sync-metadata.sh."
  fi
}

start_services() {
  status phase start 6 "$STEPS" "Starting the API and the Explorer web app" "2 to 6 minutes"
  echo "[6/$STEPS] Starting the API and the Explorer web app..."
  cd "$WORKSPACE" || park "The installed workspace is missing." "Remove the workspace volume and start again." ""
  # The services read keys and the encryption key from the files apply_settings keeps current.
  # Drop the copies exported for the setup steps first: dotenv never overrides a variable that is
  # already set, and pm2 keeps a service's environment across restarts, so an empty or stale copy
  # would hide a key added to .env later.
  local name
  for name in $EXPORTED_SETTINGS; do
    unset "$name"
  done
  pm2 delete all >/dev/null 2>&1 || true
  pm2 start "npm run start:api" --name mjapi
  pm2 start "npm run start:explorer" --name mjexplorer
}

# wait_for_url <url> <minutes> : succeeds once the URL answers with any HTTP status.
wait_for_url() {
  local url="$1" minutes="$2" waited=0
  until node -e "fetch('$url', { signal: AbortSignal.timeout(5000) }).then(() => process.exit(0), () => process.exit(1))"; do
    waited=$((waited + 10))
    if (( waited >= minutes * 60 )); then
      return 1
    fi
    sleep 10
    (( waited % 30 == 0 )) && status heartbeat
  done
}

wait_until_serving() {
  if ! wait_for_url "http://localhost:${API_PORT}/healthcheck" 10; then
    pm2 logs mjapi --nostream --lines 80 > "$LOG_DIR/api.log" 2>&1
    park "The API did not start within 10 minutes." "Read the API log in .mj-status.json (or: docker compose exec mj pm2 logs mjapi)." "$LOG_DIR/api.log"
  fi
  if ! wait_for_url "http://localhost:${EXPLORER_INTERNAL_PORT}/" 15; then
    pm2 logs mjexplorer --nostream --lines 80 > "$LOG_DIR/explorer.log" 2>&1
    park "The Explorer web app did not start within 15 minutes." "Read the Explorer log in .mj-status.json (or: docker compose exec mj pm2 logs mjexplorer)." "$LOG_DIR/explorer.log"
  fi
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------

main() {
  status start
  echo "========================================================================"
  echo " MemberJunction Citizen Agent Builder (MemberJunction ${MJ_VERSION:-unknown})"
  echo " Progress is written to .mj-status.json in your workspace folder."
  echo "========================================================================"
  if [ -z "${MJ_VERSION:-}" ]; then
    park "MJ_VERSION is not set." "Set MJ_VERSION in .env to the MemberJunction release to install, then 'docker compose up -d --build'." ""
  fi
  local problems
  if ! problems="$(node "$SCRIPTS/workspace-settings.mjs" check)"; then
    park "A setting in .env is not valid: $(grep '^error:' <<<"$problems" | sed 's/^error: //' | head -1)" \
      "Fix it in .env, then 'docker compose restart mj'." ""
  fi
  while IFS= read -r warning; do
    [ -n "$warning" ] && status warn "${warning#warning: }"
  done < <(grep '^warning:' <<<"$problems")
  load_settings

  adopt_legacy_workspace
  wait_for_database
  install_or_update_core
  apply_settings
  install_sample_data
  disable_unbundleable_client_packages
  push_starter_metadata
  touch "$STATE_DIR/provisioned"
  start_services
  wait_until_serving
  status ready "$EXPLORER_URL" "$API_URL"
  echo "========================================================================"
  echo " MemberJunction is running."
  echo "   Explorer web app: $EXPLORER_URL"
  echo "   API:              $API_URL"
  echo "   Database:         localhost:${HOST_DB_PORT:-1433} (database ${DB_DATABASE})"
  echo "========================================================================"
  exec pm2 logs
}

main "$@"
