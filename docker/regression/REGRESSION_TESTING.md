# MJ Explorer Regression Testing

Automated end-to-end regression testing of MJ Explorer using LLM-driven browser automation (Computer Use engine) running headless Chromium in Docker.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Docker Compose (mj-regression)                       │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ SQL      │  │ DB Setup │  │ MJAPI    │  │ MJ       │  │ Test     │ │
│  │ Server   │◄─│ (init)   │  │ Server   │◄─│ Explorer │◄─│ Runner   │ │
│  │          │  │          │  │          │  │ (nginx)  │  │ (Chrome) │ │
│  │ :1433    │  │ one-shot │  │ :4000    │  │ :4200    │  │          │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│    host:11433                   host:14000    host:4200                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Request Flow

The browser (headless Chromium in the test-runner container) interacts with the stack as follows:

1. **Static assets**: Browser → `socat` (localhost:4200 → mjexplorer:4200) → nginx → serves files from `/usr/share/nginx/html`
2. **Auth0 login**: Browser → Auth0 (external) → redirects back to `http://localhost:4200/?code=...&state=...`
3. **GraphQL API**: Browser → socat → nginx `/api/` → `proxy_pass http://mjapi:4000/` → Apollo Server
4. **WebSocket subscriptions**: Same path as GraphQL, nginx upgrades connection when `Upgrade: websocket` header is present

The `socat` proxy is required because Auth0's SDK (`auth0-spa-js`) only works on secure origins, and browsers treat `localhost` as secure but not arbitrary Docker hostnames like `mjexplorer`.

### Startup Sequence

1. **SQL Server** starts, waits for healthcheck (TCP responsive)
2. **DB Setup** (one-shot init container) creates the database, runs `mj migrate` (Flyway migrations), installs AssociationDB demo data (58 tables, 10K+ records), then runs `mj codegen`. Exits 0 on success.
3. **MJAPI** starts after db-setup completes successfully (`service_completed_successfully`). Just runs the GraphQL server — no migration or setup work. Healthcheck at `/healthcheck`.
4. **MJ Explorer** starts after MJAPI is healthy (static nginx server).
5. **Test Runner** starts after MJAPI is healthy and MJExplorer is started. The entrypoint script:
   - Sets up socat localhost proxy
   - Creates the test user via direct SQL INSERT
   - Syncs test metadata to the database
   - Verifies MJAPI healthcheck and nginx proxy
   - Runs the regression suite via `mj test suite`
   - Extracts screenshots from the database to `test-results/screenshots/`

## Quick Start

```bash
# 1. Create environment file
cp docker/.env.test.example docker/.env.test
# Edit docker/.env.test with real Auth0 + Anthropic credentials

# 2. Build images
docker compose -f docker/docker-compose.test.yml --env-file docker/.env.test build

# 3. Run the full stack
docker compose -f docker/docker-compose.test.yml --env-file docker/.env.test up

# 4. Check results
cat docker/test-results/results.json
ls docker/test-results/screenshots/

# 5. Tear down (add -v to remove database volumes)
docker compose -f docker/docker-compose.test.yml down -v
```

### Rebuilding Individual Services

```bash
# Rebuild only the explorer (e.g., after changing environment config)
docker compose -f docker/docker-compose.test.yml --env-file docker/.env.test build mjexplorer

# Rebuild only the test runner (e.g., after changing ComputerUse packages)
docker compose -f docker/docker-compose.test.yml --env-file docker/.env.test build test-runner

# The entrypoint script is bind-mounted — changes take effect without rebuilding
```

## Environment Variables

All variables go in `docker/.env.test` (gitignored). See `.env.test.example` for the template.

| Variable | Required | Purpose |
|----------|----------|---------|
| `TEST_SA_PASSWORD` | Yes | SQL Server SA password (min 8 chars, requires complexity) |
| `MJ_BASE_ENCRYPTION_KEY` | Yes | Base64 encryption key (`openssl rand -base64 32`) |
| `AUTH0_DOMAIN` | Yes | Auth0 tenant domain (e.g., `dev-xxxxx.us.auth0.com`) |
| `AUTH0_CLIENTID` | Yes | Auth0 SPA application client ID |
| `AUTH0_CLIENT_SECRET` | Yes | Auth0 application client secret |
| `TEST_UID` | Yes | Test user email (must exist in Auth0, email verified, no MFA) |
| `TEST_PWD` | Yes | Test user password in Auth0 |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (for Computer Use controller/judge LLM) |
| `GOOGLE_API_KEY` | No | Google API key (if using Gemini models) |

### Auth0 Setup Requirements

The Auth0 SPA application must have:
- **Allowed Callback URLs**: `http://localhost:4200`
- **Allowed Logout URLs**: `http://localhost:4200`
- **Allowed Web Origins**: `http://localhost:4200`
- **Token Endpoint Authentication Method**: None (SPA)
- **Grant Types**: Authorization Code (with PKCE)
- The test user must exist in Auth0 with email verified and MFA disabled

## File Inventory

```
docker/
├── docker-compose.test.yml       # Orchestration (5 services)
├── Dockerfile.db-setup           # DB init: migrations + AssociationDB + CodeGen (one-shot)
├── db-setup-entrypoint.sh        # DB init entrypoint script
├── Dockerfile.api                # MJAPI: GraphQL server only (no setup)
├── Dockerfile.explorer           # MJExplorer: Angular AOT build + nginx reverse proxy
├── Dockerfile.test-runner        # Test runner: full monorepo build + Playwright Chromium
├── test-runner-entrypoint.sh     # Entrypoint: user setup, metadata sync, suite execution
├── .env.test.example             # Environment variable template
├── REGRESSION_TESTING.md         # This file
└── test-results/                 # Output directory (gitignored, bind-mounted)
    ├── results.json              # Suite execution results
    └── screenshots/              # Per-test step screenshots (PNG)
        └── T01_-_Login_Smoke/
            ├── step_01.png
            ├── step_02.png
            └── ...

metadata/
├── tests/regression/
│   └── .T01-login-smoke.json     # Test definitions (synced to DB at runtime)
└── test-suites/
    └── .regression-suite.json    # Suite linking tests together
```

## How Tests Work

Each test uses the **ComputerUseTestDriver** which:

1. Launches headless Chromium via Playwright
2. Navigates to a start URL (MJExplorer at `http://localhost:4200`)
3. Takes a screenshot and sends it to an LLM (controller) which decides what to click/type
4. The LLM-driven agent performs the test workflow (login, navigate, verify UI)
5. A judge LLM periodically evaluates whether the goal was achieved
6. Oracles score the result (goal-completion, url-match, step-count)
7. Results and screenshots are persisted to the MJ database
8. The entrypoint extracts screenshots from the DB to `test-results/screenshots/`

### Test Definition Structure

Tests are defined as metadata JSON files in `metadata/tests/regression/` with three sections:

- **InputDefinition**: Goal description, start URL, auth credentials, allowed domains
- **Configuration**: LLM prompts, oracles, step limits, viewport size, judge frequency
- **ExpectedOutcomes**: URL patterns, confidence thresholds, validation criteria

See `metadata/tests/regression/.T01-login-smoke.json` for a working example.

### Oracles

Each test configures weighted oracles that evaluate the result:

| Oracle | Purpose | Typical Weight |
|--------|---------|---------------|
| `goal-completion` | Did the judge LLM confirm the goal was achieved? | 0.5 |
| `url-match` | Does the final URL match the expected pattern? | 0.3 |
| `step-count` | Did the test complete within the step budget? | 0.2 |

The weighted oracle scores combine into a final test score (0.0 to 1.0). A test passes when the goal-completion oracle passes.

### Adding New Tests

1. Create a new `.json` file in `metadata/tests/regression/` following the T01 pattern
2. Add a `relatedEntities` entry in `metadata/test-suites/.regression-suite.json` linking the test
3. The test runner automatically syncs metadata on each run -- no rebuild needed
4. Metadata files are bind-mounted from the host, so edits are picked up immediately

## Container Details

### Dockerfile.db-setup (One-Shot Init Container)

A one-shot container that runs all database setup tasks in sequence, then exits. MJAPI depends on it via `service_completed_successfully`.

**Steps executed by `db-setup-entrypoint.sh`:**

1. **Create database**: Uses Node.js mssql driver to create `MemberJunction_Test` if it doesn't exist
2. **Run migrations**: `mj migrate` applies all Flyway migrations (creates `__mj` schema, 290+ entities)
3. **Install AssociationDB**: Executes pre-built `combined_build.sql` via `sqlcmd` to create the `AssociationDemo` schema with 58 tables and 10K+ records of realistic demo data (members, events, courses, forums, certifications, etc.)
4. **Run CodeGen**: `mj codegen` generates entity classes, views, stored procedures, and GraphQL resolvers for all tables including AssociationDB

**Why a separate container:**
- Migrations and CodeGen are one-shot tasks, not long-running services
- Keeps MJAPI Dockerfile simple (just runs the server)
- `service_completed_successfully` condition ensures DB is fully ready before MJAPI starts
- Easier to debug migration/install failures in isolation

**AssociationDB demo data includes:**
- 2,000 members across 40 organizations with 8 membership types
- 21 events with 85 sessions and 1,400+ registrations
- 60 courses with 900 enrollments
- 50 forum threads with 200+ posts
- 100 resources, 413 certifications, 110 products
- All dates are relative to `GETDATE()` so data always looks current

### Dockerfile.explorer (nginx Reverse Proxy)

The explorer image is a two-stage build:

**Stage 1 (builder)**: Installs npm dependencies, generates `environment.ts` with Auth0 and API configuration, then runs `npm run build:explorer` (Angular AOT build).

**Stage 2 (nginx:alpine)**: Copies the built static files and generates an inline nginx config with:

- **`map $http_upgrade $connection_upgrade`**: Conditionally sets `Connection: upgrade` only for WebSocket requests, `Connection: close` for regular HTTP. This is critical -- unconditionally setting `Connection: upgrade` causes GraphQL POST requests to hang.
- **`location /api/`**: Reverse proxy to `http://mjapi:4000/`. The trailing slash on both `location /api/` and `proxy_pass http://mjapi:4000/` means nginx strips the `/api/` prefix, so `/api/graphql` becomes `/graphql` on MJAPI.
- **SPA fallback**: `try_files $uri $uri/ /index.html` for Angular routing.
- **Static asset caching**: 1-day cache with immutable headers for JS/CSS/images.

**Important**: `GRAPHQL_URI` must be an absolute URL (`http://localhost:4200/api/`), not a relative path (`/api/`). The `graphql-request` v7+ library validates URLs with `new URL()` which rejects relative paths.

### Dockerfile.api (MJAPI Server)

Two-stage build. The runtime stage patches `mj.config.cjs` to force `autoCreateNewUsers: true` for the test environment. The container only starts the GraphQL server — all database setup (migrations, CodeGen, AssociationDB) is handled by the `db-setup` container which must complete before MJAPI starts.

### Dockerfile.test-runner (Playwright + MJ CLI)

Based on `mcr.microsoft.com/playwright:v1.58.1-noble` which includes Chromium. Installs `socat` for localhost forwarding, copies the full monorepo, runs `npm install` + `turbo build --concurrency=2`, and creates a bootstrap ESM file that imports `@memberjunction/computer-use-engine` to register the `ComputerUseTestDriver` class.

### test-runner-entrypoint.sh

The entrypoint orchestrates the test environment in order:

1. **socat proxy** (`localhost:4200 → mjexplorer:4200`): Required for Auth0 secure context
2. **Test user creation**: Direct SQL INSERT of the test user + UI role assignment. Uses SQL directly instead of mj-sync to avoid bootstrap chicken-and-egg issues.
3. **Metadata sync**: Pushes test definitions and suites from the `metadata/` bind mount to the database using `mj sync push`.
4. **Verification**: Healthcheck direct to MJAPI + GraphQL POST through the nginx proxy to confirm the full request path works.
5. **Suite execution**: Runs `mj test suite` which discovers the suite from the database and executes all active tests via ComputerUseTestDriver.
6. **Screenshot extraction**: Queries `vwTestRunOutputs` for screenshot data and saves to `test-results/screenshots/`.

The script uses `set +e` around the test suite execution so that test failures (exit code 1) don't prevent screenshot extraction.

## Port Mapping

Host ports are remapped to avoid conflicts with local development:

| Service | Container Port | Host Port | Purpose |
|---------|---------------|-----------|---------|
| SQL Server | 1433 | **11433** | Avoids conflict with local SQL Server |
| MJAPI | 4000 | **14000** | Avoids conflict with local MJAPI |
| MJExplorer | 4200 | **4200** | Standard (test runner uses localhost:4200) |

## Design Decisions

### Why a separate db-setup container (not MJAPI)

Migrations, CodeGen, and AssociationDB installation are one-shot tasks that take 2-3 minutes combined. Keeping them in a separate init container means MJAPI's Dockerfile stays simple (just runs the server), failures are easier to debug in isolation, and `service_completed_successfully` in docker-compose guarantees the database is fully ready before any application starts.

### Why AssociationDB is included

The regression suite needs realistic data to test entity browsing, record viewing, search, and CRUD workflows. AssociationDB provides 58 tables with 10K+ records spanning membership, events, learning, forums, and more — all with referential integrity and date-relative data that always looks current. Without it, only the login test can meaningfully run.

### Why Sonnet (not Opus) for the controller/judge

Computer Use tasks are primarily visual navigation ("click this button", "type in this field"), not deep reasoning. Sonnet is 5-10x cheaper per step and handles these tasks effectively. The controller and judge prompts are stored in the MJ database (synced via metadata) and reference Sonnet models.

### Why `--concurrency=2` for the test-runner build

Building all 196+ monorepo packages in parallel exceeds Docker Desktop's default memory limit. Limiting turbo to 2 concurrent builds avoids OOM kills. If Docker has 12+ GB RAM allocated, you can increase this limit.

### Why metadata is bind-mounted (not baked in)

The `metadata/` directory is mounted from the host into the test-runner at runtime (`../metadata:/app/metadata`). This means test definition changes take effect immediately without rebuilding the image. The entrypoint runs `mj sync push` on every startup to ensure the database reflects the latest metadata.

### Why the bootstrap uses `--import`

The `ComputerUseTestDriver` class uses `@RegisterClass` to register itself in the ClassFactory. The test-runner entrypoint sets `NODE_OPTIONS="--import /app/bootstrap.mjs"` so the decorator fires before the MJ CLI starts, making the driver discoverable.

### Why socat instead of Docker networking

The test-runner browser needs to access MJExplorer at `localhost:4200` (not `mjexplorer:4200`) because Auth0's SDK requires a secure origin. Browsers treat `localhost` as secure but reject arbitrary hostnames. socat forwards TCP traffic from `localhost:4200` to `mjexplorer:4200` inside the test-runner container.

### Why test user creation uses direct SQL (not mj-sync)

The `mj sync push` command requires an authenticated System user context to operate. On a fresh database (first run), no users exist yet, creating a chicken-and-egg problem. Direct SQL INSERT bypasses this by creating the user and role assignment before any MJ framework code runs.

### Why GRAPHQL_URI must be absolute

The `graphql-request` v7+ library (used by `GraphQLDataProvider`) internally calls `new URL(url)` to validate the endpoint URL. The `URL` constructor requires an absolute URL -- a relative path like `/api/` throws `TypeError: Invalid URL`. The Docker environment sets `GRAPHQL_URI: 'http://localhost:4200/api/'` to satisfy this requirement. In non-Docker environments, the Angular dev server proxy handles this differently.

### Why nginx Connection header uses a map block

The nginx reverse proxy must handle both regular HTTP POST requests (GraphQL queries) and WebSocket upgrades (GraphQL subscriptions) on the same `/api/` location. A `map` block conditionally sets `Connection: upgrade` only when the client sends an `Upgrade` header, and `Connection: close` otherwise. Without this, unconditionally setting `Connection: "upgrade"` causes regular POST requests to hang because the backend expects a WebSocket handshake that never happens.

## Troubleshooting

### "Loading workspace..." hangs after login

The app gets stuck on "Loading workspace..." when the GraphQL API is unreachable from the browser. Check in order:

1. **MJAPI healthcheck**: `curl http://localhost:14000/healthcheck` from the host
2. **nginx proxy**: `curl -X POST http://localhost:4200/api/ -H 'Content-Type: application/json' -d '{"query":"{ __schema { queryType { name } } }"}'` -- should return 401 (expected without a token)
3. **GRAPHQL_URI**: Must be an absolute URL (`http://localhost:4200/api/`). A relative path (`/api/`) causes `TypeError: Invalid URL` in `graphql-request` v7+.
4. **nginx Connection header**: Must use a `map` block for conditional upgrade. Check the generated config: `docker exec <explorer-container> cat /etc/nginx/conf.d/default.conf`

### Docker OOM during build

Build images one at a time or increase Docker Desktop memory to 12+ GB:

```bash
docker compose -f docker/docker-compose.test.yml --env-file docker/.env.test build mjapi
docker compose -f docker/docker-compose.test.yml --env-file docker/.env.test build mjexplorer
docker compose -f docker/docker-compose.test.yml --env-file docker/.env.test build test-runner
```

### "Port already in use" errors

The stack uses non-standard host ports (11433, 14000) to avoid conflicts. If those are also in use, edit the `ports:` mappings in `docker-compose.test.yml`.

### Migrations fail with self-signed certificate

Ensure `DB_TRUST_SERVER_CERTIFICATE=true` is set (already configured in the compose file's `x-db-env` anchor).

### Test suite not found

Test metadata must be synced to the database. The entrypoint handles this automatically. If it fails, check:
- The `metadata/` volume mount is working (`../metadata:/app/metadata`)
- The test file name starts with `.` (mj-sync uses the `filePattern` from `.mj-sync.json`)
- Run `docker compose logs test-runner` and look for "Syncing test metadata" output

### ComputerUseTestDriver not found

The bootstrap import isn't loading. Check that `NODE_OPTIONS` is set in the entrypoint and that `@memberjunction/computer-use-engine` built successfully in the test-runner image. Look for build errors in `docker compose logs test-runner`.

### Screenshots not saved

The entrypoint uses `set +e` around the test suite execution to prevent `set -e` from aborting the script when tests fail (exit code 1). If screenshots are missing, check:
- The `test-results` volume mount exists (`./test-results:/app/test-results`)
- The `results.json` file was written (the screenshot extractor reads it)
- Database connectivity from the screenshot extraction script

### Auth0 login fails in headless browser

- Verify the Auth0 application has `http://localhost:4200` in Allowed Callback URLs
- Verify the test user exists in Auth0 with email verified and MFA disabled
- Check that `TEST_UID` and `TEST_PWD` in `.env.test` match the Auth0 user

## Cost Estimates

| Component | Cost per Step | Steps per Test | Cost per Test |
|-----------|--------------|----------------|---------------|
| Controller LLM (Sonnet) | ~$0.02 | 15 avg | $0.30 |
| Judge LLM (Sonnet, every 3 steps) | ~$0.02 | 5 avg | $0.10 |
| **Total per test** | | | **~$0.40** |

A full 25-test suite costs approximately **$10-12** per run.

## Test Inventory (25 Tests)

### P0 — Critical Path (release-blocking)

| Test | Description |
|------|-------------|
| T01 - Login Smoke | Auth0 login + verify dashboard loads with navigation elements |
| T02 - Home Application Load | Verify header, MJ logo, app switcher, and navigation items |
| T03 - Application Switcher | Switch between Home, Data Explorer, and AI applications |
| T04 - Data Explorer Browse Entities | Navigate to Members entity, verify records grid |
| T05 - Data Explorer Open Entity Record | Open a member record detail form |
| T06 - Data Explorer Search | Search for "Event", verify results appear |
| T07 - Entity Form View Record Details | Open an Event record, verify form fields |
| T08 - Navigation and Tab Management | Open multiple tabs, switch, close one |

### P1 — Core Functionality

| Test | Description |
|------|-------------|
| T09 - Entity Form Create New Record | Create a new Member record and save |
| T10 - Entity Form Edit and Save Record | Edit an existing Member record and save |
| T11 - Run a Saved Query | Execute a saved query and verify results |
| T12 - Admin Dashboard ERD Viewer | Open the ERD viewer, verify entity diagram |
| T13 - Admin Dashboard User Management | View user management list |
| T14 - AI Application Agent List View | View configured AI agents |
| T15 - AI Application Prompt Management | View prompts and open a prompt detail form |

### P2 — Extended Functionality

| Test | Description |
|------|-------------|
| T16 - Lists Create and Populate | Create a list and add a record |
| T17 - Settings Page Navigation | Open settings, verify categories |
| T18 - Communication Templates View | View communication templates |
| T19 - Query Browser Execute Query | Find and execute a query |
| T20 - Dashboard Browser | Open a dashboard, verify rendering |
| T21 - AI Monitor Dashboard | View AI monitoring dashboard |
| T22 - Integrations Overview | View integrations overview |

### P3 — Resilience & Edge Cases

| Test | Description |
|------|-------------|
| T23 - Handle Invalid Navigation Gracefully | Navigate to invalid URL, verify no crash |
| T24 - Session Persistence Reload Page | Reload page, verify session maintained |
| T25 - Multiple Tab Workflow | Open 3 entity tabs, close middle, verify others |

P0 tests are release-blocking. P1/P2/P3 failures are reported but don't block releases.
