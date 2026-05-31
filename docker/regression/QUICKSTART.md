# Regression Suite Quickstart

A fast path from "git clone" to "passing regression run against my app." If you want the
architectural deep-dive, read [`ARCHITECTURE.md`](ARCHITECTURE.md) after this. For the
operational reference, see [`REGRESSION_TESTING.md`](REGRESSION_TESTING.md).

This guide walks through three goals, in order:

1. **First passing run** against the built-in MJ Explorer suite (~10 min)
2. **Adapting to your app** — pick Mode B, C, or D based on what you own
3. **Pushing results to an archive MJ** — for historical comparison across environments

---

## 1. Prerequisites

| What | Minimum |
|---|---|
| Docker Desktop (Mac/Windows) or Docker Engine + Compose v2 (Linux) | latest stable |
| Node 24+ | required for the `mj` CLI |
| Disk | ~10 GB free for SQL Server volume + Playwright/Chromium image |
| Memory | 8 GB available to Docker (the regression stack reserves 4 GB for SQL Server alone) |
| Auth0 SPA application + a test user | only needed for Mode A and Mode B (MJ targets) |
| Anthropic API key | required — Computer Use drives the browser |

What you do **not** need:
- A second SQL Server — the stack ships one
- A real MJ deployment — the stack boots its own
- Any AWS/cloud credentials

## 2. Bootstrap

```bash
# Clone the monorepo and install workspace deps
git clone https://github.com/MemberJunction/MJ.git
cd MJ
npm install

# Build once (compiles the workspace; required before the CLI works)
npm run build

# Copy the example env file and fill in real values
cp docker/regression/.env.test.example docker/regression/.env.test
# Edit: AUTH0_*, TEST_UID/TEST_PWD, AI_VENDOR_API_KEY__GeminiLLM at minimum.
# Everything else has sensible defaults.
```

The `mj` CLI is installed via `npm install` to the workspace's `node_modules/.bin/`.
Use `npx mj …` from anywhere inside the monorepo.

## 3. First passing run — Mode A (self-contained)

This boots a 5-container stack with its own ephemeral SQL Server, MJAPI, and MJ Explorer,
then runs 25 LLM-driven browser tests against it.

```bash
npx mj test regression up
```

What happens (10–15 min on a cold cache, 5 on a warm one):

1. SQL Server boots, `db-setup` runs Flyway migrations + CodeGen + metadata push
2. MJAPI starts → MJ Explorer starts
3. Test runner pushes test definitions, launches headless Chromium, runs the suite
4. Per-run output lands in `docker/regression/test-results/run-<timestamp>/`:
   - `results.json` — machine-readable
   - `report.md` — score table
   - `report.html` — clickable screenshots
   - `screenshots/` — per-step PNGs
   - `diagnostics.json`, `preflight.json` — health monitor logs

The `latest` symlink in `test-results/` always points at the newest run.

When you're done:

```bash
npx mj test regression down
```

That removes the containers AND wipes the ephemeral SQL volume (`-v`).

## 4. Compare two runs

```bash
npx mj test regression compare
```

Reads the two most recent `run-*/results.json` folders and prints a diff. Exit codes:

- `0` — no regressions
- `1` — regressions detected (test went from Passed → Failed, or score dropped > 0.1)
- `2` — data error (missing or malformed results files)

Useful flags: `--diff-only`, `--format=markdown --output=delta.md`.

To share a run's report as a single self-contained file (screenshots inlined as
base64 — no adjacent `screenshots/` directory needed), export it:

```bash
npx mj test regression export            # most recent run
npx mj test regression export --run=run-<timestamp>
```

This writes `report.standalone.html` into the run directory.

---

## 5. Testing your own app — which mode do you want?

Four modes, picked based on where your app lives:

| Mode | Use when | Setup |
|---|---|---|
| **A** | You're regressing **MJ Explorer itself** | Built in — § 3 above |
| **B** | You have a **remote MJ deployment** (staging, customer prod, etc.) | Edit a target profile + Auth0 bindings |
| **C** | You have a **non-MJ web app** with a stable URL | Edit a target profile + author tests |
| **D** | Your app boots in a **Docker container** you can drop into the regression network | Write a compose overlay |

### Mode B — remote MJ deployment

1. Copy the example target and edit:

   ```bash
   cp docker/regression/targets/staging-mj.example.target.json \
      docker/regression/targets/my-staging.target.json
   ```

   Set `baseUrl`, `allowedDomains`, and the `auth.username` / `auth.password`
   credentials. The example ships these as `env:` references
   (`env:STAGING_TEST_USER` / `env:STAGING_TEST_PASSWORD`) so the secrets stay
   out of the file.

2. Export the env vars the profile references:

   ```bash
   export STAGING_TEST_USER=test-user@example.com
   export STAGING_TEST_PASSWORD=...
   ```

3. Run:

   ```bash
   npx mj test regression remote --target=my-staging
   ```

The regression stack still boots locally (because the test-runner needs SQL + MJAPI to
record TestRun rows). The browser, however, drives `my-staging`'s URL.

### Mode C — generic web app (any URL)

Scaffold a starter project for Mode C from a bundled template:

```bash
mj test regression init generic-web     # creates ./generic-web/
mj test regression remote --target=./generic-web/target.json
```

The MDN reference target runs end-to-end with no auth in ~5 minutes.

To adapt for your own app:

1. Edit `generic-web/target.json` — set `baseUrl`, `allowedDomains`, optional `auth.bindings`
2. Replace the test JSONs under `generic-web/metadata/tests/` with your own (one per user journey)
3. Optionally add custom oracles in `generic-web/oracles/<name>.cjs` and reference via
   `target.json: { oraclesModule: "..." }`

### Mode D — bring-your-own-app (overlay)

Scaffold a Mode D starter (target profile + compose overlay template + suite metadata):

```bash
mj test regression init bring-your-own-app    # creates ./bring-your-own-app/
mj test regression remote \
  --target=./bring-your-own-app/target.json \
  --overlay=./bring-your-own-app/docker-compose.app.yml
```

To adapt for your own app:

1. Author a `docker-compose.app.yml` that brings up your app as service `my-app`
2. Add a healthcheck so the test-runner waits for it
3. Set `baseUrl` to `http://my-app:<port>` in the target profile
4. Author test JSONs that drive your app's UI

### Testing the current Explorer against a `.bacpac`

Import a real MJ database export and run the **local** Explorer build against it
(full stack, DB-init swapped). Drive it with your own suite:

```bash
mj test regression up --bacpac=/path/db.bacpac --suite="My Suite" --metadata=/path/suite-metadata
```

Default behavior upgrades the imported DB (`mj migrate` + `mj codegen`) to the
current build; add `--bacpac-no-upgrade` to test it as-is. The bacpac should come
from a Flyway-managed MJ instance, and `MJ_BASE_ENCRYPTION_KEY` must match the
source if it has encrypted fields. Full details in
[REGRESSION_TESTING.md](REGRESSION_TESTING.md#testing-against-a-bacpac-database).

---

## 6. Archiving results to a separate MJ (optional)

The archive flow pulls the completed `TestSuiteRun` + cascading children from the
local regression DB and pushes them to a destination MJ. The destination is purely
config — set env vars and the flow runs automatically at the end of every suite.

### Destination requirements

Your archive MJ must have:

- The MJ core schema installed (`__mj` schema, applied via Flyway)
- The archive user (`ARCHIVE_USER_EMAIL`) as a row in `__mj.[User]`
- The MJ `Test Types` seed row (specifically `Computer Use`) — Flyway includes this
  by default but a manually-bootstrapped destination may need it pre-seeded

### Add to `.env.test`

Minimum config (everything else has defaults):

```bash
ARCHIVE_DB_DATABASE=mj_archive
ARCHIVE_DB_USERNAME=sa
ARCHIVE_DB_PASSWORD=<destination_password>
ARCHIVE_USER_EMAIL=you@example.com
```

The default `ARCHIVE_DB_HOST=host.docker.internal` works when your destination
publishes its port to the host. Override only when needed (see § 7 below).

### Run and verify

```bash
npx mj test regression up
```

A pre-flight check (~5s) runs before the suite. If your destination is misconfigured,
you'll see the error immediately — not 10 minutes later. On success you'll see:

```
✓ TCP connect to host.docker.internal:1433
✓ SQL auth as sa
✓ Database 'mj_archive' exists
✓ MJ core schema present (schema: __mj)
✓ Archive user 'you@example.com' exists
✓ Archive pre-flight passed — destination is ready.
```

After the suite finishes, the runner pre-seeds test/suite metadata to the
destination, pulls the run, tags it, and pushes:

```
Archiving suite run...
  Pre-seeding destination metadata (tests + test-suites)...
  Pulling suite run + children to .../archive...
  Tagged .<id>.json
  Pushing archive to destination MJ...
✅ Push completed successfully
```

Query the destination to confirm:

```sql
USE mj_archive;
SELECT TOP 5 ID, Status, Tags, MachineName, StartedAt
FROM __mj.vwTestSuiteRuns ORDER BY StartedAt DESC;
```

### Distinguishing runs from different sources

Set `ARCHIVE_TAG` and `ARCHIVE_SOURCE` per run to make multi-source archives
queryable. Examples in this repo: `local-dev` / `workstation` (Mode A), `byo-app` /
`mode-d-byo`, `generic-web-mdn` / `mode-c-mdn`. Then:

```bash
npx mj test regression compare --tag=staging-nightly
```

filters comparison to only runs tagged that way.

---

## 7. Common gotchas (real failures from real users)

### "Login failed for user 'sa'" connecting to destination

Almost always means the destination database **does not exist**, not that the
password is wrong. SQL Server gives a generic auth error when you try to use a
default DB that's missing. Check:

```bash
docker exec <sqlserver-container> /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P '<pwd>' -C \
  -Q "SELECT name FROM sys.databases;"
```

If the DB isn't in the list, create it and apply Flyway migrations + CodeGen.

### "getaddrinfo ENOTFOUND mj-sqlserver" — destination hostname unresolvable

The destination is in a separate docker container on its own bridge network. The
test-runner is on `mj-regression_default`. Docker DNS doesn't cross networks. Fix:

```bash
docker network connect mj-regression_default <destination-container-name>
```

Alternatively, use `ARCHIVE_DB_HOST=host.docker.internal` and rely on the host's
exposed port. The compose file already declares `extra_hosts: host-gateway` so
this works on Linux too.

### Archive push fails with `LOOKUP FAILURE` on `MJ: Test Suites` or `MJ: Tests`

The destination is missing prerequisite metadata. The current pre-seed pushes
`metadata/tests` + `metadata/test-suites`, but won't help if the destination is
truly fresh (e.g., has not been seeded with the `Computer Use` `Test Type` row).
Either:

- Push the missing entity records manually:
  `MJ_CONFIG_FILE=<archive-config> npx mj sync push --dir=metadata --include=test-types`
- Or seed your destination once with a full `mj sync push --dir=metadata` against
  it before the first regression run.

### "Cannot find docker-compose.test.yml" — wrong working directory

Run all `mj test regression *` commands from the monorepo root. The CLI checks
for `docker/regression/docker-compose.test.yml` relative to cwd and exits cleanly
with a hint when missing.

### Suite "passes" but you suspect the LLM hallucinated success

Open `report.html` and look at the screenshots step-by-step. The Computer Use
judge can occasionally claim success on a page that doesn't actually match what
the test expected. If you see this, tighten the test's `goal` field with more
explicit success criteria, and add a `url-match` or custom oracle for hard
assertions.

### "MJ_CONFIG_FILE is set globally" — pull goes to wrong DB

If you set `MJ_CONFIG_FILE` as a container-wide env var (e.g., via `docker run -e`),
the **pull** step uses the archive config instead of the local DB config and finds
zero records to archive. The entrypoint correctly scopes `MJ_CONFIG_FILE` to the
push command only — don't override it globally.

---

## 8. Where to go next

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — full design: four run modes, compose
  profile gating, archive cascade, browser context isolation, custom oracle plumbing,
  CLI surface, file inventory
- **[REGRESSION_TESTING.md](REGRESSION_TESTING.md)** — operational reference: every
  subcommand, every env var, every output file
- **[LIMITATIONS.md](LIMITATIONS.md)** — known gaps and future work
- **`mj test regression init --list`** — copy-paste starting points for Modes B, C, D (scaffolded by the CLI; templates ship with `@memberjunction/cli`)

If you hit something this quickstart doesn't cover, search the architecture doc
first — most rough edges have an explanation buried in there.
