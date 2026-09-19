#!/bin/bash
# ==============================================================================
# MemberJunction Citizen Agent Builder - Container Entrypoint
# Automates first-time installation via `mj install`, database provisioning,
# Open App installation, and starts both MJAPI (:4000) and MJExplorer (:4200).
# ==============================================================================
set -e

echo "========================================================================"
echo " Starting MemberJunction Runtime Container"
echo "========================================================================"

DB_HOST="${DB_HOST:-sqlserver}"
DB_PORT="${DB_PORT:-1433}"
DB_PASSWORD="${DB_PASSWORD:-TestPassword123!}"
DB_DATABASE="${DB_DATABASE:-MemberJunction}"

# 1. Wait for SQL Server to be accessible
echo "Waiting for SQL Server ($DB_HOST:$DB_PORT) to be ready..."
until node -e "
  const net = require('net');
  const client = net.connect($DB_PORT, '$DB_HOST', () => {
    client.destroy();
    process.exit(0);
  });
  client.on('error', () => process.exit(1));
  setTimeout(() => process.exit(1), 2000);
" 2>/dev/null; do
  echo "  Waiting for database connection..."
  sleep 3
done
echo "SQL Server is reachable!"

cd /workspace

# 2. First-time setup: install MemberJunction if not already installed
if [ ! -f "/workspace/package.json" ]; then
  echo ""
  echo "========================================================================"
  echo " First-Time Setup: Installing MemberJunction via 'mj install'..."
  echo " This runs once and initializes your database, API, and Explorer."
  echo "========================================================================"

  # Generate install configuration
  cat << EOF > /tmp/install.config.json
{
  "PackageManager": "pnpm",
  "dbUrl": "$DB_HOST",
  "dbInstance": "",
  "dbTrustServerCertificate": "Y",
  "dbDatabase": "$DB_DATABASE",
  "dbPort": $DB_PORT,
  "codeGenLogin": "sa",
  "codeGenPwD": "$DB_PASSWORD",
  "mjAPILogin": "sa",
  "mjAPIPwD": "$DB_PASSWORD",
  "graphQLPort": 4000,
  "authType": "Local",
  "createNewUser": "Y",
  "userEmail": "admin@memberjunction.org",
  "userFirstName": "Admin",
  "userLastName": "User",
  "userName": "admin",
  "openAIAPIKey": "${AI_VENDOR_API_KEY__OpenAILLM:-}",
  "anthropicAPIKey": "${AI_VENDOR_API_KEY__AnthropicLLM:-}",
  "geminiAPIKey": "${AI_VENDOR_API_KEY__GeminiLLM:-}"
}
EOF

  # Execute headless install
  mj install --yes --fast --config /tmp/install.config.json --dir /workspace

  # Install Open App business context (More Cheese default or custom enterprise app)
  APP_URL="${OPEN_APP_INSTALL_URL:-https://github.com/MemberJunction/more-cheese}"
  echo "Installing business context Open App: $APP_URL..."
  if [ -n "$GITHUB_TOKEN" ]; then
    AUTH_APP_URL=$(echo "$APP_URL" | sed -E "s|https://github.com/|https://$GITHUB_TOKEN@github.com/|")
    mj app install "$AUTH_APP_URL" || echo "Notice: mj app install completed or skipped."
  else
    mj app install "$APP_URL" || echo "Notice: mj app install completed or skipped."
  fi

  # Generate capabilities catalog
  if [ -f "/work/scripts/generate-capabilities.sh" ]; then
    bash /work/scripts/generate-capabilities.sh || echo "Notice: Capabilities generation completed."
  fi

  # Push starter metadata
  if [ -d "/work/metadata" ]; then
    mj sync push --dir /work/metadata || echo "Notice: Initial metadata push completed."
  fi

  echo "MemberJunction installation and provisioning complete!"
else
  echo "Existing MemberJunction workspace detected in /workspace."
  # Apply any pending migrations
  mj migrate || echo "Database migrations up to date."
fi

# 3. Start MJAPI and MJExplorer services via PM2
echo "Starting MJAPI and MJExplorer services..."
pm2 delete all 2>/dev/null || true

# Start API service
if [ -f "package.json" ]; then
  if grep -q "start:api" package.json; then
    pm2 start "npm run start:api" --name mjapi
  elif [ -d "apps/MJAPI" ]; then
    pm2 start "cd apps/MJAPI && npm start" --name mjapi
  else
    pm2 start "npm start" --name mjapi
  fi
fi

# Start Explorer service
if [ -f "package.json" ]; then
  if grep -q "start:explorer" package.json; then
    pm2 start "npm run start:explorer" --name mjexplorer
  elif [ -d "apps/MJExplorer" ]; then
    pm2 start "cd apps/MJExplorer && npm start" --name mjexplorer
  fi
fi

echo "========================================================================"
echo " 🎉 MemberJunction Stack is Running!"
echo "    MJAPI:       http://localhost:4000 (GraphQL & API)"
echo "    MJExplorer:  http://localhost:4200 (Web Interface)"
echo "    Database:    localhost:$DB_PORT (DB: $DB_DATABASE)"
echo "========================================================================"

# Keep container running and stream logs
exec pm2 logs
