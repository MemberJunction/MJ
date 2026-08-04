# bring-your-own-app — Mode D scaffold

A minimal scaffold for **Mode D** of the MJ regression suite: boot **your own app** inside the same Docker network as the test-runner, point the runner at it via an in-network hostname (`http://byo-app:3000`), and run your tests against it.

This scaffold gives you the pieces; you bring the app.

## What this folder contains

```
bring-your-own-app/
├── README.md                    (this file)
├── target.json                  Target profile — points the runner at http://byo-app:3000
├── docker-compose.app.yml       Mode D overlay template — adds the `byo-app` service to the regression stack
└── byo-metadata/                MJ test metadata for your suite
    ├── .mj-sync.json
    ├── tests/
    │   ├── .mj-sync.json
    │   ├── .T01-counter-increment.json    (example — adapt to YOUR app's workflows)
    │   └── .T02-contact-form-submit.json  (example — adapt to YOUR app's workflows)
    └── test-suites/
        ├── .mj-sync.json
        └── .byo-suite.json
```

## What to customize

1. **`docker-compose.app.yml`** — choose either `build:` (your app's source + Dockerfile) or `image:` (a pre-built image). Adjust the healthcheck to whatever indicates "YOUR app is ready."
2. **`target.json`** — set `baseUrl`, `auth` (if your app requires login), and `allowedDomains` for your app.
3. **`byo-metadata/tests/*.json`** — the two starter tests describe hypothetical "counter" and "contact form" workflows; rewrite the goals + `judgeValidationCriteria` for workflows in YOUR app. Reference your routes / form fields / expected text.
4. **`byo-metadata/test-suites/.byo-suite.json`** — wires your tests together into the BYO suite the runner executes.

## How it runs

The BYO suite layers on top of the existing 5-container MJ regression stack — it reuses MJAPI/SQL for test storage and reuses the test-runner image for execution. The overlay adds the `byo-app` service and overrides three env vars on `test-runner` to redirect the run.

Via the CLI:

```bash
mj test regression remote \
  --target=./bring-your-own-app/target.json \
  --overlay=./bring-your-own-app/docker-compose.app.yml
```

Or directly with docker compose (from the MJ repo root):

```bash
docker compose \
  -f docker/regression/docker-compose.test.yml \
  -f bring-your-own-app/docker-compose.app.yml \
  --env-file docker/regression/.env.test \
  --profile full \
  up --abort-on-container-exit --exit-code-from test-runner
```

## What runs, in order

1. The base `mj-regression` stack comes up: `sqlserver` → `db-setup` (migrations, codegen, MJ metadata push) → `mjapi` → `mjexplorer` → `test-runner`.
2. The overlay adds `byo-app` to the network and makes `test-runner` wait for its healthcheck.
3. Env-var overrides on `test-runner`:
   - `TEST_SUITE_NAME=BYO Regression Suite` — runs YOUR suite instead of the MJ Explorer one.
   - `EXTRA_METADATA_DIRS=/app/byo-metadata` — pushes your tests + suite to the DB alongside MJ defaults.
   - `MJ_TEST_VAR_baseUrl=http://byo-app:3000` — drives the `{{baseUrl}}` placeholder in every BYO test JSON.
   - `MJ_TEST_VAR_allowedDomains=["byo-app"]` — drives `{{allowedDomains}}` (JSON-parsed automatically because it starts with `[`).
4. The test-runner fires your suite. Results land in `docker/regression/test-results/run-<TIMESTAMP>/`.

## Path notes

Docker Compose resolves relative paths in overlay files using the directory of the **first** `-f` file, not the overlay's own location. The first file is `docker/regression/docker-compose.test.yml`, so paths in `docker-compose.app.yml` are relative to `docker/regression/`. Adjust accordingly if your scaffold lives elsewhere — or use absolute paths.

## Next steps

- Replace the two example tests with goals that exercise YOUR app's real workflows.
- Add additional tests as needed (one JSON file per test).
- If your app needs authentication, fill in `target.json`'s `auth.bindings` (the runner supports several strategies — see the MJ regression suite docs).
