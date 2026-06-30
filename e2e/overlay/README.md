# Chat-overlay e2e toolkit

Reusable Playwright helpers for driving MJExplorer's floating **AI Assistant** overlay (the chat /
realtime co-agent surface). Text mode exercises the **same client-tool infrastructure** as the voice
co-agent, so these verify the agent's app awareness + app-control (NavigateToApp, per-surface
`SetAgentClientTools`, the app-context manifest).

They share the signed-in persistent profile (`.playwright-cli/profile`) used by `e2e/fixtures.ts`.

## Prereqs
- MJExplorer running (`:4201`) + MJAPI (`:4000`).
- A primed, signed-in profile (below).

## Files
| File | What it does |
|---|---|
| `prime-auth.mjs` | Signs into MJExplorer via Auth0 and caches the session into the profile. Creds are read from `packages/MJAPI/.env` (`HEADLESS_AUTH0_TEST_UID`/`_PWD`) — never hardcoded. Run once (and when the session expires). |
| `driver.mjs` | The `withOverlay(fn)` harness — opens the overlay and hands `fn` a small API: `goto(appPath)`, `openOverlay()`, `send(prompt[,waitMs])`, `lastSage()`, `convo()`, `appText()`, `curUrl()`, `shot(name)`, plus `page` + `logs`. Run `node driver.mjs smoke` for a quick end-to-end check. |
| `probe-agent-tools.mjs` | Dumps the client-tool manifest the agent actually receives on a surface vs. what the surface registered. A mismatch = tools registered but not delivered (the bug it caught). |

## Usage
```bash
# one-time (or when auth expires)
node e2e/overlay/prime-auth.mjs

# smoke test the overlay on Home
node e2e/overlay/driver.mjs smoke

# what tools does the agent see on a surface?
node e2e/overlay/probe-agent-tools.mjs /app/data-explorer/Data
```

## Env
- `MJ_EXPLORER_URL` — base URL (default `http://localhost:4201`).
- `PW_HEADED=1` — run headed (default headless).
- `PW_PROFILE_DIR` — override the profile dir (e.g. a fresh, empty-workspace profile to avoid restored
  tabs confounding in-SPA navigation tests).

## Gotchas
- `page.goto()` is a **full reload** — it does NOT exercise the in-SPA component cache. For cached
  reattach behaviour (e.g. navigating app→app→back), navigate by **clicking** in the app, and use a
  **fresh `PW_PROFILE_DIR`** so a restored workspace doesn't preload cached tabs.
- The message input is a `.mention-editor` contenteditable (not a `<textarea>`); the driver types into
  it via the keyboard.
- Screenshots land in `.playwright-cli/shots/` (gitignored).
