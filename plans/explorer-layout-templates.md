# MJ Explorer · Layout Template Assignments

> **Purpose:** ground-truth inventory of every dashboard's structural shape, plus the canonical templates each one should conform to during Phase 2.3 (IA Standardization). Derived from a code inventory of `packages/Angular/Explorer/dashboards/src/` and `packages/Angular/Explorer/explorer-{core,settings}/` on 2026-05-07.

## TL;DR

13 of 17 dashboards collapse onto two templates. 4 are documented exceptions. Phase 2.3 work is mostly a class rename, not a redesign.

## The two templates

### Template A — Header + Left Sidebar + Main Content

```
┌──────────────────────────────────────────┐
│  mj-dashboard-header (full width)        │
├─────────────┬────────────────────────────┤
│             │                            │
│  sidebar    │   main content             │
│  (240px)    │                            │
│             │                            │
└─────────────┴────────────────────────────┘
```

- **Header:** `<header class="mj-dashboard-header">` — see `plans/design-mockups/components.css` for the canonical class.
- **Sidebar:** 240px fixed, left-aligned. Holds sub-page nav, grouped sections.
- **Main content:** scrollable; renders the active sub-page conditionally.
- **Canonical example:** `packages/Angular/Explorer/dashboards/src/Scheduling/scheduling-dashboard.component.html` — copy this structure for new pages.

### Template B — Header + Main Content (no sidebar)

```
┌──────────────────────────────────────────┐
│  mj-dashboard-header                     │
├──────────────────────────────────────────┤
│                                          │
│   main content                           │
│                                          │
└──────────────────────────────────────────┘
```

- **Header:** same as Template A. Optional toggle for an inline filter panel.
- **Main content:** full-width.
- **Canonical example:** `packages/Angular/Explorer/dashboards/src/MCP/mcp-dashboard.component.html` — copy this structure.

Filter panels (when needed) layer on top of either template — they are NOT a third template.

## Per-app assignments

| App | Current template | Target | Notes |
|---|---|---|---|
| Admin | A | A | Already aligned |
| APIKeys | A | A | Already aligned |
| ApplicationRoles | B | B | Already aligned |
| Communication | A | A | Has `.studio-toolbar` instead of header — rename to `mj-dashboard-header` |
| Credentials | A | A | Already aligned |
| DashboardBrowser | B | B | Multi-mode (List/View/Edit); header stays B in all modes |
| DatabaseDesigner | B | B | No header today — add `mj-dashboard-header` |
| EntityAdmin | B | B | Already aligned |
| MCP | B | B | **Reference example for B** |
| Permissions (User Access) | B | B | Already aligned |
| Scheduling | A | A | **Reference example for A** |
| Settings (explorer-settings) | A | A | Already aligned |
| Testing | A | A | Already aligned |

## Documented exceptions (4)

These are NOT consolidation candidates. Each has a structural reason its layout differs.

### Home — right-sidebar dashboard
Right-side collapsible sidebar (Quick Access, Notifications, Favorites, Recents) with a FAB toggle. The right side carries ambient context that left-sidebar templates would crowd out. **Keep as-is.**

### Component Studio — toolbar-driven authoring shell
Top toolbar with breadcrumb · togglable left component browser · right AI assistant pane. Purpose-built for authoring; doesn't fit Template A/B and shouldn't be forced to. **Keep as-is.**

### Data Explorer — workspace with auto-hiding nav
Animated left nav that auto-hides at "home level" plus dual right panels (detail + quick-access). Sophisticated responsive layout serving exploratory workflows. **Keep as-is.**

### Query Browser — resizable left panel + content
Inline-resizable left tree panel (`[style.width.px]`) plus main content. Workspace pattern shared with Data Explorer. **Keep as-is** (or, if a third template emerges across more workspaces, consolidate later).

## What's actually inconsistent today (the Phase 2.3 work)

The inventory found these specific issues. Each is a concrete rename / consolidation pass:

1. **Header class names are scattered.** Five different names across dashboards: `.dashboard-header`, `.header`, `.studio-toolbar`, `.viewer-toolbar`, `.content-header`. None use the canonical `.mj-dashboard-header` from the design system.
   - **Fix:** mass-rename to `.mj-dashboard-header`. This is the single highest-value dedup pass.
   - **Affected files:** all 17 dashboard templates.

2. **Empty states are ad-hoc.** `pin-empty-state`, `empty-state`, custom — no shared class, and no `<mj-empty-state>` component exists yet (Phase 2.3 calls for one).
   - **Fix:** build `<mj-empty-state>` in `@memberjunction/ng-ui-components`, then mass-replace.

3. **Sidebar widths vary.** Phase 2.3 says 240px. Apps don't all comply.
   - **Fix:** sweep Template A apps; force 240px via shared CSS variable.

4. **No app uses `<mj-page-header>` (Phase 2.3 component) yet.** That component is the long-term target — `.mj-dashboard-header` CSS is the interim.
   - **Fix path:** rename CSS first (low risk), build Angular component second (replaces the CSS-only approach).

## What this replaces

- The 6 layouts in `plans/design-mockups/pages/layouts.html` are mostly aspirational. Production today has only 5 distinct shapes (the 2 templates + 3 single-instance exceptions; Query Browser duplicates Data Explorer's pattern). Don't treat layouts.html as the catalog — treat **this doc + the canonical examples** as the catalog.

- An earlier `prototypes/admin-ia/admin-wireframes/` exploration proposed 6 templates; the empirical answer was 2 + exceptions, so that directory has been deleted. Don't recreate it — `plans/design-mockups/` is the canonical design system.

## How to use this doc

When adding a new dashboard or consolidating an existing one:

1. Decide: does it have a left sidebar? → Template A. Does it not? → Template B.
2. Open the canonical example (`Scheduling` for A, `MCP` for B). Copy its template structure.
3. Wrap your header in `<header class="mj-dashboard-header">`. Use `mj-dashboard-title` / `mj-dashboard-icon` / `mj-dashboard-subtitle` / `mj-dashboard-actions` for the inner regions.
4. Use 240px for sidebar width. Use `<mj-empty-state>` for empty states (when it exists).
5. If your page genuinely doesn't fit either template, propose a 3rd. Don't invent a one-off layout silently.

## Resolved decisions

- **Per-app accent color (`--mj-app-accent`):** keep the token as a theming hook (so per-app accents remain *possible*), but ship every app with the same brand-blue value so accents are not visible by default. Consistent with the broader "kill the rainbow" direction. Per-app overrides require an explicit opt-in.

## Open questions

- **Template C for workspaces?** Data Explorer + Query Browser share enough that they could become a third template. Defer until a third workspace candidate appears.
