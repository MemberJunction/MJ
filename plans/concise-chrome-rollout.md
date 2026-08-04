# Concise-Chrome Rollout — by section

Migrating every filter-bearing MJ Explorer page to the **concise-chrome filter model**. See
**[explorer-chrome-conventions.md §3](explorer-chrome-conventions.md)** for the pattern.

## ✅ Definition of done (per page)
1. **Control bar `search · Filter · view` lives in `[toolbar]`** — the `<mj-filter-popover>` "Filters"
   button AND the `<mj-view-toggle>` sit next to `<mj-page-search>`, NOT in `[actions]`.
2. `[actions]` holds **only** the primary CTA(s) (+ Refresh / Export). Action-button text wrapped in
   `<span class="action-btn-label">` (exterior) / `mj-action-label` (interior) so it goes icon-only on mobile.
3. **All categorical filters** live inside the one Filter popover — no inline `<mj-filter-chip>` quick-filters.
   (Exception: period/time-range *scope* chips may stay visible — see conventions §3.)
4. **No** applied-filter chip row.
5. Mobile (bottom sheet, icon-only Filter, drawer) — free from the shared primitives.

---

## Identity & Access — ✅ DONE
Entity Permissions · Users · Roles · Applications. (App Roles / API Keys = SKIP.)

## Lists — ✅ DONE

## Testing — ✅ DONE (Test Explorer). Overview/Runs/Analytics/Review = tab-nav, no filters.

## AI
- [x] Prompts · Models · Configuration · Agent Requests · Agents · Autotagging → Run History — Filter (+view) moved into the toolbar control bar; CTAs/Refresh kept in actions
- [ ] **Analytics** (`analytics-resource` + `analytics-filter-bar`) — SPECIAL: bespoke shared filter-bar, already one Filter popover (+ time-range scope chips). Its own pattern; leave unless we standardize analytics chrome.
- [ ] **Tags** (`tags-resource`) — SPECIAL: multi-section workspace, bespoke search `<input>` + per-section tab-nav/buttons, no `mj-filter-popover`. Doesn't map to the list-page model.
- Vectors · Duplicates — SKIP (no filter popover; view-only / action-only)

## Actions — ✅ DONE
- [x] Actions Overview · Execution Monitor — already had the control bar in `[toolbar]`
- [x] Action Explorer — search + Filter + view in `[toolbar]`; **Sort folded into the Filters popover** (was a standalone toolbar dropdown). Popover content is still bespoke checkbox groups (Status/Type) — could later migrate to `mj-filter-panel` fields.

## Scheduling — ✅ DONE
- [x] Scheduled Jobs — Filter moved to toolbar
- [x] Scheduling Activity — Filter in toolbar; time-range chips folded INTO the popover (Time range · Status · Job)
- Scheduling parent — tab-nav wrapper; delegates to the two above

## Integration — ✅ DONE (for the one filter page)
- [x] Activity — Filter in toolbar; status + date chips folded INTO the popover (Date range · Status · Integration)
- Pipelines / Schedules / Connections / Overview — SKIP (no filter popover; search-only or action-only)

## Credentials — ✅ DONE
- [x] Credentials List · Types · Audit — Filter (+view) moved to toolbar

## Version History — ✅ DONE
- [x] Labels — Filter + view moved to toolbar
- [x] Restore History — ADDED a Filter popover (folded the 3 status quick-chips)

## MCP — ✅ DONE
- [x] Filter moved into the toolbar (joins tab-nav + search); per-tab action buttons kept in actions

## Communication — ✅ DONE
- [x] Logs — Status chips folded into a Filter popover (next to search)
- [x] Templates — Category chips folded into a Filter popover
- Monitor / Runs / Providers / New Message — no inline chips (SKIP)

## Knowledge Hub — N/A for filters
config / analytics / tags / classify are left-nav section landings with **no** `mj-filter-popover`
(the left-nav drawer + interior-chrome mobile rules already apply). Revisit only if a section grows a filter set.

## Permissions
- [ ] **Audit Log** — SPECIAL: bespoke select + date-range query-builder form (not the standard primitives). Decide whether to model as Filter popover or leave as a query form.
- User Access / Resource Access — SKIP (select/lookup, no filters)

---

## Remaining open items
- **SPECIAL pages** (own patterns; decide individually): AI Analytics filter-bar, AI Tags workspace, Permissions Audit Log.
- **Optional follow-up:** fold Integration Activity's categorical *status* chips into its popover.
- **Action Explorer:** Sort is now inside the Filters popover; its Status/Type content is still bespoke checkbox groups — could later move to declarative `mj-filter-panel` fields.

**Bespoke filter UIs that may need `mj-filter-panel` to grow a field type first** (checkbox-group / date-range):
Action Explorer, Audit Log.
