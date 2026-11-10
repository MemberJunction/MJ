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

# 2. Provisioning. State lives on the workspace volume so it survives restarts, and each step
#    that must not run twice records its own completion: `mj app install` of an app that is
#    already installed is an error, so a failure in a LATER step has to be retried on restart
#    without re-running an earlier one. Failures are not masked. With `set -e` a failed step
#    exits the container loudly (see `docker compose logs mj`), `restart: unless-stopped`
#    retries it, and nothing reports success until every step has actually succeeded.
STATE_DIR="/workspace/.citizen-builder"

# A workspace provisioned by an earlier version of this script kept no state. Its package.json
# means `mj install` completed and the old script then ran every remaining step, so treat it as
# provisioned: re-running `mj app install` against its already-installed app would fail.
if [ -f "/workspace/package.json" ] && [ ! -d "$STATE_DIR" ]; then
  mkdir -p "$STATE_DIR"
  touch "$STATE_DIR/core-installed" "$STATE_DIR/app-installed" "$STATE_DIR/provisioned"
fi
mkdir -p "$STATE_DIR"

if [ ! -f "$STATE_DIR/provisioned" ]; then
  echo ""
  echo "========================================================================"
  echo " First-Time Setup: Installing MemberJunction via 'mj install'..."
  echo " This runs once and initializes your database, API, and Explorer."
  echo "========================================================================"

  if [ ! -f "$STATE_DIR/core-installed" ]; then
    # Generate install configuration safely via JSON.stringify so special characters in passwords/keys are escaped
    node -e "
      const fs = require('fs');
      const cfg = {
        PackageManager: 'pnpm',
        DatabaseHost: process.env.DB_HOST || 'sqlserver',
        DatabasePort: Number(process.env.DB_PORT || 1433),
        DatabaseName: process.env.DB_DATABASE || 'MemberJunction',
        DatabaseTrustCert: true,
        DatabaseAdminUser: 'sa',
        DatabaseAdminPassword: process.env.DB_PASSWORD || '',
        CodeGenUser: 'sa',
        CodeGenPassword: process.env.DB_PASSWORD || '',
        APIUser: 'sa',
        APIPassword: process.env.DB_PASSWORD || '',
        APIPort: 4000,
        AuthProvider: 'local',
        BaseEncryptionKey: process.env.MJ_BASE_ENCRYPTION_KEY || 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
        CreateNewUser: {
          Username: 'admin',
          Email: 'admin@memberjunction.org',
          FirstName: 'Admin',
          LastName: 'User'
        },
        OpenAIKey: process.env.AI_VENDOR_API_KEY__OpenAILLM || '',
        AnthropicKey: process.env.AI_VENDOR_API_KEY__AnthropicLLM || '',
        GeminiKey: process.env.AI_VENDOR_API_KEY__GeminiLLM || '',
        MistralKey: process.env.AI_VENDOR_API_KEY__MistralLLM || ''
      };
      fs.writeFileSync('/tmp/install.config.json', JSON.stringify(cfg, null, 2), { mode: 0o600 });
    "

    # Install the release this workspace is pinned to (MJ_VERSION, the same release as the CLI
    # in this container). Without a tag, `mj install --yes` takes the newest stable GitHub
    # release, which need not match that CLI.
    INSTALL_TAG_ARGS=()
    if [ -n "${MJ_VERSION:-}" ]; then
      INSTALL_TAG_ARGS=(--tag "v${MJ_VERSION}")
    else
      echo "WARNING: MJ_VERSION is not set; 'mj install' will pick the newest stable release, which may not match this container's CLI."
    fi

    # Execute headless install. Safe to retry: the installer checkpoints completed phases.
    mj install --yes --fast --config /tmp/install.config.json --dir /workspace "${INSTALL_TAG_ARGS[@]}"
    rm -f /tmp/install.config.json
    touch "$STATE_DIR/core-installed"
    pnpm add -w @angular/compiler@21.2.22 2>/dev/null || true
  fi

  # Install Open App business context (More Cheese default or custom enterprise app)
  # Note: GITHUB_TOKEN is read directly from the environment by OpenAppEngine's GitHubClient
  if [ ! -f "$STATE_DIR/app-installed" ]; then
    APP_URL="${OPEN_APP_INSTALL_URL:-https://github.com/MemberJunction/more-cheese}"
    echo "Installing business context Open App: $APP_URL..."
    mj app install "$APP_URL"
    touch "$STATE_DIR/app-installed"
  fi

  # Generate capabilities catalog. Useful to the coding agent but not needed for a running
  # stack, so a failure warns instead of stopping the container, and says what it means.
  if [ -f "/work/scripts/generate-capabilities.sh" ]; then
    bash /work/scripts/generate-capabilities.sh \
      || echo "WARNING: capabilities catalog generation failed, so the catalog may be missing or stale. Re-run scripts/generate-capabilities.sh."
  fi

  # Push starter metadata. --ci: never prompt (there is no terminal here), create
  # Template records for @file: prompt templates on first push, and exit non-zero on error.
  if [ -d "/work/metadata" ]; then
    mj sync push --dir /work/metadata --ci
  fi

  touch "$STATE_DIR/provisioned"
  echo "MemberJunction installation and provisioning complete!"
else
  echo "Existing MemberJunction workspace detected in /workspace."
  # Apply any pending migrations (exits 0 when already up to date)
  mj migrate
fi

# Configure MJExplorer host binding and compiler alignment
if [ -f "apps/MJExplorer/package.json" ]; then
  node -e "
    const fs = require('fs');
    const p = 'apps/MJExplorer/package.json';
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    let changed = false;
    if (pkg.scripts && pkg.scripts.start && !pkg.scripts.start.includes('--host 0.0.0.0')) {
      pkg.scripts.start = pkg.scripts.start.replace('ng serve', 'ng serve --host 0.0.0.0 --port 4200');
      changed = true;
    }
    const cliVer = (pkg.devDependencies && pkg.devDependencies['@angular/compiler-cli']) || '21.2.22';
    if (pkg.dependencies && pkg.dependencies['@angular/compiler'] !== cliVer) {
      pkg.dependencies['@angular/compiler'] = cliVer;
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
    }
  "
fi

# Ensure turbo.json passes through AI vendor API keys, DB settings, and MJ_DEV_AUTH_ENABLED to child processes
if [ -f "turbo.json" ]; then
  node -e "
    const fs = require('fs');
    try {
      const turbo = JSON.parse(fs.readFileSync('turbo.json', 'utf8'));
      const passThrough = new Set(turbo.globalPassThroughEnv || []);
      let changed = false;
      for (const entry of ['AI_VENDOR_API_KEY__*', 'MJ_*', 'DB_*', 'CODEGEN_DB_*', 'GRAPHQL_*', 'OPEN_APP_*', 'GITHUB_TOKEN']) {
        if (!passThrough.has(entry)) {
          passThrough.add(entry);
          changed = true;
        }
      }
      if (changed) {
        turbo.globalPassThroughEnv = Array.from(passThrough);
        fs.writeFileSync('turbo.json', JSON.stringify(turbo, null, 2) + '\n');
      }
    } catch (e) {
      console.warn('Notice: turbo.json check skipped:', e.message);
    }
  "
fi

# Sync container environment variables (API keys, encryption key, DB_USER, local dev auth) into workspace .env files
export MJ_DEV_AUTH_ENABLED="${MJ_DEV_AUTH_ENABLED:-true}"

# Local dev auth through Docker's published port: MJAPI sees the host browser as the Docker
# bridge gateway, which it only accepts with an explicit opt-in AND a shared secret (every
# remote client would look the same under Docker NAT). Generate a fresh secret per container
# start unless one is supplied, and hand the same value to MJAPI and to the Explorer build.
# Trade-off: the secret ships in the Explorer browser bundle, so it only proves a request came
# through this Explorer build. That is acceptable because docker-compose.yml publishes the
# ports on 127.0.0.1 only; do not widen that binding while local dev auth is enabled.
if [ "$MJ_DEV_AUTH_ENABLED" = "true" ]; then
  export MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE="true"
  MJ_DEV_AUTH_BRIDGE_SECRET="${MJ_DEV_AUTH_BRIDGE_SECRET:-}"
  if [ "${#MJ_DEV_AUTH_BRIDGE_SECRET}" -lt 16 ]; then
    if [ -n "$MJ_DEV_AUTH_BRIDGE_SECRET" ]; then
      echo "Notice: MJ_DEV_AUTH_BRIDGE_SECRET is shorter than 16 characters; generating a random one instead."
    fi
    MJ_DEV_AUTH_BRIDGE_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  fi
  export MJ_DEV_AUTH_BRIDGE_SECRET
fi
node -e "
  const fs = require('fs');
  const upsertVar = (content, key, val) => {
    const re = new RegExp('^' + key + '=.*$', 'm');
    const line = key + '=' + JSON.stringify(String(val));
    if (re.test(content)) return content.replace(re, () => line);
    return content + (content.endsWith('\n') ? '' : '\n') + line + '\n';
  };
  const keysToSync = [
    'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD',
    'MJ_BASE_ENCRYPTION_KEY', 'MJ_DEV_AUTH_ENABLED',
    'MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE', 'MJ_DEV_AUTH_BRIDGE_SECRET',
    'AI_VENDOR_API_KEY__OpenAILLM', 'AI_VENDOR_API_KEY__AnthropicLLM',
    'AI_VENDOR_API_KEY__GeminiLLM', 'AI_VENDOR_API_KEY__GroqLLM', 'AI_VENDOR_API_KEY__MistralLLM'
  ];
  for (const envFile of ['.env', 'apps/MJAPI/.env', 'packages/MJAPI/.env']) {
    if (fs.existsSync(envFile)) {
      let content = fs.readFileSync(envFile, 'utf8');
      for (const k of keysToSync) {
        const v = process.env[k];
        if (v !== undefined && v !== '') {
          content = upsertVar(content, k, v);
        }
      }
      content = upsertVar(content, 'DB_USER', process.env.DB_USERNAME || 'sa');
      fs.writeFileSync(envFile, content);
    }
  }
  const rawApiPort = String(process.env.API_PORT || '4000').trim();
  const apiPort = /^\d+$/.test(rawApiPort) ? rawApiPort : '4000';
  for (const ngEnv of [
    'apps/MJExplorer/src/environments/environment.ts',
    'apps/MJExplorer/src/environments/environment.development.ts',
    'packages/MJExplorer/src/environments/environment.ts',
    'packages/MJExplorer/src/environments/environment.development.ts',
  ]) {
    if (fs.existsSync(ngEnv)) {
      const src = fs.readFileSync(ngEnv, 'utf8');
      let next = src
        .replace(/GRAPHQL_URI:\s*['\"][^'\"]*['\"]/g, \"GRAPHQL_URI: 'http://localhost:\" + apiPort + \"/'\")
        .replace(/GRAPHQL_WS_URI:\s*['\"][^'\"]*['\"]/g, \"GRAPHQL_WS_URI: 'ws://localhost:\" + apiPort + \"/'\");
      if (process.env.MJ_DEV_AUTH_ENABLED === 'true') {
        next = next.replace(/AUTH_TYPE:\s*['\"][^'\"]*['\"]/g, \"AUTH_TYPE: 'local'\");
        // Bridge secret is hex or operator-supplied; only write values that are safe inside a TS string literal
        const bridgeSecret = String(process.env.MJ_DEV_AUTH_BRIDGE_SECRET || '');
        if (/^[A-Za-z0-9._~+\/=-]{16,}$/.test(bridgeSecret)) {
          const secretLine = \"LOCAL_DEV_BRIDGE_SECRET: '\" + bridgeSecret + \"'\";
          if (/LOCAL_DEV_BRIDGE_SECRET:\s*['\"][^'\"]*['\"]/.test(next)) {
            next = next.replace(/LOCAL_DEV_BRIDGE_SECRET:\s*['\"][^'\"]*['\"]/g, () => secretLine);
          } else {
            next = next.replace(/AUTH_TYPE:\s*'local'/, () => \"AUTH_TYPE: 'local',\\n  \" + secretLine);
          }
        } else {
          console.warn('Notice: MJ_DEV_AUTH_BRIDGE_SECRET contains characters that cannot be written to the Explorer environment; browser login through the Docker bridge will be refused.');
        }
      }
      if (next !== src) {
        fs.writeFileSync(ngEnv, next);
      }
    }
  }
"

# Sanitize dynamicPackages.client so non-browser packages are not bundled into MJExplorer
if [ -f "mj.config.cjs" ]; then
  node -e "
    const fs = require('fs');
    const vm = require('vm');
    try {
      const config = require('./mj.config.cjs');
      if (config.dynamicPackages && Array.isArray(config.dynamicPackages.client)) {
        let changed = false;
        config.dynamicPackages.client.forEach(entry => {
          if (!entry.PackageName.endsWith('-ng') || entry.PackageName === '@mj-biz-apps/sonar-ng') {
            if (entry.Enabled !== false) {
              entry.Enabled = false;
              changed = true;
            }
          }
        });
        if (changed) {
          const code = fs.readFileSync('mj.config.cjs', 'utf8');
          const dynMatch = code.match(/dynamicPackages\s*:\s*\{/);
          if (dynMatch && dynMatch.index !== undefined) {
            const afterDyn = code.slice(dynMatch.index);
            const clientRel = afterDyn.match(/client\s*:\s*\[/);
            if (clientRel && clientRel.index !== undefined) {
              const openPos = dynMatch.index + clientRel.index + clientRel[0].length - 1;
              let depth = 1, pos = openPos + 1, inStr = null;
              while (pos < code.length && depth > 0) {
                const ch = code[pos];
                if (inStr) {
                  if (ch === '\\\\') { pos += 2; continue; }
                  if (ch === inStr) inStr = null;
                } else if (ch === '\"' || ch === \"'\" || ch === '\`') {
                  inStr = ch;
                } else if (ch === '[') {
                  depth++;
                } else if (ch === ']') {
                  depth--;
                }
                pos++;
              }
              if (depth === 0) {
                const closePos = pos - 1;
                const serialized = JSON.stringify(config.dynamicPackages.client, null, 2).replace(/\n/g, '\n    ');
                const updated = code.slice(0, openPos) + serialized + code.slice(closePos + 1);
                vm.compileFunction(updated);
                fs.writeFileSync('mj.config.cjs', updated);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Notice: dynamicPackages check skipped:', e.message);
    }
  "
fi

# 3. Start MJAPI and MJExplorer services via PM2
echo "Starting MJAPI and MJExplorer services..."
pm2 delete all 2>/dev/null || true

# Start API service directly in apps/MJAPI (avoids turbo wrapper masking OOM exits in pm2)
if [ -d "apps/MJAPI" ]; then
  pm2 start npm --name mjapi --cwd /workspace/apps/MJAPI -- start
elif [ -d "packages/MJAPI" ]; then
  pm2 start npm --name mjapi --cwd /workspace/packages/MJAPI -- start
elif [ -f "package.json" ] && grep -q "start:api" package.json; then
  pm2 start "npm run start:api" --name mjapi
else
  pm2 start "npm start" --name mjapi
fi

# Start Explorer service directly in apps/MJExplorer
if [ -d "apps/MJExplorer" ]; then
  pm2 start npm --name mjexplorer --cwd /workspace/apps/MJExplorer -- start
elif [ -d "packages/MJExplorer" ]; then
  pm2 start npm --name mjexplorer --cwd /workspace/packages/MJExplorer -- start
elif [ -f "package.json" ] && grep -q "start:explorer" package.json; then
  pm2 start "npm run start:explorer" --name mjexplorer
fi

echo "========================================================================"
echo " 🎉 MemberJunction Stack is Running!"
echo "    MJAPI:       http://localhost:${API_PORT:-4000} (GraphQL & API)"
echo "    MJExplorer:  http://localhost:${EXPLORER_PORT:-4202} (Web Interface — Zero-Config Local Dev Auth active)"
echo "    Database:    localhost:$DB_PORT (DB: $DB_DATABASE)"
echo "========================================================================"

# Keep container running and stream logs
exec pm2 logs
