# `<mj-empty-state>` Migration — Convention & Rollout Log

Objective **O4** of [ui-consistency-objectives.md](ui-consistency-objectives.md): replace ~213 inline
empty-state patterns across ~101 files with the canonical
`<mj-empty-state>` (in `@memberjunction/ng-ui-components`). This doc is the
convention every section migration follows, plus the running progress log.

## The component

`packages/Angular/Generic/ui-components/src/lib/empty-state/empty-state.component.ts`

| Input | Type | Notes |
|-------|------|-------|
| `Icon` | `string \| null` | FA class; `null` → variant default; `""` → no icon |
| `Title` | `string` | bold heading (use for single-line empties too) |
| `Message` | `string` | supporting text |
| `ActionText` | `string` | renders the built-in primary CTA when set |
| `ActionIcon` | `string` | FA icon inside the CTA |
| `ActionVariant` | `'primary'\|'secondary'\|'outline'\|'flat'` | default `primary` |
| `Variant` | `'empty'\|'no-results'\|'success'\|'warning'\|'error'` | drives default icon + icon tone |
| `Size` | `'compact'\|'default'\|'large'` | padding + icon size |
| `Action` (output) | `EventEmitter<MouseEvent>` | CTA click |

Slots: default `<ng-content>` (rich body — feature lists, dynamic text), and
`[actions]` (multi/bespoke CTAs; self-collapses via `:empty`).

Variant default icons: `empty`→inbox, `no-results`→magnifying-glass,
`success`→circle-check, `warning`/`error`→triangle-exclamation.

## Migration rules

1. **Pick the variant by intent**, not by icon: filtered/searched-to-nothing →
   `no-results`; disabled/misconfigured feature → `warning`; load/op failure →
   `error`; otherwise `empty` (default).
2. **Size**: in-panel / small-widget empties → `compact`; onboarding
   "create your first X" → `large`; everything else → `default`.
3. **Single-line empties** (`icon + span`) → `Title` only, `Size="compact"`.
4. **Icon + heading + paragraph** → `Title` + `Message`.
5. **Normalize non-standard FA icons** to FA6 canonical while migrating:
   `fa-shield-alt`→`fa-shield-halved`, `fa-refresh`/`fa-sync`→`fa-arrows-rotate`,
   `fa-check-circle`→`fa-circle-check`, `fa-search`→`fa-magnifying-glass`
   (or just use the `no-results` default).
6. **Dynamic messages** (search term echoed, filter-dependent copy): compute in a
   component getter (e.g. `EmptyStateTitle` / `NoResultsMessage`) and bind
   `[Title]`/`[Message]` — don't cram conditionals into the template.
6b. **Flex-parent gotcha** — `<mj-empty-state>`'s host centers its *content* but
   does NOT grow to fill the parent. In a **block** parent it's full-width
   (centers fine). In a **flex-row** parent it shrinks to content width and
   sits flush-left; in a flex-fill panel it won't fill vertically either. If the
   old `.empty-state` had `flex: 1` or `width/height: 100%` (i.e. it was a
   full-area placeholder), re-add that on the `mj-empty-state` element in the
   consumer's CSS (e.g. `.canvas mj-empty-state { flex: 1; }`). Caught on
   ComponentStudio's dashboard canvas + editors + preview.
7. **Delete the displaced bespoke CSS** (`.empty-state*`, `.empty-icon`,
   `.no-selection`, `.btn-create-large`, `.btn-clear`, etc.). Keep only CSS that
   styles **projected** content (see onboarding below). Leave **shared**
   stylesheets that other unmigrated components still consume.
8. **Wire the module**: add `MJEmptyStateComponent` to the declaring NgModule's
   `imports` (these components are mostly `standalone: false`). Standalone
   components add it to their own `imports` array.

## Reset-filters convention (list pages)

Any list page with search and/or panel filters gets a **gated reset CTA** on its
`no-results` empty state — shown only when the list is actually narrowed:

```html
<mj-empty-state
  [Variant]="IsListNarrowed ? 'no-results' : 'empty'"
  Icon="fa-solid fa-..."
  Title="No X found"
  Message="..."
  [ActionText]="IsListNarrowed ? 'Reset filters' : ''"
  ActionIcon="fa-solid fa-rotate-left"
  (Action)="resetAllFiltersAndSearch()" />
```

Add to the component:

```typescript
/** True when search and/or panel filters narrow the list. */
public get IsListNarrowed(): boolean {
  return this.filters$.value.search !== '' || this.TotalActiveFilterCount > 0;
}

/** Reset search + all panel filters and refresh immediately. */
public resetAllFiltersAndSearch(): void {
  this.filters$.next({ /* defaults incl. search: '' */ });
  this.applyFilters();
  this.cdr.markForCheck();
}
```

- **Canonical label is "Reset filters" with `fa-rotate-left`** — matches the
  shared `mj-filter-panel`'s built-in reset button (which these same pages render
  in their filter popover). Do NOT use "Clear filters" / "Clear All Filters" —
  that contradicts the popover's wording on the same page. (Search-only empties
  with no filter panel may use "Clear search" since they reset a search box, not
  filters.)
- Show the reset CTA **only when narrowed** (no button on a genuinely-empty list).
- Clear **search AND filters** — the filter-panel's own `clearAllAppliedFilters()`
  deliberately preserves search, so a separate `resetAllFiltersAndSearch()` is
  needed for the empty-state CTA.
- **Deferral**: pages whose filter is a **parent-owned `@Input`** (e.g.
  `api-key-list`) do NOT get a local reset — it would desync the parent's filter
  UI. Preserve existing behavior and revisit with parent/child coordination.

## Onboarding empties (feature checklist)

"Create Your First X" empties with a feature checklist: migrate to
`<mj-empty-state Size="large">` with the built-in CTA, and **project the
checklist into the default content slot** (drop the decorative brand-circle —
the flat icon matches every other empty + the no-gradients design direction).

Keep the projected checklist's CSS (it styles content rendered inside the host).
Standardize its spacing with MJ tokens:

```css
.empty-state-features {
  display: flex;
  flex-direction: column;
  gap: var(--mj-space-2);                          /* 8px */
  margin: var(--mj-space-5) 0 var(--mj-space-2);   /* 20px above · 8px below */
  text-align: left;
}
```

## Testing each section (Playwright + state injection)

Empty-states have several conditions and the running env rarely has the right
data for all of them. **Default to forcing state via Angular's debug API** — no
DB mutation, no cleanup, deterministic. The MJExplorer dev build exposes
`window.ng`, so from `playwright-cli run-code` you can grab any resource
component and re-render it in any state.

Reusable helper (paste once per page via `run-code`):

```js
window.__forceState = (sel, patch) => {
  const c = window.ng.getComponent(document.querySelector(sel));
  Object.assign(c, patch);
  window.ng.applyChanges(c);
  return Object.keys(patch);
};
```

Resource components have stable selectors (`mj-<kebab-class-name>`, e.g.
`mj-lists-browse-resource`). The property names to patch are the same ones you
read while migrating the component's template. Examples (Lists/Browse):

```js
// onboarding (genuinely empty)
__forceState('mj-lists-browse-resource', { allLists:[], filteredLists:[], isLoading:false })
// no-results (filtered to nothing → reset CTA)
__forceState('mj-lists-browse-resource', { allLists:[{}], filteredLists:[], isLoading:false, searchTerm:'zzz' })
```

Reload the page to clear the injected state. **Error** states: use
`playwright-cli route` to fail the relevant GraphQL/REST call (don't blanket-mock
the GraphQL endpoint — it serves metadata too). Occasionally do a **real-data**
pass when you specifically want to validate the live data-binding path.

### States to verify per section

For each migrated empty-state, confirm in **both light and dark mode**:

- [ ] **Populated** — the normal (non-empty) render still works (didn't break layout)
- [ ] **Empty / onboarding** — icon (flat, no leftover circle), title, message, CTA fires
- [ ] **No-results** — `no-results` variant tone; reset/clear CTA shows only when narrowed and fires
- [ ] **Error** (if the component has one) — `error`/`warning` variant tone + retry CTA
- [ ] Projected content (feature checklists) spacing correct; design tokens adapt to dark

## Progress log

| Section | Files | Instances | Status | Commit |
|---------|-------|-----------|--------|--------|
| explorer-settings (pilot) | 9 | 14 | ✅ | `c637bfd304` |
| dashboards/APIKeys | 6 | 11 | ✅ | `7d25fe43ba` |
| dashboards/Lists | 5 | 9 | ✅ | `5c2746acc6` |
| dashboards/AI | 11 | 13 | ✅ | `ff116e0acc` |
| dashboards/ComponentStudio | 11 | 16 | ✅ | `e23fb54dfe` |
| dashboards/Credentials | 6 | 9 | ✅ | `789b2359c3` |
| dashboards/Actions | 5 | 7 | ✅ | `65183c5cfd` |
| dashboards/Integration | 5 | 5 | ✅ | `d602f3721f` |
| dashboards/Communication | 4 | 7 | ✅ | `28f78fa80b` |
| dashboards/VersionHistory | 4 | 8 | ✅ | (this commit) |
| dashboards/Testing | 6 | 17 | ✅ | `8549bc37ab` |
| dashboards/Scheduling | 3 | 5 | ✅ | (this commit) |
| dashboards/Permissions | 3 | 6 | ✅ | (this commit) |
| dashboards/KnowledgeHub | 4 | 9 | ✅ | (this commit) |
| dashboards/DataExplorer | 1 | 2 | ✅ | (this commit) |
| dashboards/QueryBrowser | 1 | 3 | ✅ | (this commit) |
| dashboards/MCP | 1 | 4 | ✅ | (this commit) |
| dashboards/SystemDiagnostics | 1 | 8 | ✅ | (this commit) |
| dashboards/Home | 1 | 2 | ✅ | (prior commit) |
| dashboards/AI-autotagging (stragglers) | 8 | 23 | ✅ | (this commit) |
| dashboards/DevTools event-monitor | 1 | 3→1 | ✅ | (this commit) |
| Explorer/core-entity-forms (24 files) | 24 | 85 | ✅ (build-verified)¹ | (this commit) |
| Generic/conversations | ~12 | — | | |
| Generic/{dashboard-viewer,artifacts,entity-viewer,...} | misc | — | | |
| Explorer/explorer-core | ~5 | — | | |

## Follow-ups

- **¹ core-entity-forms screenshots**: migration is build-verified (package
  compiles all 85 `<mj-empty-state>` instances, 15 tests pass, 0 residual inline
  markup, 0 icon-less). Per the agreed "representative + build-verify" scope, live
  screenshots were not captured — form empty-states sit behind collapsed
  `mj-accordion-panel`s and record-dependent collections (an opened saved Query
  didn't even render the params panel in the DOM), making state-injection
  impractical. They render via the identical canonical component already captured
  across 200+ dashboard states. Revisit with real fixture records if needed.
- **`.error-container`** blocks (entity-permissions, settings) are a distinct
  class that maps onto the `error` variant — fold them in during their sections.
- **`api-key-list`** reset-filters (parent-owned `Filter` @Input) — see deferral
  above.
- **FINAL CLEANUP (do last, once ALL sections migrated)**: delete the shared
  `.empty-state` / `.empty-icon` / `.empty-text` / `.empty-subtext` definitions in
  explorer-settings' `shared/styles/_admin-patterns.css`, `_md3-shared.css`, and
  `shared-settings.css`. These are app-wide fallbacks still feeding unmigrated
  sections, so they can only go once nothing renders `.empty-state` markup
  anywhere. (explorer-settings itself already has zero `.empty-state` markup.)
  Also drop the pre-existing dead `.no-data` rule in
  `AI/components/charts/performance-heatmap.component.ts` (no matching markup).
