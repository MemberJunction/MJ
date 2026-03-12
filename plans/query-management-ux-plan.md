# Query Management UX — Analysis & Design Plan

**Date:** 2026-03-11
**Branch:** EL-BC
**Author:** Investigation + design session

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Query Builder Agent — What It Is](#2-query-builder-agent--what-it-is)
3. [The Gap: What's Missing Today](#3-the-gap-whats-missing-today)
4. [Data Model Reference](#4-data-model-reference)
5. [Design Philosophy & Constraints](#5-design-philosophy--constraints)
6. [UI Design Proposals](#6-ui-design-proposals)
7. [Recommended Approach](#7-recommended-approach)
8. [Implementation Plan](#8-implementation-plan)
9. [Risk & Design Review](#9-risk--design-review)

---

## 1. Current State Assessment

### 1.1 Query Browser (`/app/data-explorer/Queries`)

**Component:** `QueryBrowserResourceComponent`
**Location:** `packages/Angular/Explorer/dashboards/src/QueryBrowser/`

The Query Browser is the main entry point for queries in the current UI. It provides:

- **Left panel**: Hierarchical category tree with search and status filter chips (`Approved | Pending | Rejected | Expired`)
- **Right panel**: `mj-query-viewer` — runs the query, shows parameter form, results in AG Grid
- **State persistence**: Panel width, status filters, expanded categories, selected query — all saved to User Settings
- **Deep-linking**: `?queryId=<uuid>` URL param for direct navigation

**What it CANNOT do today:**
- Create a new query
- Edit query metadata (name, description, category, SQL, parameters, permissions)
- Manage query fields, permissions, or related sub-records

The toolbar has only: expand-all, collapse-all, refresh.

### 1.2 Query Form (Exists but Hidden)

**Component:** `MJQueryFormComponentExtended`
**Location:** `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Queries/`

A full-featured custom entity form **does exist** for query CRUD:

- SQL editor (code-highlighted)
- Category selection with create-new-category dialog
- Status management with color-coded badges
- Expansion panels for Parameters, Fields, Entities, Permissions
- Run query inline with parameter dialog
- Unsaved changes tracking

**How to access it today:** You must navigate to the generic entity record browser → find "MJ: Queries" entity → create/edit records there. There is **no navigation path** from the Query Browser to this form.

### 1.3 SingleQueryComponent

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/single-query/`

A thin 31-line wrapper that bridges the routing system to `mj-query-viewer`. Does not show the management form; only renders the viewer.

### 1.4 `ng-query-viewer` Package

**Location:** `packages/Angular/Generic/query-viewer/`

Modern AG Grid-based package providing:
- `QueryViewerComponent` — composite viewer with parameter form, grid, info panel
- `QueryDataGridComponent` — AG Grid table
- `QueryParameterFormComponent` — dynamic parameter inputs
- `QueryInfoPanelComponent` — query metadata display
- `QueryRowDetailComponent` — row expansion

This is the display/execution layer only; no editing capability.

### 1.5 What the Old 2.x Version Had

Based on git history, the old experience included a dedicated Query page with a form where users could:
- Enter name, SQL, category, status
- Save → trigger AI-assisted generation of `QueryField`, `QueryParameter`, `QueryEntity` sub-records
- The AI would parse the SQL and auto-create the metadata records

The main migration (`b98840457e`, Feb 2026) replaced the deprecated `@memberjunction/ng-query-grid` (Kendo-based) with `@memberjunction/ng-query-viewer` (AG Grid-based). This simplified SingleQueryComponent down to a pure viewer and inadvertently orphaned the management form from the main query navigation path.

---

## 2. Query Builder Agent — What It Is

### 2.1 Overview

The Query Builder Agent is a **conversational AI system** for creating queries by describing what data you need in natural language. It is _not_ a direct form replacement — it's an AI assistant that does the heavy lifting of SQL authorship.

**Architecture: Two-tier orchestration**

```
User Message
    │
    ▼
Query Builder Agent (Orchestrator)  ← TypeScript: QueryBuilderAgent extends BaseAgent
    │  - Discusses requirements with user
    │  - Manages conversation, artifacts, iteration
    │  - Payload: { source, title, plan, columns[], rows[], metadata{sql} }
    │
    ├── Action: Get Entity Details       (schema discovery)
    ├── Action: Execute Research Query   (test/validate SQL)
    │
    └── Sub-Agent: Query Strategist      (SQL generation specialist)
            - Loop agent
            - Explores schema, generates SQL, tests it
            - Returns structured query results
```

**Metadata:**
- `metadata/agents/.query-builder-agent.json` — Agent definition
- `metadata/prompts/.query-builder-agent-prompt.json` — Orchestrator system prompt
- `metadata/prompts/.query-builder-query-strategist-prompt.json` — Strategist prompt
- `packages/AI/Agents/src/query-builder-agent.ts` — TypeScript implementation

### 2.2 What the Agent Produces

The agent creates **Data Artifacts** (not directly saved queries — the agent creates `Pending` query records via Create Record action). Output payload:

```json
{
  "source": "query",
  "title": "Active Customers by Region",
  "plan": "## Approach\n...",
  "columns": [{ "field": "Region", "headerName": "Region" }],
  "rows": [...],
  "metadata": {
    "sql": "SELECT ...",
    "rowCount": 42,
    "executionTimeMs": 180
  }
}
```

Key design decisions:
- Agent creates queries as **Pending** status — never auto-approves
- SQL is formatted with `sql-formatter` (T-SQL, 4-space indent, UPPERCASE keywords)
- The user reviews/approves through normal MJ workflow
- Agent saves via **Create Record / Update Record actions** (standard MJ actions, not a special API)

### 2.3 Execute Research Query Action

A security-hardened action that enforces:
- SELECT-only (rejects DML/DDL)
- Dangerous pattern detection (EXEC, xp_cmdshell, etc.)
- Configurable timeout (default 30s)
- Row limits (default 1000)
- Optional LLM analysis of results

---

## 3. The Gap: What's Missing Today

| Capability | Status | Where |
|---|---|---|
| Browse queries by category | ✅ Working | Query Browser |
| Run a query | ✅ Working | Query Browser → query-viewer |
| Filter by status | ✅ Working | Query Browser |
| Deep-link to a query | ✅ Working | `?queryId=<uuid>` |
| Create a new query (manual) | ✅ Implemented | Query Browser → slide-in drawer |
| Edit query SQL/metadata | ✅ Implemented | Query Browser → slide-in drawer |
| View/edit query parameters | ❌ Not accessible from Query Browser | Exists in entity form, use "Open Full Record" |
| View/edit query permissions | ❌ Not accessible from Query Browser | Exists in entity form, use "Open Full Record" |
| Approve/reject a query | ❌ Not accessible from Query Browser | Entity form only |

**Root cause:** `MJQueryFormComponentExtended` is fully implemented but there is no button/route in the Query Browser to open it for new or existing queries. The drawer covers the common cases (Name, SQL, Category, Status, Description); advanced sub-entity management uses "Open Full Record" to reach the full entity form.

---

## 4. Data Model Reference

```
MJ: Queries (core)
├── ID (PK)
├── Name (255)
├── CategoryID → MJ: Query Categories
├── UserQuestion (text)        — natural language intent
├── Description (text)
├── SQL (text)                 — may use Nunjucks {{param}} syntax
├── TechnicalDescription (text)— AI-generated performance docs
├── OriginalSQL (text)         — pre-optimization copy
├── Feedback (text)
├── Status: Approved|Expired|Pending|Rejected|In-Review|Obsolete
├── QualityRank (int)
├── ExecutionCostRank (int)
├── UsesTemplate (bit)         — auto-set when SQL has {{ }}
├── AuditQueryRuns (bit)
├── CacheEnabled (bit)
├── CacheTTLMinutes (int)
├── CacheMaxSize (int)
├── CacheValidationSQL (text)
├── EmbeddingVector (text)
├── EmbeddingModelID
└── SQLDialectID

MJ: Query Categories
├── ID, Name, ParentID (self-ref), Description
├── UserID, DefaultCacheEnabled, DefaultCacheTTLMinutes
└── CacheInheritanceEnabled

MJ: Query Fields          — result set columns (AI or manual)
├── QueryID, Name, Sequence, SQLBaseType, SQLFullType
├── SourceEntityID, SourceFieldName
├── IsComputed, ComputationDescription
├── IsSummary, SummaryDescription
└── DetectionMethod: AI|Manual, AutoDetectConfidenceScore

MJ: Query Parameters      — input parameters (Nunjucks)
├── QueryID, Name, Type: array|boolean|date|number|string
├── IsRequired, DefaultValue, Description, SampleValue
├── ValidationFilters (JSON array of Nunjucks filters)
└── DetectionMethod: AI|Manual, AutoDetectConfidenceScore

MJ: Query Permissions     — role-based access
└── QueryID, RoleID

MJ: Query SQLs            — multi-dialect SQL support
└── QueryID, SQLDialectID, SQL

(Future) MJ: Query Dependencies — composable query graph
└── QueryID, DependsOnQueryID, ReferencePath, Alias, ParameterMapping
```

---

## 5. Design Philosophy & Constraints

### 5.1 Non-Negotiables

1. **No hardcoded entity names** in new components — use `Metadata()` lookups
2. **No `any` types** in TypeScript
3. **Reuse existing infrastructure** — `MJQueryFormComponentExtended` already exists and is well-built; don't duplicate
4. **PascalCase public members, camelCase private** throughout
5. **`@if` / `@for`** modern template syntax
6. **`inject()` over constructor injection** for new components
7. **No re-exports** between packages
8. **Extend, don't replace** — the manual path (drawer) and the full entity form path coexist and complement each other

### 5.2 Architectural Constraints

- The Query Browser lives in `packages/Angular/Explorer/dashboards/` — a dashboard package
- The Query Form lives in `packages/Angular/Explorer/core-entity-forms/` — the entity forms package
- Navigation between sections uses the `TabService` / MJ resource system, NOT router.navigate
- Query Browser is registered as `'QueryBrowserResource'` — a `BaseResourceComponent`
- User should never leave context — prefer inline panels or dialog overlays over full page navigation

### 5.3 UX Principles

- **Progressive disclosure**: Show what the user needs now; reveal complexity on demand
- **Inline where possible**: Don't force navigation away from the browser when editing
- **Status clarity**: Pending/Approved/Rejected must always be visible
- **Escape hatch**: "Open Full Record" link gives access to advanced sub-entity management without cluttering the common-case drawer

---

## 6. UI Design — Chosen Approach: Right-Side Slide-In Drawer

**Core constraint**: The user stays on `http://localhost:4201/app/data-explorer/Queries` for all create and edit operations. No tab navigation, no page changes.

**Pattern**: A fixed-position drawer slides in from the right edge of the viewport, overlaying the query viewer panel with a semi-transparent backdrop. The left panel (category tree + search) remains fully live and interactive throughout.

---

### 6.1 Overall Layout When Drawer is Open

```
URL stays: http://localhost:4201/app/data-explorer/Queries
─────────────────────────────────────────────────────────────────────────────
│                                          │                                │
│   LEFT PANEL (fully live)                │  BACKDROP (rgba 0,0,0, 0.35)  │
│   ──────────────────────────             │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│   ┌ ⊞ Queries (47)      [+][⇵][⇄][↺] ┐ │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░  ├──────────────────────┐
│   │ 🔍 Search...               ×      │ │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░  │                      │
│   │                                   │ │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░  │   SLIDE-IN DRAWER    │
│   │ [● Approved][○ Pending][○ ...]    │ │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░  │   (480px wide)       │
│   │                                   │ │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░  │                      │
│   │ ▼ Sales (12)                      │ │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░  │   [form content]     │
│   │     ● Monthly Revenue         ✎   │ │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░  │                      │
│   │     ○ Top Customers by Region ✎   │ │                               └──────────────────────┘
│   │   ▶ Marketing (5)                 │ │
│   │   ▶ Finance (8)                   │ │
│   └───────────────────────────────────┘ │
│                                         │
─────────────────────────────────────────────────────────────────────────────

Key:
  [+]  = New Query button (visible if user has create permission)
  ✎   = Inline edit icon on query items (visible on hover if user has edit permission)
  Backdrop click = closes drawer (with unsaved-changes warning if dirty)
  Esc key        = closes drawer (with unsaved-changes warning if dirty)
```

**Drawer dimensions:**
- Width: 480px (fixed)
- Height: 100vh (full viewport height)
- Position: `fixed; right: 0; top: 0; bottom: 0` — overlays the whole page
- Slide animation: CSS `transform: translateX(100%)` → `translateX(0)`, 220ms ease-out
- Backdrop: `fixed; inset: 0; background: rgba(0,0,0,0.35)` — behind drawer, in front of page

> **⚠️ Left panel stays interactive**: The backdrop only visually dims the right half. The left panel is visually unobscured because it's narrower than the viewport minus the drawer.

---

### 6.2 Create Form — New Query

**Trigger:** `[+]` button in the left panel header toolbar
**URL stays:** `http://localhost:4201/app/data-explorer/Queries` (no change)

```
┌─────────────────────────────────────────────────────────────┐
│  ╔═══════════════════════════════════════════════════════╗   │
│  ║  📝  New Query                                   [×]  ║   │
│  ╠═══════════════════════════════════════════════════════╣   │
│  ║                                                       ║   │
│  ║  Name *                                               ║   │
│  ║  ┌─────────────────────────────────────────────────┐  ║   │
│  ║  │                                                 │  ║   │
│  ║  └─────────────────────────────────────────────────┘  ║   │
│  ║                                                       ║   │
│  ║  Category                          Status             ║   │
│  ║  ┌────────────────────────────┐  ┌───────────────┐   ║   │
│  ║  │ (none)                  ▾  │  │ Pending     ▾ │   ║   │
│  ║  └────────────────────────────┘  └───────────────┘   ║   │
│  ║                                                       ║   │
│  ║  Description                                          ║   │
│  ║  ┌─────────────────────────────────────────────────┐  ║   │
│  ║  │                                                 │  ║   │
│  ║  │                                                 │  ║   │
│  ║  └─────────────────────────────────────────────────┘  ║   │
│  ║                                                       ║   │
│  ║  SQL                                                  ║   │
│  ║  ┌─────────────────────────────────────────────────┐  ║   │
│  ║  │                                                 │  ║   │
│  ║  │  SELECT                                         │  ║   │
│  ║  │    ...                                          │  ║   │
│  ║  │                                                 │  ║   │
│  ║  │                                                 │  ║   │
│  ║  └─────────────────────────────────────────────────┘  ║   │
│  ║                                                       ║   │
│  ╠═══════════════════════════════════════════════════════╣   │
│  ║  [  Save  ]                          [  Cancel  ]    ║   │
│  ╚═══════════════════════════════════════════════════════╝   │
└─────────────────────────────────────────────────────────────┘
```

**Fields:**

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| Name | Text input | ✅ Yes | — | Full width. Save button disabled if empty |
| Category | Select dropdown | No | (none) | Populated from `metadata.QueryCategories` |
| Status | Select dropdown | No | `Pending` | Options: Pending, Approved, Rejected, Expired |
| Description | Textarea | No | — | 3 rows, resizable |
| SQL | Textarea | No | — | 10 rows, monospace font, resizable, tab key inserts 4 spaces |

**Footer buttons (left to right):**
- `[Save]` — primary/indigo, disabled while saving or if Name is empty. Shows spinner while saving.
- `[Cancel]` — secondary/outline, closes drawer. If form is dirty (any field changed), shows confirmation: "Discard unsaved changes?"

**After successful save:**
1. Drawer slides out (right)
2. Query list refreshes via `loadData(true)`
3. Newly created query is auto-selected in the left panel tree
4. Its category auto-expands in the tree
5. Right panel shows the query viewer for the new query

**Validation states:**
```
Name field — error state (empty on save attempt):
┌─────────────────────────────────────────────────────────────┐
│  Name *                                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │  ← red border
│  └─────────────────────────────────────────────────────┘   │
│  ⚠ Name is required                                         │  ← red hint text
└─────────────────────────────────────────────────────────────┘

Save button — saving state:
  [  ⟳ Saving...  ]   ← spinner, button disabled
```

---

### 6.3 Edit Form — Existing Query

**Triggers (two entry points):**
1. `[✎]` hover icon on a query item in the left panel tree
2. `[✎ Edit]` button in the right panel header (next to status pill)

**URL stays:** `http://localhost:4201/app/data-explorer/Queries?queryId=<uuid>` (no change)

```
┌─────────────────────────────────────────────────────────────┐
│  ╔═══════════════════════════════════════════════════════╗   │
│  ║  ✎  Edit Query                                  [×]  ║   │
│  ║     Monthly Revenue by Region                        ║   │  ← query name subtitle
│  ╠═══════════════════════════════════════════════════════╣   │
│  ║                                                       ║   │
│  ║  Name *                                               ║   │
│  ║  ┌─────────────────────────────────────────────────┐  ║   │
│  ║  │ Monthly Revenue by Region                       │  ║   │
│  ║  └─────────────────────────────────────────────────┘  ║   │
│  ║                                                       ║   │
│  ║  Category                          Status             ║   │
│  ║  ┌────────────────────────────┐  ┌───────────────┐   ║   │
│  ║  │ Sales                   ▾  │  │ Approved    ▾ │   ║   │
│  ║  └────────────────────────────┘  └───────────────┘   ║   │
│  ║                                                       ║   │
│  ║  Description                                          ║   │
│  ║  ┌─────────────────────────────────────────────────┐  ║   │
│  ║  │ Shows monthly revenue broken down by...         │  ║   │
│  ║  │                                                 │  ║   │
│  ║  └─────────────────────────────────────────────────┘  ║   │
│  ║                                                       ║   │
│  ║  SQL                                                  ║   │
│  ║  ┌─────────────────────────────────────────────────┐  ║   │
│  ║  │ SELECT                                          │  ║   │
│  ║  │     r.Region,                                   │  ║   │
│  ║  │     SUM(o.Amount) AS Revenue                    │  ║   │
│  ║  │ FROM Orders o                                   │  ║   │
│  ║  │ JOIN Regions r ON r.ID = o.RegionID             │  ║   │
│  ║  │ GROUP BY r.Region                               │  ║   │
│  ║  │ ORDER BY Revenue DESC                           │  ║   │
│  ║  └─────────────────────────────────────────────────┘  ║   │
│  ║                                                       ║   │
│  ║  ─────────────────────────────────────────────────── ║   │
│  ║  ℹ To manage Parameters, Fields, and Permissions —   ║   │
│  ║    ↗ Open full record                                ║   │
│  ║                                                       ║   │
│  ╠═══════════════════════════════════════════════════════╣   │
│  ║  [  Save  ]                          [  Cancel  ]    ║   │
│  ╚═══════════════════════════════════════════════════════╝   │
└─────────────────────────────────────────────────────────────┘
```

**Fields:** Same as Create, all pre-populated from `QueryInfo`.

**Additional elements in Edit mode only:**
- **"Open Full Record" info box**: Links to `navigationService.OpenEntityRecord('MJ: Queries', compositeKey)` for managing Parameters, Fields, and Permissions in the full entity form.

**Footer buttons (left to right):**
- `[Save]` — primary/indigo, same behavior as Create
- `[Cancel]` — secondary/outline, dirty-check same as Create

**After successful save:**
1. Drawer slides out
2. Query list refreshes
3. The edited query remains selected (re-selected by ID)
4. If name or category changed, the tree position updates accordingly

---

### 6.4 Inline Edit Icon on Query Tree Items

Currently the query tree items only support click-to-select. We add a hover-revealed `✎` icon on the right side of each item.

```
Query item — default state:
  ┌──────────────────────────────────────────────────────┐
  │ ● ▮ Monthly Revenue by Region                        │
  └──────────────────────────────────────────────────────┘

Query item — hovered (edit icon appears):
  ┌──────────────────────────────────────────────────────┐
  │ ● ▮ Monthly Revenue by Region               [ ✎ ]   │
  └──────────────────────────────────────────────────────┘

  Click ✎  → opens Edit drawer for this query
             (does NOT select the query for running — separate actions)
  Click row → selects query for running (existing behavior, unchanged)
```

The `✎` icon only appears on hover and only if `CanEditQuery` is true.

---

### 6.5 Right Panel — Edit Button

The right panel header gains a dark-variant edit button alongside the status pill:

```
Right panel header — query selected:
  ┌────────────────────────────────────────────────────────────────┐
  │  ▮ Monthly Revenue by Region      ● Approved   [ ✎ ]          │
  └────────────────────────────────────────────────────────────────┘

  [ ✎ ] uses dark icon color (#555) instead of white, since the right
        panel header background is white (#fff).
        Shows tooltip: "Edit query metadata"
```

---

### 6.6 Interaction & State Details

**Drawer open/close animation:**
```css
/* Closed */
.query-drawer { transform: translateX(100%); }

/* Open */
.query-drawer { transform: translateX(0); transition: transform 220ms ease-out; }

/* Backdrop */
.query-drawer-backdrop { opacity: 0; → opacity: 1; transition: opacity 220ms ease-out; }
```

**Keyboard:**
- `Esc` → close drawer (with dirty-check)
- `Tab` → cycles through form fields normally
- Inside SQL textarea, `Tab` key → inserts 4 spaces (prevents focus escape)

**Dirty tracking:**
- Form is "dirty" if any field differs from its initial value
- Dirty state is tracked in component (no heavy form library needed)
- Closing a dirty form shows: `"You have unsaved changes. Discard them?"` → [Discard] [Keep Editing]

**Scroll:**
- Drawer content scrolls independently (the SQL textarea may be tall)
- Drawer header (title + close) and footer (buttons) are sticky — always visible

**Saving states:**
```
[  Save  ]          ← default
[  ⟳ Saving...  ]  ← during async save (button disabled)
```

---

### 6.7 "Open Full Record" Link

Both drawer modes show a footer note linking to the full entity form for advanced management. This is the escape hatch for users who need to manage Parameters, Fields, Permissions, or SQL dialect variants:

```
Edit drawer body (below SQL field):
  ──────────────────────────────────────────────────
  ℹ To manage Parameters, Fields, and Permissions —
    Open full record →
  ──────────────────────────────────────────────────
```

Clicking "Open full record" → calls `navigationService.OpenEntityRecord('MJ: Queries', compositeKey)` which opens the full entity form in a **new Golden Layout tab**. The drawer also closes. The user is still on the Queries page (left panel) but gains the full edit experience in a side-by-side tab.

---

### 6.8 Toolbar Summary — Final State

```
Left panel header (all states):

  Default (read-only user):
  ┌────────────────────────────────────────────────┐
  │  ⊞ Queries (47)         [⇵ expand][⇄ collapse][↺]  │
  └────────────────────────────────────────────────┘

  With create permission:
  ┌────────────────────────────────────────────────┐
  │  ⊞ Queries (47)     [+][⇵ expand][⇄ collapse][↺]  │
  └────────────────────────────────────────────────┘
                          ↑
                          New Query button
```

```
Right panel header (query selected):

  Read-only user:
  ┌──────────────────────────────────────────────────────┐
  │  ▮ Monthly Revenue by Region      ● Approved         │
  └──────────────────────────────────────────────────────┘

  With edit permission:
  ┌──────────────────────────────────────────────────────┐
  │  ▮ Monthly Revenue by Region      ● Approved  [ ✎ ]  │
  └──────────────────────────────────────────────────────┘
```

---

## 7. Recommended Approach

**Chosen design**: Right-side slide-in drawer (Section 6 above). Stays on `http://localhost:4201/app/data-explorer/Queries` throughout.

### Phase 1 — Drawer ✅ Implemented

**Scope:**
1. Slide-in drawer component built directly into `QueryBrowserResourceComponent`
2. Create mode: empty form fields, saves new `MJQueryEntity`
3. Edit mode: pre-populated from `QueryInfo`, saves edits back to `MJQueryEntity`
4. Inline `✎` hover icon on each query tree item
5. `✎ Edit` button in right panel header (dark variant, visible on white bg)
6. `[+]` New Query button in left panel toolbar
7. Dirty-check on close (Esc / backdrop / Cancel)
8. "Open Full Record" link in edit mode for sub-entity management
9. Auto-select + expand created/edited query after save

**Files changed:**
- `packages/Angular/Explorer/dashboards/src/QueryBrowser/query-browser-resource.component.ts`
- `packages/Angular/Explorer/dashboards/src/QueryBrowser/query-browser-resource.component.html`
- `packages/Angular/Explorer/dashboards/src/QueryBrowser/query-browser-resource.component.css`
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Queries/query-form.component.ts`
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Queries/query-form.component.html`

**No new package dependencies required** — `@memberjunction/core-entities` (for `MJQueryEntity`) and `FormsModule` (for `[(ngModel)]`) are already in the dashboards module.

### "Open Full Record" Page Fixes ✅ Implemented

The `MJQueryFormComponentExtended` entity form (opened via the "Open Full Record" link in the edit drawer) had several non-functional toolbar elements due to its use of the legacy `[Form]="this"` toolbar API without wiring up the event outputs.

**Non-functional items removed:**
- **Delete button** — toolbar dispatches to form methods not connected in legacy mode
- **Favorite button** — same issue
- **History button** — same issue
- **Lists button** — same issue
- **Section search input** — typing + pressing Enter triggered edit mode (form submit bubbling)
- **Expand All / Collapse All buttons** — emit events nobody handles; custom form uses its own `*PanelExpanded` boolean state
- **Width toggle / Manage Sections / Section reorder** — emit events nobody handles

**Fix:** Added `ToolbarConfig: FormToolbarConfig` property with those features disabled, passed as `[Config]="ToolbarConfig"` to `<mj-form-toolbar>`. The Edit button and Save/Cancel/Discard flow remain fully functional.

**Also fixed:** `statusOptions` in `query-form.component.ts` was missing `In-Review` and `Obsolete` — added both to match the full `MJQueryEntity.Status` union type.

### Phase 2 — Approval Workflow

Badge on Pending filter chip showing count of queries awaiting approval. Bulk status-change controls for admin users.

---

## 8. Implementation Notes

### Drawer Implementation

The drawer is embedded directly in `QueryBrowserResourceComponent` — no separate component file. State is managed via public properties with `cdr.markForCheck()` for OnPush change detection compatibility.

**Key patterns used:**
- `MJQueryEntity` from `@memberjunction/core-entities` for create/edit via `entity.Save()`
- `entity.Load(queryId)` to load an existing record for editing
- `metadata.GetEntityObject<MJQueryEntity>('MJ: Queries')` — never `new MJQueryEntity()`
- `entity.GetUserPermisions(currentUser).CanCreate / .CanUpdate` for permission checks
- JSON snapshot comparison for dirty tracking (no third-party form library)
- `@HostListener('document:keydown.escape')` for Esc key support

---

## 9. Risk & Design Review

### 9.1 Package Dependency Risk

The main architectural risk is creating unintended cross-package dependencies:

| Scenario | Risk | Mitigation |
|---|---|---|
| `dashboards` imports from `core-entity-forms` | New dependency, may cause build order issues | Use TabService navigation instead of embedding |
| Embed `mj-query-viewer` in the edit drawer | `query-viewer` is already a dependency of dashboards | OK |
| New quick-create form duplicates `MJQueryFormComponentExtended` | Code duplication, drift | The drawer covers common cases; "Open Full Record" handles advanced use |

### 9.2 Permissions

- Only show Create/Edit buttons if the user has entity-level write permissions for `MJ: Queries`
- Use `MJQueryEntity` permissions via the standard MJ permission system
- Check: `entity.GetUserPermisions(currentUser).CanCreate` / `.CanUpdate` from `Metadata().Entities`
- Do not hardcode role names

### 9.3 Status Approval Workflow

The Query Builder Agent always creates `Pending` queries. Manual creation via the drawer also defaults to `Pending`. Consider:

- Should the Query Browser show a notification badge for queries awaiting approval (if user has approval rights)?
- Should the Status filter default include `Pending` for users who can approve?
- These are UX improvements, not blockers, but worth noting for Phase 2.

### 9.4 Long-Term: Query Form Location

`MJQueryFormComponentExtended` currently lives in `core-entity-forms`. As query management becomes a first-class feature, consider whether it belongs in:
- `query-viewer` package (makes query viewer a full management package — rename to `query-manager`?)
- A new dedicated `query-management` package
- Keep in `core-entity-forms` (it's an entity form, that's appropriate)

This is not urgent but worth a conversation. The current location is defensible.

---

## Testing Instructions

### Phase 1 — Drawer Manual Test Steps

**Prerequisites:** MJExplorer running at `http://localhost:4201`, MJAPI at `http://localhost:4001`. Log in as a user with query create/edit permissions.

---

#### Test 1: Create New Query — happy path

1. Go to `http://localhost:4201/app/data-explorer/Queries`
2. Confirm the `+` icon button is in the left panel header (next to expand-all)
3. Click `+`
4. **Verify**: The URL stays at `/app/data-explorer/Queries` — no tab navigation
5. **Verify**: A drawer slides in from the right. Title reads "New Query"
6. **Verify**: All fields are empty; Status defaults to "Pending"
7. **Verify**: The left panel (category tree) is still visible and the backdrop dims the right panel
8. Enter Name: `Test Drawer Query`; enter SQL: `SELECT 1 AS TestCol`
9. Click `[Save]`
10. **Verify**: Button shows spinner briefly, then drawer slides out
11. **Verify**: The new query appears in the left tree (expand the "Uncategorized" or relevant category, enable Pending filter)
12. **Verify**: The new query is auto-selected and the right panel shows its viewer

---

#### Test 2: Create — validation

1. Click `+` to open the Create drawer
2. Leave Name empty, click `[Save]`
3. **Verify**: Save is blocked; Name field shows a red border and "Name is required" hint
4. Type a name, then clear it again
5. **Verify**: Error state returns when field loses focus with empty value

---

#### Test 3: Create — cancel with dirty check

1. Click `+` to open the Create drawer
2. Type something in the Name field (making the form dirty)
3. Press `Esc`
4. **Verify**: A confirmation appears: "You have unsaved changes. Discard them?"
5. Click `[Discard]` — **Verify**: drawer closes, no query created
6. Repeat steps 1–3, click `[Keep Editing]` — **Verify**: drawer stays open, text preserved

---

#### Test 4: Edit from right panel Edit button

1. Go to `http://localhost:4201/app/data-explorer/Queries?queryId=23F8423E-F36B-1410-8D9C-00021F8B792E`
2. Confirm the `✎` edit button appears to the right of the status pill in the right panel header
3. **Verify**: The button has a dark icon (visible against white header background — not invisible)
4. Click `✎`
5. **Verify**: URL stays at `/app/data-explorer/Queries?queryId=...` — no navigation
6. **Verify**: Edit drawer slides in from the right. Title reads "Edit Query" with the query name below
7. **Verify**: All fields are pre-populated (Name, Category, Status, Description, SQL)
8. Change the Description, click `[Save]`
9. **Verify**: Drawer closes, list refreshes, the same query remains selected

---

#### Test 5: Edit from hover icon on tree item

1. Go to `http://localhost:4201/app/data-explorer/Queries`
2. Hover over any query item in the left panel tree
3. **Verify**: A `✎` icon appears on the right side of the item (on hover only)
4. Click the `✎` icon
5. **Verify**: Edit drawer opens for that query (same as Test 4)
6. **Verify**: Clicking the row itself (not the icon) still selects the query for running — does NOT open the drawer

---

#### Test 6: Edit — Open Full Record link

1. Open the Edit drawer for any query
2. **Verify**: Near the bottom of the form body, an info box reads "To manage Parameters, Fields, and Permissions — Open full record"
3. Click "Open full record"
4. **Verify**: The drawer closes AND a new tab opens with the full `MJQueryFormComponentExtended` entity form for that query

---

#### Test 7: Permission-based visibility

1. Log in as a read-only user (no create/edit permissions on MJ: Queries)
2. Go to `http://localhost:4201/app/data-explorer/Queries`
3. **Verify**: `+` button is NOT visible in the left panel header
4. Hover over query items — **Verify**: `✎` icon does NOT appear
5. Select a query — **Verify**: `✎` edit button is NOT in the right panel header

---

#### Test 8: No disruption to existing run behavior

1. Go to `http://localhost:4201/app/data-explorer/Queries`
2. Select any `Approved` query — **Verify**: results load in the grid as before
3. Select a parameterized query — **Verify**: parameter form appears and query runs
4. Navigate via URL: `?queryId=<uuid>` — **Verify**: correct query auto-selected
5. Toggle status filter chips — **Verify**: tree filters correctly
6. Open the drawer and press `Esc` — **Verify**: drawer closes and query viewer is intact

---

## Summary of Action Items

| Priority | Task | Status | Notes |
|---|---|---|---|
| ✅ Phase 1 | Right-side slide-in drawer (create + edit) | Done | All three component files updated |
| 🟡 Phase 2 | Approval workflow UX (badge, bulk status) | Future | Nice to have |
| ⚪ Future | AI field/parameter detection on save | TBD | Confirm if action exists in actions/agents packages |
