# Phase 1: Design Token Migration — Hardcoded Values to `--mj-*` Tokens

## Context

MemberJunction has a fully implemented design token system (`_tokens.scss` + `ThemeService`) but **255 CSS/SCSS files** still use hardcoded values (~11,300 occurrences). This blocks dark mode, custom themes, and consistent branding. Phase 1 migrates **all** hardcoded values — colors, font sizes, border radii, and box shadows — to `--mj-*` CSS custom properties, package by package, with QA verification at each step.

## Pre-Migration Setup (Do First)

### Step 0A: Eliminate the legacy bridge variables
**File:** `packages/Angular/Explorer/explorer-app/src/lib/styles/_variables.scss`

Replace `--mj-blue`, `--navy`, `--light-blue`, `--white-color`, `--med-gray`, etc. with their semantic token equivalents (`--mj-brand-primary`, `--mj-brand-secondary`, `--mj-brand-accent`, `--mj-bg-surface`, `--mj-border-default`). Then find-and-replace all usages of these legacy vars across the codebase.

### Step 0B: Retire the conversations shadow variable system
**File:** `packages/Angular/Generic/conversations/src/lib/styles/variables.css`

This file redefines `--mj-blue`, `--navy`, etc. with hardcoded hex values, bypassing the global token chain. Replace all definitions with references to `--mj-*` semantic tokens, then update all conversation component files that use these local vars.

### Step 0C: Fix the form-field `:host` token override
**File:** `packages/Angular/Generic/base-forms/src/lib/field/form-field.component.css`

This file overrides `--mj-text-primary`, `--mj-text-secondary`, `--mj-border` on `:host` with hardcoded values, actively **breaking dark mode** for all entity forms. Remove these `:host` overrides so the global tokens flow through.

**QA for Step 0:** Open any entity record form (Data Explorer > Data > click any row). Verify text, borders, and backgrounds look correct in light mode. Toggle to dark mode via avatar menu and verify forms render properly.

---

## Migration Batches

Each batch targets one package. For each batch:
1. Replace **all** hardcoded values with the appropriate `--mj-*` token — this includes:
   - **Colors**: hex, rgba, rgb, named colors (white, black)
   - **Font sizes**: px values → `var(--mj-text-*)`
   - **Border radii**: px values → `var(--mj-radius-*)`
   - **Box shadows**: inline shadow values → `var(--mj-shadow-*)`
2. Build the package: `cd packages/<path> && npm run build`
3. Visually verify in the browser using the QA instructions below
4. Test in both **light mode** and **dark mode**

### Critical Anti-Patterns to Fix During Migration

#### 1. No intermediate alias variables — use tokens directly
**NEVER** create `:host` or component-level CSS variables that just alias global tokens. Components should reference `var(--mj-brand-primary)` directly, not define `--mj-accent: var(--mj-brand-primary)` and then use `var(--mj-accent)`.

```css
/* ❌ BAD — unnecessary indirection layer */
:host {
  --mj-accent: var(--mj-brand-primary);
  --mj-card-bg: var(--mj-bg-surface);
  --mj-border: var(--mj-border-default);
  --mj-error: var(--mj-status-error);
}
.some-element { color: var(--mj-accent); }

/* ✅ GOOD — use global tokens directly */
.some-element { color: var(--mj-brand-primary); }
```

**Exception:** Component-specific variables that don't exist in the global token system (e.g., `--mj-forms-toolbar-bg`, `--mj-forms-field-label-width`) are fine to define on `:host`.

When migrating a file that has a `:host` alias block:
1. Find every usage of the alias variable (e.g., `var(--mj-accent)`) in the file
2. Replace each usage with the actual token (e.g., `var(--mj-brand-primary)`)
3. Remove the alias definition from `:host`
4. Keep only truly component-specific variables in `:host`

#### 2. No self-referencing CSS variables
**NEVER** write `--mj-text-primary: var(--mj-text-primary)` — this creates a circular reference that makes the property resolve to its initial value (empty), breaking token inheritance for the entire subtree. If a component doesn't need to override a global token, simply don't redefine it.

```css
/* ❌ BAD — circular self-reference breaks inheritance */
:host {
  --mj-text-primary: var(--mj-text-primary);
  --mj-text-secondary: var(--mj-text-secondary);
}

/* ✅ GOOD — just don't redefine them; they cascade naturally */
:host {
  display: block;
}
```

#### 3. Remove `@media (prefers-color-scheme: dark)` blocks
Dark mode is controlled by the `[data-theme="dark"]` attribute on `<html>`, not by the OS preference media query. Any `@media (prefers-color-scheme: dark)` block in a component that overrides `--mj-*` tokens with hardcoded values will conflict with the global theme system. Remove these blocks entirely.

```css
/* ❌ BAD — conflicts with global [data-theme="dark"] tokens */
@media (prefers-color-scheme: dark) {
  .my-panel {
    --mj-text-primary: #ffffff;
    --mj-bg-surface: #1e1e1e;
  }
}

/* ✅ GOOD — dark mode handled globally by _tokens.scss */
/* (just delete the block) */
```

### Font Size Mapping

| Hardcoded Value | Token |
|---|---|
| `10px` | `var(--mj-text-xs)` (0.75rem / 12px) |
| `11px`, `12px` | `var(--mj-text-xs)` |
| `13px`, `14px` | `var(--mj-text-sm)` (0.875rem / 14px) |
| `15px`, `16px` | `var(--mj-text-base)` (1rem / 16px) |
| `18px` | `var(--mj-text-lg)` (1.125rem / 18px) |
| `20px` | `var(--mj-text-xl)` (1.25rem / 20px) |
| `24px` | `var(--mj-text-2xl)` (1.5rem / 24px) |
| `30px` | `var(--mj-text-3xl)` (1.875rem / 30px) |
| `36px` | `var(--mj-text-4xl)` (2.25rem / 36px) |
| `48px` | `var(--mj-text-5xl)` (3rem / 48px) |
| `60px` | `var(--mj-text-6xl)` (3.75rem / 60px) |

**Note:** Only replace `font-size` values. Do not replace px values used for `width`, `height`, `padding`, `margin`, `gap`, or other layout properties — those are intentional fixed sizes.

### Border Radius Mapping

| Hardcoded Value | Token |
|---|---|
| `0` | `var(--mj-radius-none)` |
| `2px`, `3px`, `4px` | `var(--mj-radius-sm)` (4px) |
| `6px`, `8px` | `var(--mj-radius-md)` (8px) |
| `10px`, `12px` | `var(--mj-radius-lg)` (12px) |
| `16px` | `var(--mj-radius-xl)` (16px) |
| `24px` | `var(--mj-radius-2xl)` (24px) |
| `50%`, `9999px`, `100px` | `var(--mj-radius-full)` (9999px) |

### Box Shadow Mapping

| Hardcoded Pattern | Token |
|---|---|
| `0 1px 2px ...` (subtle) | `var(--mj-shadow-sm)` |
| `0 4px 6px ...` (medium) | `var(--mj-shadow-md)` |
| `0 10px 15px ...` (large) | `var(--mj-shadow-lg)` |
| `0 20px 25px ...` (extra large) | `var(--mj-shadow-xl)` |
| `0 25px 50px ...` (heavy) | `var(--mj-shadow-2xl)` |
| `inset 0 2px 4px ...` | `var(--mj-shadow-inner)` |
| `none` | `var(--mj-shadow-none)` |

**Note:** Dark mode redefines shadows with higher opacity for visibility on dark surfaces. Using tokens ensures shadows adapt automatically.

### Color Mapping Quick Reference

| Hardcoded Value | Token |
|---|---|
| `#ffffff`, `#fff` | `var(--mj-bg-surface)` or `var(--mj-color-neutral-0)` |
| `#f8fafc` | `var(--mj-bg-page)` or `var(--mj-color-neutral-50)` |
| `#f8f9fa`, `#f5f5f5` | `var(--mj-bg-surface-card)` or `var(--mj-color-neutral-50)` |
| `#f1f5f9` | `var(--mj-bg-surface-sunken)` or `var(--mj-color-neutral-100)` |
| `#e2e8f0`, `#e5e7eb` | `var(--mj-border-default)` or `var(--mj-color-neutral-200)` |
| `#cbd5e1`, `#d1d5db` | `var(--mj-border-strong)` or `var(--mj-color-neutral-300)` |
| `#94a3b8`, `#999` | `var(--mj-text-disabled)` or `var(--mj-color-neutral-400)` |
| `#64748b`, `#6c757d` | `var(--mj-text-muted)` or `var(--mj-color-neutral-500)` |
| `#475569`, `#495057`, `#666` | `var(--mj-text-secondary)` or `var(--mj-color-neutral-600)` |
| `#334155` | `var(--mj-color-neutral-700)` |
| `#1e293b`, `#333` | `var(--mj-text-primary)` or `var(--mj-color-neutral-800)` |
| `#0f172a` | `var(--mj-color-neutral-900)` |
| `#0076b6`, `#007bff` | `var(--mj-brand-primary)` |
| `#1976d2`, `#2196f3` | `var(--mj-brand-primary)` (Material blue → MJ brand) |
| `#006aa3`, `#005a9e` | `var(--mj-brand-primary-hover)` |
| `#092340` | `var(--mj-brand-secondary)` |
| `#5cc0ed` | `var(--mj-brand-accent)` |
| `#6366f1` | `var(--mj-color-indigo-500)` — **see decision note below** |
| `#ef4444` | `var(--mj-status-error)` or `var(--mj-color-error-500)` |
| `#dc3545`, `#dc2626` | `var(--mj-status-error)` or `var(--mj-color-error-600)` |
| `#22c55e`, `#28a745`, `#10b981` | `var(--mj-status-success)` or `var(--mj-color-success-500)` |
| `#f59e0b`, `#ffc107` | `var(--mj-status-warning)` or `var(--mj-color-warning-500)` |
| `#3b82f6` | `var(--mj-color-info-500)` |
| `rgba(0,0,0,0.*)` | `var(--mj-bg-overlay)` for overlays, or `var(--mj-shadow-*)` for shadows |

### Decision Needed: Indigo `#6366f1` (229 occurrences in 38 files)

This color exists as a primitive token (`--mj-color-indigo-500`) but has no semantic token. It's heavily used in dashboard components. Options:
- **A)** Replace with `var(--mj-brand-primary)` — unifies brand but changes visual appearance
- **B)** Create a new semantic token (e.g., `--mj-brand-indigo`) that maps to `--mj-color-indigo-500`
- **C)** Use the primitive directly: `var(--mj-color-indigo-500)` — works but primitives shouldn't be in components per THEMING.md

**Recommendation:** Create a semantic token. These appear to be used for secondary interactive elements (buttons, highlights) distinct from the primary brand blue. A semantic token like `--mj-accent-indigo` would preserve the design intent while being themeable.

---

## Batch 1: Global Styles (7 files, ~153 hardcoded colors)
**Package:** `packages/Angular/Explorer/explorer-app/src/lib/styles/`

| File | Colors | Notes |
|---|---|---|
| `_common.scss` | 55 | Bridge vars + hardcoded gradients |
| `_kendo-theme-override.scss` | 42 | Kendo UI overrides using `--mj-blue` |
| `_badges.scss` | 22 | Badge color classes |
| `_utilities.scss` | 15 | `.text-success`, `.text-danger` etc. |
| `styles.scss` | 9 | Root stylesheet |
| `main.scss` | 9 | Duplicate root |
| `_md3-theme.scss` | 1 | Material Design 3 mapping |

**QA: These styles affect EVERY page.**
- Navigate to Home app — verify header, nav, badges, buttons
- Open Data Explorer > Data > click any entity row — verify form styling
- Open Chat > Conversations — verify message styling
- Check any status badges (success/warning/error colors)
- Test dark mode toggle on each of the above

---

## Batch 2: Shell & Navigation (16 files, ~237 hardcoded colors)
**Package:** `packages/Angular/Explorer/explorer-core/`

| File | Colors |
|---|---|
| `shell.component.css` | 21 |
| `app-switcher.component.css` | 7 |
| `app-nav.component.css` | 4 |
| `tab-container.component.css` | 1 |
| `command-palette.component.css` | 18 |
| `user-profile.component.css` | 25 |
| `user-notifications.component.css` | 24 |
| `single-search-result.component.css` | 20 |
| `single-list-detail.component.css` | 32 |
| `single-dashboard.component.css` + sub-components | 26 |
| `dashboard-preferences-dialog.component.css` | 33 |
| `oauth-callback.component.css` | 13 |
| `app-access-dialog.component.css` | 13 |

**QA:**
- Verify the **header bar**: app switcher dropdown, horizontal nav tabs, search box
- Press `Cmd+K` → verify **command palette** styling
- Click avatar → verify **user menu** styling
- Click avatar → Settings → verify profile sidebar
- Click bell icon → verify **notifications panel**
- Open a dashboard tab → verify dashboard chrome (add/edit/delete item dialogs)
- Test dark mode on all of the above

---

## Batch 3: Base Forms & Entity Viewer (20 files, ~1,021 hardcoded colors)
**Packages:**
- `packages/Angular/Generic/base-forms/` (7 files, 149 colors)
- `packages/Angular/Generic/entity-viewer/` (13 files, 872 colors)

**base-forms files:**
| File | Colors |
|---|---|
| `form-toolbar.component.css` | 47 |
| `collapsible-panel.component.css` | 25 |
| `form-field.component.css` | 23 |
| `isa-related-card.component.css` | 22 |
| `section-manager.component.css` | 20 |
| `record-form-container.component.css` | 7 |
| `isa-related-panel.component.css` | 5 |

**entity-viewer files:**
| File | Colors |
|---|---|
| `view-config-panel.component.css` | 326 |
| `entity-data-grid.component.css` | 133 |
| `aggregate-setup-dialog.component.css` | 115 |
| `aggregate-panel.component.css` | 50 |
| `entity-record-detail-panel.component.css` | 44 |
| `quick-save-dialog.component.css` | 43 |
| + 7 more files | 161 |

**QA:**
- **Forms:** Data Explorer > Data tab > click any entity row → verify:
  - Form toolbar (Save/Edit/Back buttons)
  - Individual form fields (text inputs, dropdowns, checkboxes)
  - Collapsible related entity panels at bottom
  - Section headers and dividers
- **Entity Viewer:** Data Explorer > Data tab → verify:
  - Grid view with data rows, column headers
  - Card view toggle
  - Click filter/configure icon → verify config panel (advanced filters, column picker)
  - Click "Save View" → verify quick-save dialog
  - Pagination controls at bottom
  - Aggregate panel (if enabled)
  - Record detail side panel (click expand icon on a row)
- Test dark mode on all of the above

---

## Batch 4: Conversations & Chat (23 files, ~730 hardcoded colors)
**Package:** `packages/Angular/Generic/conversations/` (22 files, 716 colors)
**Package:** `packages/Angular/Generic/chat/` (1 file, 14 colors)

**Key files:**
| File | Colors |
|---|---|
| `message-item.component.css` | 163 |
| `conversation-chat-area.component.css` | 102 |
| `search-panel.component.css` | 69 |
| `mention-editor.component.css` | 41 |
| `thread-panel.component.css` | 41 |
| `collection-share-modal.component.css` | 40 |
| `artifact-share-modal.component.css` | 40 |
| + 16 more files | 234 |

**QA:**
- App switcher → **Chat** app → Conversations tab:
  - Verify conversation list sidebar (left panel)
  - Click a conversation → verify message bubbles (user vs AI)
  - Verify message input box at bottom (attachments, @-mention)
  - Type `@` → verify mention dropdown
  - Click the search icon → verify search panel
  - Open a thread (if any) → verify thread panel
- Chat → **Collections** tab:
  - Click "Share" on a collection → verify share modal
- Chat → **Tasks** tab:
  - Verify task list styling
- Test dark mode on all of the above

---

## Batch 5: Dashboard Components — AI App (17 files, ~1,100+ hardcoded colors)
**Package:** `packages/Angular/Explorer/dashboards/src/AI/`

| File | Colors |
|---|---|
| `model-management.component.css` | 191 |
| `system-configuration.component.css` | 191 |
| `prompt-management.component.css` | 190 |
| `agent-configuration.component.css` | 168 |
| `agent-editor.component.css` | 114 |
| `prompt-version-control.component.css` | 84 |
| `model-prompt-priority-matrix.component.css` | 68 |
| `execution-monitoring.component.css` | 4 |
| `agent-filter-panel.component.css` | 29 |
| `prompt-filter-panel.component.css` | 29 |
| `system-config-filter-panel.component.css` | 29 |

**Also include related Generic packages:**
- `packages/Angular/Generic/agents/` (2 files, 172 colors)
- `packages/Angular/Generic/ai-test-harness/` (1 file, 125 colors)
- `packages/Angular/Generic/flow-editor/` (5 files, 234 colors)

**QA:**
- App switcher → **AI** app:
  - **Monitor** tab → verify execution monitoring widgets/KPIs
  - **Prompts** tab → verify prompt list, filter panel, version control panel, model-priority matrix
  - **Agents** tab → verify agent list, agent editor, flow editor (node diagram), filter panel
  - Click "New Agent" → verify create agent dialog/slide-in
  - Click agent permissions → verify permissions panel
  - **Models** tab → verify model list and detail cards
  - **Configuration** tab → verify system config panels and filter
  - Click "Test" on a prompt → verify AI test harness dialog
- Test dark mode on all of the above

---

## Batch 6: Dashboard Components — Actions, Data Explorer, Home (20+ files, ~600+ hardcoded colors)
**Package:** `packages/Angular/Explorer/dashboards/` — Actions, DataExplorer, DashboardBrowser, QueryBrowser, Home subdirs

**Also include:**
- `packages/Angular/Generic/actions/` (4 files, 168 colors)
- `packages/Angular/Generic/action-gallery/` (if any CSS)
- `packages/Angular/Generic/query-viewer/` (5 files, 208 colors)
- `packages/Angular/Generic/dashboard-viewer/` (7 files, 450 colors)

**QA:**
- App switcher → **Actions** app:
  - **Overview** tab → verify action gallery/cards
  - **Explorer** tab → verify tree panel (left), action cards, toolbar, new action/category panels
  - **Monitor** tab → verify execution logs
  - Click "Test" on an action → verify test harness dialog
- App switcher → **Data Explorer** app:
  - **Dashboards** tab → verify dashboard browser (card grid, share dialog)
  - **Data** tab → verify navigation panel (tree), filter dialog
  - **Queries** tab → verify query browser, click a query → verify query viewer (grid, parameter form, info panel, row detail)
- App switcher → **Home** app → verify home dashboard widgets
- Test dark mode on all of the above

---

## Batch 7: Dashboard Components — Remaining Apps (~35 files, ~1,400+ hardcoded colors)
**Package:** `packages/Angular/Explorer/dashboards/` — Credentials, Scheduling, VersionHistory, Lists, Communication, Integration, Testing, ComponentStudio, MCP, SystemDiagnostics, APIKeys

**Also include:**
- `packages/Angular/Generic/credentials/` (3 files, 182 colors)
- `packages/Angular/Generic/versions/` (4 files, 307 colors)
- `packages/Angular/Generic/deep-diff/` (2 files, 90 colors)

**QA:**
- **Credentials** app → all tabs (Overview, Credentials, Types, Categories, Audit) → verify panels, edit dialogs
- **Scheduling** app → all tabs (Dashboard, Jobs, Activity) → verify job slideout, scheduling cards
- **Version History** app → Labels, Diff Viewer, Restore, Dependency Graph tabs
- **Lists** app → Lists, Operations, Categories tabs
- **Communication** app → all tabs
- **Integrations** app → all tabs (Overview, Connections, Pipelines, Schedules, Activity)
- **Testing** app → all tabs (Overview, Explorer tree, Runs, Analytics, Review)
- **Component Studio** app → full workspace (spec editor, code editor, preview, AI assistant, browser panel)
- **Admin** app → MCP tab, System Diagnostics tab, API Keys tab
- Test dark mode on all of the above

---

## Batch 8: Entity Forms (37 files, ~2,020 hardcoded colors)
**Package:** `packages/Angular/Explorer/core-entity-forms/`

| Sub-area | Files | Colors |
|---|---|---|
| AI Agents forms | 10 | ~605 |
| Tests forms | 4 | ~409 |
| Lists form | 1 | 132 |
| AI Agent Run forms | 5 | ~279 |
| Entity form | 1 | 121 |
| Action forms | 2 | 150 |
| AI Prompt Run forms | 2 | 144 |
| Query forms | 3 | 79 |
| Template forms | 3 | 36 |
| AI Prompt form | 1 | 7 |
| Shared form styles | 1 | 38 |

**QA:** For each entity form, open a record of that type:
- AI > Agents > click an agent → verify custom form
- AI > Prompts > click a prompt → verify form
- AI > Monitor > click a run → verify agent run form (timeline, step nodes, visualization, analytics)
- Actions > Explorer > click an action → verify action form (execution log sub-form)
- Data Explorer > open an Entity record → verify entity form
- Testing > click a test/suite/run → verify test forms
- Open a List record → verify list form
- Open a Query record → verify query form (run dialog)
- Open a Template record → verify template form (params grid, param dialog)
- Test dark mode on all of the above

---

## Batch 9: Settings & Admin (19 files, ~354 hardcoded colors)
**Package:** `packages/Angular/Explorer/explorer-settings/`

| File | Colors |
|---|---|
| `shared-settings.css` | 123 |
| `user-profile-settings.component.css` | 45 |
| `notification-preferences.component.css` | 44 |
| `application-settings.component.css` | 38 |
| `settings.component.css` | 20 |
| + 14 more files | 84 |

**Also include:**
- `packages/Angular/Generic/entity-relationship-diagram/` (1 file, 4 colors)

**QA:**
- Click avatar → **Settings**:
  - General tab (profile, account info)
  - Notifications tab (preferences)
  - Applications tab (app management, reorder)
  - Appearance tab
- **Admin** app:
  - ERD tab → verify entity relationship diagram
  - Permissions tab → verify permission grid/dialog
  - Roles tab → verify role dialog
  - Users tab → verify user management/dialog
  - SQL Logging tab → verify log table
  - Apps tab → verify application dialog
- Test dark mode on all of the above

---

## Batch 10: Remaining Generic Packages (~30 files, ~1,400+ hardcoded colors)

| Package | Files | Colors | QA Location |
|---|---|---|---|
| `Generic/artifacts` | 4 | 225 | Chat > click an artifact card; or Artifact tab |
| `Generic/file-storage` | 4 | 277 | File Browser app → Browse Files |
| `Generic/filter-builder` | 3 | 130 | Any view → Configure → Advanced Filter |
| `Generic/record-changes` | 1 | 126 | Any record form → Record Changes section |
| `Generic/markdown` | 1 | 82 | Chat conversations (AI responses render markdown) |
| `Generic/list-management` | 2 | 109 | Lists app; or any record form with list associations |
| `Generic/data-context` | 2 | 71 | Chat → conversation settings → Data Context |
| `Generic/export-service` | 1 | 53 | Any view grid → Export button |
| `Generic/code-editor` | 1 | 27 | Component Studio; Actions > code editing; AI prompt templates |
| `Generic/trees` | 2 | 44 | Actions > Explorer (left tree); Data Explorer > Data (left tree) |
| `Generic/timeline` | 1 | 38 | Record forms with timeline support |
| `Generic/entity-communication` | 1 | 8 | Communication-enabled entity records |
| `Generic/notifications` | 0 | 0 | (Already clean — verify bell icon panel) |
| `Generic/tab-strip` | 1 | 1 | Record forms (related entity tabs at bottom) |
| `Generic/join-grid` | 1 | 4 | Record forms with many-to-many relationships |
| `Generic/shared/loading` | 1 | 1 | Any loading state (mj-loading component) |
| `Generic/generic-dialog` | 0 | 0 | Confirmation dialogs (already clean) |
| `Generic/find-record` | 0 | 0 | FK lookup fields (verify styling) |
| `Generic/record-selector` | 0 | 0 | FK dropdowns (verify styling) |
| `Generic/resource-permissions` | 0 | 0 | Share dialogs (verify styling) |
| Remaining small packages | ~3 | ~10 | Verify visually |

**QA:** Test each package at its listed location. Test dark mode for all.

---

## Batch 11: Minor Explorer Packages

| Package | Files | Colors | QA Location |
|---|---|---|---|
| `Explorer/entity-permissions` | 1 | 3 | Admin > Permissions grid |
| `Explorer/list-detail-grid` | 1 | 2 | Lists app (list detail grid) |
| `Explorer/simple-record-list` | 1 | 2 | Record lists in various contexts |

---

## Post-Migration Verification

After all batches are complete:

1. **Full dark mode sweep**: Toggle dark mode and navigate through every app listed above
2. **Grep audit**: Run `grep -rn '#[0-9a-fA-F]\{3,8\}' packages/Angular/ --include='*.css' --include='*.scss' | grep -v dist | grep -v node_modules | grep -v _tokens.scss | grep -v generated` — should return zero results (or only token definitions)
3. **Build all**: `npm run build` from repo root — verify zero compilation errors
4. **Run tests**: `npm test` — verify no test regressions

## Working Approach

For each batch, I will:
1. Process files one at a time (or in small groups for the same component)
2. Map each hardcoded color to the correct semantic token using the mapping table
3. Use semantic tokens (e.g., `--mj-bg-surface`) wherever the intent is clear; use primitive tokens (e.g., `--mj-color-neutral-200`) only when no semantic token fits
4. Preserve visual intent — don't change what something looks like in light mode, just make it themeable
5. Build the package after completing the batch
6. Report to user for QA before moving to next batch
