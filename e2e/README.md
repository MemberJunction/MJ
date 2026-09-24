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
- **`specs/user-routines.spec.ts`** — User Routines in the Chat app: the
  sidebar Routines section renders (bottom-pinned, permission-gated), then the
  full **live** story — create an every-minute "Sage says hi" routine through
  the slide-in editor (agent tree picker, Advanced cron), let the REAL
  1-minute dispatcher inside MJAPI claim and run it (nothing mocked; requires
  a working AI setup for Sage), assert the Success chip, the history row with
  its in-app-notification bell and linked Agent-run record, then delete the
  routine through the UI (cleanup is guaranteed via try/finally). Budget ~8
  minutes for the live test.
- **`specs/omnibar.spec.ts`** — Unified Command Palette (omnibar):
  Ctrl/Cmd+K opens the centered palette over the shell; plain text runs the
  cross-source global search (grouped rows + "See all results" opens the
  Search Results tab); `#` switches to Jump-to-Record mode, `/` to Commands
  mode (Enter on an app row switches apps), `@` lists agents (tolerantly
  skipped when none are available); Escape closes, and the header affordance
  opens the palette on click. Uses `omnibar-optin.ts` helpers to ensure the
  `Shell.Omnibar.Enabled` flag state.
- **`specs/chat-drafts.spec.ts`** — Composer draft persistence
  (UserInfoEngine-backed, key `mj.chat.drafts.v1`): a draft typed into the
  new-conversation composer — including a resolved agent-mention pill staged
  via the omnibar — survives a full page reload (the pill rehydrates as a
  pill, the typed tail is intact), and clearing the composer clears the
  persisted draft (no ghost restore). Syncs deterministically on the
  pipeline's `[Drafts]` console signals instead of sleeps; cleans up after
  itself since drafts persist per-user server-side.

- **`specs/a11y.spec.ts`** — Page-level accessibility (axe-core): the signed-in
  Explorer shell (Home) and the omnibar palette scanned against WCAG 2.0/2.1
  A+AA rule tags in a real browser (the jsdom widget tier can't evaluate
  contrast or landmark rules). Known violations are parked in `*_DEBT_RULES`
  lists with `// A11Y-DEBT:` comments while the rest keep gating. **Not in the CI
  invocation yet** — run locally with the primed profile.

## CI wiring

`.github/workflows/release-test.yml` runs `omnibar.spec.ts` + `chat-drafts.spec.ts`
nightly (and on dispatch with `run_e2e`) when the `E2E_PW_PROFILE_B64` secret — a
base64'd tar.gz of a primed signed-in `.playwright-cli/profile` — is configured,
along with the matching `E2E_TENANT_ID`/`E2E_WEB_CLIENT_ID` auth secrets. Without
the secrets the job's steps are skipped and it finishes **green with a prominent
`::warning`** in the run summary — it never fails the release, and never silently
claims to have validated the UI. The live `user-routines` spec and
`predictive-studio` (needs its metadata synced) remain local-only.
