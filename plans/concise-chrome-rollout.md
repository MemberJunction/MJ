# Concise-Chrome Rollout — by section

Migrating every filter-bearing MJ Explorer page to the **concise-chrome filter model**. Organized by
Explorer section so we can land it one section at a time. See
**[explorer-chrome-conventions.md §3](explorer-chrome-conventions.md)** for the full pattern.

## ✅ Definition of done (per page) — ALL of these
1. **Control bar `search · Filter · view` lives in `[toolbar]`** — the `<mj-filter-popover>` "Filters"
   button AND the `<mj-view-toggle>` sit **next to `<mj-page-search>`**, NOT in `[actions]`.
2. `[actions]` holds **only** the primary CTA(s) (+ Refresh / Export).
3. **All** filters live inside the one Filter popover's `<mj-filter-panel>` — no inline
   `<mj-filter-chip>` quick-filters (single-select → `type:'chips'`; multi-select → `+ multi:true`;
   dropdown → `type:'dropdown'`).
4. **No** applied-filter chip row.
5. Mobile (bottom sheet, icon-only Filter, drawer, etc.) — free from the shared primitives.

> ⚠️ **A page that already has one `<mj-filter-popover>` is NOT done** if that popover (or the
> view-toggle) is still in `[actions]`. Moving the control bar into `[toolbar]` next to search is the
> bulk of the remaining work — it applies to nearly every page below, on top of any chip-folding.

Status key: **DONE** · **MOVE** (one popover already, but Filter/view still in `[actions]` → move to the
toolbar control bar) · **FOLD+MOVE** (also has inline chips to fold into the popover) · **ADD** (no
popover yet → add one) · **VERIFY** (filter shape unconfirmed) · **SKIP** (no real filters).

---

## Identity & Access  (explorer-settings, in the Admin shell) — ✅ DONE
- [x] Entity Permissions · Users · Roles · Applications
- [ ] App Roles — SKIP (edit panel) · API Keys — SKIP (tab-nav)

## Lists — ✅ DONE
- [x] `dashboards/src/Lists/components/lists-browse-resource.component.ts`

## Testing
- [x] **Test Explorer** `dashboards/src/Testing/components/testing-explorer.component.ts` — DONE
- [ ] Testing Overview / Runs / Analytics / Review — SKIP/VERIFY (tab-nav parent; sub-tabs may have their own filters — confirm per tab)

## AI  (`dashboards/src/AI/components/…`) — NOT done (all need the control-bar move)
- [ ] `analytics/ai-analytics-resource.component.ts` + `analytics/analytics-filter-bar.component.ts` — MOVE (shared `FilterBarConfig`; Filter currently in actions)
- [ ] `prompts/prompt-management.component.*` — MOVE (popover + view-toggle in actions)
- [ ] `models/model-management.component.*` — MOVE
- [ ] `system/system-configuration.component.*` — MOVE
- [ ] `requests/agent-requests-resource.component.*` — MOVE
- [ ] `agents/agent-configuration.component.*` — MOVE
- [ ] `autotagging/tabs/history-tab.component.*` — MOVE
- [ ] `tags/tags-resource.component.*` — FOLD+MOVE (inline chips + left-nav)
- [ ] `vectors/*`, `duplicates/*` — VERIFY (confirm whether they have filter chrome)

## Actions  (`dashboards/src/Actions/components/…`)
- [ ] `actions-overview.component.*` — MOVE
- [ ] `execution-monitoring.component.*` — MOVE
- [ ] `explorer/action-explorer.component.*` — FOLD+MOVE (bespoke checkbox popover + sort dropdown — needs care)

## Scheduling  (`dashboards/src/Scheduling/…`)
- [ ] `components/scheduling-jobs.component.*` — MOVE
- [ ] `components/scheduling-activity.component.*` — FOLD+MOVE (time-range chips)
- [ ] `scheduling-dashboard.component.*` — tabbed parent; delegates to jobs/activity (handle with the two above)

## Integration  (`dashboards/src/Integration/components/…`)
- [ ] `activity/activity.component.*` — FOLD+MOVE (status/date chips + popover)
- [ ] `pipelines/pipelines.component.*` — ADD/VERIFY (search-only today)
- [ ] `schedules`, `connections`, `overview` — VERIFY (confirm filter chrome)

## Credentials  (`dashboards/src/Credentials/components/…`)
- [ ] `credentials-list-resource.component.*` — MOVE
- [ ] `credentials-types-resource.component.*` — MOVE/VERIFY
- [ ] `credentials-audit-resource.component.*` — MOVE/VERIFY

## Version History  (`dashboards/src/VersionHistory/components/…`)
- [ ] `labels-resource.component.*` — MOVE
- [ ] `restore-resource.component.*` — ADD (status quick-chips, no popover yet)

## MCP
- [ ] `dashboards/src/MCP/mcp-dashboard.component.*` — MOVE (popover + view-toggle + search; tools tab)

## Knowledge Hub  (`dashboards/src/KnowledgeHub/components/…`) — VERIFY (left-nav drawer done; per-section filter chrome to confirm)
- [ ] `config/knowledge-config-resource.component.*`
- [ ] `analytics/analytics-resource.component.*`
- [ ] `tags`, `classify` sections

## Permissions  (`dashboards/src/Permissions/…`)
- [ ] `audit-log-resource.component.*` — FOLD/decide (bespoke select+date query form — may not fit the model)
- [ ] `user-access`, `resource-access` — SKIP (select/lookup, no filters)

## SKIP — no real filters
Home · Admin shell containers · ApplicationRoles · APIKeys · Data Explorer (bespoke smart-filter UX) ·
Communication / Archiving / Component Studio / Database Designer / Dev Tools / SystemDiagnostics
(action-only or tab-nav; confirm if any list view sneaks a filter in).

---

**Bespoke filter UIs needing care before converting:** Action Explorer (checkbox-group popover content +
custom sort dropdown — may need `mj-filter-panel` to grow a checkbox-group / date-range field type),
Audit Log (query-builder form), Data Explorer (smart-filter — likely stays an exception).

**Note:** most "MOVE" pages put `<mj-filter-popover>` + `<mj-view-toggle>` in `[actions]` per the old
convention. The migration relocates both into `[toolbar]` after `<mj-page-search>`; the CTA stays in
`[actions]`. Verify each page's current slot placement when you pick it up.
