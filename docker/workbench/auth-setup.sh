#!/bin/bash
# ─── Auth0 & Environment Setup for MJ Workbench ────────────────────────────────
#
# This script configures Auth0 credentials and Angular environment files
# needed to run MJAPI and MJExplorer inside the Docker workbench.
#
# It is run automatically on first boot (or when Auth0 vars are missing from .env),
# and can also be invoked manually:
#
#   auth-setup              # Interactive prompts
#   auth-setup --check      # Just check if setup is complete (exit 0 if yes, 1 if no)
#
set -e

MJ_DIR="/workspace/MJ"
ENV_FILE="$MJ_DIR/.env"
MJAPI_ENV="$MJ_DIR/packages/MJAPI/.env"
ENVIRONMENTS_DIR="$MJ_DIR/packages/MJExplorer/src/environments"

# ─── Check mode: exit 0 if Auth0 is configured, 1 if not ───────────────────────
if [ "$1" = "--check" ]; then
    if [ -f "$ENV_FILE" ] && grep -q "^AUTH0_DOMAIN=." "$ENV_FILE" 2>/dev/null; then
        exit 0
    else
        exit 1
    fi
fi

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │     MJ Workbench — Auth0 Setup          │"
echo "  └─────────────────────────────────────────┘"
echo ""
echo "  MJAPI and MJExplorer need Auth0 credentials to run."
echo "  You'll need a test Auth0 tenant with a SPA application configured."
echo ""
echo "  These values will be saved to $ENV_FILE"
echo "  and used to generate Angular environment files."
echo ""

# ─── Prompt for each variable ──────────────────────────────────────────────────
read -rp "  Auth0 Domain (e.g. myapp.us.auth0.com): " INPUT_AUTH0_DOMAIN
read -rp "  Auth0 Client ID: " INPUT_AUTH0_CLIENT_ID
read -rp "  Auth0 Client Secret: " INPUT_AUTH0_CLIENT_SECRET
read -rp "  Test User Email (for browser automation login): " INPUT_TEST_UID
read -rsp "  Test User Password: " INPUT_TEST_PWD
echo ""  # newline after hidden input

# ─── Validate inputs ──────────────────────────────────────────────────────────
if [ -z "$INPUT_AUTH0_DOMAIN" ] || [ -z "$INPUT_AUTH0_CLIENT_ID" ] || [ -z "$INPUT_AUTH0_CLIENT_SECRET" ]; then
    echo ""
    echo "  ERROR: Auth0 Domain, Client ID, and Client Secret are required."
    echo "  Run 'auth-setup' again to retry."
    exit 1
fi

# ─── Append Auth0 variables to .env ────────────────────────────────────────────
# Remove any existing Auth0 / test credential lines first
if [ -f "$ENV_FILE" ]; then
    # Strip existing Auth0 and test credential lines
    sed -i '/^# ─── Auth0/d' "$ENV_FILE"
    sed -i '/^AUTH0_DOMAIN=/d' "$ENV_FILE"
    sed -i '/^AUTH0_CLIENT_ID=/d' "$ENV_FILE"
    sed -i '/^AUTH0_CLIENT_SECRET=/d' "$ENV_FILE"
    sed -i '/^TEST_AUTH0_DOMAIN=/d' "$ENV_FILE"
    sed -i '/^TEST_AUTH0_CLIENT_ID=/d' "$ENV_FILE"
    sed -i '/^TEST_AUTH0_CLIENT_SECRET=/d' "$ENV_FILE"
    sed -i '/^TEST_UID=/d' "$ENV_FILE"
    sed -i '/^TEST_PWD=/d' "$ENV_FILE"
    sed -i '/^# Test credentials for browser automation/d' "$ENV_FILE"
    # Remove trailing blank lines
    sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$ENV_FILE"
fi

cat >> "$ENV_FILE" << EOF

# ─── Auth0 Configuration (used by MJAPI) ───────────────────────────────────────
AUTH0_DOMAIN=${INPUT_AUTH0_DOMAIN}
AUTH0_CLIENT_ID=${INPUT_AUTH0_CLIENT_ID}
AUTH0_CLIENT_SECRET=${INPUT_AUTH0_CLIENT_SECRET}

# Test credentials for browser automation (used by Claude Code for headless login)
TEST_AUTH0_DOMAIN=${INPUT_AUTH0_DOMAIN}
TEST_AUTH0_CLIENT_ID=${INPUT_AUTH0_CLIENT_ID}
TEST_AUTH0_CLIENT_SECRET=${INPUT_AUTH0_CLIENT_SECRET}
TEST_UID=${INPUT_TEST_UID}
TEST_PWD=${INPUT_TEST_PWD}
EOF

echo ""
echo "  Updated $ENV_FILE with Auth0 credentials."

# ─── Symlink .env into packages/MJAPI/ ─────────────────────────────────────────
if [ -f "$MJAPI_ENV" ] && [ ! -L "$MJAPI_ENV" ]; then
    # Back up existing non-symlink .env
    mv "$MJAPI_ENV" "$MJAPI_ENV.bak"
    echo "  Backed up existing $MJAPI_ENV to .env.bak"
fi
if [ ! -L "$MJAPI_ENV" ]; then
    ln -sf "$ENV_FILE" "$MJAPI_ENV"
    echo "  Symlinked $ENV_FILE → $MJAPI_ENV"
else
    echo "  Symlink $MJAPI_ENV already exists."
fi

# ─── Create Angular environment files ──────────────────────────────────────────
mkdir -p "$ENVIRONMENTS_DIR"

# Base environment (used by production build)
cat > "$ENVIRONMENTS_DIR/environment.ts" << ENVTS
export const environment = {
  GRAPHQL_URI: 'http://localhost:4000/',
  GRAPHQL_WS_URI: 'ws://localhost:4000/',
  REDIRECT_URI: 'http://localhost:4200/',
  AUTH_TYPE: 'auth0',
  NODE_ENV: 'production',
  AUTOSAVE_DEBOUNCE_MS: 1200,
  SEARCH_DEBOUNCE_MS: 800,
  MIN_SEARCH_LENGTH: 3,
  MJ_CORE_SCHEMA_NAME: '__mj',
  production: true,
  APPLICATION_NAME: 'MemberJunction Explorer',
  APPLICATION_INSTANCE: 'DOCKER',
  AUTH0_DOMAIN: '${INPUT_AUTH0_DOMAIN}',
  AUTH0_CLIENTID: '${INPUT_AUTH0_CLIENT_ID}',
} as const;
ENVTS

# Development environment (used by ng serve / npm start)
cat > "$ENVIRONMENTS_DIR/environment.development.ts" << ENVTS
export const environment = {
  GRAPHQL_URI: 'http://localhost:4000/',
  GRAPHQL_WS_URI: 'ws://localhost:4000/',
  REDIRECT_URI: 'http://localhost:4200/',
  AUTH_TYPE: 'auth0',
  NODE_ENV: 'development',
  AUTOSAVE_DEBOUNCE_MS: 1200,
  SEARCH_DEBOUNCE_MS: 800,
  MIN_SEARCH_LENGTH: 3,
  MJ_CORE_SCHEMA_NAME: '__mj',
  production: false,
  APPLICATION_NAME: 'MemberJunction Explorer',
  APPLICATION_INSTANCE: 'DEV',
  AUTH0_DOMAIN: '${INPUT_AUTH0_DOMAIN}',
  AUTH0_CLIENTID: '${INPUT_AUTH0_CLIENT_ID}',
} as const;
ENVTS

# Staging environment (same as dev for workbench purposes)
cat > "$ENVIRONMENTS_DIR/environment.staging.ts" << ENVTS
export const environment = {
  GRAPHQL_URI: 'http://localhost:4000/',
  GRAPHQL_WS_URI: 'ws://localhost:4000/',
  REDIRECT_URI: 'http://localhost:4200/',
  AUTH_TYPE: 'auth0',
  NODE_ENV: 'staging',
  AUTOSAVE_DEBOUNCE_MS: 1200,
  SEARCH_DEBOUNCE_MS: 800,
  MIN_SEARCH_LENGTH: 3,
  MJ_CORE_SCHEMA_NAME: '__mj',
  production: false,
  APPLICATION_NAME: 'MemberJunction Explorer',
  APPLICATION_INSTANCE: 'STAGING',
  AUTH0_DOMAIN: '${INPUT_AUTH0_DOMAIN}',
  AUTH0_CLIENTID: '${INPUT_AUTH0_CLIENT_ID}',
} as const;
ENVTS

echo "  Created Angular environment files in $ENVIRONMENTS_DIR"

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │     Setup Complete!                     │"
echo "  └─────────────────────────────────────────┘"
echo ""
echo "  Auth0 domain:    ${INPUT_AUTH0_DOMAIN}"
echo "  Client ID:       ${INPUT_AUTH0_CLIENT_ID:0:8}..."
echo "  Test user:       ${INPUT_TEST_UID}"
echo ""
echo "  .env:            $ENV_FILE"
echo "  MJAPI symlink:   $MJAPI_ENV → $ENV_FILE"
echo "  Environments:    $ENVIRONMENTS_DIR/"
echo ""
echo "  Next steps:"
echo "    db-bootstrap     # Create MJ database + run migrations"
echo "    mjapi             # Start MJAPI server"
echo "    mjui              # Start MJ Explorer"
echo ""
