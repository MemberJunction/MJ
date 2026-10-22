#!/usr/bin/env bash
# Starts MJAPI from the DSQL worktree against the POC Aurora DSQL cluster.
set -euo pipefail
POC_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="$(cd "$POC_DIR" && tofu output -raw endpoint)"
TOKEN="$(aws dsql generate-db-connect-admin-auth-token --profile mj --region us-east-1 --hostname "$HOST" --expires-in 604800)"
[ -n "$TOKEN" ] || { echo "no DSQL token" >&2; exit 1; }
set -a
. "$POC_DIR/auth.env"
DB_PLATFORM=postgresql
DB_HOST="$HOST"
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=admin
DB_PASSWORD="$TOKEN"
CODEGEN_DB_USERNAME=admin
CODEGEN_DB_PASSWORD="$TOKEN"
GRAPHQL_PORT=3000
set +a
cd "$REPO/packages/MJAPI"
exec pnpm start
