# Design Token Audit & Cleanup

**Branch**: `claude/audit-design-tokens-RzHaZ`
**Status**: In progress
**Owner**: Claude (audit + remediation)

## Goal

Eliminate hardcoded color values (`#hex`, `rgb()`, named colors) from Angular component CSS/SCSS and inline styles, replacing them with the semantic design tokens defined in `packages/Angular/Generic/shared/src/lib/_tokens.scss`. This restores correct dark-mode behavior, enables white-labeling, and removes ~270+ violations across ~20 components.

## Why

The MJ design system uses CSS custom properties (`--mj-text-primary`, `--mj-bg-surface`, `--mj-status-warning-*`, etc.) so the entire UI can re-theme by swapping the values defined under `[data-theme="dark"]`. Hardcoded hex values bypass that mechanism — they look fine in light mode and break (or look wrong) in dark mode. They also block white-label customers from re-skinning the product.

A baseline audit (already complete) identified the offenders. This plan executes the cleanup.

## Token Quick Reference (from `_tokens.scss`)

Use **semantic** tokens only. Never reach for the `--mj-color-*` primitives — those don't auto-adapt to dark mode.

| Need | Token |
|---|---|
| Body text | `var(--mj-text-primary)` |
| Supporting text | `var(--mj-text-secondary)` |
| Muted/caption text | `var(--mj-text-muted)` |
| Disabled text | `var(--mj-text-disabled)` |
| Text on dark/colored bg | `var(--mj-text-inverse)` |
| Page background | `var(--mj-bg-page)` |
| Card / panel surface | `var(--mj-bg-surface)` |
| Tinted card | `var(--mj-bg-surface-card)` |
| Inset / sunken area | `var(--mj-bg-surface-sunken)` |
| Hover state surface | `var(--mj-bg-surface-hover)` |
| Active/pressed surface | `var(--mj-bg-surface-active)` |
| Modal backdrop | `var(--mj-bg-overlay)` |
| Default border | `var(--mj-border-default)` |
| Subtle border | `var(--mj-border-subtle)` |
| Stronger border | `var(--mj-border-strong)` |
| Focus ring | `var(--mj-border-focus)` |
| Primary action | `var(--mj-brand-primary)` (+ `-hover`, `-active`) |
| Success state | `var(--mj-status-success)` (+ `-bg`, `-text`, `-border`) |
| Warning state | `var(--mj-status-warning)` (+ `-bg`, `-text`, `-border`) |
| Error state | `var(--mj-status-error)` (+ `-bg`, `-text`, `-border`) |
| Info state | `var(--mj-status-info)` (+ `-bg`, `-text`, `-border`) |

For translucent tints, use `color-mix(in srgb, var(--mj-...) X%, transparent)` rather than picking a hex.

## Hex → Token Mapping (verified against `_tokens.scss`)

| Hardcoded value found in audit | Replacement |
|---|---|
| `#333`, `#334155`, `#1e293b` | `var(--mj-text-primary)` |
| `#475569`, `#555`, `#666` | `var(--mj-text-secondary)` |
| `#64748b`, `#888`, `#757575` | `var(--mj-text-muted)` |
| `#94a3b8`, `#999`, `#9e9e9e`, `#aaa` | `var(--mj-text-disabled)` |
| `#fff`, `#ffffff` (text on dark) | `var(--mj-text-inverse)` |
| `white`, `#fff` (surface bg) | `var(--mj-bg-surface)` |
| `#f8fafc`, `#fafafa`, `#f9f9f9`, `#f8f9fa` | `var(--mj-bg-surface-card)` |
| `#f1f5f9`, `#f1f1f1`, `#f0f0f0`, `#f3f4f6` | `var(--mj-bg-surface-sunken)` |
| `#e2e8f0`, `#e0e0e0`, `#e5e7eb`, `#d1d5db` | `var(--mj-border-default)` |
| `#cbd5e1`, `#ccc` | `var(--mj-border-strong)` |
| `#0076b6` (MJ blue), `#264FAF`, `#2563eb` | `var(--mj-brand-primary)` |
| `#3B82F6`, `#3b82f6` (info blue) | `var(--mj-status-info)` |
| `#22c55e`, `#16a34a`, `#28a745`, `#4caf50` | `var(--mj-status-success)` |
| `#15803d`, `#1b7a3d`, `#059669` | `var(--mj-status-success-text)` |
| `#dcfce7`, `#e6f9ed`, `#d4edda`, `#f0fdf4` | `var(--mj-status-success-bg)` |
| `#86efac`, `#bbf7d0` | `var(--mj-status-success-border)` |
| `#f59e0b`, `#ea580c`, `#ff9800`, `#ffc107`, `#d97706` | `var(--mj-status-warning)` |
| `#b45309`, `#92400e`, `#c2410c`, `#b5850a` | `var(--mj-status-warning-text)` |
| `#fef3c7`, `#fff7ed`, `#fff7e0`, `#fff8e1`, `#fffbeb` | `var(--mj-status-warning-bg)` |
| `#fde68a`, `#fed7aa` | `var(--mj-status-warning-border)` |
| `#ef4444`, `#dc2626`, `#dc3545`, `#f44336`, `#d32f2f`, `#c62828`, `#e53e3e` | `var(--mj-status-error)` |
| `#b91c1c`, `#c53030`, `#991b1b` | `var(--mj-status-error-text)` |
| `#fee2e2`, `#fde8e8`, `#ffebee`, `#fef2f2` | `var(--mj-status-error-bg)` |
| `#fca5a5`, `#fecaca` | `var(--mj-status-error-border)` |
| `#dbeafe`, `#e3f2fd`, `#eff6ff` | `var(--mj-status-info-bg)` |
| `#1d4ed8` | `var(--mj-status-info-text)` |

## Targets (in execution order)

Order is by combination of severity + isolation (start with files that are entirely owned, then move to scattered fixes).

### Priority 1 — HEAVY isolated files (most concentrated wins)

1. **`packages/Angular/Generic/scheduling/src/lib/panels/scheduled-job-editor/scheduled-job-editor.component.css`** — 28 violations, naked hex throughout. Pure mechanical replace.
2. **`packages/Angular/Generic/scheduling/src/lib/panels/scheduled-job-summary/scheduled-job-summary.component.css`** — 23 violations, same pattern as #1.
3. **`packages/Angular/Generic/artifacts/src/lib/components/plugins/component-feedback-panel/component-feedback-panel.component.css`** — 57 violations. Strategy: strip the hardcoded fallback values from existing `var(--mj-..., #fallback)` calls. The token names are already correct; we just delete the dead fallbacks.
4. **`packages/Angular/Explorer/dashboards/src/SystemDiagnostics/system-diagnostics.component.css`** — perfmon section (~18 violations). The `--perfmon-*` namespace is essentially a parallel theme; map each to the appropriate `--mj-*` semantic token (or to dark-mode-aware equivalents using `color-mix()`).

### Priority 2 — MODERATE status-color cleanup

5. **`packages/Angular/Generic/flow-editor/src/lib/components/flow-node.component.css`** — 14 warning-banner colors → status-warning tokens.
6. **`packages/Angular/Generic/flow-editor/src/lib/agent-editor/flow-agent-editor.component.css`** — 14 success/error/warning colors → status tokens.
7. **`packages/Angular/Explorer/dashboards/src/Integration/components/widgets/integration-card.component.ts`** — ~15 violations in inline `styles:`.
8. **`packages/Angular/Explorer/dashboards/src/Integration/components/widgets/run-history-panel.component.ts`** — ~10 violations in inline `styles:`. `.chip-green/-amber/-red` → status-success/warning/error.
9. **`packages/Angular/Explorer/explorer-core/src/lib/system-validation/system-validation-banner.component.ts`** — 9 violations. Material-Design status colors → `--mj-status-*` tokens.
10. **`packages/Angular/Generic/pagination/src/lib/pagination.component.css`** — 9 fallback hex values to strip.

### Priority 3 — LIGHT scattered fixes

11. **`packages/Angular/Bootstrap/src/lib/components/auth-shell.component.ts`** — 1 violation: `color: #d32f2f` → `var(--mj-status-error)`.
12. **`packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/test-suite-form.component.ts`** — 5 inline tooltip styles.
13. **`packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/test-rubric-form.component.ts`** — 2 ternary status bindings.
14. **`packages/Angular/Explorer/dashboards/.../entity-selector-dialog.component.ts`** — 2 success badge colors.
15. **`packages/Angular/Explorer/dashboards/.../dashboard-resource.component.ts`** — 2 error colors.
16. **`packages/Angular/Explorer/dashboards/.../testing-runs.component.ts`** — 2 icon colors.
17. **`packages/Angular/Explorer/dashboards/src/AIDashboard/.../agent-editor.component.ts`** — 2 D3 chrome colors. (D3 graph data colors stay categorical.)
18. **`packages/Angular/Explorer/dashboards/src/SystemDiagnostics/system-diagnostics.component.ts`** — `#4caf50` check icon (line ~1025).
19. **`packages/Angular/Explorer/explorer-app/src/lib/styles/_utilities.scss` + `_badges.scss` + `main.scss`** — Bootstrap-flavored utility classes (~20). Scope: only fix truly hardcoded entries; preserve any intentional Bootstrap-compat classes (decide per-occurrence).

### Priority 4 — Verify exemptions (no changes expected)

20. **`packages/Angular/Generic/flow-editor/src/lib/components/flow-editor.component.css`** — 14 Foblex graph connector colors. Confirm these are data-viz / pure SVG categorical (exempt) vs. chrome (must fix).
21. **`packages/Angular/Generic/markdown/src/lib/components/markdown.component.css`** — 5 syntax-highlighter overrides. Confirm legitimate exemption.
22. **`packages/Angular/Generic/actions/src/lib/action-test-harness/action-test-harness.component.css`** — 10 Monaco/VS-Code editor theme colors. Already confirmed exempt.

## Methodology (per file)

1. **Read the entire file** before editing — do not pattern-match blindly.
2. **Map each hardcoded color to its semantic token** using the table above. If the color is genuinely off-palette (e.g., a brand teal that doesn't match any token), surface it for discussion rather than forcing a bad mapping.
3. **For translucent variants**, prefer `color-mix(in srgb, var(--mj-...) X%, transparent)` over inventing a new hex.
4. **Preserve exemptions**:
   - SVG `data:` URIs (must stay encoded hex)
   - Monaco/CodeMirror editor theme colors
   - Categorical chart/graph data colors (non-chrome)
   - `rgba(255, 255, 255, ...)` overlays on intentionally colored backgrounds
5. **Edit, then build that package** with `cd packages/<...> && npm run build`. Fix any compile errors before moving on.
6. **Update the todo list** as each file is completed.

## Definition of Done

- All targets in Priorities 1–3 have zero hardcoded color violations remaining (verified by grep on each file).
- Priority 4 exemptions are explicitly noted (in this plan or in a `// design-token-exempt:` comment in the file).
- Every affected package builds clean (`npm run build` exits 0).
- A single commit (or small set of cohesive commits) on `claude/audit-design-tokens-RzHaZ` captures the change.
- PR raised against `next` with a summary table of files touched and violation counts retired.

## Out of Scope (intentionally deferred)

- The full white-label customer flow (separate effort).
- Migrating existing `--mj-color-*` primitive references — only fixing raw hex/rgb.
- Restructuring component CSS for organization or naming. Touch only color-related declarations.
- Bootstrap utility-class consolidation beyond the immediate hardcoded-color fix in `_utilities.scss`.

## Phase 2 — Remaining Files (Future Work)

A broader sweep after this PR landed identified additional component files with **smaller numbers** of hex/rgba violations (typically 1–5 per file) that were not in the original audit. These should be tackled as a Phase 2 effort using the same hex→token mapping table. Rough list (non-exhaustive — re-scan before starting):

- `packages/Angular/Generic/conversations/**` (multiple components: chat area, navigation, notification, share, members, agent process panels)
- `packages/Angular/Generic/ai-test-harness/**` (window, dialog, agent execution monitor/node)
- `packages/Angular/Generic/flow-editor/src/lib/components/flow-status-bar.component.ts`, `flow-toolbar.component.ts`
- `packages/Angular/Generic/flow-editor/src/lib/agent-editor/agent-step-list.component.ts`, `agent-properties-panel.component.css`
- `packages/Angular/Generic/filter-builder/**` (filter-builder.component.ts, filter-group.component.css)
- `packages/Angular/Generic/query-viewer/**` (query-data-grid, query-info-panel)
- `packages/Angular/Generic/artifacts/**` (artifact-viewer-panel, artifact-version-history, artifact-type-plugin-viewer)
- `packages/Angular/Generic/ng-map-view/src/lib/map-view.component.css`
- `packages/Angular/Generic/Testing/src/lib/components/test-run-dialog.component.ts`
- `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts`
- `packages/Angular/Explorer/dashboards/src/Lists/components/venn-diagram/venn-diagram.component.ts`
- Remaining hex declarations in `packages/Angular/Explorer/dashboards/src/SystemDiagnostics/system-diagnostics.component.css` (D3 chart axis fills outside the perfmon block)

This Phase 2 work should follow the same methodology and exemption rules established in this PR.
