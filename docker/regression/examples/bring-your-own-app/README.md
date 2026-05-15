# bring-your-own-app — Example Mode D Target

A minimal **Angular + Express** demo app shipped alongside the regression suite as a **Mode D** target (boot your app inside the same docker network as the test-runner, point the runner at it via in-network hostname).

The app has **two intentional bugs** for the regression runner to catch:

| Route | What it claims to do | Bug |
|---|---|---|
| `/counter` | Display a counter that increments when you click `+1`. | The `+1` button **decrements** the counter instead. |
| `/contact` | Contact form that shows "Thanks!" after submission. | The `Submit` button is wired to a no-op handler — nothing happens on click. |

Two corresponding tests live in [`tests/`](tests/) — `.T01-counter-increment.json` and `.T02-contact-form-submit.json`. The runner's LLM controller is expected to navigate to each page, attempt the workflow, and **fail** the goal because the page doesn't behave as described. That's the demo: this is what a real regression catch looks like when a working app starts misbehaving.

## Layout

```
bring-your-own-app/
├── README.md                       (this file)
├── Dockerfile                      Multi-stage: ng build → node:24-slim runtime
├── docker-compose.app.yml          Mode D overlay — boots this app alongside the regression stack
├── target.json                     Reference target profile (documentation; not yet consumed by an init flow)
├── app/                            Angular + Express source
│   ├── package.json
│   ├── angular.json
│   ├── tsconfig.json
│   ├── server.mjs                  Express; serves built Angular + /api/healthcheck
│   └── src/
│       ├── index.html
│       ├── main.ts
│       ├── styles.css
│       └── app/
│           ├── app.component.ts
│           ├── app.routes.ts
│           ├── counter/counter.component.ts   (BUG #1)
│           └── contact/contact.component.ts   (BUG #2)
├── tests/                          MJ test definitions targeting this app
│   ├── .mj-sync.json
│   ├── .T01-counter-increment.json
│   └── .T02-contact-form-submit.json
└── suites/                         Suite that wires the two tests together
    ├── .mj-sync.json
    └── .byo-suite.json
```

## Quick smoke check (Docker only)

Build the image and run it standalone — confirms the app works before involving the runner:

```bash
docker build -t mj-regression-byo-app:dev .
docker run --rm -p 3000:3000 mj-regression-byo-app:dev
# In another terminal:
curl -sf http://localhost:3000/api/healthcheck   # → {"ok":true,...}
open http://localhost:3000/counter               # click +1, see the bug
open http://localhost:3000/contact               # fill the form, click Submit, see the bug
```

## Run the BYO suite via the regression runner

The BYO suite layers on top of the existing 5-container regression stack — it reuses MJAPI/SQL for test storage and reuses the test-runner image for execution. The overlay (`docker-compose.app.yml`) adds the `byo-app` service and overrides three env vars on `test-runner` to redirect the run.

```bash
# From the repo root:
docker compose \
    -f docker/regression/docker-compose.test.yml \
    -f docker/regression/examples/bring-your-own-app/docker-compose.app.yml \
    --env-file docker/regression/.env.test \
    up --build --abort-on-container-exit --exit-code-from test-runner
```

What that runs:

1. The base `mj-regression` stack comes up: `sqlserver` → `db-setup` (migrations, codegen, MJ metadata push) → `mjapi` → `mjexplorer` → `test-runner`.
2. The overlay adds `byo-app` to the network and makes `test-runner` wait for it to be healthy.
3. The overlay's env-var overrides change what `test-runner` does:
   - `TEST_SUITE_NAME=BYO Regression Suite` — runs the BYO suite instead of the MJ Explorer suite.
   - `EXTRA_METADATA_DIRS=/app/byo-tests,/app/byo-suites` — pushes the BYO tests + suite to the DB alongside the MJ defaults.
   - `MJ_TEST_VAR_baseUrl=http://byo-app:3000` — drives the `{{baseUrl}}` placeholder in every BYO test JSON.
   - `MJ_TEST_VAR_allowedDomains=["byo-app"]` — drives `{{allowedDomains}}` (JSON-parsed automatically because the value starts with `[`).
4. The test-runner fires both BYO tests. Each is expected to FAIL because of the intentional bugs; failure is the demo.

Outputs land in `docker/regression/test-results/run-<timestamp>/` exactly like a normal regression run — JSON results, markdown report, HTML report with screenshots.

Teardown:

```bash
docker compose \
    -f docker/regression/docker-compose.test.yml \
    -f docker/regression/examples/bring-your-own-app/docker-compose.app.yml \
    down -v
```

## How the `{{baseUrl}}` plumbing works

The test JSONs use placeholders:

```jsonc
"startUrl": "{{baseUrl}}/counter",
"allowedDomains": "{{allowedDomains}}"
```

At test-execution time, [`ComputerUseTestDriver`](../../../../packages/AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts) walks the parsed `InputDefinition`, `Configuration`, and `ExpectedOutcomes` and substitutes `{{key}}` strings using values from two layered sources (resolver values override env vars):

1. **`MJ_TEST_VAR_*` env vars** — `MJ_TEST_VAR_baseUrl=http://byo-app:3000` becomes `baseUrl`. JSON-looking values are auto-parsed, so `MJ_TEST_VAR_allowedDomains='["byo-app"]'` becomes an array.
2. **TestingFramework variable resolver** — schema-validated, populated by CLI `--var foo=bar` flags when a TestType has a VariablesSchema declared.

This is what makes the same test JSON reusable across the MJ regression suite (Mode A), a remote MJ staging instance (Mode B), and arbitrary apps like this one (Modes C / D) — only the values change, not the test definition.

## What's intentionally NOT here (yet)

Per the implementation plan, several pieces are still in flight:

- `target.json` is a forward-looking shape that documents the eventual `mj test regression remote --target=...` path. Today the env-var overrides in `docker-compose.app.yml` do the actual work; the target profile lives in the repo as the spec the CLI will eventually consume.
- `mj test regression *` CLI subcommands are not yet wired (that's Phase 4 Part B of the plan). The existing `npm run regression:*` scripts continue to work for the base MJ flow; the BYO overlay invocation uses raw `docker compose` directly until the CLI ships.
