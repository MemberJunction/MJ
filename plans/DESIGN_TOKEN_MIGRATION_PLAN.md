# Design Token Migration Plan

## Summary

MemberJunction's design token system (`_tokens.scss` + `ThemeService`) enables dark mode, custom themes, and consistent branding via `--mj-*` CSS custom properties. This plan tracks the migration of all hardcoded values in Angular component CSS to these tokens.

## Progress (as of 2026-03-11)

**Branch:** `design-tokens-phase-1` — 349 files changed, 17,313 insertions, 15,772 deletions across 14 commits.

### What's been completed

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

### Key decisions made during migration

- **Indigo/violet → brand-primary**: All `#6366f1`, `--mj-color-violet-*`, `--mj-color-indigo-*` mapped to `--mj-brand-primary` (blue)
- **No gradients**: All gradients flattened to flat semantic colors
- **Shadow primitives → rgba()**: `color-mix(in srgb, var(--mj-color-neutral-900) X%, transparent)` replaced with `rgba(0, 0, 0, X/100)` — shadow darkness is theme-agnostic
- **No intermediate alias variables**: Components use `var(--mj-brand-primary)` directly, not `:host` aliases

---

## Remaining Work — 1,659 hardcoded hex values across 72 CSS files

### Tier 1: User-facing forms, settings, and core UI (~1,150 instances)

Components users interact with daily — forms, settings, dialogs, search, profiles.

| File | Hex Count | QA Location |
|---|---|---|
| **core-entity-forms** | | |
| `list-form.component.css` | 122 | Open any List record |
| `ai-prompt-run-form.component.css` | 112 | AI > Monitor > click a prompt run |
| `query-form.component.css` | 57 | Open any Query record |
| `create-prompt-dialog.component.css` | 23 | AI > Agents > create prompt dialog |
| `query-category-dialog.component.css` | 3 | Queries > category dialog |
| `query-run-dialog.component.css` | 6 | Queries > run dialog |
| `ai-prompt-form.component.css` | 5 | AI > Prompts > click a prompt |
| **Generic/agents** | | |
| `agent-permissions-panel.component.css` | 90 | AI > Agents > permissions |
| `create-agent-panel.component.css` | 69 | AI > Agents > create agent |
| **explorer-settings** | | |
| `shared-settings.css` | 88 | Avatar > Settings (shared styles) |
| `notification-preferences.component.css` | 39 | Settings > Notifications |
| `application-settings.component.css` | 38 | Settings > Applications |
| `user-profile-settings.component.css` | 38 | Settings > Profile |
| `settings.component.css` | 15 | Settings shell |
| `appearance-settings.component.css` | 13 | Settings > Appearance |
| `account-info.component.css` | 16 | Settings > Account |
| `sql-logging.component.css` | 8 | Admin > SQL Logging |
| `application-dialog.component.css` | 4 | Admin > Apps dialog |
| **Generic/filter-builder** | | |
| `filter-rule.component.css` | 46 | Any view > Configure > Advanced Filter |
| `filter-builder.component.css` | 40 | Any view > Configure > Advanced Filter |
| `filter-group.component.css` | 31 | Any view > Configure > Advanced Filter |
| **Generic/data-context** | | |
| `ng-data-context.component.css` | 56 | Chat > conversation > Data Context |
| `ng-data-context-dialog.component.css` | 9 | Chat > Data Context dialog |
| **Generic/actions** | | |
| `action-param-dialog.component.css` | 37 | Actions > click action > param dialog |
| `action-result-code-dialog.component.css` | 28 | Actions > result code dialog |
| `action-test-harness.component.css` | 10 | Actions > Test button |
| **Generic/query-viewer** | | |
| `query-parameter-form.component.css` | 34 | Queries > run with parameters |
| `query-info-panel.component.css` | 2 | Queries > info panel |
| **explorer-core** | | |
| `single-list-detail.component.css` | 32 | Lists > click a list |
| `dashboard-preferences-dialog.component.css` | 29 | Dashboard > preferences |
| `single-search-result.component.css` | 18 | Global search results |
| `command-palette.component.css` | 15 | Cmd+K command palette |
| `user-profile.component.css` | 22 | Avatar > profile |
| `user-notifications.component.css` | 13 | Bell icon > notifications |
| `oauth-callback.component.css` | 12 | OAuth login callback |
| `single-dashboard.component.css` | 9 | Dashboard chrome |
| `app-switcher.component.css` | 7 | App switcher dropdown |
| `shell.component.css` | 7 | Shell frame |
| `app-nav.component.css` | 4 | Nav tabs |
| `add-item.component.css` | 4 | Dashboard > add item |
| `edit-dashboard.component.css` | 2 | Dashboard > edit |
| `delete-item.component.css` | 1 | Dashboard > delete item |
| **Generic/others** | | |
| `timeline.component.css` | 26 | Record forms with timeline |
| `deep-diff.component.css` | 24 | Version History > diff viewer |
| `tree-dropdown.component.css` | 23 | Tree dropdowns throughout |
| `tree.component.css` | 15 | Tree views (Actions, Data Explorer) |
| `markdown.component.css` | 10 | Chat AI responses, markdown rendering |
| `code-editor.component.css` | 5 | Component Studio, Actions code editing |
| `join-grid.component.css` | 4 | M2M relationship grids |
| `custom-agent-icons.css` | 4 | Agent icon styles |
| `deep-diff-dialog.component.css` | 2 | Diff dialog |
| `data-requirements-viewer.component.css` | 2 | Artifact data requirements |
| `simple-record-list.component.css` | 2 | Record lists |
| `list-detail-grid.component.css` | 2 | List detail grid |
| `entity-permissions-grid.component.css` | 3 | Admin > Permissions |
| `tab.component.css` | 1 | Tab strip tabs |
| `home-dashboard.component.css` | 1 | Home app |
| `bootstrap.component.css` | 7 | Bootstrap/loading screen |
| **dashboards (non-AI)** | | |
| `connections.component.css` | 47 | Integrations > Connections |
| `system-diagnostics.component.css` | 18 | Admin > System Diagnostics |
| `pipelines.component.css` | 18 | Integrations > Pipelines |
| `visual-editor.component.css` | 18 | Integrations > Visual Editor |
| `component-browser.component.css` | 3 | Component Studio browser |
| `activity.component.css` | 1 | Integration activity |

### Tier 2: Flow editor (~201 instances)

Specialized agent flow editor — lower traffic, largest single component.

| File | Hex Count | QA Location |
|---|---|---|
| `flow-agent-editor.component.css` | 63 | AI > Agents > flow editor |
| `flow-node.component.css` | 54 | Flow editor nodes |
| `flow-editor.component.css` | 40 | Flow editor canvas |
| `agent-properties-panel.component.css` | 36 | Flow editor properties |
| `flow-palette.component.css` | 8 | Flow editor palette |

---

## Migration Pattern

Most remaining files follow the same pattern already proven on `entity-form.component.css`:
1. File defines local CSS variables with hex values at `:host` level
2. Rest of file references those local vars
3. **Fix:** Remap local vars to MJ semantic tokens, then fix remaining direct hex refs
4. Build the package and verify

## Anti-Patterns (Reference)

These rules were established during the migration and must be followed for all remaining work:

1. **No intermediate alias variables** — use `var(--mj-brand-primary)` directly, not `:host { --accent: var(--mj-brand-primary) }`
2. **No self-referencing CSS variables** — never write `--mj-text-primary: var(--mj-text-primary)`
3. **Remove `@media (prefers-color-scheme: dark)` blocks** — dark mode uses `[data-theme="dark"]` attribute
4. **No gradients on page containers** — use flat `var(--mj-bg-page)`
5. **Cards use `var(--mj-bg-surface-card)`** — not `var(--mj-bg-surface)`
6. **Never use primitive tokens in components** — only semantic tokens (`--mj-brand-primary`, `--mj-text-primary`, etc.)

## Open Issues

### Kendo dropdown popups
Kendo's `<kendo-dropdownlist>` popup (`.k-list`, `.k-list-item`) renders outside component scope and uses hardcoded white backgrounds. Our `!important` overrides aren't winning against Kendo's specificity. May require overriding Kendo's internal CSS custom properties.

### CodeMirror programmatic theming
The `mj-code-editor` component wraps CodeMirror 6. CSS `::ng-deep` overrides don't reach CodeMirror's dynamic DOM. Correct fix: use CodeMirror's `EditorView.theme()` API with `--mj-*` tokens via the existing `_themeConf` compartment. Wrapper CSS is tokenized but editor surface, gutters, and syntax highlighting are not.

### AG Grid v35 dark mode
Partially implemented, needs revisiting. See memory for details on `colorSchemeVariable` approach vs `withParams()` with MJ semantic tokens.

## Token Mapping Reference

### Colors
| Hardcoded | Token |
|---|---|
| `#ffffff`, `#fff` | `var(--mj-bg-surface)` |
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
| `#ef4444`, `#dc3545` | `var(--mj-status-error)` |
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

## Post-Migration Verification

After all remaining files are migrated:

1. **Full dark mode sweep**: Toggle dark mode and navigate through every app
2. **Grep audit**: `grep -rn '#[0-9a-fA-F]\{3,8\}' packages/Angular/ --include='*.css' --include='*.scss' | grep -v dist | grep -v node_modules | grep -v _tokens.scss | grep -v generated` — should return zero
3. **Build all**: `npm run build` from repo root
4. **Run tests**: `npm test`
