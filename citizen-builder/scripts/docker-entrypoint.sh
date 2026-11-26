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

# Ensure /workspace/.npmrc has shamefully-hoist=true so Vite in apps/MJExplorer
# resolves all transitive @memberjunction/*, luxon, rrule, etc. dependencies of
# installed OpenApps.
ensure_npmrc_shamefully_hoist() {
  if [ ! -f /workspace/.npmrc ]; then
    printf 'shamefully-hoist=true\n' > /workspace/.npmrc
  elif ! grep -Eq '^[[:space:]]*shamefully-hoist[[:space:]]*=' /workspace/.npmrc; then
    printf '\nshamefully-hoist=true\n' >> /workspace/.npmrc
  else
    node -e "
      const fs = require('fs');
      const p = '/workspace/.npmrc';
      const content = fs.readFileSync(p, 'utf8');
      const updated = content.replace(/^[ \t]*shamefully-hoist[ \t]*=.*$/gm, 'shamefully-hoist=true');
      if (updated !== content) {
        fs.writeFileSync(p, updated);
      }
    "
  fi
}

# Compute a hash of the provisioning-relevant environment configuration so a
# failed provisioning run can enter a diagnostic hold instead of tight-looping
# and exhausting GitHub's 60/hr anonymous API rate limit.
compute_provisioning_env_hash() {
  node -e "
    const crypto = require('crypto');
    const payload = [
      process.env.MJ_VERSION || '',
      process.env.OPEN_APP_INSTALL_URL || '',
      process.env.OPEN_APP_VERSION || '',
      process.env.OPEN_APP_DEPS_FROM_HEAD || '',
      process.env.GITHUB_TOKEN || ''
    ].join('|');
    process.stdout.write(crypto.createHash('sha256').update(payload).digest('hex'));
  "
}

print_provisioning_failure_banner() {
  local step_label="$1"
  local log_file="$2"
  echo "" >&2
  echo "========================================================================" >&2
  echo " ERROR: Citizen Builder provisioning failed during: $step_label" >&2
  echo "========================================================================" >&2
  if [ -f "$log_file" ]; then
    echo " Preserved root-cause output ($log_file):" >&2
    echo "------------------------------------------------------------------------" >&2
    tail -n 60 "$log_file" >&2
    echo "------------------------------------------------------------------------" >&2
  fi
  echo "" >&2
  echo " Remediation steps:" >&2
  echo "   1. If you see a GitHub 403 / API rate limit exceeded error, add a" >&2
  echo "      read-only GITHUB_TOKEN to your .env file (even a token with zero" >&2
  echo "      private repo scopes raises the limit from 60/hr to 5,000/hr)." >&2
  echo "   2. Verify MJ_VERSION, OPEN_APP_INSTALL_URL, and OPEN_APP_VERSION" >&2
  echo "      (if set) in your .env file." >&2
  echo "   3. Apply your updated .env and retry cleanly:" >&2
  echo "        docker compose up -d --force-recreate mj" >&2
  echo "      (Note: 'docker compose up -d' reloads .env changes; if .env did not" >&2
  echo "       change, clear $STATE_DIR/failed-env-hash before 'docker compose restart mj'.)" >&2
  echo "" >&2
  echo " Container is now in diagnostic hold so Docker restart loops do not" >&2
  echo " re-hammer GitHub API rate limits. Update .env and recreate/restart mj." >&2
  echo "========================================================================" >&2
}

hold_until_reconfigured() {
  trap 'exit 0' TERM INT
  while true; do
    sleep 5 &
    wait $! || true
  done
}

run_provisioning_cmd() {
  local step_label="$1"
  shift
  local log_file="$STATE_DIR/last-provisioning-error.log"
  set +e
  "$@" 2>&1 | tee "$log_file"
  local rc=${PIPESTATUS[0]}
  set -e
  if [ "$rc" -ne 0 ]; then
    printf '%s' "$CURRENT_ENV_HASH" > "$STATE_DIR/failed-env-hash"
    print_provisioning_failure_banner "$step_label" "$log_file"
    hold_until_reconfigured
  fi
}

# 2. Provisioning. State lives on the workspace volume so it survives restarts, and each step
#    that must not run twice records its own completion: `mj app install` of an app that is
#    already installed is an error, so a failure in a LATER step has to be retried on restart
#    without re-running an earlier one. Failures are preserved and held on unchanged env so
#    restart: unless-stopped does not burn GitHub's anonymous 60/hr API rate limit.
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
  CURRENT_ENV_HASH="$(compute_provisioning_env_hash)"
  if [ -f "$STATE_DIR/failed-env-hash" ]; then
    FAILED_ENV_HASH="$(cat "$STATE_DIR/failed-env-hash" 2>/dev/null || true)"
    if [ "$FAILED_ENV_HASH" = "$CURRENT_ENV_HASH" ]; then
      print_provisioning_failure_banner "previous provisioning attempt (unchanged environment)" "$STATE_DIR/last-provisioning-error.log"
      hold_until_reconfigured
    else
      echo "Provisioning environment configuration changed; clearing previous failure hold and retrying..."
      rm -f "$STATE_DIR/failed-env-hash" "$STATE_DIR/last-provisioning-error.log"
    fi
  fi

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
    run_provisioning_cmd "mj install" mj install --yes --fast --config /tmp/install.config.json --dir /workspace "${INSTALL_TAG_ARGS[@]}"
    rm -f /tmp/install.config.json
    ensure_npmrc_shamefully_hoist
    touch "$STATE_DIR/core-installed"
    pnpm add -w @angular/compiler@21.2.22 2>/dev/null || true
  fi

  # Ensure shamefully-hoist=true is present before `mj app install` installs OpenApp dependencies
  ensure_npmrc_shamefully_hoist

  # Install Open App business context (More Cheese default or custom enterprise app)
  # Note: GITHUB_TOKEN is read directly from the environment by OpenAppEngine's GitHubClient
  if [ ! -f "$STATE_DIR/app-installed" ]; then
    APP_URL="${OPEN_APP_INSTALL_URL:-https://github.com/MemberJunction/more-cheese}"
    APP_INSTALL_ARGS=(--non-interactive)
    if [ -n "${OPEN_APP_VERSION:-}" ]; then
      APP_INSTALL_ARGS+=(--version "$OPEN_APP_VERSION")
    fi
    if [ -n "${OPEN_APP_DEPS_FROM_HEAD:-}" ]; then
      APP_INSTALL_ARGS+=(--dependencies-from-head "$OPEN_APP_DEPS_FROM_HEAD")
    fi
    echo "Installing business context Open App: $APP_URL..."
    run_provisioning_cmd "mj app install ($APP_URL)" mj app install "$APP_URL" "${APP_INSTALL_ARGS[@]}"
    touch "$STATE_DIR/app-installed"

    # Wire Open App client bootstrap into MJExplorer's class manifest (best-effort;
    # MJExplorer prestart also runs this). Never run full `mj codegen` in Citizen Builder.
    for explorerDir in /workspace/apps/MJExplorer /workspace/packages/MJExplorer; do
      if [ -d "$explorerDir" ]; then
        mj codegen manifest \
          --appDir "$explorerDir" \
          --output "$explorerDir/src/app/generated/class-registrations-manifest.ts" \
          --exclude-packages @memberjunction \
          --open-app-client-bootstrap || true
        break
      fi
    done
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

  rm -f "$STATE_DIR/failed-env-hash" "$STATE_DIR/last-provisioning-error.log"
  touch "$STATE_DIR/provisioned"
  echo "MemberJunction installation and provisioning complete!"
else
  echo "Existing MemberJunction workspace detected in /workspace."
  # Apply any pending migrations (exits 0 when already up to date)
  mj migrate
fi

# Ensure shamefully-hoist=true is present on every boot
ensure_npmrc_shamefully_hoist

# Provision out-of-the-box read-only SQL login for Run Ad-hoc Query in Explorer Chat.
# Runs idempotently on every boot so DB_READ_ONLY_USERNAME / DB_READ_ONLY_PASSWORD are
# always valid and strictly read-only across all schemas (including OpenApp schemas).
RO_USER="${DB_READ_ONLY_USERNAME:-mj_readonly}"
RO_PASS_FILE="$STATE_DIR/readonly-db-password"
if [ -n "${DB_READ_ONLY_PASSWORD:-}" ]; then
  RO_PASS="$DB_READ_ONLY_PASSWORD"
elif [ -s "$RO_PASS_FILE" ]; then
  RO_PASS="$(cat "$RO_PASS_FILE")"
else
  RO_PASS="$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url') + 'A1!')")"
  node -e "
    const fs = require('fs');
    fs.writeFileSync(process.argv[1], process.argv[2], { mode: 0o600 });
    fs.chmodSync(process.argv[1], 0o600);
  " "$RO_PASS_FILE" "$RO_PASS"
fi

echo "Ensuring read-only SQL login '$RO_USER' exists in '$DB_DATABASE'..."
RO_USER="$RO_USER" RO_PASS="$RO_PASS" node -e "
  const resolveMssql = () => {
    for (const candidate of [
      '/workspace/node_modules/mssql',
      '/workspace/apps/MJAPI/node_modules/mssql',
      '/workspace/packages/MJAPI/node_modules/mssql',
    ]) {
      try { return require(candidate); } catch {}
    }
    throw new Error('Could not locate mssql module in /workspace');
  };
  const sql = resolveMssql();
  (async () => {
    const roUser = process.env.RO_USER;
    const roPass = process.env.RO_PASS;
    const dbName = process.env.DB_DATABASE || 'MemberJunction';
    const pool = await sql.connect({
      server: process.env.DB_HOST || 'sqlserver',
      port: Number(process.env.DB_PORT || 1433),
      database: dbName,
      user: 'sa',
      password: process.env.DB_PASSWORD || 'TestPassword123!',
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
    });
    try {
      const req = pool.request();
      req.input('roUser', sql.NVarChar(128), roUser);
      req.input('roPass', sql.NVarChar(256), roPass);
      req.input('dbName', sql.NVarChar(128), dbName);
      await req.query(\`
        DECLARE @quotedLogin NVARCHAR(260) = QUOTENAME(@roUser);
        DECLARE @escapedPass NVARCHAR(512) = REPLACE(@roPass, '''', '''''');
        DECLARE @sql NVARCHAR(MAX);

        IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @roUser)
        BEGIN
          SET @sql = N'CREATE LOGIN ' + @quotedLogin + N' WITH PASSWORD = ''' + @escapedPass + N''', CHECK_POLICY = OFF, DEFAULT_DATABASE = ' + QUOTENAME(@dbName) + N';';
          EXEC sp_executesql @sql;
        END
        ELSE
        BEGIN
          SET @sql = N'ALTER LOGIN ' + @quotedLogin + N' WITH PASSWORD = ''' + @escapedPass + N''', CHECK_POLICY = OFF;';
          EXEC sp_executesql @sql;
        END

        IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @roUser)
        BEGIN
          SET @sql = N'CREATE USER ' + @quotedLogin + N' FOR LOGIN ' + @quotedLogin + N';';
          EXEC sp_executesql @sql;
        END
        ELSE
        BEGIN
          SET @sql = N'ALTER USER ' + @quotedLogin + N' WITH LOGIN = ' + @quotedLogin + N';';
          EXEC sp_executesql @sql;
        END

        SET @sql = N'ALTER ROLE [db_datareader] ADD MEMBER ' + @quotedLogin + N';';
        EXEC sp_executesql @sql;

        SET @sql = N'ALTER ROLE [db_denydatawriter] ADD MEMBER ' + @quotedLogin + N';';
        EXEC sp_executesql @sql;
      \`);
    } finally {
      await pool.close();
    }
  })().catch((err) => {
    console.error('Failed to provision read-only SQL login:', err);
    process.exit(1);
  });
"
export DB_READ_ONLY_USERNAME="$RO_USER"
export DB_READ_ONLY_PASSWORD="$RO_PASS"

# Configure MJExplorer host binding, compiler alignment, and Cache-Control: no-cache
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

node -e "
  const fs = require('fs');
  for (const ngJson of ['apps/MJExplorer/angular.json', 'packages/MJExplorer/angular.json']) {
    if (!fs.existsSync(ngJson)) continue;
    const cfg = JSON.parse(fs.readFileSync(ngJson, 'utf8'));
    let changed = false;
    if (cfg.projects && typeof cfg.projects === 'object') {
      for (const proj of Object.values(cfg.projects)) {
        const serve = proj && proj.architect && proj.architect.serve;
        if (serve) {
          serve.options = serve.options || {};
          serve.options.headers = serve.options.headers || {};
          if (serve.options.headers['Cache-Control'] !== 'no-cache') {
            serve.options.headers['Cache-Control'] = 'no-cache';
            changed = true;
          }
        }
      }
    }
    if (changed) {
      fs.writeFileSync(ngJson, JSON.stringify(cfg, null, 2) + '\n');
    }
  }
"

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

# Sync container environment variables (API keys, encryption key, DB_USER, read-only DB creds, local dev auth) into workspace .env files
[ -z "${MJ_ARTIFACT_COLLAB_HMAC_SECRET:-}" ] && unset MJ_ARTIFACT_COLLAB_HMAC_SECRET
[ -z "${MJ_COLLABORATION_TICKET_SECRET:-}" ] && unset MJ_COLLABORATION_TICKET_SECRET
[ -z "${MJ_FROZEN_BLOCK_HMAC_SECRET:-}" ] && unset MJ_FROZEN_BLOCK_HMAC_SECRET
[ -z "${MJ_FROZEN_SNAPSHOT_SECRET:-}" ] && unset MJ_FROZEN_SNAPSHOT_SECRET
export MJ_DEV_AUTH_ENABLED="${MJ_DEV_AUTH_ENABLED:-true}"
export MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE="${MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE:-true}"
node -e "
  const fs = require('fs');
  const upsertVar = (content, key, val) => {
    const re = new RegExp('^' + key + '=.*$', 'm');
    const line = key + '=' + JSON.stringify(String(val));
    if (re.test(content)) return content.replace(re, () => line);
    return content + (content.endsWith('\n') ? '' : '\n') + line + '\n';
  };
  const crypto = require('crypto');
  const keysToSync = [
    'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD',
    'DB_READ_ONLY_USERNAME', 'DB_READ_ONLY_PASSWORD',
    'MJ_BASE_ENCRYPTION_KEY',
    'MJ_ARTIFACT_COLLAB_HMAC_SECRET', 'MJ_COLLABORATION_TICKET_SECRET',
    'MJ_FROZEN_BLOCK_HMAC_SECRET', 'MJ_FROZEN_SNAPSHOT_SECRET',
    'MJ_DEV_AUTH_ENABLED', 'MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE',
    'AI_VENDOR_API_KEY__OpenAILLM', 'AI_VENDOR_API_KEY__AnthropicLLM',
    'AI_VENDOR_API_KEY__GeminiLLM', 'AI_VENDOR_API_KEY__GroqLLM', 'AI_VENDOR_API_KEY__MistralLLM'
  ];
  const generatedCollabSecret = crypto.randomBytes(32).toString('hex');
  const generatedFrozenSecret = crypto.randomBytes(32).toString('hex');
  for (const envFile of ['.env', 'apps/MJAPI/.env', 'packages/MJAPI/.env']) {
    if (fs.existsSync(envFile)) {
      let content = fs.readFileSync(envFile, 'utf8');
      for (const k of keysToSync) {
        const v = process.env[k];
        if (v !== undefined && v !== '') {
          content = upsertVar(content, k, v);
        }
      }
      if (!/^MJ_ARTIFACT_COLLAB_HMAC_SECRET=.+/m.test(content) && !/^MJ_COLLABORATION_TICKET_SECRET=.+/m.test(content)) {
        content = upsertVar(content, 'MJ_ARTIFACT_COLLAB_HMAC_SECRET', generatedCollabSecret);
      }
      if (!/^MJ_FROZEN_BLOCK_HMAC_SECRET=.+/m.test(content) && !/^MJ_FROZEN_SNAPSHOT_SECRET=.+/m.test(content)) {
        content = upsertVar(content, 'MJ_FROZEN_BLOCK_HMAC_SECRET', generatedFrozenSecret);
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

# 3. Start MJAPI and MJExplorer services via pm2-runtime (PID 1 supervision)
echo "Starting MJAPI and MJExplorer services via pm2-runtime..."
node -e "
  const fs = require('fs');
  const apps = [];

  if (fs.existsSync('/workspace/apps/MJAPI')) {
    apps.push({ name: 'mjapi', cwd: '/workspace/apps/MJAPI', script: 'npm', args: 'start', autorestart: true, max_restarts: 10, min_uptime: '5s' });
  } else if (fs.existsSync('/workspace/packages/MJAPI')) {
    apps.push({ name: 'mjapi', cwd: '/workspace/packages/MJAPI', script: 'npm', args: 'start', autorestart: true, max_restarts: 10, min_uptime: '5s' });
  } else if (fs.existsSync('/workspace/package.json')) {
    const rootPkg = JSON.parse(fs.readFileSync('/workspace/package.json', 'utf8'));
    const hasStartApi = !!(rootPkg.scripts && rootPkg.scripts['start:api']);
    apps.push({ name: 'mjapi', cwd: '/workspace', script: 'npm', args: hasStartApi ? 'run start:api' : 'start', autorestart: true, max_restarts: 10, min_uptime: '5s' });
  }

  if (fs.existsSync('/workspace/apps/MJExplorer')) {
    apps.push({ name: 'mjexplorer', cwd: '/workspace/apps/MJExplorer', script: 'npm', args: 'start', autorestart: true, max_restarts: 10, min_uptime: '5s' });
  } else if (fs.existsSync('/workspace/packages/MJExplorer')) {
    apps.push({ name: 'mjexplorer', cwd: '/workspace/packages/MJExplorer', script: 'npm', args: 'start', autorestart: true, max_restarts: 10, min_uptime: '5s' });
  } else if (fs.existsSync('/workspace/package.json')) {
    const rootPkg = JSON.parse(fs.readFileSync('/workspace/package.json', 'utf8'));
    if (rootPkg.scripts && rootPkg.scripts['start:explorer']) {
      apps.push({ name: 'mjexplorer', cwd: '/workspace', script: 'npm', args: 'run start:explorer', autorestart: true, max_restarts: 10, min_uptime: '5s' });
    }
  }

  fs.writeFileSync('/tmp/ecosystem.config.cjs', 'module.exports = ' + JSON.stringify({ apps }, null, 2) + ';\n');
"

echo "========================================================================"
echo " MemberJunction Stack Starting (PID 1 pm2-runtime)"
echo "    MJAPI:       http://localhost:${API_PORT:-4000} (GraphQL & API)"
echo "    MJExplorer:  http://localhost:${EXPLORER_PORT:-4202} (Web Interface — Zero-Config Local Dev Auth active)"
echo "    Database:    localhost:$DB_PORT (DB: $DB_DATABASE)"
echo "========================================================================"

exec pm2-runtime start /tmp/ecosystem.config.cjs
