#!/bin/bash
# ==============================================================================
# Citizen Agent Builder - Environment Bootstrap Script
# Runs inside the MJAPI container or via:
#   docker compose exec api /work/scripts/bootstrap.sh
# ==============================================================================
set -e

echo "========================================================"
echo " Starting MemberJunction Citizen Builder Bootstrap"
echo "========================================================"

cd /app

# 1. Run core migrations
echo "[1/4] Ensuring core MemberJunction database migrations are applied..."
mj migrate

# 2. Install Open App (More Cheese by default, or Org-specific app)
APP_URL="${OPEN_APP_INSTALL_URL:-https://github.com/MemberJunction/more-cheese}"
echo "[2/4] Installing business context Open App: $APP_URL..."

if [ -n "$GITHUB_TOKEN" ]; then
    # Inject token into GitHub URL if private repo
    AUTH_APP_URL=$(echo "$APP_URL" | sed -E "s|https://github.com/|https://$GITHUB_TOKEN@github.com/|")
    mj app install "$AUTH_APP_URL" || echo "Warning: mj app install returned non-zero, continuing..."
else
    mj app install "$APP_URL" || echo "Warning: mj app install returned non-zero, continuing..."
fi

# 3. Generate Capabilities Catalog
echo "[3/4] Generating CAPABILITIES.md catalog from database..."
if [ -f "/work/scripts/generate-capabilities.sh" ]; then
    bash /work/scripts/generate-capabilities.sh || echo "Warning: Capability generation skipped."
fi

# 4. Push local metadata
echo "[4/4] Pushing starter metadata to local instance..."
if [ -d "/work/metadata" ]; then
    mj sync push --dir /work/metadata || echo "Initial sync completed or already up to date."
fi

echo "========================================================"
echo " MemberJunction Citizen Builder is Ready!"
echo " API: http://localhost:${API_PORT:-4000}"
echo " Database: localhost:${DB_PORT:-1433}"
echo "========================================================"
