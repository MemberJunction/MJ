# Concise-Chrome Rollout — page swap checklist

Tracks migrating every filter-bearing MJ Explorer page to the **concise-chrome filter model**:
**one `<mj-filter-popover>` "Filters" button** (with an active-count badge) holding all filters,
**persistent search**, and the filter popover docking as a **bottom sheet on mobile**. There is
**no inline quick-filter chip group and no applied-filter chip row** — the badge + the panel carry
filter state. See **[explorer-chrome-conventions.md §3](explorer-chrome-conventions.md)** for the pattern.

**Per-page recipe (summary):**
1. Fold any inline `<mj-filter-chip>` quick-filters into ONE
   `<mj-filter-popover Label="Filters" Icon="fa-solid fa-filter">` + `<mj-filter-panel [Fields]>`
   in the `[toolbar]` control bar (`search · Filter · view`). Single-select set → `type:'chips'`;
   multi-select set → `type:'chips'` + `multi:true`; dropdown → `type:'dropdown'`.
2. Keep search in `[toolbar]`; keep the one primary CTA in `[actions]`. On interior pages wrap
   action-button labels in `<span class="mj-action-label">` so they go icon-only on mobile.
3. `ActiveFilterCount` (or `TotalActiveFilterCount`) getter drives the popover badge; the popover's
   `(ClearAllRequested)` resets all filters. **No** `AppliedFilters` getter, **no** `mj-applied-filters`.
4. Mobile (bottom sheet, icon-only Filter, drawer, etc.) is free from the shared primitives.

Legend: **DONE** · **COMPLIANT** (already one popover + search — only inherits the mobile sheet, no
structural change; optionally move the view-toggle into the toolbar) · **CONVERT** (has inline chips
to fold into the popover) · **VERIFY** (filter shape unconfirmed) · **SKIP** (no real filters).

---

## ✅ DONE (6)
- [x] `dashboards/src/Testing/components/testing-explorer.component.ts`
- [x] `dashboards/src/Lists/components/lists-browse-resource.component.ts`
- [x] `explorer-settings/src/lib/entity-permissions/entity-permissions.component.*`
- [x] `explorer-settings/src/lib/user-management/user-management.component.*`
- [x] `explorer-settings/src/lib/role-management/role-management.component.*`
- [x] `explorer-settings/src/lib/application-management/application-management.component.*`

## CONVERT — fold inline quick-filter chips into the one Filter popover
- [ ] `dashboards/src/Scheduling/components/scheduling-activity.component.*` (time-range chips)
- [ ] `dashboards/src/Scheduling/scheduling-dashboard.component.*` (tabbed parent — delegates to jobs/activity)
- [ ] `dashboards/src/Integration/components/activity/activity.component.*` (status/date chips + popover)
- [ ] `dashboards/src/Actions/components/explorer/action-explorer.component.*` (bespoke checkbox popover + sort dropdown — needs care)
- [ ] `dashboards/src/AI/components/tags/tags-resource.component.*` (VERIFY — inline chips + left-nav)
- [ ] `dashboards/src/VersionHistory/components/restore-resource.component.*` (status quick-chips, no popover → add one)
- [ ] `dashboards/src/Permissions/audit-log-resource.component.*` (bespoke select+date query form — decide if it fits the model)

## COMPLIANT — already one popover + search (free mobile sheet; no structural work)
Just confirm: no stray inline chips, and the view-toggle (if any) sits in the toolbar.
- [ ] `dashboards/src/Actions/components/actions-overview.component.*`
- [ ] `dashboards/src/Actions/components/execution-monitoring.component.*`
- [ ] `dashboards/src/MCP/mcp-dashboard.component.*`
- [ ] `dashboards/src/AI/components/prompts/prompt-management.component.*`
- [ ] `dashboards/src/AI/components/requests/agent-requests-resource.component.*`
- [ ] `dashboards/src/AI/components/agents/agent-configuration.component.*`
- [ ] `dashboards/src/AI/components/models/model-management.component.*`
- [ ] `dashboards/src/AI/components/system/system-configuration.component.*`
- [ ] `dashboards/src/AI/components/autotagging/tabs/history-tab.component.*`
- [ ] `dashboards/src/AI/components/analytics/ai-analytics-resource.component.ts` + `analytics-filter-bar.component.ts` (shared `FilterBarConfig`)
- [ ] `dashboards/src/Credentials/components/credentials-list-resource.component.*`
- [ ] `dashboards/src/Credentials/components/credentials-types-resource.component.*`
- [ ] `dashboards/src/Credentials/components/credentials-audit-resource.component.*`
- [ ] `dashboards/src/Scheduling/components/scheduling-jobs.component.*`
- [ ] `dashboards/src/VersionHistory/components/labels-resource.component.*`

## VERIFY — Knowledge Hub left-nav shells (drawer done; filter shape to confirm)
- [ ] `dashboards/src/KnowledgeHub/components/config/knowledge-config-resource.component.*`
- [ ] `dashboards/src/KnowledgeHub/components/analytics/analytics-resource.component.*`
- [ ] `dashboards/src/KnowledgeHub/components/{tags,classify}/*` (per-section filter chrome)
- [ ] `dashboards/src/Integration/components/{pipelines,schedules,connections,overview}/*` (confirm whether they filter)

## SKIP — no real filters
- `dashboards/src/Home/home-dashboard.*` · `Testing/testing-dashboard.*` (tab-nav parent) · `Admin/admin-*container*.*` (shell)
- `dashboards/src/ApplicationRoles/application-roles-resource.*` (edit panel) · `APIKeys/api-keys-resource.*` (tab-nav)
- `dashboards/src/DataExplorer/data-explorer-dashboard.*` (bespoke smart-filter UX) · `Permissions/{user-access,resource-access}-resource.*`

---

**Bespoke filter UIs needing care before converting:** Action Explorer (checkbox-group popover content + custom sort dropdown — may need `mj-filter-panel` to grow a checkbox-group/date-range field type), Audit Log (query-builder form), Data Explorer (smart-filter — likely stays an exception).
