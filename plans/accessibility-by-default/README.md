# Accessibility-by-Default Framework Layer — Implementation Plan

**Origin:** selected outcome of the 2026-08-07 weekly creative exploration
([idea 3](../weekly-exploration/2026-08-07/idea-3-accessibility-by-default.md), PR #3605).
**Status:** Phases 1–2 implemented (this plan's companion PR); Phase 3 designed, not started.
**Testers/finalizers:** MattC-BC, CaelebB-BC.

## Goal

Make every UI surface an MJ app ships accessible **by default** — WCAG 2.1 AA — by fixing
accessibility at the framework choke points instead of per-app, and by gating regressions in CI
the same way the design-token system gates hardcoded colors. Context: ADA Title II conformance
deadlines (April 2026 for larger public entities, April 2027 for smaller ones) apply to many
organizations that build on MJ.

## Key architecture findings (what changed vs. the exploration doc)

Reconnaissance for the implementation corrected two assumptions in the original idea doc:

1. **The real choke point is the runtime form components, not CodeGen's emitted strings.**
   CodeGen's generated form HTML is composed almost entirely of `<mj-form-field>` and
   `<mj-collapsible-panel>` elements; the raw DOM (inputs, labels, dropdowns, panel headers)
   is rendered by `@memberjunction/ng-base-forms` at runtime. Fixing accessibility there means
   **every generated form — and every custom form built from the same components — inherits the
   fix instantly, without re-running CodeGen.** That's strictly better leverage than editing
   the CodeGen templates.
2. **The Testing Engine must stay browser-free.** Playwright lives in the Computer-Use stack
   (`packages/AI/ComputerUse`, `packages/AI/MJComputerUse`) as an *optional peer dependency*;
   nothing in `packages/TestingFramework/*` may depend on a browser. So the oracle is
   DOM-agnostic (it evaluates structured findings a driver hands it), and the live-browser
   scan driver belongs next to the Computer-Use driver — Phase 3, not this PR.

## Phase 1 — Runtime form component accessibility (SHIPPED)

All in `packages/Angular/Generic/base-forms`:

### `mj-form-field` (`src/lib/field/`)
- **Label ↔ control association**: every edit control gets a unique per-instance `ControlId`;
  the visible `<label>` now carries `for` + its own `LabelId` (referenced by `aria-labelledby`
  on div-based comboboxes).
- **Validation state**: `aria-required` (from `AllowsNull === false`), `aria-invalid` (while
  error-level failures display), `aria-describedby` pointing at the rendered error/warning
  containers. Error container is `role="alert"`, warnings `role="status"`, so screen readers
  announce them.
- **Accessible names without visible labels**: `aria-label` falls back to the field's
  `DisplayName` whenever `ShowLabel` is false (including the read-only disabled checkbox).
- **Custom select**: previously mouse-only — a keyboard user could not change the value at all
  (WCAG 2.1.1 blocker). Now a full combobox/listbox pattern: `role="combobox"`,
  `aria-expanded`, `aria-haspopup`, `aria-controls`, `aria-activedescendant`; Enter/Space/
  Arrow keys open, arrows + Home/End navigate, Enter/Space commit, Escape closes. Options are
  `role="option"` with `aria-selected` and a keyboard-active highlight.
- **Value-list autocomplete**: same combobox ARIA plus ArrowUp/Down/Enter/Escape keyboard
  navigation (previously none).
- **FK search**: `role="combobox"` + `aria-activedescendant` wired to the results grid, which
  now carries proper `role="grid"`/`row`/`columnheader`/`gridcell` semantics with per-row ids
  and `aria-selected`. Also fixed a latent bug where arrow-key navigation scrolled using a
  selector (`.mj-fk-option`) that doesn't exist in the multi-column grid — active rows now
  scroll into view correctly.
- **Read-only links** (FK/Email/URL/Record): `<a>` elements without `href` are not
  keyboard-focusable; they now carry `role="link"`, `tabindex="0"` and Enter-key activation.
- **Decorative icons**: `aria-hidden="true"`; icon-only buttons got explicit `aria-label`s.

### `mj-collapsible-panel` (`src/lib/panel/`)
- Header (`role="button"`) previously had **no keyboard handler** — Enter/Space now toggle
  (with Space-scroll suppression), and the header advertises `aria-expanded` + `aria-controls`.
- Body is a `role="region"` labelled by the header (unique per-instance id pair).
- "Inherited from X" badge is keyboard-activatable; chevron/icons are `aria-hidden`.

### `chat` package
- One pre-existing `img-alt` violation fixed (decorative welcome image → `alt=""`), which
  makes the **entire `packages/` tree pass `check:a11y:all` (839 templates, 0 violations)**.

## Phase 2 — AccessibilityOracle + `check:a11y` CI gate (SHIPPED)

### `AccessibilityOracle` (`packages/TestingFramework/Engine/src/oracles/AccessibilityOracle.ts`)
- Implements `IOracle` with `type: 'accessibility'`; registered as a built-in alongside the
  other five oracles and exported from the package barrels.
- **DOM-agnostic by design**: consumes an `AccessibilityScanOutput` (`{ violations, scannedPages,
  passedRuleCount }`) that a browser driver passes as `actualOutput`. `AccessibilityViolation`
  deliberately mirrors an axe-core `Result` so a driver maps `axe.run()` output with a one-line
  transform — without this package depending on axe-core.
- Config: `failOn` severity gate (default `['critical','serious']`), `maxViolations` threshold,
  `allowedRules` reviewed-exception list, `scoreDenominator` for linear score decay.
- Unit-tested in `src/__tests__/accessibility-oracle.test.ts` (validation, gating, thresholds,
  allowlist, scoring, detail shape).

### `check:a11y` gate (`.github/scripts/check-a11y-templates.sh`)
- Follows the `check-css-hex-tokens.sh` shell-gate contract exactly: diff vs `origin/next` by
  default, `--base <ref>` / `--all` / `--file <path>` modes, file allowlist at
  `.github/scripts/ci/a11y-allowlist.txt`, `::error` annotations, exit 0/1/2.
- **Deliberately high-precision static ruleset** (each rule is a mechanical WCAG failure with
  near-zero false-positive surface): `img-alt` (1.1.1), `positive-tabindex` (2.4.3),
  `hidden-but-focusable` (aria-hidden + tabindex="0", 4.1.2). Multi-line tags and HTML comments
  are handled correctly.
- Wired as `npm run check:a11y` / `check:a11y:all` and a dedicated PR workflow
  (`.github/workflows/ci-a11y.yml`, diff-scoped, `fetch-depth: 0`).
- The allowlist starts **empty** — the full tree already passes, so the gate begins clean with
  zero seeded debt (the exploration doc's "baseline sizing" open question resolved to: baseline
  is zero).

### Why the gate is static, not axe-in-a-browser
The PR gate must run on every PR without a database or a running Explorer instance. axe-core
against live routes needs both (the Computer-Use regression stack runs in Docker with a DB).
So: static template rules gate PRs cheaply and deterministically today; the live-scan pipeline
is Phase 3 and reports through the Testing Framework rather than blocking PRs. The static
ruleset should grow (e.g. icon-only buttons without accessible names, click-without-keydown on
non-interactive elements) as precision can be maintained.

## Phase 3 — Live scanning, findings entity, dashboard (NOT STARTED)

1. **`AccessibilityAuditDriver`** — a `BaseTestDriver` subclass living alongside
   `ComputerUseTestDriver` (in or next to `packages/AI/MJComputerUse`, which already
   peer-depends on Playwright and depends on `@memberjunction/testing-engine`):
   - `@RegisterClass(BaseTestDriver, 'AccessibilityAuditDriver')`; `axe-core` as an optional
     peer dependency, dynamic-imported with an install hint (same pattern as Playwright).
   - Navigates configured routes via the existing browser harness (`HeadlessBrowserEngine`),
     runs `axe.run()` per route, maps results to `AccessibilityScanOutput`, and lets the
     `accessibility` oracle (already shipped) do the gating/scoring. Screenshots of violating
     regions ship as `TestRunOutputItem[]`.
   - New `MJ: Test Types` metadata row (`DriverClass: 'AccessibilityAuditDriver'`, `uuidgen`
     primary key, no sync block) + test/suite JSON under `metadata/tests/`; runs in the Docker
     regression stack.
2. **`MJ: Accessibility Findings` entity** — persists scan results (route, ruleId, impact,
   WCAG tags, FirstSeenAt/LastSeenAt/ResolvedAt) so trends are queryable; migration + CodeGen.
3. **Accessibility Audit dashboard** — Explorer dashboard (scaffold via `scaffold-mj-dashboard`)
   with per-route conformance cards, a findings table with WCAG references, and an AI
   "explain & suggest a fix" action (mockup:
   [exploration mockup](../weekly-exploration/2026-08-07/mockups/accessibility-audit-dashboard.html)).

## Definition of done for this PR (Phases 1–2)

- `@memberjunction/ng-base-forms` builds; its vitest suite (including the existing
  `form-field` / `collapsible-panel` DOM specs) passes.
- `@memberjunction/testing-engine` builds; its vitest suite (including the new oracle spec)
  passes.
- `npm run check:a11y:all` passes with an empty allowlist.
- `npm run check:ui` passes on changed styles.

## Open questions for reviewers (MattC-BC / CaelebB-BC)

- Should `check:a11y` also join the `check:ui` composite script, or stay standalone? (Currently
  standalone; the composite is documented as the CSS pair.)
- Keyboard UX detail: select currently commits on Space as well as Enter (native `<select>`
  behavior is Enter-commit / Space-toggle) — confirm with a screen-reader pass.
- The FK results grid uses `grid` roles with `aria-activedescendant` on the combobox (ARIA 1.2
  grid-popup pattern) — verify announcement behavior in NVDA/VoiceOver during testing.
