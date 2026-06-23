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
| `Variant` | `'empty'\|'no-results'\|'warning'\|'error'` | drives default icon + icon tone |
| `Size` | `'compact'\|'default'\|'large'` | padding + icon size |
| `Action` (output) | `EventEmitter<MouseEvent>` | CTA click |

Slots: default `<ng-content>` (rich body — feature lists, dynamic text), and
`[actions]` (multi/bespoke CTAs; self-collapses via `:empty`).

Variant default icons: `empty`→inbox, `no-results`→magnifying-glass,
`warning`/`error`→triangle-exclamation.

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

## Progress log

| Section | Files | Instances | Status | Commit |
|---------|-------|-----------|--------|--------|
| explorer-settings (pilot) | 9 | 14 | ✅ | `c637bfd304` |
| dashboards/APIKeys | 6 | 11 | ✅ | `7d25fe43ba` |
| dashboards/Lists | 5 | 9 | ✅ | (this commit) |
| dashboards/AI | 11 | — | ⏳ next | |
| dashboards/ComponentStudio | 9 | — | | |
| dashboards/Credentials | 5 | — | | |
| dashboards/Actions | 5 | — | | |
| dashboards/{VersionHistory,Testing,Integration,Communication} | 4 each | — | | |
| dashboards/{Scheduling,Permissions} | 3 each | — | | |
| dashboards/{KnowledgeHub,DataExplorer} | 2 each | — | | |
| dashboards/{SystemDiagnostics,QueryBrowser,MCP,Home} | 1 each | — | | |
| Explorer/core-entity-forms | ~22 | — | | |
| Generic/conversations | ~12 | — | | |
| Generic/{dashboard-viewer,artifacts,entity-viewer,...} | misc | — | | |
| Explorer/explorer-core | ~5 | — | | |

## Follow-ups

- **`.error-container`** blocks (entity-permissions, settings) are a distinct
  class that maps onto the `error` variant — fold them in during their sections.
- **`api-key-list`** reset-filters (parent-owned `Filter` @Input) — see deferral
  above.
