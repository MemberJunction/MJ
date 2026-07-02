# MJ Explorer — Playwright UI (e2e) tests

Browser-driven UI tests that exercise a **running** MJExplorer in a real browser.
These are separate from the repo's Vitest unit suite (`npm test` /
`turbo run test`) and are **not** part of the default CI test run — invoke them
explicitly.

## Layout

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Playwright Test config (loads repo `.env` via dotenv; ports/profile via `PW_*` env). |
| `fixtures.ts` | Launches a **persistent browser context** bound to the signed-in `.playwright-cli/profile` so specs start authenticated. |
| `tsconfig.json` | Standalone TS config used for `tsc --noEmit` validation. |
| `specs/*.spec.ts` | The specs. |

## Prerequisites

1. **MJAPI** running (default `:4001`).
2. **MJExplorer** running (default `http://localhost:4201`).
3. The feature's metadata synced into the target environment (e.g. for
   Predictive Studio: the `Predictive Studio` application + its reference data).
4. A **primed, signed-in** persistent profile. Create it once, headed, then it's
   reused across runs (tokens persist ~30 days):

   ```bash
   npx playwright-cli open --headed --profile .playwright-cli/profile http://localhost:4201
   # ...sign in once...
   ```

## Configuration (env)

All overrides come from the environment (repo `.env` is auto-loaded). **No
secrets in spec code** — any credentials must come from `.env`.

| Var | Default | Meaning |
|-----|---------|---------|
| `PW_BASE_URL` | `http://localhost:4201` | MJExplorer base URL. |
| `PW_API_URL` | `http://localhost:4001` | MJAPI URL (informational). |
| `PW_USER_DATA_DIR` | `../.playwright-cli/profile` | Signed-in browser profile dir. |
| `PW_HEADED` / `PWDEBUG` | unset | Set `1` to run headed. |

## Run

```bash
# from repo root
npm run test:e2e

# or directly
npx playwright test --config e2e/playwright.config.ts

# headed / debug
PW_HEADED=1 npx playwright test --config e2e/playwright.config.ts --debug

# list tests without running (also how the specs are validated offline)
npx playwright test --config e2e/playwright.config.ts --list
```

## Specs

- **`specs/predictive-studio.spec.ts`** — Predictive Studio dashboard: loads the
  Studio shell, deep-links each of the 6 panels via `?panel=`, and asserts each
  panel's key elements render (catalog cards + recommendation banner, the
  registry list/detail, the experiments kanban columns, the Compare view-mode
  toggle across its 3 layouts, the visual-DAG pipeline builder, the
  action-forward home), plus that the docked copilot toggle opens the embedded
  chat. Relies on `data-testid` hooks in the PS templates.
