# MJ Explorer Regression Tests

LLM-driven browser regression tests that exercise MJ Explorer end-to-end. Each test is a metadata record (`MJ: Tests` entity) executed by the **ComputerUseTestDriver** — headless Chromium driven by an LLM controller, validated by an LLM judge plus deterministic oracles.

## Quick Reference

```bash
# Run the full suite via Docker
mj test regression up

# Compare the two most recent runs
mj test regression compare

# Validate test definitions without executing
mj test validate --dir=metadata/tests/regression

# Run a single test (against your local DB / dev stack)
mj test run --name "T01 - Login Smoke"
```

## Directory Layout

```
metadata/tests/regression/
├── .mj-sync.json              # Entity sync config (parent: metadata/tests/.mj-sync.json)
├── .T01-login-smoke.json      # Test definition (one file per test)
├── .T02-home-application-load.json
├── ...
└── .T25-multiple-tab-workflow.json

metadata/test-suites/
├── .mj-sync.json
└── .regression-suite.json     # Suite + ordered TestSuiteTest mappings
```

## Anatomy of a Test Definition

Every test file has the same top-level shape (system fields like `primaryKey` and `sync` are auto-managed by `mj sync push` — never write them by hand):

```json
{
  "fields": {
    "TypeID": "@lookup:MJ: Test Types.Name=Computer Use",
    "Name": "T01 - Login Smoke",
    "Description": "What this test verifies, in one or two sentences.",
    "InputDefinition": { /* see below */ },
    "ExpectedOutcomes": { /* see below */ },
    "Configuration":   { /* see below */ },
    "Status": "Active",
    "Tags": "P0,regression,smoke"
  }
}
```

### `InputDefinition` — what the agent should do

```json
{
  "goal": "Plain-English description the LLM controller follows.",
  "startUrl": "http://localhost:4200",
  "allowedDomains": ["localhost", "*.auth0.com"],
  "auth": {
    "bindings": [{
      "domains": ["localhost", "*.auth0.com"],
      "method": {
        "Type": "Basic",
        "Username": "computeruse@bluecypress.io",
        "Password": "computerpassword2!",
        "Strategy": "FormLogin"
      }
    }]
  }
}
```

- **`goal`**: the prompt the controller LLM follows. Be specific about the success state (e.g. "verify the dashboard renders with the user's apps visible") rather than the steps to take. The controller decides the steps.
- **`startUrl`**: where the browser opens.
- **`allowedDomains`**: hostnames the controller is allowed to navigate to (other domains get blocked). Always include `localhost` and `*.auth0.com` for login.
- **`auth.bindings`**: how to handle login pages. The `FormLogin` strategy fills `input[name=username]` / `input[name=password]` and clicks submit when it sees the configured domain.

### `ExpectedOutcomes` — what counts as success

```json
{
  "goalCompleted": true,
  "finalUrlPattern": "^http://localhost:4200(?!/login|/callback)",
  "minConfidence": 0.7,
  "maxSteps": 30,
  "judgeValidationCriteria": [
    "User is logged in and past the Auth0 login screen",
    "MJ Explorer application is visible with navigation elements"
  ]
}
```

- **`finalUrlPattern`**: regex the final browser URL must match. Used by the `url-match` oracle.
- **`minConfidence`**: minimum confidence the LLM judge must report for goal-completion to pass.
- **`maxSteps`**: hard cap on controller iterations. If the agent burns through this without succeeding, the test fails.
- **`judgeValidationCriteria`**: bullet points the judge LLM uses to decide whether the goal was met. Be concrete — these are evaluated against the final screenshot.

### `Configuration` — execution & scoring

```json
{
  "headless": true,
  "maxSteps": 30,
  "maxExecutionTime": 300000,
  "screenshotHistoryDepth": 3,
  "viewportWidth": 1280,
  "viewportHeight": 720,
  "controllerPromptName": "Computer Use - Controller",
  "judgePromptName":      "Computer Use - Judge",
  "judgeFrequency": "EveryNSteps:3",
  "oracles": [
    { "type": "goal-completion", "weight": 0.5, "config": { "minConfidence": 0.7 } },
    { "type": "url-match",       "weight": 0.3, "config": { "pattern": "^http://localhost:4200(?!/login|/callback)" } },
    { "type": "step-count",      "weight": 0.2, "config": { "maxSteps": 30 } }
  ],
  "scoringWeights": {
    "goal-completion": 0.5,
    "url-match":       0.3,
    "step-count":      0.2
  }
}
```

- **`maxExecutionTime`**: hard timeout in ms. If the test wall-clock exceeds this, it's killed.
- **`screenshotHistoryDepth`**: number of recent screenshots passed to the controller as visual context.
- **`judgeFrequency`**: how often the LLM judge re-evaluates progress. `EveryNSteps:3` runs the judge on steps 3, 6, 9, etc. Use `EveryStep` for short tests; `OnStagnation:N` for long ones.
- **`oracles`**: scoring functions. The three built-in ones (`goal-completion`, `url-match`, `step-count`) are usually enough.

## Tags & Priority

Tags drive reporting and (eventually) release-gating logic. The convention:

| Tag | Meaning | Required for release |
|---|---|---|
| `P0` | Critical path — login, navigation, basic CRUD | Yes |
| `P1` | Core functionality — workflows, admin, AI features | Yes |
| `P2` | Extended functionality — settings, lists, dashboards | No |
| `P3` | Resilience & edge cases | No |

Always add `regression` as a tag too. Other useful tags: `smoke`, `crud`, `auth`, `dashboard`.

## Adding a New Test

1. **Pick the next free test number** (T01–T25 are taken; start at T26).
2. **Copy the closest existing test** that does something similar — it's almost always faster than starting from scratch.
   ```bash
   cp metadata/tests/regression/.T07-entity-form-view-record.json \
      metadata/tests/regression/.T26-my-new-test.json
   ```
3. **Edit the new file**:
   - Change `Name` (must be unique across all tests).
   - Rewrite `Description`, `InputDefinition.goal`, and `ExpectedOutcomes.judgeValidationCriteria`.
   - Update `finalUrlPattern` to match where the test should end up.
   - Tune `maxSteps` based on a manual estimate (5 for a simple click, 15+ for multi-step workflows).
   - Update `Tags` (priority + workflow area).
4. **Add to the suite** — open `metadata/test-suites/.regression-suite.json` and append a `MJ: Test Suite Tests` entry under `relatedEntities` with the new `Sequence` number and `TestID`.
5. **Validate locally**: `mj test validate --dir=metadata/tests/regression`
6. **Smoke test single-run**: `mj test run --name "T26 - My New Test"`
7. **Push to DB**: `npx mj sync push --dir=metadata --include=tests,test-suites`

## Tuning Failing Tests

When a test fails, the first questions to ask:

1. **Did the controller hit `maxSteps`?** Check `report.md` step count vs limit. If the workflow legitimately needs more steps, raise `maxSteps` and `step-count` oracle's threshold.
2. **Did the URL match fail?** Look at the actual `finalUrl` in `results.json` — your `finalUrlPattern` regex may be too strict (escape `?` and `.`, allow trailing IDs, etc.).
3. **Did the judge fail with low confidence?** Read the `judgeReason` in the goal-completion oracle's `details`. Often the judge needs more specific `judgeValidationCriteria`.
4. **Is the test flaky?** Run it 3–5 times. If results vary wildly, the goal description is probably ambiguous — be more specific about what success looks like visually.

## Authentication

The test user (`computeruse@bluecypress.io`) is seeded into the Docker DB by `docker/regression/test-metadata/users/.users.json` with both `UI` and `Integration` roles. The `Integration` role is what gives the user permission to create/edit records (needed for tests like T09, T10, T16).

If you add a test that needs broader permissions, update `docker/regression/test-metadata/users/.users.json` to assign additional roles via the `MJ: User Roles` related entity.

## Where Results Go

After every Docker run, results land in `docker/regression/test-results/run-{TIMESTAMP}/`:

- `results.json` — full test outcomes (machine-readable, used by `mj test compare`)
- `report.md` — human-readable summary
- `screenshots/T01_Login_Smoke/step_01.png` — one screenshot per step

A `latest` symlink in `test-results/` always points at the most recent run. Runs **never** overwrite each other — the timestamped folders are permanent until you delete them.

## Related Docs

- [docker/regression/REGRESSION_TESTING.md](../../../docker/regression/REGRESSION_TESTING.md) — running and debugging the Docker stack
- [docker/CLAUDE.md](../../../docker/CLAUDE.md) — Docker environment overview (workbench + regression)
- [plans/regression-testing/plan.md](../../../plans/regression-testing/plan.md) — original design doc
