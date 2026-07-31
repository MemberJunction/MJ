# Element-Grounding Interception Bugs — Two Confirmed Defects

Found while investigating the 7 remaining `ClickElement` failures in Computer Use regression
run `run-20260728T201832Z` (MJ Explorer Regression Failures subset, 7/23). All 7 failures share
one signature: the element resolves, Playwright reports it "visible, enabled and stable", and the
click is then blocked by another element intercepting pointer events until the action budget expires.

Two distinct root causes, both reproduced live and both with a verified fix. A third case is correct
browser behavior and needs no fix.

**Repro environment:** live regression stack (`docker/regression/docker-compose.test.yml`),
MJExplorer at `localhost:4200`, viewport **1280x720** (matches the suite), user
`computeruse@bluecypress.io`, Chromium via `playwright-cli`.

---

## Issue 1 — Interactivity probe lists invisible, inert elements (Computer Use framework)

**Owner:** `@memberjunction/computer-use`
**Causes:** T079 — Admin Database Designer (1 failure/run, but pollutes *every* element list)
**Severity:** High — corrupts element-grounded perception app-wide
**Status:** ✅ Fixed in `element-extraction.ts` — `checkVisibility()` + `pointer-events` guard.
Verified live on 3 pages (32–41 elements each): exactly the 3 phantom entries dropped per page,
**0 elements dropped that were still hit-testable**.

### Symptom
The controller is offered `combobox "MJ: Actions"` in its Interactive Elements list on pages where
no such control is visible. Clicking it can never succeed, so the step burns its full action budget
and the run drifts into loop detection.

### Root cause
`extractInteractiveElements` in
[`packages/AI/ComputerUse/src/browser/element-extraction.ts`](../packages/AI/ComputerUse/src/browser/element-extraction.ts)
filters visibility using **only the element's own computed style**:

```javascript
const style = window.getComputedStyle(el);
if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return;
```

`getComputedStyle` does not inherit `opacity`, and the probe never consults `pointer-events`. So the
standard "mounted but closed" overlay idiom slips straight through. MJExplorer's global search popup
([`shell.component.css`](../packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.css), `.search-popup`) uses exactly that idiom:

```css
.search-popup      { opacity: 0; transform: translateY(-10px); pointer-events: none; }
.search-popup.open { opacity: 1; transform: translateY(0);     pointer-events: all;  }
```

Its descendant `div.mj-dropdown[role="combobox"][tabindex="0"]` matches the probe's interactive
selector, has a real on-screen box, and reports its *own* opacity as `1` — so it is listed.

### Measured on `/app/admin/Data & Schema` (fully loaded, `data-mj-ready="true"`)

| Property | Value |
|---|---|
| box | `x:1116 y:63 w:180 h:38` — identical to the failing run |
| own `opacity` / `visibility` / `display` | `1` / `visible` / `flex` |
| computed `pointer-events` | **`none`** |
| nearest ancestor with `opacity: 0` | **`div.search-popup`** |
| `Element.checkVisibility({opacityProperty, visibilityProperty})` | **`false`** |
| probe's own-element visibility check | **passes (bug)** |
| `elementFromPoint` at its center | `h1.mj-page-header-title` — identical to the failing run |

Both the box and the reported interceptor match the production failure exactly.

### Fix
Two independent guards; either alone fixes T079, both are worth having:

1. Replace the hand-rolled visibility test with `Element.checkVisibility({ opacityProperty: true,
   visibilityProperty: true, contentVisibilityAuto: true })`, which correctly accounts for
   ancestor-driven invisibility. Confirmed above to return `false` for this element. Chromium 105+,
   so always available under Playwright.
2. Skip elements whose computed `pointer-events` is `none` — an element that cannot receive a
   pointer event is not interactive by definition.

### Note on the `h1`
`h1.mj-page-header-title` is **innocent**. It is 1500px wide and simply sits underneath the phantom
dropdown, so it is what `elementFromPoint` returns. There is no page-header layout bug here — an
earlier hypothesis that the title overlapped the toolbar is now cleared.

---

## Issue 2 — PS Studio Algorithm Catalog: filter chips are unclickable (app CSS)

**Owner:** `packages/Angular/Explorer/dashboards` — Predictive Studio
**Causes:** T069 — PS Studio-Door Workbench Tour (4 of the 7 failures; has never passed)
**Severity:** High — the control is unusable for real users, not just the agent
**Status:** ✅ Fixed in `ps-catalog.component.css` — `.ps-catalog > .ps-card { flex-shrink: 0; }`

### Symptom
On **Predictive Studio → Studio → Algorithm Catalog**, the scenario filter chips
(`[data-testid="ps-catalog-scenario-chip"]`) render behind the opaque algorithm gallery cards.
Clicks land on a gallery card instead of the chip, so the filter cannot be operated.

### Root cause
A flexbox shrink bug. `.ps-panel.ps-catalog` is `display: flex; flex-direction: column`, and its
children get the default `flex-shrink: 1`. When the panel is height-constrained, `.guide-card` is
compressed **below its content height** while `overflow` stays visible, so its body spills out and
overlaps the next flex sibling `.gallery`. Cards inside the gallery are `position: relative`
([`ps-catalog.component.css`](../packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-catalog.component.css), `.acard`), so they paint above the overflowing static
content and win the hit test.

### Measured at 1280x720

| Element | Rect (top→bottom) | Height |
|---|---|---|
| `.ps-card.guide-card` (flex child) | 169 → 215 | **45.6px** |
| `.ps-card-body` (its own child) | 170 → 336 | **165.9px** ← overflows parent by ~120px |
| `.chips-row` (inside the body) | 252 → 320 | 68.5px |
| `.gallery` (next flex sibling) | **231** → 876 | 645.4px |

`.chips-row` (252–320) sits inside `.gallery`'s range (231–876) — they overlap. `elementFromPoint`
at a chip's center returns `div.nm`, a gallery card's title, not the chip.

### Verified fix
Injected live via `addStyleTag` and re-measured:

```css
.ps-catalog > .ps-card { flex-shrink: 0; }
```

| | `.guide-card` height | chip hit-testable | `elementFromPoint` at chip center |
|---|---|---|---|
| before | 46px | **false** | `div.nm` (gallery card title) |
| after | 168px | **true** | `button.chip` ✅ |

Prefer `flex-shrink: 0` (or `flex: 0 0 auto`) on the panel's card children over adding `overflow`,
since the content genuinely needs its full height.

---

## Not a bug — T124, Message Logs Filter And Search (2 failures)

Both failures are blocked by `div.cdk-overlay-backdrop.mj-filter-popover-backdrop`. The filter
popover was open (`aria-expanded="true"`) and CDK's backdrop covers the page **by design** — that is
how the popover is dismissed. The agent then tried to click the Refresh button and the popover
trigger straight through it.

This is an agent-strategy gap, not a defect. It is addressed by the error-distillation change in
[`packages/AI/ComputerUse/src/engine/action-error.ts`](../packages/AI/ComputerUse/src/engine/action-error.ts):
the controller previously saw a bare `Timeout 8000ms exceeded` (which reads as "the element isn't
there") buried under a 15-line Playwright call log, and retried the identical click. It now receives
the named blocker plus the recovery — press Escape, or click the covering element.

---

## Issue 3 — Auth0 consent screen is the dominant regression-flakiness source (config)

**Owner:** Auth0 tenant config (`dev-n1t563mrdhqg0t41`, app **MJ-Test**)
**Causes:** the `auth-detour` failure class — the single largest swing factor in subset pass rate
**Severity:** High for suite reliability; zero product impact
**Status:** ⚠️ Mitigated by accepting the grant once (see below); durable fix is a tenant setting.

Auth-detour kills correlate almost perfectly with the subset pass count across five runs:

| Run | Grounding | Pass | Auth-detour kills |
|---|---|---|---|
| 172945Z | off | 6 | 0 |
| 182001Z | off | 8 | 1 |
| 191518Z | on, pre-fix | **2** | **5** |
| 201832Z | on, heal fix | 7 | 2 |
| 213034Z | on, heal+distill | 9 | 0 |

The detour target is always `https://…auth0.com/u/consent?state=…` — **not** `/u/login`. Reproduced
live: with a valid Auth0 session, an authorize round-trip lands on Auth0's **"Authorize App"** screen
(`MJ-Test is requesting access to your … account`, Decline/Accept). It is a consent prompt, not a
credential prompt, so the session was never the problem.

`MaxDetours` is 2, so the second consent redirect terminates the test as `Failed/AuthDetour` — a
class the driver itself labels "an infrastructure/session fault, not an agent failure", yet which
still competes for the shared retry budget and usually finds it exhausted.

**Mitigation applied:** the consent grant was accepted once for `computeruse@bluecypress.io` + MJ-Test.
A subsequent authorize (after clearing `localhost` cookies) did **not** re-prompt, so Auth0 persisted
the grant. Expect the auth-detour class to disappear until the tenant/user grant is reset.

**Durable fix:** in the Auth0 dashboard, mark MJ-Test **first-party** and/or enable **Allow Skipping
User Consent** so a fresh DB/user can never reintroduce it. Without that, any tenant reset or new test
user silently restores a ~20%-pass-rate swing.

---

## Footnote — invalid resource routes hang instead of erroring

Low priority, separate concern, filed only so it is not lost. A deep link whose resource segment does
not match a nav item — e.g. `/app/admin/AdminDataSchema` (the `DriverClass`) instead of
`/app/admin/Data & Schema` (the nav `Label`) — leaves the shell in `.shell-loading` **indefinitely**:
`data-mj-ready` never becomes `true` and no error is surfaced. Verified over 40s+ against four Admin
resources. Correct routes load normally, so this is not a `NotifyLoadComplete` regression — an
unresolvable route just has no failure path.
