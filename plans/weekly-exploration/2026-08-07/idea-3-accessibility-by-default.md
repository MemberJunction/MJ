# Idea 3: Accessibility-by-Default Framework Layer

**Week of 2026-08-07 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

ADA Title II regulations set hard deadlines — April 2026 for larger public entities, April 2027 for smaller ones — requiring public-facing digital services to meet WCAG 2.1 AA conformance. Associations, nonprofits, universities, and government-adjacent organizations that receive federal funds or serve the public are squarely in scope, and most of them have neither an accessibility specialist on staff nor the budget to hire one. Meanwhile, the actual stakes are human, not just legal: a blind member trying to renew their dues, a donor with low vision trying to make a gift, a volunteer using a screen reader to sign up for a shift — every one of them is failed by an unlabeled form field or a color-only status indicator. Accessibility retrofits are expensive and slow precisely because most platforms treat it as a per-app afterthought instead of a property of the code generator itself.

MJ auto-generates the majority of the UI surface any app built on it will ship — forms, grids, dashboards — from metadata. That's exactly the leverage point where "every app inherits accessibility by default" is possible in a way it isn't for hand-built apps. Nobody researched proposed this exact framing this week (it's new), and it directly serves the "improving the world for our users" bar: it's the one idea here that helps literally every person who will ever use software built on MJ, not just staff-side users.

## What already exists (and why this doesn't duplicate it)

- **Design token system** (`packages/Angular/Generic/shared/src/lib/_tokens.scss`, enforced by `check:ui`) already gates *color* consistency and dark-mode correctness at CI time via `.github/scripts/check-css-hex-tokens.sh`. This proposal is the natural sibling gate for *accessibility*, following the exact same "shell script + CI job + local `npm run check:*` mirror" pattern already proven to work for the team — not a new enforcement philosophy.
- **`packages/TestingFramework`** already has a plug-in oracle/driver architecture (`IOracle`: ExactMatch/LLMJudge/SQLValidator/SchemaValidator/TraceValidator; `BaseTestDriver`: `AgentEvalDriver`). This proposal adds one new oracle (`AccessibilityOracle`) and reuses the existing Playwright-based browser harness already built for the Computer-Use regression suite (PR #3033) rather than standing up a second browser-automation stack.
- **CodeGen's Angular form/grid templates** (`packages/CodeGenLib`) are the single choke point that already stamps out every generated form field. This proposal edits those templates, so the fix is applied once, centrally, and every existing app that re-runs CodeGen inherits it — the same leverage CodeGen already has for validation and typing.
- This is explicitly **not** part of the Unified Permissions work, the design-token color work, or any UI-consistency plan already in `plans/ui-consistency-objectives.md` (that doc's accessibility mention is a single unchecked bullet, not a system) — there is no active initiative doing this today.

## Proposed architecture

### 1. CodeGen template fixes (source of the problem, fixed at the source)

- Every generated form field emits a proper `<label for>` / `aria-label`, `aria-describedby` for validation/help text, and `aria-invalid`/`aria-required` bound to the existing validation state MJ already computes.
- Generated grids emit proper `role="grid"`/`role="row"`/`role="gridcell"` and keyboard navigation hooks (leveraging Kendo's existing a11y support where the grid is Kendo-backed, post the in-flight Kendo-removal work — flagged as a sequencing dependency, not a blocker, since the template touches whichever grid primitive is current at implementation time).
- Status/severity indicators that are currently color-only (e.g., a red dot for "Error") gain a paired icon or text label — this is a `check:ui` violation in spirit already; accessibility and design-token discipline are two sides of the same "don't rely on color alone" principle.

### 2. `AccessibilityOracle` (new, `packages/TestingFramework/Engine/src/oracles/AccessibilityOracle.ts`)

- Wraps `axe-core` against a rendered route/component in the existing Playwright harness.
- Returns structured findings: WCAG criterion (e.g., "1.4.3 Contrast (Minimum)"), severity, DOM selector, and a human-readable explanation — same finding shape the design-token gate already reports, so tooling that displays one can display the other.
- Runs as a new `BaseTestDriver` subclass (`AccessibilityAuditDriver`) that can target either a single dashboard/form or a full regression sweep, reusing the Computer-Use suite's existing app-launch/navigation scaffolding.

### 3. CI gate: `check:a11y`

- Mirrors `check:ui` exactly: runs `AccessibilityAuditDriver` against dashboard/form routes touched by a PR's diff, fails on **new** violations only (diffed against a checked-in baseline, same "reviewed-exception form" pattern used by PR #3454 for the ui-layers manifest) so the gate doesn't become an unblockable wall of pre-existing debt on day one.
- `npm run check:a11y` locally mirrors the PR gate, consistent with every other `check:*` script in the repo.

### 4. `MJ: Accessibility Findings` entity + Accessibility Audit dashboard

- Persists scan results (EntityID/RecordID = the dashboard or form scanned, WCAG criterion, severity, FirstSeenAt, LastSeenAt, ResolvedAt) so trends are queryable the same way Version History makes change trends queryable.
- New dashboard under `packages/Angular/Explorer/dashboards` (28th dashboard, following the existing scaffold pattern — see the `scaffold-mj-dashboard` skill) — **Accessibility Audit**: conformance score cards per dashboard/form, a sortable issues table with WCAG references, and an "Explain & suggest a fix" action that calls an existing-pattern AI Action (same shape as other CoreActions) to propose a concrete template or CSS fix, which a developer reviews and applies — the AI proposes, a human commits, matching how the rest of MJ treats AI-authored changes.

### Why this belongs in core, not an app

Accessibility conformance is not domain logic — it's a property every generated UI surface should have regardless of what the app is *for*. Fixing it in CodeGen templates and the testing framework means every current and future MJ app inherits the improvement by re-running CodeGen and enabling one CI check, with zero per-app engineering. That's the platform leverage this whole exercise is supposed to be looking for.

## Phased rollout

1. **Phase 1** — CodeGen template fixes for generated forms (labels, ARIA, validation announcements). Immediate, broad win, no new packages.
2. **Phase 2** — `AccessibilityOracle` + `AccessibilityAuditDriver` + `check:a11y` CI gate with baseline allowlist.
3. **Phase 3** — `MJ: Accessibility Findings` entity + Accessibility Audit dashboard + AI-assisted fix suggestions.

## Open questions

- Baseline size: an initial full-repo scan is needed to seed the "existing debt" allowlist before the gate can go live — sizing that scan is a Phase 2 prerequisite, not a design blocker.
- Grid accessibility depends on which grid primitive Explorer is standardized on post the in-flight Kendo-removal effort (`plans/phase-2-kendo-removal.md`); sequencing this after that work avoids fixing accessibility twice.

## Mockup

See [`mockups/accessibility-audit-dashboard.html`](./mockups/accessibility-audit-dashboard.html) — the Accessibility Audit dashboard showing conformance scores, an issues table, and the "Explain & suggest a fix" drill-down. Screenshot: [`screenshots/idea-3-accessibility-audit-dashboard.png`](./screenshots/idea-3-accessibility-audit-dashboard.png).
