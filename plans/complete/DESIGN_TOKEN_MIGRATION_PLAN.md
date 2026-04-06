# Design Token Migration Plan

## Status: COMPLETE

MemberJunction's design token system (`_tokens.scss` + `ThemeService`) enables dark mode, custom themes, and consistent branding via `--mj-*` CSS custom properties. This document records the completed migration of all hardcoded values in Angular component CSS to these tokens.

## Final Results (2026-03-12)

**Branch:** `design-tokens-phase-1`

| Metric | Value |
|---|---|
| Starting hex values | 1,659 across 72 CSS files |
| Migrated to tokens | 1,544 (93%) |
| Intentionally preserved | 115 (7%) |
| Tier 1 (core UI) | **Complete** — ~1,150 instances across 65 files |
| Tier 2 (flow editor) | **Complete** — 201 instances across 5 files |
| Straggler cleanup | **Complete** — 22 additional hex values in 5 files |
| All primitive tokens eliminated | **Complete** — 91 files migrated from `--mj-color-*` to semantic tokens |

### Resolved Issues

All three open issues from the migration have been resolved:

| Issue | Resolution |
|---|---|
| **Kendo dropdown popups** | Fixed by overriding Kendo's internal CSS custom properties (`--kendo-color-*`) under `[data-theme="dark"]` in `_kendo-theme-override.scss` |
| **CodeMirror programmatic theming** | Fixed via CodeMirror's `EditorView.theme()` API reading `--mj-*` tokens through the existing `_themeConf` compartment |
| **AG Grid v35 dark mode** | Fixed using `colorSchemeVariable` + `data-ag-theme-mode` attribute set by `applyThemeToDOM()` |

---

## Intentionally Preserved Hex Values (115)

These hex values remain by design and should **not** be migrated:

### 1. CSS Custom Property Fallbacks (~34 instances)
Hex values used as fallback values in `var(--token, #fallback)` syntax. The hex only renders if the custom property is undefined — this is correct CSS behavior.
- Visual editor connection colors: `var(--ve-color-regex, #8b5cf6)` etc.
- Code block colors: `var(--mj-bg-code-block, #1e1e1e)`, `var(--mj-text-code, #d4d4d4)`
- Warning badge colors: `var(--mj-color-warning-200, #fef08a)`, `var(--mj-color-warning-800, #854d0e)`

### 2. Dark Theme Definitions (~17 instances)
The system diagnostics perfmon component defines its own retro-terminal dark theme using local CSS custom properties (`--perfmon-*`). These are self-contained theme definitions, not component colors.
- Files: `system-diagnostics.component.css`

### 3. SVG Paint & Flow Editor Visualization (~43 instances)
SVG `fill`/`stroke` properties and specialized visualization state colors in the flow editor. These are part of a distinct visual language for node-graph editing.
- Files: `flow-editor.component.css`, `flow-node.component.css`, `flow-agent-editor.component.css`, `agent-properties-panel.component.css`

### 4. Code Display Dark Backgrounds (~15 instances)
Intentional dark-on-dark rendering for code output panels. These replicate VS Code's dark theme for log output and syntax highlighting.
- Files: `action-test-harness.component.css`, `query-info-panel.component.css`

### 5. Print Media Overrides (~3 instances)
Light-on-white color overrides inside `@media print` blocks in the markdown component.
- Files: `markdown.component.css`

### 6. Filter Depth Categorical Colors (3 instances)
Distinct colors (`#7b1fa2` purple, `#388e3c` green, `#f57c00` orange) for visually distinguishing nesting depth levels in the filter builder. These are intentional categorical indicators.
- Files: `filter-group.component.css`

---

## What Was Completed

### Commit History

| Commit | Scope |
|---|---|
| Home dashboard | Home app dashboard |
| Actions Overview, code-editor, Kendo dropdowns | Actions, code-editor, Kendo dropdown overrides |
| Actions forms, base-forms, test harness, Kendo theme | Base forms, action forms, Kendo theme overrides |
| AI dashboards, MCP, charts, widgets, test harness, AI Agent forms | All AI dashboard components, MCP, agent forms |
| Data Explorer, entity-viewer, query-viewer, credentials, integration, file-storage, dashboard-viewer, global styles | Global styles, shell, Data Explorer, entity viewer, query viewer, credentials, integration, file storage, dashboard viewer |
| Template forms, shared form-styles, Communication dashboards | Template forms, communication dashboards |
| Lists and Scheduling dashboards | Lists, scheduling |
| record-changes, versions, entity-communication | Record changes, version history, entity communication |
| Testing app, Scheduling slideout dark mode | Testing app |
| Version History, Component Studio, markdown | Version history, component studio, markdown |
| Conversations, Tasks, Artifacts, Chat, AI Agent Run forms | Conversations, chat, artifacts, AI agent run forms |
| App switcher dropdown overflow + more components | Shell navigation, app switcher |
| Agent run visualization SVG, Kendo primary-active color | SVG migration, Kendo fixes |
| **Eliminate all primitive design tokens** | 91 files — replaced all `--mj-color-neutral-900`, `--mj-color-info-500`, `--mj-color-violet-500/600`, `--mj-color-error-700` with semantic tokens |
| Entity form hex migration | `entity-form.component.css` — 83 hardcoded hex → semantic tokens |
| Tier 1 hex migration | 65 CSS files, ~1,150 hardcoded hex → semantic tokens |
| Tier 2 flow editor migration | 5 CSS files, 201 hardcoded hex → semantic tokens |
| CodeMirror, AG Grid, Kendo popup theming | Dark mode fixes for third-party components |
| Final straggler cleanup | 5 files, 22 hex values: `styles.scss`, `filter-group`, `filter-builder`, `settings`, `query-form` |

### Key Decisions Made During Migration

- **Indigo/violet → brand-primary**: All `#6366f1`, `--mj-color-violet-*`, `--mj-color-indigo-*` mapped to `--mj-brand-primary` (blue)
- **No gradients**: All gradients flattened to flat semantic colors
- **Shadow primitives → rgba()**: `color-mix(in srgb, var(--mj-color-neutral-900) X%, transparent)` replaced with `rgba(0, 0, 0, X/100)` — shadow darkness is theme-agnostic
- **No intermediate alias variables**: Components use `var(--mj-brand-primary)` directly, not `:host` aliases

---

## Anti-Patterns (Reference)

These rules were established during the migration and must be followed for all future work:

1. **No intermediate alias variables** — use `var(--mj-brand-primary)` directly, not `:host { --accent: var(--mj-brand-primary) }`
2. **No self-referencing CSS variables** — never write `--mj-text-primary: var(--mj-text-primary)`
3. **Remove `@media (prefers-color-scheme: dark)` blocks** — dark mode uses `[data-theme="dark"]` attribute
4. **No gradients on page containers** — use flat `var(--mj-bg-page)`
5. **Cards use `var(--mj-bg-surface-card)`** — not `var(--mj-bg-surface)`
6. **Never use primitive tokens in components** — only semantic tokens (`--mj-brand-primary`, `--mj-text-primary`, etc.)

## Token Mapping Reference

### Colors
| Hardcoded | Token |
|---|---|
| `#ffffff`, `#fff` | `var(--mj-bg-surface)` or `var(--mj-text-inverse, white)` on colored backgrounds |
| `#f8fafc` | `var(--mj-bg-page)` |
| `#f8f9fa`, `#f5f5f5` | `var(--mj-bg-surface-card)` |
| `#f1f5f9` | `var(--mj-bg-surface-sunken)` |
| `#e2e8f0`, `#e5e7eb` | `var(--mj-border-default)` |
| `#cbd5e1`, `#d1d5db` | `var(--mj-border-strong)` |
| `#94a3b8` | `var(--mj-text-disabled)` |
| `#64748b`, `#6c757d` | `var(--mj-text-muted)` |
| `#475569`, `#495057` | `var(--mj-text-secondary)` |
| `#1e293b`, `#333` | `var(--mj-text-primary)` |
| `#0076b6`, `#007bff`, `#3b82f6`, `#6366f1` | `var(--mj-brand-primary)` |
| `#ef4444`, `#dc3545`, `#d9534f` | `var(--mj-status-error)` |
| `#22c55e`, `#28a745`, `#10b981` | `var(--mj-status-success)` |
| `#f59e0b`, `#ffc107` | `var(--mj-status-warning)` |

### Font Sizes
| Hardcoded | Token |
|---|---|
| `10px`–`12px` | `var(--mj-text-xs)` |
| `13px`–`14px` | `var(--mj-text-sm)` |
| `15px`–`16px` | `var(--mj-text-base)` |
| `18px` | `var(--mj-text-lg)` |
| `20px` | `var(--mj-text-xl)` |
| `24px` | `var(--mj-text-2xl)` |
| `30px` | `var(--mj-text-3xl)` |

**Note:** Only replace `font-size` values. Layout properties (`width`, `padding`, `gap`, etc.) keep their px values.

### Border Radii
| Hardcoded | Token |
|---|---|
| `2px`–`4px` | `var(--mj-radius-sm)` |
| `6px`–`8px` | `var(--mj-radius-md)` |
| `10px`–`12px` | `var(--mj-radius-lg)` |
| `16px` | `var(--mj-radius-xl)` |
| `50%`, `9999px` | `var(--mj-radius-full)` |

### Box Shadows
| Pattern | Token |
|---|---|
| `0 1px 2px ...` (subtle) | `var(--mj-shadow-sm)` |
| `0 4px 6px ...` (medium) | `var(--mj-shadow-md)` |
| `0 10px 15px ...` (large) | `var(--mj-shadow-lg)` |
| `0 20px 25px ...` (xl) | `var(--mj-shadow-xl)` |
| `inset 0 2px 4px ...` | `var(--mj-shadow-inner)` |
