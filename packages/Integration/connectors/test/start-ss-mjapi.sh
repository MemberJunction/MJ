#!/usr/bin/env bash
# =============================================================================
# start-ss-mjapi.sh — ONE idempotent command to (re)start the SQL-Server E2E MJAPI.
#
# WHY THIS EXISTS: MJAPI's launch env (DB coords, RSU vars, the API key, advancedGen-off)
# was being hand-reassembled on every restart, and a single dropped var crashed it
# (missing DB creds, lost MJ_API_KEY). This script bakes EVERY var in one place so a
# restart can never "guess wrong" again. It is the single source of truth for the
# E2E MJAPI launch environment.
#
# THE ONLY THING NOT BAKED IN: MJ_API_KEY. By design the broker runs as a separate OS
# user (mjbroker) and the key lives in /Users/Shared/mj-broker/mjkey.env, which THIS
# user cannot read. So the key is sourced from a small key file you populate ONCE:
#
#     sudo grep '^MJ_API_KEY=' /Users/Shared/mj-broker/mjkey.env \
#       | sudo tee /tmp/mj-ss-e2e.env >/dev/null \
#       && sudo chown "$(whoami)" /tmp/mj-ss-e2e.env && chmod 600 /tmp/mj-ss-e2e.env
#
# After that one command, this script restarts MJAPI with `bash start-ss-mjapi.sh`
# forever — no pasting, no broker restart (the key never changes), no guessing.
#
# Usage:
#   bash packages/Integration/connectors/test/start-ss-mjapi.sh
#   MJ_API_KEY=... bash .../start-ss-mjapi.sh        # key inline (overrides key file)
#   KEY_FILE=/path/to.env bash .../start-ss-mjapi.sh # custom key file
# =============================================================================
set -uo pipefail

# --- locate repo root (this script lives in packages/Integration/connectors/test) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
MJAPI_DIR="$REPO_ROOT/packages/MJAPI"

# --- the baked, never-guessed environment ---------------------------------------
export GRAPHQL_PORT="${GRAPHQL_PORT:-4007}"

# DB: the dockerized SQL Server E2E database (sql-claude on localhost:1444)
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-1444}"
export DB_DATABASE="${DB_DATABASE:-MJ_SS_E2E}"
export DB_USERNAME="${DB_USERNAME:-sa}"
export DB_PASSWORD="${DB_PASSWORD:-Claude2Sql99}"
# CodeGen (the RSU/ApplyAll child process spawned at RUNTIME) needs DDL-capable DB creds. Without these
# the spawned codegen connects with an EMPTY user → "ConnectionError: Login failed for user ''" → every
# runtime ApplyAll fails at RunCodeGen (the connector entities never get created). Default to the same
# sa creds as the runtime connection so the spawned child inherits them.
export CODEGEN_DB_USERNAME="${CODEGEN_DB_USERNAME:-$DB_USERNAME}"
export CODEGEN_DB_PASSWORD="${CODEGEN_DB_PASSWORD:-$DB_PASSWORD}"
export DB_TRUST_SERVER_CERTIFICATE="${DB_TRUST_SERVER_CERTIFICATE:-1}"
export MJ_CORE_SCHEMA="${MJ_CORE_SCHEMA:-__mj}"

# RSU (runtime schema update) — engages only during ApplyAll; isolated work dir so it
# never writes into the repo. advancedGen is OFF in the repo-root mj.config.cjs.
export ALLOW_RUNTIME_SCHEMA_UPDATE="${ALLOW_RUNTIME_SCHEMA_UPDATE:-1}"
export RSU_WORK_DIR="${RSU_WORK_DIR:-/tmp/rsu-isolated}"
export RSU_ADDITIONAL_SCHEMA_INFO_PATH="${RSU_ADDITIONAL_SCHEMA_INFO_PATH:-$REPO_ROOT/metadata/integrations/additionalSchemaInfo.json}"

export NODE_ENV="${NODE_ENV:-development}"

# --- the one var that must come from outside: MJ_API_KEY -------------------------
KEY_FILE="${KEY_FILE:-/tmp/mj-ss-e2e.env}"
if [[ -z "${MJ_API_KEY:-}" ]]; then
  if [[ -f "$KEY_FILE" ]]; then
    # LITERAL read — never `source` this file. The key contains '#'/'$' specials; sourcing makes
    # bash treat everything after the first '#' as a comment → TRUNCATED key → 401 mismatch vs the
    # campaign's literal regex read.
    export MJ_API_KEY="$(grep -m1 '^MJ_API_KEY=' "$KEY_FILE" | cut -d= -f2-)"
    EK_FROM_FILE="$(grep -m1 '^MJ_BASE_ENCRYPTION_KEY=' "$KEY_FILE" | cut -d= -f2-)"
    [[ -n "$EK_FROM_FILE" ]] && export MJ_BASE_ENCRYPTION_KEY="$EK_FROM_FILE"
  fi
fi
if [[ -z "${MJ_API_KEY:-}" ]]; then
  cat >&2 <<EOF
ERROR: MJ_API_KEY not set and not found in $KEY_FILE.
The key must MATCH the broker's. Populate the key file ONCE (you have sudo; I don't):

  sudo grep '^MJ_API_KEY=' /Users/Shared/mj-broker/mjkey.env \\
    | sudo tee $KEY_FILE >/dev/null \\
    && sudo chown "\$(whoami)" $KEY_FILE && chmod 600 $KEY_FILE

Then re-run this script. (The key never changes, so this is a one-time step.)
EOF
  exit 2
fi

# --- MJ_BASE_ENCRYPTION_KEY: the credential-store field-encryption key -----------
# MJ: Credentials.Values is encrypted before storage (EnvVarKeySource → KeyLookupValue
# 'MJ_BASE_ENCRYPTION_KEY'); without it, CreateConnection fails with "Failed to encrypt
# field Values". This is NOT a broker secret (only MJAPI encrypts), so the launcher owns
# it: generate a 32-byte base64 key ONCE, persist it, and reuse it on every restart so
# anything encrypted with it stays decryptable. Self-managing — no user step, no guessing.
ENCKEY_FILE="${ENCKEY_FILE:-/tmp/mj-ss-e2e-enckey.env}"
if [[ -z "${MJ_BASE_ENCRYPTION_KEY:-}" && -f "$ENCKEY_FILE" ]]; then
  # LITERAL read (consistent with the key-file read above) — avoid any shell mangling of the value.
  export MJ_BASE_ENCRYPTION_KEY="$(grep -m1 '^MJ_BASE_ENCRYPTION_KEY=' "$ENCKEY_FILE" | cut -d= -f2-)"
fi
if [[ -z "${MJ_BASE_ENCRYPTION_KEY:-}" ]]; then
  GEN="$(openssl rand -base64 32)"
  ( umask 077; printf 'MJ_BASE_ENCRYPTION_KEY=%s\n' "$GEN" > "$ENCKEY_FILE" )
  export MJ_BASE_ENCRYPTION_KEY="$GEN"
  echo "generated + persisted a fresh MJ_BASE_ENCRYPTION_KEY -> $ENCKEY_FILE (stable across restarts)"
else
  export MJ_BASE_ENCRYPTION_KEY
fi

# --- RSU work dir must resolve node_modules (ESM child imports dotenv/@memberjunction/*) ---
# ApplyAll's RSU CodeGen spawns `cd $RSU_WORK_DIR && node .rsu_codegen.mjs`. As ESM it resolves
# bare imports by walking node_modules UP from that dir, so the isolated work dir needs a
# node_modules symlink to the repo's — without it the child dies with ERR_MODULE_NOT_FOUND
# (dotenv), surfacing as "ApplyAll failed: CodeGen not available". Idempotent.
mkdir -p "$RSU_WORK_DIR"
if [[ ! -e "$RSU_WORK_DIR/node_modules" ]]; then
  if ln -s "$REPO_ROOT/node_modules" "$RSU_WORK_DIR/node_modules" 2>/dev/null; then
    echo "linked $RSU_WORK_DIR/node_modules -> repo node_modules"
  else
    echo "WARN: could not link node_modules into $RSU_WORK_DIR (RSU CodeGen may fail)"
  fi
fi
# The RSU CodeGen child is spawned with a CLEAN env and reads DB creds via dotenv from the
# .env in its cwd ($RSU_WORK_DIR), NOT from MJAPI's inherited env — without it CodeGen dies
# with "Login failed for user ''". The repo .env already holds the MJ_SS_E2E coords; link it.
if [[ ! -e "$RSU_WORK_DIR/.env" && -f "$REPO_ROOT/.env" ]]; then
  ln -s "$REPO_ROOT/.env" "$RSU_WORK_DIR/.env" 2>/dev/null \
    && echo "linked $RSU_WORK_DIR/.env -> repo .env" \
    || echo "WARN: could not link .env into $RSU_WORK_DIR (RSU CodeGen DB login may fail)"
fi
# The RSU IN-PROCESS CodeGen runner calls initializeConfig(RSU_WORK_DIR). With no mj.config.cjs here it
# falls back to defaults whose RELATIVE './SQL Scripts/generated' resolves against '/' →
# "ENOENT: mkdir '/SQL Scripts/generated/__mj'" → every runtime ApplyAll fails at RunCodeGen. Drop a
# config that re-exports the repo config with output dirs anchored ABSOLUTE under THIS isolated work dir
# (generated SQL/TS land here, never the repo or '/'), and with dev-package afterCommands removed (not
# needed for a runtime schema update; they fast-fail on a cold worktree). Written every restart (cheap).
cat > "$RSU_WORK_DIR/mj.config.cjs" <<EOF
const orig = require('$REPO_ROOT/mj.config.cjs');
const path = require('path');
const wd = __dirname;
const base = { ...orig };
base.output = (orig.output || []).map((o) => {
  let d = String(o.directory || '');
  if (d.startsWith('./')) d = d.slice(2);
  return { ...o, directory: path.isAbsolute(d) ? d : path.join(wd, d) };
});
base.commands = []; // RSU runtime: skip dev-package rebuild afterCommands
module.exports = base;
EOF
echo "wrote $RSU_WORK_DIR/mj.config.cjs (output dirs absolute under work dir, no afterCommands)"

# --- guard: refuse to restart while a sync is actively running -------------------
# (a half-killed MJAPI mid-sync orphans the run; cheap COUNT via sqlcmd in docker)
RUNNING="$(docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$DB_PASSWORD" -C -d "$DB_DATABASE" -h -1 -W \
  -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.CompanyIntegrationRun WHERE EndedAt IS NULL;" 2>/dev/null | tr -d '[:space:]')"
if [[ "${RUNNING:-0}" =~ ^[0-9]+$ ]] && [[ "${RUNNING}" -gt 0 ]]; then
  echo "REFUSING to restart: ${RUNNING} active sync run(s) in progress (EndedAt IS NULL)." >&2
  echo "Wait for them to finish, or pass FORCE=1 to override." >&2
  [[ "${FORCE:-0}" != "1" ]] && exit 3
fi

# --- stop the old MJAPI on the port, wait for the port to free -------------------
OLD_PID="$(lsof -ti :"$GRAPHQL_PORT" 2>/dev/null | head -1 || true)"
if [[ -n "$OLD_PID" ]]; then
  echo "stopping old MJAPI pid=$OLD_PID on :$GRAPHQL_PORT"
  kill "$OLD_PID" 2>/dev/null || true
  for _ in $(seq 1 30); do lsof -ti :"$GRAPHQL_PORT" >/dev/null 2>&1 || break; sleep 0.5; done
  lsof -ti :"$GRAPHQL_PORT" >/dev/null 2>&1 && { kill -9 "$OLD_PID" 2>/dev/null || true; sleep 1; }
fi
if lsof -ti :"$GRAPHQL_PORT" >/dev/null 2>&1; then
  echo "ERROR: port $GRAPHQL_PORT still in use after stop attempt." >&2; exit 4
fi

# --- record the launch env (key REDACTED) so it's self-documenting forever -------
LOG="/tmp/ss-mjapi-${GRAPHQL_PORT}.log"
ENV_RECORD="/tmp/ss-mjapi-${GRAPHQL_PORT}.env-record"
{
  echo "# launched $(date -u +%Y-%m-%dT%H:%M:%SZ) by start-ss-mjapi.sh"
  for v in GRAPHQL_PORT DB_HOST DB_PORT DB_DATABASE DB_USERNAME DB_TRUST_SERVER_CERTIFICATE MJ_CORE_SCHEMA \
           ALLOW_RUNTIME_SCHEMA_UPDATE RSU_WORK_DIR RSU_ADDITIONAL_SCHEMA_INFO_PATH NODE_ENV; do
    echo "$v=${!v}"
  done
  echo "DB_PASSWORD=<redacted> MJ_API_KEY=<redacted-present>"
} > "$ENV_RECORD"

# --- launch (detached so it survives this shell) ---------------------------------
TSX_PREFLIGHT="$REPO_ROOT/node_modules/tsx/dist/preflight.cjs"
TSX_LOADER="file://$REPO_ROOT/node_modules/tsx/dist/loader.mjs"
cd "$MJAPI_DIR"
nohup node --require "$TSX_PREFLIGHT" --import "$TSX_LOADER" src/index.ts > "$LOG" 2>&1 &
NEW_PID=$!
disown 2>/dev/null || true
echo "launched MJAPI pid=$NEW_PID (log: $LOG, env: $ENV_RECORD)"

# --- wait for healthy (401/200 from the GraphQL endpoint) ------------------------
for i in $(seq 1 90); do
  if ! kill -0 "$NEW_PID" 2>/dev/null; then
    echo "ERROR: MJAPI process died during startup. Last log lines:" >&2
    tail -25 "$LOG" | sed -E 's#(MJ_API_KEY=)[^ ]*#\1<redacted>#g' >&2
    exit 5
  fi
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$GRAPHQL_PORT/" 2>/dev/null || echo 000)"
  if [[ "$CODE" == "401" || "$CODE" == "200" ]]; then
    echo "MJAPI HEALTHY on :$GRAPHQL_PORT (code $CODE) after ~$((i*2))s — pid $NEW_PID"
    exit 0
  fi
  sleep 2
done
echo "ERROR: MJAPI did not become healthy within ~180s. Last log lines:" >&2
tail -25 "$LOG" | sed -E 's#(MJ_API_KEY=)[^ ]*#\1<redacted>#g' >&2
exit 6
