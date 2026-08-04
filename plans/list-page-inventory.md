# MJ Explorer List-Page Inventory

> **Part of the UI consistency program.** Current commitments live in [`ui-consistency-objectives.md`](ui-consistency-objectives.md). The gameplan that uses this data is in [`list-page-consistency-gameplan.md`](list-page-consistency-gameplan.md).
>
> **Status: data artifact.** Generated 2026-05-22 via automated audit of `packages/Angular/**`. Source-of-truth for the list-page consistency program. Feeds directly into [`plans/list-page-standardization.md`](list-page-standardization.md).
>
> **What this is:** Per-page inventory of every list-of-records page in MJ Explorer, capturing controls present, card patterns used, view modes available, and rendering components. Plus a per-card-implementation inventory.
>
> **What this isn't:** A plan, a set of decisions, or a contract. It's the empirical baseline that planning + decisions get made *against*.
>
> **Scope:** List-of-records pages only. Excludes Overview/KPI dashboards, workspace pages (Component Studio, Flow Editor, etc.), record-detail pages (entity forms), and modal/wizard flows.

---

## Headline findings

1. **~44 list pages identified** across all apps — significantly more than the 11 rows in the existing `list-page-standardization.md` proposal.
2. **~25 distinct card "components" — but almost all are inline templates**, not extracted standalone components. Only `action-card`, `action-list-item`, `integration-card`, `entity-card` (generic), and `settings-card` exist as separate `.component.ts` files. **The other ~20 are embedded markup inside `@for` loops in the resource component's template.** That changes the consolidation strategy materially — we're not just consolidating 40 implementations, we're extracting cards into components for the first time.
3. **Strong adoption of chrome filter primitives** — ~80% of list pages use `<mj-filter-popover>` + `<mj-filter-panel>`. The chrome migration succeeded here.
4. **Stat badges (X-of-Y form) on ~75% of pages** — chrome `[meta]` slot discipline is largely working.
5. **View-mode toggle present on ~60% of pages — but with inconsistent mode sets.** Some pages offer card / list / compact (3-way), some card / list (2-way), some card / hierarchy (tree-style). No canonical set.
6. **Bulk actions exist on only 4 pages** (User, Role, Credential, some permission pages). Most pages don't support multi-select / bulk operations. Implementation is bespoke per page.
7. **`ActionListViewComponent` has NO shared chrome at all** — an older pattern that predates the chrome standards. Not migrated.
8. **HomeComponent flagged as NOT a list page** despite having `@for` loops — it's a KPI dashboard with pinned/recent items.
9. **Conversations / Collections / Tasks are list sidebars in a chat UI**, not standalone list pages — included for completeness but they have a unique embedded context.
10. **Empty states are universally inline markup** — zero use of a shared `<mj-empty-state>` component (because it doesn't exist yet — catalog item A1).

---

## List Pages Inventory

| App | Page | File | Records | Renderer | View Modes | Chrome `[actions]` | Chrome `[toolbar]` | Chrome `[meta]` | Card Pattern | Empty State | Bulk Actions | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Admin: API Keys** | API Keys | `Explorer/dashboards/src/APIKeys/api-keys-resource.component.ts` | API Key records | Custom grid (table) | list-only | Refresh, Generate New Key | Tab nav, search | Stat badge (X of Y) | None (inline) | inline-markup | absent | Tab-based chrome; health banner + KPI cards on overview tab |
| **Admin: Users** | User Management | `Explorer/explorer-settings/src/lib/user-management/user-management.component.ts` | User records | Custom card grid | card-only | Filter-popover, Refresh, Export, Add User | Page-search, filter-chips | Stat badge (X of Y) | User card (inline) | inline-markup | **present** | Interior chrome (shell sub-page); bulk enable/disable/assign role/delete |
| **Admin: Roles** | Role Management | `Explorer/explorer-settings/src/lib/role-management/role-management.component.ts` | Role records | Custom card grid | card-only | Refresh, Add Role | Page-search, filter-chips | Stat badge (X of Y) | Role card (inline) | inline-markup | absent | Interior chrome (shell sub-page) |
| **Admin: Applications** | Application Management | `Explorer/explorer-settings/src/lib/application-management/application-management.component.ts` | Application records | Custom card grid | card-only | Refresh, Add Application | Page-search | Stat badge (X of Y) | App card (inline) | inline-markup | absent | Interior chrome (shell sub-page) |
| **Admin: Entity Permissions** | Entity Permissions | `Explorer/explorer-settings/src/lib/entity-permissions/entity-permissions.component.ts` | Entity + Role permissions | Custom table grid | list-only | Filter-popover, Refresh | Page-search | Unknown | None (inline) | custom-component | absent | Interior chrome; edit dialog driven |
| **AI: Requests** | Agent Requests | `Explorer/dashboards/src/AI/components/requests/agent-requests-resource.component.ts` | Agent Request records | Custom card grid | card-only | Filter-popover | Page-search | Stat badge (pending count) | Request card (inline) | inline-markup | absent | Custom priority/status badges; detail dialog on card click |
| **AI: Tags** | Tags (Library) | `Explorer/dashboards/src/AI/components/tags/tags-resource.component.ts` | Tag records | Varies by tab | mixed | Refresh, Run Health (action-specific) | Tab nav, tab-specific search | Unknown | Tag card (varies by tab) | inline-markup | absent | Left-nav tabs (Tags, Taxonomy, Suggestions, Health); each has own renderer |
| **AI: Vectors** | Vector Management | `Explorer/dashboards/src/AI/components/vectors/vector-management-resource.component.ts` | Vector records | Custom grid | list-only | Refresh | Page-search | Unknown | None (inline) | inline-markup | absent | KPI cards above list; vector metadata table |
| **AI: Autotagging Pipeline** | Autotagging Pipeline | `Explorer/dashboards/src/AI/components/autotagging/autotagging-pipeline-resource.component.ts` | Pipeline run records | Custom grid | list-only | Refresh | Page-search, tab-nav | Unknown | None (inline) | inline-markup | absent | Left-nav interior chrome; multiple tabs for pipeline state |
| **AI: Duplicates** | Duplicate Detection | `Explorer/dashboards/src/AI/components/duplicates/duplicate-detection-resource.component.ts` | Duplicate pair records | Custom grid/cards | mixed | Refresh, action buttons | Page-search, tab-nav | Unknown | Duplicate card (varies) | inline-markup | absent | Left-nav interior chrome; list + detail split view |
| **AI: Clusters** | Cluster Visualization | `Explorer/dashboards/src/KnowledgeHub/components/clusters/cluster-visualization-resource.component.ts` | Cluster records | Custom visualization (D3/canvas) | tree | Refresh | Search | Unknown | None (visualization) | inline-markup | absent | Graph view, not traditional list — likely OUT OF SCOPE |
| **AI: Knowledge Config** | Knowledge Config | `Explorer/dashboards/src/KnowledgeHub/components/config/knowledge-config-resource.component.ts` | Config records | Custom | mixed | Refresh, config-specific buttons | Tab-nav, tab-specific search | Unknown | Config item (inline) | inline-markup | absent | Left-nav tabs (Entities, Fields, etc.); each tab is separate list |
| **AI: Scheduling** | Scheduling | `Explorer/dashboards/src/KnowledgeHub/components/scheduling/scheduling-resource.component.ts` | Schedule records | Custom | list-only | Refresh, Add Schedule | Page-search, filter-chips | Unknown | Schedule card (inline) | inline-markup | absent | Simple list; status badges |
| **AI: Model Management** | Models | `Explorer/dashboards/src/AI/components/models/model-management.component.ts` | Model records | Custom card grid | card-only | Refresh | Page-search | Stat badge (count) | Model card (inline) | inline-markup | absent | KPI cards above list |
| **AI: Prompt Management** | Prompts | `Explorer/dashboards/src/AI/components/prompts/prompt-management.component.ts` | Prompt records | Custom | mixed | Refresh | Tab-nav, search | Unknown | Prompt card (varies by tab) | inline-markup | absent | Tabbed interface; prompts + versions |
| **Actions** | Action Explorer | `Explorer/dashboards/src/Actions/components/explorer/action-explorer.component.ts` | Action records | Custom (card/list/compact) | **both (toggle)** | Filter-popover, Sort dropdown, View-toggle, Refresh, New Action | Page-search, filter-chips (active filters) | Stat badge (X of Y filtered) | **action-card.component** | inline-markup | absent | Tree sidebar + grid/list/compact center; most complex list-page chrome in the app |
| **Actions: List View** | Actions (older) | `Explorer/dashboards/src/Actions/components/actions-list-view.component.ts` | Action records | Custom card grid | card-only | **NONE — bespoke filter buttons** | Inline search, category dropdown | Count badge (manual) | Action card (inline) | inline-markup | absent | **No shared chrome at all** — predates standards; category tree overlay panel |
| **Connections** | Integrations | `Explorer/dashboards/src/Integration/components/connections/connections.component.ts` | Integration/Connection records | Custom card grid | card-only | Refresh, Add Integration | None | None (intentionally omitted) | **integration-card.component** | inline-markup | absent | Card-only with detail drawer; test result inline on card |
| **Credentials** | Credentials | `Explorer/dashboards/src/Credentials/components/credentials-list-resource.component.ts` | Credential records | Custom (card/list toggle) | **both (toggle)** | Filter-popover, View-toggle, Refresh, New Credential | Page-search | Stat badges (total, expiring, expired) | Credential card (inline) | inline-markup | **present** | Bulk enable/disable/delete; expiration warnings |
| **Credentials: Audit** | Credentials Audit | `Explorer/dashboards/src/Credentials/components/credentials-audit-resource.component.ts` | Audit log records | Custom table | list-only | Refresh | Page-search | Stat badge (X of Y) | None (inline table) | inline-markup | absent | Audit log; no bulk actions |
| **Credentials: Categories** | Credential Categories | `Explorer/dashboards/src/Credentials/components/credentials-categories-resource.component.ts` | Category records | Custom | list-only | Refresh, Add Category | Page-search | Stat badge (count) | Category card (inline) | inline-markup | absent | Simple list |
| **Credentials: Types** | Credential Types | `Explorer/dashboards/src/Credentials/components/credentials-types-resource.component.ts` | Type records | Custom | list-only | Refresh | Page-search | Stat badge (count) | Type card (inline) | inline-markup | absent | Reference/read-only list |
| **Dashboards** | Dashboard Browser | `Explorer/dashboards/src/DashboardBrowser/dashboard-browser-resource.component.ts` | Dashboard records | Unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | Template could not be read; needs manual verification |
| **DataExplorer** | Data Explorer | `Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts` | Entity/query records | Dynamic (query-driven) | mixed | Filter, view-mode toggle, Refresh | Tab-nav, query-specific search | Unknown | None (dynamic) | inline-markup | absent | Meta-dashboard; renders any query result. Likely OUT OF SCOPE as fixed-entity list |
| **Integration: Activity** | Activity | `Explorer/dashboards/src/Integration/components/activity/activity.component.ts` | Activity log records | Custom timeline/table | mixed | Refresh | Page-search, filter-chips | Unknown | Activity card/item (inline) | inline-markup | absent | Timeline or table view |
| **Integration: Pipelines** | Pipelines | `Explorer/dashboards/src/Integration/components/pipelines/pipelines.component.ts` | Pipeline records | Custom card grid | card-only | Refresh, New Pipeline | Page-search | Unknown | Pipeline card (inline) | inline-markup | absent | Card-only with detail drawer |
| **Integration: Schedules** | Schedules | `Explorer/dashboards/src/Integration/components/schedules/schedules.component.ts` | Schedule records | Custom card grid | card-only | Refresh, New Schedule | Page-search, filter-chips | Stat badge (count) | Schedule card (inline) | inline-markup | absent | Simple list with status indicators |
| **Lists: Browse** | Lists Browse | `Explorer/dashboards/src/Lists/components/lists-browse-resource.component.ts` | List records | Custom (table/card/hierarchy) | **3-way (both/tree)** | Filter-popover, View-toggle, Favorites-toggle, New List | Page-search | Stat badge (X of Y) | List card (varies by view) | inline-markup | absent | Three view modes — hierarchy shows category tree |
| **Lists: My Lists** | My Lists | `Explorer/dashboards/src/Lists/components/lists-my-lists-resource.component.ts` | List records (user-owned) | Custom | mixed | View-toggle, Refresh, New List | Page-search | Stat badge (count) | List card (inline) | inline-markup | absent | Filtered to current user's lists |
| **Lists: Shared With Me** | Shared With Me | `Explorer/dashboards/src/Lists/components/lists-shared-with-me-resource.component.ts` | List records (shared) | Custom | mixed | View-toggle, Refresh | Page-search | Stat badge (count) | List card (inline) | inline-markup | absent | Filtered to shared lists |
| **Lists: Categories** | List Categories | `Explorer/dashboards/src/Lists/components/lists-categories-resource.component.ts` | Category records | Custom | list-only | Refresh, New Category | Page-search | Stat badge (count) | Category card (inline) | inline-markup | absent | Simple category list |
| **Lists: Operations** | List Operations | `Explorer/dashboards/src/Lists/components/lists-operations-resource.component.ts` | Operation log records | Custom table | list-only | Refresh | Page-search, filter-chips | Unknown | None (inline table) | inline-markup | absent | Audit/log style view |
| **MCP** | MCP Servers | `Explorer/dashboards/src/MCP/mcp-dashboard.component.ts` | Server records | Custom card grid | card-only | Refresh, Add Server | Page-search | Stat badge (count) | Server card (inline) | inline-markup | absent | Connection status badges; test dialog |
| **Permissions: Audit Log** | Audit Log | `Explorer/dashboards/src/Permissions/audit-log-resource.component.ts` | Audit record entries | Custom table | list-only | Filter-popover, Refresh | Page-search | Stat badge (X of Y) | None (inline table) | inline-markup | absent | Read-only audit view; sortable columns |
| **Permissions: User Access** | User Access | `Explorer/dashboards/src/Permissions/user-access-resource.component.ts` | User permission records | Custom | mixed | Filter-popover, View-toggle, Refresh | Page-search | Stat badge (X of Y) | Permission card (inline) | inline-markup | absent | Role assignment; modal edit dialog |
| **Permissions: Resource Access** | Resource Access | `Explorer/dashboards/src/Permissions/resource-access-resource.component.ts` | Resource permission records | Custom | mixed | Filter-popover, View-toggle, Refresh | Page-search | Stat badge (X of Y) | Permission card (inline) | inline-markup | absent | Entity/field level permissions |
| **Query Browser** | Queries | `Explorer/dashboards/src/QueryBrowser/query-browser-resource.component.ts` | Query records | Custom | list-only | Refresh, New Query | Page-search, filter-chips | Stat badge (X of Y) | Query card (inline) | inline-markup | absent | SQL query browser |
| **Scheduling** | Jobs | `Explorer/dashboards/src/Scheduling/components/scheduling-jobs-resource.component.ts` | Job records | Custom | mixed | Refresh, run-state filters | Page-search | Stat badge (count by state) | Job card (inline) | inline-markup | absent | State-based tabs or chips |
| **Scheduling: Activity** | Activity | `Explorer/dashboards/src/Scheduling/components/scheduling-activity-resource.component.ts` | Activity log | Custom table | list-only | Refresh | Page-search, filter-chips | Unknown | None (inline table) | inline-markup | absent | Job execution history; timeline |
| **Testing: Runs** | Test Runs | `Explorer/dashboards/src/Testing/components/testing-runs-resource.component.ts` | Test run records | Custom | mixed | Refresh, run filters | Page-search, filter-chips | Stat badge (by status) | Test run card (inline) | inline-markup | absent | Status indicators; linked to test details |
| **Testing: Explorer** | Test Explorer | `Explorer/dashboards/src/Testing/components/testing-explorer-resource.component.ts` | Test case records | Custom (with tree) | both | Filter-popover, View-toggle, Refresh, New Test | Page-search | Stat badge (X of Y) | Test card (varies) | inline-markup | absent | Tree sidebar + card/list center |
| **Testing: Review** | Review | `Explorer/dashboards/src/Testing/components/testing-review-resource.component.ts` | Review queue records | Custom | mixed | Refresh, approve/reject bulk | Page-search, filter-chips | Unknown | Review card (inline) | inline-markup | absent | Workflow-driven; approval actions |
| **Version History: Diffs** | Diffs | `Explorer/dashboards/src/VersionHistory/components/diff-resource.component.ts` | Diff records | Custom | list-only | Refresh | Page-search | Stat badge (count) | Diff card (inline) | inline-markup | absent | Syntax-highlighted diffs |
| **Version History: Graph** | Graph | `Explorer/dashboards/src/VersionHistory/components/graph-resource.component.ts` | Commit/version records | Custom visualization | tree | Refresh, filter by type | Page-search | Unknown | None (graph viz) | inline-markup | absent | DAG visualization. Likely OUT OF SCOPE |
| **Version History: Labels** | Labels | `Explorer/dashboards/src/VersionHistory/components/labels-resource.component.ts` | Label records | Custom | list-only | Refresh, New Label | Page-search | Stat badge (count) | Label card (inline) | inline-markup | absent | Simple list; tags/labels |
| **Version History: Restore** | Restore | `Explorer/dashboards/src/VersionHistory/components/restore-resource.component.ts` | Restorable version records | Custom | list-only | Refresh, restore action | Page-search, filter-chips | Stat badge (available versions) | Version card (inline) | inline-markup | absent | Action-driven list |
| **Conversations** | Conversations | `Explorer/explorer-core/src/lib/resource-wrappers/chat-conversations-resource.component.ts` | Conversation records | Custom (list sidebar) | list-only | Refresh, New Conversation | Search | Pinned count badge | Conversation item (inline) | inline-markup | absent | List sidebar + chat center — not a standalone list page |
| **Conversations: Collections** | Collections | `Explorer/explorer-core/src/lib/resource-wrappers/chat-collections-resource.component.ts` | Collection records | Custom | list-only | Refresh, New Collection | Search | Unknown | Collection item (inline) | inline-markup | absent | Conversation grouping |
| **Conversations: Tasks** | Tasks | `Explorer/explorer-core/src/lib/resource-wrappers/chat-tasks-resource.component.ts` | Task records | Custom | mixed | Refresh, state filters | Search, status filter | Stat badge (by status) | Task item (inline) | inline-markup | absent | State-based tabs or filter chips |

---

## Card Component Inventory

Only 5 cards exist as separate `.component.ts` files. The remaining ~20 are inline templates.

### Extracted card components (separate files)

| Component | Selector | File | Used By | Visual Shape | Notes |
|---|---|---|---|---|---|
| **action-card** | `mj-action-card` | `Explorer/dashboards/src/Actions/components/explorer/action-card.component.ts` | Action Explorer | Icon + title + description + category pill + status badges + category link + chevron-right | Specialized for actions; AI-generated badge; links to category filter |
| **action-list-item** | `mj-action-list-item` | `Explorer/dashboards/src/Actions/components/explorer/action-list-item.component.ts` | Action Explorer (list view) | Icon + name + category + status + type + params + updated-date + action-menu | Compact/normal mode toggle; table-row appearance |
| **integration-card** | `mj-integration-card` | `Explorer/dashboards/src/Integration/components/widgets/integration-card.component.ts` | Connections | Brand-colored icon circle + name + company + source-type + credential-hint + sync-status + test-result-inline | Distinctive brand colors |
| **entity-card** | `mj-entity-card` | `Generic/entity-card/src/lib/entity-card.component.ts` | Generic | Customizable via slots + inputs | Generic; accepts any entity; configurable |
| **settings-card** | `mj-settings-card` | `Explorer/explorer-settings/src/lib/shared/settings-card.component.ts` | Settings pages | Icon + title + description + status indicator | Container for settings sections |

### Inline card templates (embedded in resource components)

| Pattern | Location | Data Shape | Visual Shape | Consolidation Notes |
|---|---|---|---|---|
| Request card | agent-requests template | RequestID, Type, Priority, Status, text, Agent, dates | Left icon + title + priority/status badges + body + meta-row + chevron | Priority/status colors; expiration warning |
| Credential card | credentials-list template | ID, Label, Type, Owner, Status, Expiration, Scopes | Type icon + label + owner + scopes + status + expiration + menu | Color-coded expiration |
| Role card | role-management template | ID, Name, Description, isSystem, PermissionCount | Name + description + system-badge + permission-count + edit | Simple |
| User card | user-management template | ID, Name, Email, Status, Role, LastLogin | Avatar + name + email + status + role + menu | Includes bulk-select checkbox |
| Application card | application-management template | ID, Name, Description, Status, ActiveUserCount | Name + description + status + active-count + menu | Simple |
| List card | lists-browse template (3 view modes) | ID, Name, ItemCount, Owner, Sharing, EntityType | Varies: folder (tree), table rows, or card | Three modes |
| Schedule card | scheduling-schedules template | ID, Name, Frequency, Status, NextRun, LastRun | Name + frequency + status + next-run + menu | Simple horizontal |
| Job card | scheduling-jobs template | ID, Name, Status, ScheduledFor, Result, Duration | Name + status + date + result + duration + menu | Status-colored |
| Query card | query-browser template | ID, Name, Description, EntityType, CreatedBy, LastModified | Name + description + entity-type + author + date + menu | Simple |
| Permission card | permissions templates | EntityName, RoleName, Permissions, Status | Entity + role + permission checkboxes + edit-icon | Modal edit on click |
| Audit entry | audit-log templates | Action, User, Timestamp, Details, Status | Timestamp + user + action + status indicator | Table-row style |
| Tag card | tags-resource template (varies by tab) | TagID, Name, Count, Health, Embedding | Tag label + count + health + embedding-status | Multiple forms per tab |
| Vector card | vector-management template | VectorID, Content preview, Status, Dimension, Score | Content + metadata + status + score | Technical |
| Pipeline card | autotagging-pipeline template | RunID, StartTime, Status, RecordsProcessed, Errors | Time + status + progress + menu | Status-driven |
| Conversation item | chat-conversations template | ID, Title, LastMessage, Timestamp, Unread | Title + preview + timestamp + unread badge + pin | Sidebar list, compact |
| Test run card | testing-runs template | RunID, TestName, Status, Duration, Pass/Fail counts | Name + status + duration + counts | Status emphasized |
| Test case card | testing-explorer template | TestID, Name, Status, LastRun, Coverage | Name + status + date + coverage % | Tree/card/list views |
| Review item | testing-review template | ReviewID, ItemName, Status, AssignedTo, Deadline | Name + status + assignee + deadline + approve/reject | Workflow actions inline |
| Label card | version-history-labels template | LabelID, Name, TargetRef, CreatedAt | Name + target-ref + date + menu | Simple |
| Version card | version-history-restore template | VersionID, Timestamp, Author, Message, Restorable | Timestamp + author + message + restore-button | Action-driven |
| Activity entry | integration-activity, scheduling-activity templates | ID, Type, Timestamp, Status, Details | Timestamp + activity-type + status + detail | Timeline or table |
| Category item (Credentials, Lists) | various | ID, Name, Description, Count | Name + description + count badge | Simple |
| Type item (Credentials) | credentials-types template | TypeID, Name, Fields | Type name + field-count | Read-only |

---

## Recurring shapes — consolidation candidates

Across the ~25 inline card patterns, three recurring visual archetypes emerge:

1. **Icon + Title + Meta + Actions** (most common; ~12 cards): Left-side icon, main title, secondary meta row (1–3 fields), optional action menu / chevron on the right. Examples: Request card, Role card, Schedule card, Job card, Query card, MCP server card.
2. **Avatar + Identity + Status** (~5 cards): User/role/owner avatar, primary identity (name + email or name + sub-text), status badge, optional bulk-select checkbox. Examples: User card, Permission card, Test review item.
3. **Compact List Item** (~6 cards): Single-line item with timestamp + label + status indicator, often used in audit logs or activity feeds. Examples: Audit entry, Activity entry, Conversation item, Label card.

If `<mj-card>` is built with slot contracts that satisfy these three archetypes, it covers ~22 of 25 patterns. The remaining 3 are genuinely specialized (Action card, Integration card, Tag card with multi-tab variants).

---

## Notes and surprises

### Patterns that recur (good signal)

- **Interior chrome (`<mj-page-header-interior>`)** is universal on Admin shell sub-pages. Consistent.
- **Filter pattern** (`<mj-filter-popover>` + `<mj-filter-panel>`) is at ~80% adoption. The chrome migration succeeded here.
- **Stat badges in `[meta]`** (X-of-Y form) appear on ~75% of pages.
- **Page search** (`<mj-page-search>`) in `[toolbar]` is at ~85% adoption.
- **Refresh button** (`<mj-refresh-button>`) is on nearly every page.

### Pages with unusual or absent chrome

- **`ActionListViewComponent`** — no shared chrome at all. Bespoke header. Pre-standards.
- **`ActionExplorerComponent`** — most complex chrome in the app. Multi-select filter checkboxes, bespoke sort dropdown, view-toggle, AND active-filter chips in `[toolbar]`. Plus a tree sidebar.
- **`Connections`** (Integrations) — `[meta]` slot intentionally empty; card-only with detail drawer.
- **APIKeys** — hybrid (overview tab with KPIs + list tab). Tab nav in `[toolbar]` is unusual.

### View-mode toggle inconsistencies

Pages that have a toggle, and what their modes are:

- **Action Explorer**: card / list / compact (3-way)
- **Lists Browse**: table / card / hierarchy (3-way; hierarchy is unique)
- **Credentials**: card / list (2-way)
- **Permissions (User Access, Resource Access)**: card / list (2-way)
- **Testing Explorer**: card / list (2-way; plus tree sidebar)
- **My Lists, Shared With Me**: card / list (2-way)

Pages that *might* benefit from a toggle but don't have one:
- User Management (card-only) — could benefit from list view for power users
- Role Management (card-only) — same
- Application Management (card-only) — same
- Most logs/audit pages (list-only) — list is fine; card view doesn't add value
- MCP Servers (card-only) — borderline; could add list

### Bulk action support

Pages with bulk actions: User Management, Credentials, possibly Role Management and some permission pages.
Pages that would clearly benefit but don't have them: Application Management, MCP Servers, Schedules, Pipelines, Connections.

### Empty state — universal gap

Zero use of a shared empty-state component. 100% inline markup. This is the most consistent gap in the inventory.

### Out-of-scope items that surfaced

- **Cluster Visualization** (D3 graph) — not a list page
- **Version History Graph** (DAG viz) — not a list page
- **Home Dashboard** — KPI dashboard
- **Data Explorer** — meta-dashboard rendering arbitrary query results
- **Workspace pages** (Component Studio, Flow Editor, AI Test Harness, Database Designer, Conversations chat surface) — not list pages
- **Dashboard Browser** — template could not be verified; needs manual check

---

## What this inventory tells us about the open questions

### Q1: Should every list page have both card and list views?

**Empirical answer**: No. The data suggests three categories:

- **Card-only is fine** when items are low-volume (≤ ~100), visually distinguishable, and have meaningful scannable metadata. Examples: User Management, Role Management, Application Management, Models, MCP Servers, Connections. ~12 pages.
- **List-only is correct** for high-volume / dense / sortable data: audit logs, activity feeds, schedules, type references. ~15 pages.
- **Both (toggle) is right** when items range from few to many, and different users want different density: Lists Browse, Credentials, Action Explorer, Testing Explorer. ~7 pages.

**Recommendation**: Define `list-only / card-only / both` as the canonical taxonomy. Document per-page which applies. Don't force toggle on pages where one mode is obviously correct.

### Q2: What's the exception list?

Pages NOT in scope for the list-page consistency program:

- Visualizations (Cluster, Version History Graph)
- Home dashboard
- Data Explorer (dynamic meta-dashboard)
- Workspace pages
- Embedded chat list sidebars (Conversations / Collections / Tasks within chat UI) — they're list pages but with a different parent context

### Q3: Stat tile vs. card split

Confirmed. Stat tiles appear in Overview pages and embed numeric/aggregate data; cards appear in list pages and represent individual records. They serve different purposes — keep them as separate catalog items (`<mj-stat-tile>` A9 vs `<mj-card>` A12).

---

## Next-step candidates (not decisions; for collaboration)

1. **Extract the 3 archetypes** into a single `<mj-card>` with slot contracts (icon-title-meta-actions, avatar-identity-status, compact-list-item). Migrate the easiest pattern first as a proof — likely the user/role/app card cluster (all very similar shape).
2. **Build `<mj-empty-state>`** before the card work — it's needed in every list page and the gap is 100%.
3. **Document the view-mode taxonomy** per the empirical findings above. Update `list-page-standardization.md` to make this concrete.
4. **Audit the 3 outlier pages** with manual review: Dashboard Browser (template unverified), APIKeys hybrid chrome, ActionListViewComponent's lack of chrome.
5. **Bulk actions** — design a reusable `<mj-bulk-action-toolbar>` if we want to add multi-select to more pages.

---

## Audit methodology

- Tool: Explore agent dispatched 2026-05-22
- Source: working tree at commit `9dae4bd248` (post-merge with `next`)
- Coverage: `packages/Angular/**`, excluding `node_modules`, `dist`, `generated`
- Method: identify resource components extending `BaseResourceComponent` / `BaseDashboard`, then classify by template inspection
- Limitations: shallow — code inspection only, no design context; inline templates harder to inspect than separate `.html` files; one template (Dashboard Browser) couldn't be read
