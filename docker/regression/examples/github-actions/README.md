# GitHub Actions — CI Integration Sample

Copy-paste workflow file for running the agentic test runner in CI. Drop it
into your repo's `.github/workflows/` directory, configure the secrets, and
you'll have nightly regression coverage + per-PR smoke tests.

## Files

- [`regression.yml`](regression.yml) — sample workflow with two jobs (one
  commented out): `remote-target` (Mode B/C — hit a deployed app) and `byo`
  (Mode D — bring up the app inside the workflow).

## Setup checklist

1. **Copy the workflow file** to your repo: `.github/workflows/regression.yml`.
2. **Configure repository secrets** (`Settings → Secrets and variables → Actions`):
   - `ANTHROPIC_API_KEY` — Computer Use controller/judge LLM
   - `APP_TEST_USER` — test account username
   - `APP_TEST_PASSWORD` — test account password
3. **Add a `tests/` directory** to your repo with metadata JSONs matching the
   MJ TestingFramework shape — see [`../generic-web/metadata/tests/`](../generic-web/metadata/tests/)
   for the layout.
4. **Pin the runner image version** in `env.RUNNER_IMAGE`. Use a specific tag
   like `memberjunction/agentic-test-runner:v5.30.0`, not `:latest`, so your
   CI matrix is reproducible.
5. **Edit the URL + suite name** in the `Run regression suite` step to match
   your deployment.

## What gets uploaded as an artifact

Every run uploads `test-results/run-*/` to the workflow artifacts. Contents:

- `results.json` — machine-readable suite results.
- `report.html` — self-contained HTML gallery with screenshots.
- `report.md` — markdown summary.
- `screenshots/` — per-step PNGs.
- `preflight.json`, `diagnostics.json` — health probes.

Open the HTML report by downloading the artifact and unzipping it locally.

## Failure semantics

The runner exits 1 when any test failed and 0 when all passed. GitHub Actions
fails the job on non-zero exit, so a failing test breaks the build and
notifies PR authors via the usual checks UI.

For finer-grained signals (regressions vs. failures), wire up a comparison
step against a previous run by adding `mj test compare --from-json` against
an archived baseline. Useful when the suite has long-running tests that may
have transient noise — you only care about regressions, not absolute failures.

## Cost note

Computer Use suites are LLM-driven and incur per-step Anthropic costs (~$0.30
per test, ~$10 for a 25-test suite). Don't put this on `push` triggers for a
busy repo — use `pull_request` + `schedule` + `workflow_dispatch` instead.
