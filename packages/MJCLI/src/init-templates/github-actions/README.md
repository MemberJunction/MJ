# GitHub Actions — run the regression suite from your own repo

[`regression.yml`](regression.yml) is a copy-paste workflow that runs the suite
against your MJ instance using the published `memberjunction/agentic-test-runner`
image — **no MJ monorepo checkout**.

## Use it

1. Copy `regression.yml` to `.github/workflows/regression.yml` in your repo.
2. Add your suite next to it: a `my-suite/target.json` (baseUrl + auth `env:`
   refs + suite name) and `my-suite/metadata/` (tests + test-suites). Scaffold a
   starting point with `mj test regression init remote-mj`.
3. Add repo **secrets** (names match the root `.env` convention):
   - `AI_VENDOR_API_KEY__GeminiLLM` (primary model) — and/or `AI_VENDOR_API_KEY__AnthropicLLM`
   - `DB_HOST` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` — a reachable MJ
     provider DB (your instance under test, or a throwaway) where test
     definitions/prompts are pushed and results recorded.
   - any auth vars your `target.json` references (e.g. `STAGING_TEST_USER`).
4. Pin `IMAGE` to the MJ version your instance runs.

Results (incl. `report.html` + screenshots) upload as the `regression-results`
artifact. Diff locally with `mj test regression compare`.

> This is Mode B/C (drive a URL). For Mode D (boot your app in CI alongside the
> runner) add your app via `docker compose` and `mj test regression remote
> --overlay`, or a services: block. See [REGRESSION_TESTING.md](../../REGRESSION_TESTING.md).
