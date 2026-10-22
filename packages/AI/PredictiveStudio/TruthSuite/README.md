# `@memberjunction/predictive-studio-truth-suite`

Predictive Studio planted-truth test suite: the 111-gate registry, seeded world and scenario generators, `pstruth` test schema loaders, harness, Python judges, and reference pipeline. Repo-local test content (`private: true`); never published.

## 1. What the Suite Proves

Every gate in `gates/gates.json` tests a specific Predictive Studio contract against a planted-truth world (`W1`–`W9`, `C1`–`C3`) or time-series scenario (`T1`–`T6`, `D1`–`D5`, `M1`–`M3`) where the true data-generating process (`TrueP`, structural coefficients, censoring dates, and regime shifts) is known before any model is fit.

**Division of labor with the integration-test-suite rigs:** The existing ten Predictive Studio rigs under `packages/TestingFramework/integration-test-suite/rigs/ps-*.ts` (gated by `PS_INTEGRATION=1`: operate flow, scheduled scoring, scored query, agent builder, agent run, and five live lifecycle flows) prove in-process engine seams under `PS_INTEGRATION=1`. This truth suite judges planted-truth gates end-to-end over a running MJAPI and sidecar. Do not introduce a third test surface. Test-only metadata for the `pstruth` schema (`AllowDirectSQLInsert`/`Update`/`Delete` opt-ins) intentionally lives package-local under `TruthSuite/metadata/` (plan decisions `D2-05` and `D2-40`) rather than `metadata-optional/`, and `truth:run` automatically runs `pnpm run truth:clean` at teardown to remove `PSTruth:`-prefixed fixtures in FK-safe order unless `TRUTH_KEEP_FIXTURES=1` is set.

## 2. Registry and Outcomes

All 111 gates live in `gates/gates.json` from day one:
- **`Status: "required"`** — must pass (`pass`); failing (`fail`) fails the CI job.
- **`Status: "expected-fail"`** — a gate whose product fix has not yet landed (`xfail` when it fails as expected, `xpass` once its milestone lands before its final flip to `required`, `not-implemented` when still a stub).
- **`error`** — harness, sidecar, or database error; always fails the CI job regardless of gate status.
- **`not-run`** — skipped because its lane (`nightly` / `weekly`) or prerequisite (`live-model`, `bizapps-common`) is not active.

Validate the registry locally (and against `origin/next` to verify no gate is deleted, downgraded, or silently edited):

```bash
pnpm --filter @memberjunction/predictive-studio-truth-suite run truth:registry -- --against origin/next
```

## 3. Lanes

- **`pr`** — runs on PRs touching Predictive Studio or TruthSuite: Phase-0 `pr` gates + every stub.
- **`nightly`** — runs `pr` + `nightly` gates (including the 60-seed `W2 → C1.1` noise gate and bridged Feature Pipeline gates against `bizapps-common`).
- **`weekly`** — runs all gates, including 400-seed statistical gates, `W8`, and live-model story gates (`G0.6`).

## 4. End-to-End Local Loop

Assuming your `.env` in the repository root defines `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `CODEGEN_DB_USERNAME`, `CODEGEN_DB_PASSWORD`, `DB_TRUST_SERVER_CERTIFICATE`, `GRAPHQL_PORT`, and `MJ_API_KEY`:

### Step 1: Create the isolated database

```bash readme-step
sqlcmd -S "$DB_HOST,$DB_PORT" -U "$DB_USERNAME" -P "$DB_PASSWORD" -C -Q "IF DB_ID(N'$DB_DATABASE') IS NULL CREATE DATABASE [$DB_DATABASE];"
```

### Step 2: Install dependencies and build packages

```bash readme-step
pnpm install --frozen-lockfile
npx turbo build --filter=@memberjunction/cli --filter=mj_api --filter=@memberjunction/predictive-studio-truth-suite... --filter=@memberjunction/ng-dashboards --filter=@memberjunction/integration-test-suite
```

### Step 3: Migrate core schema, push metadata, and provision `pstruth`

```bash readme-step
MJ_MIGRATION_REQUEST_TIMEOUT=120000 node packages/MJCLI/bin/run.js migrate
node packages/MJCLI/bin/run.js sync push --dir=metadata --ci
node packages/MJCLI/bin/run.js sync push --dir=metadata-optional/integration-test --ci
node packages/AI/PredictiveStudio/TruthSuite/scripts/provision.mjs
```

### Step 4: Set up Python virtual environments and fetch the Loom pin

```bash readme-step
pnpm --filter @memberjunction/predictive-studio-sidecar run setup:python
pnpm --filter @memberjunction/predictive-studio-truth-suite run setup:python
pnpm --filter @memberjunction/predictive-studio-truth-suite run truth:loom
```

### Step 5: Start the single-threaded truth sidecar and MJAPI

```bash readme-step
rm -f packages/AI/PredictiveStudio/TruthSuite/.run/sidecar.url
(cd packages/AI/PredictiveStudio/TruthSuite && nohup pnpm run truth:sidecar > /tmp/truth-sidecar-$GRAPHQL_PORT.log 2>&1 &)
for i in $(seq 1 60); do [ -s packages/AI/PredictiveStudio/TruthSuite/.run/sidecar.url ] && break; sleep 2; done
export PREDICTIVE_STUDIO_SIDECAR_URL=$(cat packages/AI/PredictiveStudio/TruthSuite/.run/sidecar.url)
export MJ_DISABLE_TASK_GRAPH_DISPATCHER=1
(cd packages/MJAPI && nohup node dist/index.js > /tmp/mjapi-$GRAPHQL_PORT.log 2>&1 &)
for i in $(seq 1 36); do curl -fsS "http://localhost:$GRAPHQL_PORT/healthcheck" >/dev/null 2>&1 && break; sleep 5; done
curl -fsS "http://localhost:$GRAPHQL_PORT/healthcheck"
```

### Step 6: Run the `pr` truth-suite lane

```bash readme-step
cd packages/AI/PredictiveStudio/TruthSuite && pnpm run truth:run -- --mode pr
```

## 5. Adding a Gate Body

1. Replace the gate's `Implementation` in `gates/gates.json` from `{ "Kind": "stub" }` to `{ "Kind": "body" }` (or `{ "Kind": "mj-test", "TestName": "..." }`).
2. Add `TruthGate.Define('<TestName>', async (h) => { ... })` in `gates/*.gates.test.ts`.
3. Verify the gate reports `xfail` before the product fix and `xpass` after the product fix.
4. Flip `"Status"` from `"expected-fail"` to `"required"` in `gates/gates.json` once the gate passes in CI.

## 6. Data, Loom Pin, and Python Judges

- **Loom pin**: `fixtures/loom.json` pins `MemberJunction/loom` by commit SHA. `pnpm run truth:loom` clones and verifies the pin under `.loom/`.
- **Regeneration check**: `pnpm run test:regeneration` verifies that all 9 worlds and 14 scenario specs regenerate byte-identically against `fixtures/golden-hashes.json`.
- **Python judges & reference pipeline**: `pnpm run test:python` runs the fast pytest suite; `pnpm run test:python -- -m slow` reproduces the 20 reference numbers from the assessment.

## 7. Troubleshooting

- **`error` outcomes**: Inspect `results/<run>/gates/<GateID>.json` (`Error` field) and `/tmp/mjapi-*.log` / `/tmp/truth-sidecar-*.log`.
- **`pstruth` entities missing**: Run `pnpm run truth:provision` and restart MJAPI so the server reloads metadata.
- **Determinism mismatch (`W1 → S5.4`)**: Ensure MJAPI was booted with `PREDICTIVE_STUDIO_SIDECAR_URL` pointing to `pnpm run truth:sidecar` (`OMP_NUM_THREADS=1`).
