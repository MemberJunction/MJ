# Form section counts and hide-when-empty

**Status:** agreed, implementing
**Packages:** `@memberjunction/core`, `@memberjunction/generic-database-provider`, `@memberjunction/ng-base-forms`
**Migration:** none in this PR (the L3 admin columns are a follow-up, see §9)
**Related:** [Form chrome layering](form-chrome-layering.md) · [Form contributions](form-contributions.md) · [Forms Architecture Guide §7c/§7d](../guides/FORMS_ARCHITECTURE_GUIDE.md)

## 1. The problem

Hub forms (Person, Organization, Company…) grow a related section for every
OpenApp that points a `DisplayInForm` relationship at them. L1 inclusions and
the More folder help, but the user still cannot tell which sections hold data
without opening each one, and every empty section costs rail space.

Today:

- A related grid loads only when its section is expanded **and** scrolled into
  view. Its row count exists only after that load (`AfterDataLoad` →
  `SetSectionRowCount`). A collapsed or unselected section shows no badge.
- Nothing hides an empty related section. `hasRenderableContent()` is hard-coded
  `true` for `Variant === 'related-entity'`.
- The toolbar's tag / attachment / version badges are three separate `RunView`s
  that pull full rows and count them with `.length`.
- `RunViews` is one HTTP request, but the database provider runs each view as a
  separate pool query (`Promise.all(params.map(InternalRunView))`).

## 2. Decisions

| # | Decision |
|---|---|
| D1 | **Counts are prefetched by default.** Every saved-record form open fetches the count for every related section, plus the toolbar badges, in **one** `RunViews` call. A relationship (or entity, or contribution) can opt out with `showCount: false`. |
| D2 | **Empty behaviour is metadata, default `'show'`.** `whenEmpty: 'show' \| 'hide' \| 'more'`. `'show'` is the default because an empty grid is often exactly where a user creates the first row. |
| D3 | **`'more'` demotes, it doesn't remove.** An empty `'more'` section is moved into the More folder — one click away, still able to create the first row. Once it has rows it returns to its normal placement. *(Confirm with AM; trivial to drop.)* |
| D4 | **Edit mode does not reveal hidden sections.** The existing "show empty fields" toolbar toggle is the L4 escape hatch: when on, every hidden-because-empty section comes back. |
| D5 | **The More folder shows the sum of its children's counts** when collapsed; expanded children show their own counts. |
| D6 | **Freshness = grid loads.** Counts update when a grid loads, including a manual refresh — the grid's load event bubbles to the form badge and re-resolves chrome (a section that goes 0 → n reappears). No cross-record BaseEntity-event recount in v1. |
| D7 | **Unsaved records are skipped entirely.** |
| D8 | **Fail open.** If the count call fails, or a single count fails (e.g. no CanRead), that section is treated as non-empty and shown with no badge. The form never blocks on counts. |
| D9 | **Sticky visibility.** A section the user currently has open is never hidden by a count update (deleting its last row does not yank it away). |
| D10 | **The single round trip lives in `RunViews`, not a new Remote Operation.** Every security gate `RunView` applies (CanRead, RLS + API-key row filters, saved-view WhereClause, PreRunView tenant hooks, field-security predicate gate, materialized-view swap) is reused unchanged, and every caller that batches counts benefits. |
| D11 | **Rollout:** MJ core infrastructure first (this PR), then `bizapps-common` tailors Person / Organization, then the rest of the stack. |

## 3. Metadata

Everything is JSONType configuration that already exists (no migration). By
runtime it is in the database like any other metadata.

### L1 — per relationship: `EntityRelationship.Configuration.UI`

`metadata/entities/JSONType-interfaces/IEntityRelationshipConfiguration.ts`

```ts
export interface IEntityRelationshipUIConfiguration {
    inclusion?: 'Primary' | 'More' | 'None';
    FormRole?: 'Primary' | 'Detail';
    join?: { mode: 'any'; fields: string[] };
    sortKey?: number;
    /** Behaviour when the section has 0 rows. Omit = inherit (entity default, else 'show'). */
    whenEmpty?: 'show' | 'hide' | 'more';
    /** Prefetch the row count and show the badge. Omit = inherit (entity default, else true). */
    showCount?: boolean;
}
```

### L2 — per parent entity default: `Entity.Configuration.UI.Form`

`metadata/entities/JSONType-interfaces/IEntityConfiguration.ts`

```ts
export interface IEntityFormConfiguration {
    // ...existing Layout, AutoLeftNavAt, RelatedRolePolicy, PrimaryRelatedBudget
    /** Default whenEmpty for this form's related sections. Omit = 'show'. */
    RelatedWhenEmpty?: 'show' | 'hide' | 'more';
    /** Default showCount for this form's related sections. Omit = true. */
    ShowRelatedCounts?: boolean;
}
```

### Contributions — runtime registration metadata

`FormPanelRegistrationMetadata` (`base-forms/src/lib/panel-slot/base-form-panel.ts`):

```ts
whenEmpty?: 'show' | 'hide' | 'more';
showCount?: boolean;
/**
 * What to count for this contribution. Omit = derived from relatedEntity /
 * relatedJoinField when present. A contribution with neither can still report
 * its own count after it mounts via FormComponent.SetSectionRowCount().
 */
count?: { entity: string; joinFields?: string[] } | false;
```

### Precedence

Later wins: **contribution / relationship (L1) → entity default (L2) → built-in
default** for resolving the value, then **L4 "show empty fields" = on** overrides
any `'hide'` / `'more'` back to `'show'`. (L3 admin overrides are §9.)

Readers live beside `ReadRelationshipInclusion` in
`packages/MJCore/src/generic/entityConfiguration.ts`:
`ReadRelationshipWhenEmpty(rel, entity)` and `ReadRelationshipShowCount(rel, entity)`.

## 4. Server — all-`count_only` `RunViews` batch in one statement

`GenericDatabaseProvider.InternalRunViews`:

1. **Refactor, no behaviour change.** Extract the per-view preparation in
   `InternalRunView` (entity lookup, CanRead check, PreRunView hooks, WHERE
   assembly incl. RLS / saved view / ExtraFilter / field-security gate,
   effective base view) into a reusable method that returns a *prepared view*
   (`{ entityInfo, fromClause, whereClause }` or a per-view failure).
   `InternalRunView` uses it unchanged.
2. **Fast path.** When every item in the batch is `ResultType: 'count_only'`
   and there are ≥ 2 items, prepare each view, then run **one** statement:

   ```sql
   SELECT 0 AS "BatchIndex", COUNT(*) AS "TotalRowCount" FROM <view A> WHERE <where A>
   UNION ALL
   SELECT 1, COUNT(*) FROM <view B> WHERE <where B>
   ```

   Identifiers go through `QuoteIdentifier` / `QuoteSchemaAndView` (dialect
   neutral; PG case folding). Each branch is an indexed seek (CodeGen creates
   FK indexes; many-to-many uses the existing `IN (SELECT … FROM JoinView)`).
3. **Per-item failures.** A view that fails preparation (no CanRead, bad
   filter) is left out of the statement and gets its own failed
   `RunViewResult`; the rest of the batch succeeds. If the combined statement
   itself throws, fall back to the per-view path so one bad filter can't blank
   every badge.
4. **Mixed batches** (any non-`count_only` item) keep today's per-view path.
5. Post-run hooks / audit / logging that `InternalRunView` performs for
   `count_only` still run per item.

Result shape is unchanged: `RowCount = TotalRowCount = count`, `Results = []`.
Counts stay cache-ineligible (existing rule).

## 5. Client — the form count coordinator

A new `FormSectionCountLoader` (pure, framework-agnostic module in
`ng-base-forms`, unit-testable) plus container wiring.

**Build requests** on `RecordReady` for a saved record:

- **Related sections** — the baked related panels (mapped back to their
  `EntityRelationshipInfo` through the CodeGen section-key rule), the stock
  grids, and relationship-claiming contributions. Filter via the existing
  `BuildRelationshipViewParamsByEntityName(relatedEntity, joinField)` so the
  count uses exactly the filter the grid uses (1:M, M2M, `join.any`,
  `DisplayUserViewID`). Skipped when resolved `showCount === false` **and**
  `whenEmpty === 'show'`.
- **Contributions with a `count` spec.**
- **System counts** — `MJ: Tagged Items`, `MJ: File Entity Record Links` (only
  when `AttachmentsAvailable`), and the record-change versions. These replace
  `loadTagCount` / `loadAttachmentCount` / `loadVersionCount`.

All of it goes out as **one** `RunViews` with `ResultType: 'count_only'`, fired
without awaiting, in parallel with form render.

**Apply results:**

- toolbar badges set;
- `SetSectionRowCount(key, n)` per section → accordion + rail badges (only
  displayed when resolved `showCount` is true);
- `scheduleChromeResolve()` once, with the empty-section set.

**Chrome.** `ResolveFormChromeInput` gains `EmptySectionBehavior:
Map<sectionKey, 'hide' | 'more'>` (only sections known to be empty with a
non-`'show'` behaviour). The resolver adds `'hide'` keys to the hidden set and
moves `'more'` keys into More — membership is decided in the resolver (data),
never in `BaseFormPolicy.DecorateChrome`. Before counts arrive, `'hide'`
sections are held out of the rail (no show-then-yank); `'show'` / `'more'`
render immediately.

**Freshness (D6).** Any later `SetSectionRowCount` (grid load, manual refresh,
self-reporting contribution) that crosses the 0 boundary re-schedules chrome
resolution. The sticky rule (D9) exempts the active / expanded section.

**More folder badge (D5).** `ChromeGroupRowCount` summed over More's children.

**Gap fix.** `RelatedEntityGridPanelComponent` binds `[BadgeCount]` so fill-in
grids show their count in the accordion header, not just the rail.

**Skips:** unsaved records, composite-key parents (relationship joins assume a
single-column key), and forms rendered in `SectionName` (single section) mode.

## 6. Performance

- One HTTP request, one SQL statement per saved-record form open, regardless of
  how many related sections the form has.
- The three toolbar badge queries drop from full-row loads to counts and join
  the same statement.
- Counts are never cached (`count_only` is cache-ineligible by design), so each
  form open costs one statement. Opt out per relationship with
  `showCount: false` for known-expensive related entities.

## 7. Tests

- `GenericDatabaseProvider`: all-`count_only` batch → one `ExecuteSQL`, correct
  index mapping; a failed-preparation item gets its own failure; mixed batches
  unchanged; statement failure falls back to per-view.
- `entityConfiguration` readers: precedence L1 → L2 → default.
- `FormSectionCountLoader`: request building (baked / stock / claimed /
  `count` spec / system counts, opt-outs, unsaved skip), result application.
- `ResolveFormChrome`: `'hide'` hides, `'more'` moves to More, show-empty-fields
  overrides, active section sticky.

## 8. Rollout

1. **MJ core (this PR):** §3 metadata, §4 server, §5 client, guide + PANELS.md.
2. **bizapps-common:** tailor Person / Organization (and other hubs) with
   `whenEmpty` on the relationships Common owns, and contribution metadata on
   Common's panels.
3. **Up the stack:** Tasks, Orders, Accounting, Sales, Contracts, ATS, Caliber,
   Forms each tag the relationships they point at the hubs.

## 9. Follow-ups (out of scope for this PR)

- **L3 admin override:** nullable `WhenEmpty` and `ShowCount` columns on
  `MJ: Form Chrome Rules` (migration + CodeGen), so a site can override per
  (parent, related entity) or (parent, contribution).
- **Cross-record freshness:** recount when a related entity is saved elsewhere
  (BaseEntity events, debounced).
- **SQL Server `ExecuteSQLBatch`** as an alternative to `UNION ALL` if a
  branch-level plan issue ever shows up.
