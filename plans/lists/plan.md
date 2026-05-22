# Lists Feature Enhancement — Implementation Plan

Branch: `an-plan-lists-enhancements` · Mockups: [`mockups/index.html`](mockups/index.html)

> **HOW TO USE THIS PLAN.** This document is the source of truth for the Lists enhancement work. The implementing agent (and human reviewer) **MUST work through the [Punch List](#10-punch-list)** in the order written. Every task has explicit Exit Criteria — do not mark a task complete unless all criteria are met. If a session is interrupted, the next agent picks up at the first non-completed task. Do not skip ahead, do not bundle phases.
>
> Testing is **non-negotiable** and is part of each phase's exit criteria — not a phase at the end. Every phase ships with unit tests, UI/integration suite updates, and (where data volume matters) performance tests against the **AssociationDB demo database** with larger lists and views. A phase is not done until all three pass.

---

## 1. Goals & Non-Goals

**Goals.** Bridge Lists (static materialized sets) and User Views (dynamic filtered queries) without collapsing the distinction; finish the half-built Sharing model; introduce a reusable "audience source" abstraction starting with Communications; surface Tags on Lists; ship high-ROI polish. Establish a clean **four-layer architecture** (core model → resolver → DP helper → thin Angular) with **Actions as a required parallel consumer** so AI Agents and Workflows get identical capability as the UI. Enforce a non-bypassable **drop-row warning contract** across every layer.

**Non-Goals.** Lists do NOT become dynamic. Multi-entity Lists are NOT supported at the data layer (single-entity is intentional). User Views are NOT replaced. Tagging is NOT redesigned. Cross-entity power comes from *composition* (multiple List/View inputs into one target List), not from changing the List entity.

## 2. Architectural Principles

Strict layering. Each layer is a thin pass-through over the one below.

1. **Core object model** — new package `@memberjunction/lists`. Pure TypeScript, framework-agnostic. Owns all business logic: list materialization, set algebra, delta computation, lineage tracking, refresh modes, drop guards. Has zero GraphQL / HTTP / Angular dependencies. Talks to data via `RunView` and `BaseEntity` save patterns (see existing [add-records-to-list.action.ts](../../packages/Actions/CoreActions/src/custom/lists/add-records-to-list.action.ts)).

2. **GraphQL resolver layer** — `@memberjunction/server`. New hand-written `ListOperationsResolver` extending the generated `MJ: Lists` resolver. Pattern follows [UserViewResolver.ts](../../packages/MJServer/src/resolvers/UserViewResolver.ts). Wraps core, enforces auth via `contextUser` and ResourcePermission.

3. **GraphQLDataProvider helper** — `ListsClient` in `@memberjunction/graphql-dataprovider`. Typed client mirroring `@memberjunction/lists` types one-to-one. Single source of truth for type defs lives in `@memberjunction/lists`; both server and client import from it.

4. **Angular UI** — thin. Bind props, render, call `ListsClient`. No SQL. No business logic. No orchestration. Existing [list-sharing.service.ts](../../packages/Angular/Generic/list-management/src/lib/services/list-sharing.service.ts) becomes a thin adapter over `ListsClient`.

5. **Actions (REQUIRED, not optional)** — `@memberjunction/core-actions` (existing). Every public capability in the UI must also be exposed via an Action. Why required:
   - AI Agents need to materialize, refresh, compose, and share lists without scraping the UI.
   - Workflows need list ops as steps (e.g., "after invoice approved, add to Closed Won list").
   - Scheduled jobs need to run nightly refreshes with audit trail.
   - MCP tools need a first-class API for third-party orchestration.

   Actions are *thin* — each delegates to a single `ListOperations` method. **Every action that can produce drops must accept an explicit `ConfirmDrops` input.** See architecture mockup at [`mockups/27-architecture.html`](mockups/27-architecture.html) for the required Action list.

See visual: [`mockups/27-architecture.html`](mockups/27-architecture.html).

## 2.5 Mockups: Visual Intent Only — Implement With MJ Design System

**The mockups in [`mockups/`](mockups/) define the visual intent of every screen and component — layout, hierarchy, copy, states, badges, drop-warning treatment, button placement, etc. The implementing agent MUST match the mockups pixel-for-pixel in terms of *what is rendered and where* — but MUST NOT lift the HTML/CSS verbatim.**

The mockups are static HTML using ad-hoc CSS tokens defined in [`mockups/styles.css`](mockups/styles.css) for the sole purpose of standalone browser review. They are **not** production code, do not match every real MJ component contract, and must be re-implemented properly using the production stack:

- **Design tokens** — every color, radius, shadow, spacing value comes from the canonical MJ tokens in [`packages/Angular/Generic/shared/src/lib/_tokens.scss`](../../packages/Angular/Generic/shared/src/lib/_tokens.scss). **No hardcoded hex values, no copying the mockup's `--mj-*` definitions.** Per CLAUDE.md design-token rules: use *semantic* tokens (`--mj-text-primary`, `--mj-bg-surface-card`, `--mj-brand-primary`, `--mj-status-error-bg`, etc.), never primitives.
- **Angular components** — use the MJ UI components package (`@memberjunction/ng-ui-components`) for buttons (`mjButton`), dialogs (`mj-dialog` / `MJDialogService`), inputs, dropdowns, switches, accordions, etc. **Do not roll plain `<button>` / `<input>` styled with raw CSS** — that's what the mockups did for portability, not what production should do.
- **Splitter / grid / tree** — use `angular-split`, AG Grid, and existing tree components. The mockups draw these by hand for layout; production reuses the real widgets.
- **Form patterns** — follow the patterns in CLAUDE.md (getter/setter `@Input()`, `inject()` over constructor DI for new code, `@if`/`@for` block syntax).
- **Standalone vs NgModule** — follow the pattern of the package each component lives in (per CLAUDE.md Angular section).
- **Loading states** — use `<mj-loading>`, not the spinner divs sketched in the mockups.
- **Icons** — Font Awesome 6 classes as shown in the mockups; identical names.
- **Modal/dialog UX** — Confirm/Submit on LEFT, Cancel on RIGHT (per CLAUDE.md). Mockups follow this convention; production must too.

**Pixel-perfect parity is required for:** layout structure (3-pane ops grid, sidebar + main shell, modal sizes, card grids), every visual state shown (no-drops vs drops, viewer perspective gating, lineage badges, tag chips, audience picker tabs, delta summary tiles), copy and microcopy in dialogs/warnings, the drop-warning red treatment with required acknowledgment checkbox, badge colors and meanings.

**What is NOT pixel-perfect:** the exact pixel values of padding/margins/radius — those come from MJ tokens, which may differ slightly from the mockup's approximations. If a token gives a slightly different result, the token wins.

When in doubt: read the mockup for *intent*, build it with MJ design system + components for *implementation*.

## 3. Naming Conventions (Strictly Enforced)

Per the repo's [CLAUDE.md](../../CLAUDE.md):

- **PascalCase** for all **public** class members — properties, methods, `@Input()`, `@Output()`. Also for class names, interface names, enum names, type aliases.
- **camelCase** for all **private/protected** class members — and for local variables, function parameters.

```ts
export class ListOperations {
    // ✅ Public — PascalCase
    public ComputeDelta(target: ListSource, source: ListSource, mode: ListRefreshMode): Promise<ListDelta> { ... }
    public ApplyDelta(delta: ListDelta, opts: ApplyOptions): Promise<ApplyResult> { ... }

    // ✅ Private — camelCase
    private signDeltaToken(payload: DeltaPayload): string { ... }
    private validateAgainstResourcePermissions(listId: string): void { ... }
}
```

This applies uniformly across `@memberjunction/lists`, `ListOperationsResolver`, `ListsClient`, all Angular components/services, and every new Action. No exceptions. Reviewers must reject PRs that violate.

GraphQL field names follow GraphQL conventions (lowerCamelCase) — a separate world from TypeScript class members.

## 4. The Drop-Row Warning Contract (Hard Requirement)

Every mutating list operation MUST go through `ComputeDelta` first. The returned `ListDelta` includes a server-signed `DeltaToken` (HMAC of `targetListId + source signature + mode + timestamp`).

`ApplyDelta` enforces, in this order:

1. Verify `DeltaToken` signature and expiry (5 min TTL).
2. Re-compute on server. If membership or source has changed since preview, return `STALE_DELTA` — UI re-runs `ComputeDelta` automatically.
3. If `delta.Counts.Remove > 0` and `opts.ConfirmDrops !== true`, reject with `DROP_NOT_CONFIRMED`. **Server-side enforcement** — UI is a convenience, not the source of truth.
4. Check caller has Editor permission on the target list (ResourcePermission).
5. Apply, emit AuditLog entry.

**Operations that CAN drop:** `RefreshFromSource(mode: 'Sync')`, `ComputeSetOp('intersection' | 'difference')` into existing list, "Move records between lists", future replace-contents.

**Operations that CANNOT drop:** `MaterializeFromView` (target is new), `AddViewResultsToList` (additive by definition), `ComputeSetOp('union')` into existing, manual single-record add.

See visuals: [`mockups/08-delta-confirm.html`](mockups/08-delta-confirm.html) (component spec), [`mockups/13-refresh-additive.html`](mockups/13-refresh-additive.html), [`mockups/14-refresh-sync-drops.html`](mockups/14-refresh-sync-drops.html), [`mockups/24-move-records-delta.html`](mockups/24-move-records-delta.html).

## 5. Testing Requirements (Per Phase)

Each phase has three test gates. **All three must pass before that phase is marked done.**

### 5.1 Unit Tests (Vitest)

- Located in `src/__tests__/` per the project's existing convention.
- Run via `npm run test` in the package directory.
- Coverage targets: `@memberjunction/lists` ≥ 85% lines; resolver + DP helper ≥ 75%; Angular components ≥ 60% (focus on logic, not template binding).
- Mock all external dependencies; no DB connections.
- Specific suites required per phase — see [Punch List](#10-punch-list).

### 5.2 UI / Integration Suite

- Playwright CLI tests under `e2e/lists/` (new directory).
- Run locally against the MJ Explorer dev server with the workbench DB.
- Cover every mockup-illustrated flow as a happy path + at least one drop-warning edge case.
- Tests must reset state between runs (use the existing test database reset pattern).
- CI gate: tests run on every PR via GitHub Actions.

### 5.3 Performance Tests (AssociationDB Demo Database)

The AssociationDB demo dataset is the reference for realistic data volumes. **Every phase that touches list materialization, set-op, or refresh paths MUST include perf tests at the following scales** (run locally + tracked in a `perf-baselines.json` file under `packages/Lists/perf/`):

| Scenario | Source Size | Target Size | Acceptable Latency (p95) |
|---|---|---|---|
| Materialize from view | 10k Contacts | new list | < 4 s |
| Materialize from view | 100k Contacts | new list | < 30 s |
| Refresh additive | 50k members, 5k adds | — | < 6 s |
| Refresh sync (with drops) | 50k members, 5k adds, 2k drops | — | < 8 s |
| Compute set-op (union of 3) | 30k + 20k + 10k | preview | < 3 s |
| Compute set-op (intersection of 3) | 30k + 20k + 10k | preview | < 3 s |
| Bulk-move 5k records | between lists | — | < 8 s |
| Excel export | 50k-row list | file | < 30 s |
| `listsSharedWithMe` query | user with 200 shares | — | < 1.5 s |
| Audit log query | 10k events | — | < 2 s |

If a perf test regresses, the SQL-side path (`spComputeListDelta` stored proc) must be implemented — see [§7](#7-cross-cutting-concerns). 100k+ scenarios route to `MJQueue` for async processing; the perf test asserts job-handle return time, not completion.

The implementing agent MUST run these tests AT LEAST ONCE during each phase, save the baseline to `perf-baselines.json`, and fail the phase if any p95 exceeds budget.

## 6. Phases (Overview)

Mockups referenced inline. Full visual index at [`mockups/index.html`](mockups/index.html).

### Phase 0 — Foundation

New package `@memberjunction/lists` housing pure TypeScript core. Public API (PascalCase members):

```ts
export type ListRefreshMode = 'Additive' | 'Sync';
export type ListSource =
  | { kind: 'list'; listId: string }
  | { kind: 'view'; viewId: string; runtimeParams?: Record<string, unknown> }
  | { kind: 'adhoc'; entityName: string; extraFilter: string };

export interface ListDelta {
  TargetListId: string | null;
  EntityName: string;
  ToAdd: string[];
  ToRemove: string[];
  Unchanged: string[];
  Counts: { Add: number; Remove: number; Unchanged: number; SourceTotal: number; TargetTotal: number };
  Warnings: ListDeltaWarning[];
  DeltaToken: string;       // HMAC, 5-min TTL
}

export class ListOperations {
  constructor(contextUser: UserInfo, provider?: IMetadataProvider) { ... }

  // Read / resolve
  public ResolveSource(source: ListSource): Promise<ResolvedRecordSet>;
  public GetListMembers(listId: string): Promise<ResolvedRecordSet>;

  // Preview (never mutates) — returns DeltaToken
  public ComputeDelta(target: ListSource | 'new', source: ListSource, mode: ListRefreshMode): Promise<ListDelta>;
  public ComputeSetOp(op: 'union'|'intersection'|'difference', inputs: ListSource[], target?: ListSource | 'new'): Promise<ListDelta>;

  // Commit (takes Delta from above; refuses if stale or unconfirmed drops)
  public ApplyDelta(delta: ListDelta, opts: { ConfirmDrops: boolean; DeltaToken: string }): Promise<ApplyResult>;

  // High-level convenience
  public MaterializeFromView(viewId: string, opts: MaterializeOptions): Promise<ApplyResult>;
  public AddViewResultsToList(viewId: string, listId: string): Promise<ApplyResult>;
  public RefreshFromSource(listId: string, mode: ListRefreshMode, opts: { ConfirmDrops: boolean }): Promise<ApplyResult>;
}
```

Mockup: [`mockups/08-delta-confirm.html`](mockups/08-delta-confirm.html).

### Phase 1 — Lists ↔ Views Bridge

**Data model** adds to `MJ: Lists`: `SourceViewID`, `SourceFilterSnapshot`, `LastRefreshedAt`, `LastRefreshedByUserID`, `RefreshMode`, `UseSnapshot`. Migration `V20260516xxxx__v5.35.x__List_Lineage_Fields.sql` (consolidated ALTER TABLE, `sp_addextendedproperty` per column, no `__mj` columns).

Mockups: [`mockups/09-save-view-as-list.html`](mockups/09-save-view-as-list.html), [`mockups/10-operations-mixed.html`](mockups/10-operations-mixed.html), [`mockups/11-compose-into-target.html`](mockups/11-compose-into-target.html), [`mockups/12-list-detail-lineage.html`](mockups/12-list-detail-lineage.html), [`mockups/13-refresh-additive.html`](mockups/13-refresh-additive.html), [`mockups/14-refresh-sync-drops.html`](mockups/14-refresh-sync-drops.html).

### Phase 2 — Finish Sharing

Keep `MJListInvitation` (pending-email flow). Deprecate `MJListShare`; ResourcePermission is the source of truth. New `ListAccessLog` entity for audit (verify no general-purpose AuditLog usable first).

Mockups: [`mockups/15-share-dialog.html`](mockups/15-share-dialog.html), [`mockups/16-invitations.html`](mockups/16-invitations.html), [`mockups/17-shared-with-me.html`](mockups/17-shared-with-me.html), [`mockups/18-audit-log.html`](mockups/18-audit-log.html), [`mockups/19-viewer-perspective.html`](mockups/19-viewer-perspective.html).

### Phase 3 — Audience Source Abstraction

`AudienceSource` is the same union as `ListSource` (top-level export from `@memberjunction/lists`). New `<mj-audience-source-picker>` Angular component. `SendToAudience` in `@memberjunction/communication-engine`.

Mockups: [`mockups/20-audience-picker.html`](mockups/20-audience-picker.html), [`mockups/21-communications-audience.html`](mockups/21-communications-audience.html).

### Phase 4 — Tags on Lists UI

Pure UI: reusable `<mj-tag-chips>`, embed on list cards/detail, filter-by-tag in browse toolbar. No data model changes.

Mockup: [`mockups/22-tags-on-lists.html`](mockups/22-tags-on-lists.html).

### Phase 5 — Polish

Excel export (existing TODO at [lists-operations-resource.component.ts:1916](../../packages/Angular/Explorer/dashboards/src/Lists/components/lists-operations-resource.component.ts#L1916)), bulk-edit on single-list view (move/copy/status/remove), favorites/pinning via existing `UserFavorite`, usage stats panel.

Mockups: [`mockups/23-bulk-edit-members.html`](mockups/23-bulk-edit-members.html), [`mockups/24-move-records-delta.html`](mockups/24-move-records-delta.html), [`mockups/25-favorites-stats.html`](mockups/25-favorites-stats.html), [`mockups/26-excel-export.html`](mockups/26-excel-export.html).

## 7. Cross-Cutting Concerns

1. **Delta-Confirm component.** Shared Angular component `<mj-list-delta-confirm>` in `@memberjunction/ng-list-management`. The **only** UI path producing a valid `DeltaToken` for `ApplyDelta`. Required acknowledgment checkbox when `Counts.Remove > 0`. See [`mockups/08-delta-confirm.html`](mockups/08-delta-confirm.html).

2. **Performance / Scale.** In-memory diff acceptable up to ~25k combined source+target. Above that, route to SQL stored proc `spComputeListDelta`. Above 100k: enqueue via `MJQueue`, return a job handle. Threshold logic in `ListOperations.ComputeDelta`. Asserted by perf tests (§5.3).

3. **Permissions / RLS.** Every resolver endpoint checks ResourcePermission. `PreviewListDelta` requires Viewer. `ApplyListDelta` requires Editor. `MaterializeFromView` requires Editor on category (or Create on Lists). View resolution honors existing View access rules.

4. **Telemetry.** Structured events from `ListOperations` for every operation (start/success/failure with counts). Sync-mode refreshes log `RemovedCount` for forensics. Hook existing MJ logging pipeline.

5. **Class registration & manifests.** Every new class with `@RegisterClass` must be picked up by the manifest generator. Run `npm run mj:manifest:server-bootstrap` and `mj:manifest:ng-bootstrap` after adding any decorated class.

6. **CodeGen.** Schema changes in Phase 1 (and possibly Phase 2 for `ListAccessLog`) require running CodeGen after the migration applies. The agent runs `mj codegen` and commits the regenerated files in the same PR as the migration.

7. **Singletons.** Anything in `@memberjunction/lists` needing to be a singleton MUST extend `BaseSingleton<T>`. No manual `static _instance` patterns.

## 8. Decisions Going Into Implementation

These were open questions on the original plan; pre-resolved so the implementing agent isn't blocked. If discovery during implementation invalidates a decision, the agent surfaces it to the human reviewer rather than working around.

1. **MJListShare deprecation:** Keep `MJListInvitation` (pending-email flow). Deprecate `MJListShare`; ResourcePermission is the active source of truth.
2. **Snapshot vs live view:** Both stored. `SourceFilterSnapshot` captured at materialization; `UseSnapshot BIT` controls whether refresh uses snapshot or re-reads the live view. Default `UseSnapshot = false` (live).
3. **Multi-source lineage:** Defer `ListSourceLink` to V2 (P1.5). Single-source lineage only in initial ship.
4. **Bulk async threshold:** 25k synchronous, 100k+ via `MJQueue`.
5. **Audience field mapping:** Ask user per message; remember last choice per-user in localStorage. No new entity in V1.
6. **Audit log:** New `ListAccessLog` entity unless Phase 2 task 2.0 finds a reusable generic `AuditLog`.
7. **`SendToAudience` package home:** Lives in `@memberjunction/communication-engine`. The `AudienceSource` type lives in `@memberjunction/lists`. Communication-engine depends on lists.

## 9. Migration & Rollout Order

Each phase ships as a separate PR off `next`. CodeGen runs after every schema change. Manifests regenerated after every new `@RegisterClass`.

1. Phase 0 — foundation package + delta-confirm component. Internal-only release.
2. Phase 1.A — schema migration + lineage fields + `MaterializeFromView` + `AddViewResultsToList`.
3. Phase 1.B — `RefreshFromSource` + set-op composition + first drop-warning UX in production.
4. Phase 2 — sharing finish (independent of Phase 1, can run in parallel).
5. Phase 3 — audience picker (depends on Phase 0's `ResolveSource`).
6. Phase 4 — tags UI (independent).
7. Phase 5 — polish (independent, ship piecemeal).

---

## 10. Punch List

> **This is the canonical execution order.** The implementing agent MUST work through these tasks in order. Each task lists Exit Criteria — do not mark `[x]` unless all criteria are met. If a session interrupts, the next agent resumes at the first non-`[x]` task. Do not skip ahead. Do not start a Phase N task before all Phase (N-1) tasks are checked.
>
> **Format:** `[ ] N.x — Title` (N = phase number, x = sequence within phase).
>
> **Visual fidelity reminder:** every UI task references a mockup under [`mockups/`](mockups/). The mockups define WHAT to build and how it should LOOK; they do not define HOW to build it. Implementation uses MJ design tokens ([`_tokens.scss`](../../packages/Angular/Generic/shared/src/lib/_tokens.scss)), `@memberjunction/ng-ui-components`, AG Grid, `angular-split`, etc. — see [§2.5](#25-mockups-visual-intent-only--implement-with-mj-design-system). Do not lift HTML/CSS from the mockups verbatim.

### Phase 0 — Foundation

- [ ] **0.1** — Create `packages/Lists/` workspace package
  - Scaffold `package.json` with deps on `@memberjunction/core`, `@memberjunction/core-entities`, `@memberjunction/global`
  - `tsconfig.json`, `vitest.config.ts`, `src/index.ts` exporting public API surface
  - Add to root workspaces; run `npm install` at repo root
  - **Exit:** `cd packages/Lists && npm run build` succeeds with no errors

- [ ] **0.2** — Define core types in `packages/Lists/src/types.ts`
  - `ListSource`, `ListRefreshMode`, `ListDelta`, `ListDeltaWarning`, `ApplyResult`, `MaterializeOptions`, `ResolvedRecordSet`
  - PascalCase on all members; documented with TSDoc
  - **Exit:** types compile, exported from `src/index.ts`

- [ ] **0.3** — Implement `ListOperations.ResolveSource` + `GetListMembers`
  - Uses `RunView` with `EntityName` + `ViewID` paths
  - Reuses composite-key serializer matching `ListDetail.RecordID` format from existing `AddRecordsToListAction`
  - **Exit:** returns `ResolvedRecordSet` for list, view, and ad-hoc sources

- [ ] **0.4** — Implement `ComputeDelta` + `ComputeSetOp` (preview only)
  - In-memory set diff using `Set<string>` for record IDs
  - Generates `DeltaToken` via HMAC (Node `crypto.createHmac`, secret from MJ config)
  - Adds `WILL_REMOVE_RECORDS` warning when `Counts.Remove > 0`
  - **Exit:** deterministic given same inputs

- [ ] **0.5** — Implement `ApplyDelta` with drop guard
  - Validates token signature + 5-min TTL
  - Re-computes server-side; returns `STALE_DELTA` if changed
  - Rejects with `DROP_NOT_CONFIRMED` if `Counts.Remove > 0 && !ConfirmDrops`
  - Calls Editor permission check (placeholder; Phase 2 wires real check)
  - Batch-applies via existing `AddRecordsToList` / `RemoveRecordsFromList` patterns
  - Emits structured log entry per operation
  - **Exit:** integration test against in-memory MJ provider passes

- [ ] **0.6** — Unit test suite for `@memberjunction/lists`
  - Files under `packages/Lists/src/__tests__/`
  - Cover: source resolution; additive + sync delta math; set-op math (union/intersection/difference, 3+ inputs); stale-token detection; drop-guard refusal; entity-mismatch warning; edge cases (empty sources, identical sources, no overlap)
  - Use `@memberjunction/test-utils` for mocks
  - **Exit:** `npm run test` passes; coverage ≥ 85% lines

- [ ] **0.7** — Build `<mj-list-delta-confirm>` Angular component
  - In `@memberjunction/ng-list-management`
  - Standalone component, PascalCase Inputs/Outputs
  - Two visual states (no-drops / drops); matches [`mockups/08-delta-confirm.html`](mockups/08-delta-confirm.html) exactly
  - Drop state: acknowledgment checkbox required before Confirm enables
  - Emits `Confirm` (with `DeltaToken`) or `Cancel`
  - **Exit:** renders correctly in MJ Explorer storybook/sandbox; matches mockup

- [ ] **0.8** — Phase 0 PR against `next`
  - Branch `feat/lists-phase-0-foundation`
  - Title: `feat(lists): Phase 0 — foundation package + delta-confirm component`
  - Body references this plan; lists tests added
  - **Exit:** PR open, CI green, ready for review

### Phase 1 — Lists ↔ Views Bridge

- [ ] **1.0** — Migration: lineage fields on `MJ: Lists`
  - `migrations/v5/V20260516xxxx__v5.35.x__List_Lineage_Fields.sql`
  - Single consolidated ALTER TABLE: `SourceViewID`, `SourceFilterSnapshot`, `LastRefreshedAt`, `LastRefreshedByUserID`, `RefreshMode`, `UseSnapshot`
  - `sp_addextendedproperty` for each new column
  - No `__mj` columns (CodeGen handles)
  - **Exit:** migration applies cleanly; `mj codegen` regenerates entity_subclasses.ts with new fields

- [ ] **1.1** — Implement `MaterializeFromView` in `ListOperations`
  - Creates a new `MJ: List` with lineage fields set
  - Bulk-inserts `ListDetail` rows for view results
  - Captures filter snapshot when `RememberLineage = true`
  - **Exit:** unit test creates list from view; lineage fields populated

- [ ] **1.2** — Implement `AddViewResultsToList`
  - Always additive (no drops possible)
  - Dedupes against existing list members
  - **Exit:** unit test verifies no duplicates; returns `Added` count

- [ ] **1.3** — Implement `RefreshFromSource` (Additive + Sync)
  - Reads list lineage to determine source
  - Resolves source via live view OR snapshot filter based on `UseSnapshot`
  - Calls `ComputeDelta` then `ApplyDelta`
  - Updates `LastRefreshedAt`, `LastRefreshedByUserID`
  - **Exit:** unit tests for both modes; Sync without `ConfirmDrops` returns `DROP_NOT_CONFIRMED`

- [ ] **1.4** — Extend `ComputeSetOp` to mix View + List sources
  - Same `ListSource` discriminated union; resolver handles by kind
  - **Exit:** unit test composing Lists + Views into preview Delta

- [ ] **1.5** — GraphQL resolver `ListOperationsResolver`
  - File: `packages/MJServer/src/resolvers/ListOperationsResolver.ts`
  - Queries: `previewListDelta`, `resolveAudience`
  - Mutations: `applyListDelta`, `materializeListFromView`, `addViewResultsToList`, `refreshListFromSource`, `composeLists`
  - Input types in same file
  - All resolvers accept `@Ctx() context` and pass `contextUser` to core
  - **Exit:** GraphQL schema regenerates; resolver compiles; auth checks call placeholder `ResourcePermissionService`

- [ ] **1.6** — `ListsClient` in `@memberjunction/graphql-dataprovider`
  - Typed methods mirroring resolver one-to-one
  - Returns `ListDelta` / `ApplyResult` types imported from `@memberjunction/lists`
  - **Exit:** client compiles; `PreviewListDelta` from test app hits resolver and returns expected shape

- [ ] **1.7** — Angular: User View toolbar "Save as List" button
  - Add to User View resource UI
  - Opens dialog matching [`mockups/09-save-view-as-list.html`](mockups/09-save-view-as-list.html)
  - Two lineage options + `UseSnapshot` toggle
  - Calls `ListsClient.MaterializeFromView`
  - **Exit:** clicking creates list with correct lineage; navigates to new list detail

- [ ] **1.8** — Angular: Operations panel accepts View operands
  - Extend [lists-operations-resource.component.ts](../../packages/Angular/Explorer/dashboards/src/Lists/components/lists-operations-resource.component.ts) to add "Add View" alongside "Add List"
  - Mixed operand rendering per [`mockups/10-operations-mixed.html`](mockups/10-operations-mixed.html) (dashed stroke = view, solid = list)
  - **Exit:** select 1 list + 2 views, see Venn render, "Create New List" materializes the selected region

- [ ] **1.9** — Angular: List detail "Refresh from source" UI
  - Lineage-aware lists show lineage badge + Refresh button per [`mockups/12-list-detail-lineage.html`](mockups/12-list-detail-lineage.html)
  - Refresh opens delta-confirm preview
  - Mode dropdown defaults to last-used mode for this list
  - **Exit:** Additive refresh works; Sync refresh requires acknowledgment

- [ ] **1.10** — Angular: Compose-into-target multi-source UI
  - New panel within Operations tab per [`mockups/11-compose-into-target.html`](mockups/11-compose-into-target.html)
  - Drag-reorderable sources, op selector, target picker
  - **Exit:** union/intersection/difference all produce correct preview; commit creates/updates target

- [ ] **1.11** — Required Actions for Phase 1
  - `MaterializeListFromViewAction`
  - `AddViewResultsToListAction`
  - `RefreshListFromSourceAction` (accepts `ConfirmDrops` input — defaults false)
  - `ComposeListsAction` (accepts `ConfirmDrops` input)
  - Each wraps a single `ListOperations` method. Each `@RegisterClass`-decorated.
  - **Exit:** actions appear in Action picker; each callable from MJ Explorer Actions UI

- [ ] **1.12** — Unit tests for Phase 1
  - Resolver: success + failure paths per mutation; auth failure path
  - `ListsClient`: type assertions + smoke calls against mock server
  - Each new Action: parameter mapping correct, calls correct core method
  - Angular: critical logic only (delta-confirm host wiring)
  - **Exit:** each package's `npm run test` passes; counts reported in PR description

- [ ] **1.13** — UI/integration suite for Phase 1
  - Playwright in `e2e/lists/phase1/`
  - Flow 1: User View → Save as List → list appears in browse with lineage badge
  - Flow 2: Refresh Additive on lineage list → preview shows +N / 0 removed → confirm → counts update
  - Flow 3: Refresh Sync on lineage list → preview shows drops → confirm checkbox required → confirm → audit log entry visible
  - Flow 4: Operations mixed (list + view + view, intersection) → save as new list
  - **Exit:** all flows pass locally; PR adds to CI workflow

- [ ] **1.14** — Performance tests for Phase 1 (AssociationDB)
  - `packages/Lists/perf/phase1.perf.ts`
  - Run against AssociationDB demo (document setup in `packages/Lists/perf/README.md`)
  - Scenarios per §5.3 table that apply to Phase 1
  - Write baselines to `packages/Lists/perf/perf-baselines.json`
  - **Exit:** every p95 within budget; baselines committed

- [ ] **1.15** — Phase 1 PR
  - Branch `feat/lists-phase-1-views-bridge`
  - **Exit:** PR open with mockups linked, test results in body, CI green

### Phase 2 — Finish Sharing

- [ ] **2.0** — Decide audit log entity
  - Investigate whether a generic `AuditLog` entity already exists and is usable
  - If yes, reuse. If no, scaffold `MJ: List Access Logs` in `V20260524xxxx__v5.36.x__List_Access_Log.sql`
  - Fields: `ListID`, `UserID`, `EventType` (Shared/Unshared/InvitationSent/InvitationAccepted/Refreshed/BulkOperation), `Details NVARCHAR(MAX)`, `EventDate`
  - **Exit:** decision documented in PR body; entity/migration applied if new

- [ ] **2.1** — `ListSharing` service in `@memberjunction/lists`
  - Methods: `Share`, `Unshare`, `Invite`, `AcceptInvitation`, `RevokeInvitation`, `GetSharesForList`, `GetListsSharedWithUser`
  - Writes to ResourcePermission and (for invitations) `MJ: List Invitations`
  - Emits ListAccessLog entries
  - **Exit:** unit tests cover happy paths + token expiry

- [ ] **2.2** — Email notifications on share / invite
  - Hook into NotificationEngine / existing share-handler pattern
  - Register a Lists-specific handler if not already done
  - Template: "X shared list Y with you" + accept link for email invites
  - **Exit:** sharing triggers email in dev; invitation includes valid acceptance URL

- [ ] **2.3** — Resolver sharing mutations/queries
  - `shareList`, `unshareList`, `inviteToList`, `acceptListInvitation`, `revokeListInvitation`
  - `listsSharedWithMe` query
  - **Exit:** GraphQL schema updates; resolvers callable

- [ ] **2.4** — `ListsClient` sharing methods
  - **Exit:** client compiles

- [ ] **2.5** — Angular: enhanced Share dialog
  - Matches [`mockups/15-share-dialog.html`](mockups/15-share-dialog.html)
  - Permission-level dropdown per share; role icon for role shares
  - "Notify by email" toggle (default on)
  - **Exit:** dialog functional; shares persist; emails fire when toggled on

- [ ] **2.6** — Angular: Invitations management UI
  - Matches [`mockups/16-invitations.html`](mockups/16-invitations.html)
  - Pending/Accepted/Expired/Revoked tabs
  - Resend / Revoke actions on pending invites
  - Send-Invitation form
  - **Exit:** send → see pending → simulated accept → see accepted

- [ ] **2.7** — Angular: "Shared With Me" tab in Browse
  - Matches [`mockups/17-shared-with-me.html`](mockups/17-shared-with-me.html)
  - Calls `listsSharedWithMe` query
  - Permission badge per card
  - **Exit:** tab populated; permission badges accurate

- [ ] **2.8** — Angular: Permission-level gating across all List UIs
  - Viewer hides Add/Remove/Refresh/Edit/Share/Delete/Operations
  - Editor hides Delete/Share
  - Per [`mockups/19-viewer-perspective.html`](mockups/19-viewer-perspective.html)
  - Gating reads from `currentUserPermission` resolved by `ListsClient`
  - **Server-side enforcement** remains source of truth
  - **Exit:** as Viewer all mutating buttons absent; as Editor Delete absent; as Owner all visible

- [ ] **2.9** — Angular: Audit Log view per list
  - Matches [`mockups/18-audit-log.html`](mockups/18-audit-log.html)
  - Filter by event type / date range / actor
  - Linked from share dialog ("View audit log")
  - **Exit:** events visible chronologically; filters work

- [ ] **2.10** — Required Actions for Phase 2
  - `ShareListAction`, `InviteToListAction`, `UnshareListAction`, `RevokeListInvitationAction`
  - **Exit:** callable from Action picker

- [ ] **2.11** — Unit tests for Phase 2
  - `ListSharing` service: invite-token expiry, role expansion, permission enforcement at data layer
  - Each new Action
  - **Exit:** all pass

- [ ] **2.12** — UI suite for Phase 2
  - Flow 1: share with user → recipient sees in Shared With Me → audit log shows event
  - Flow 2: invite by email → see pending → accept via token → user appears in shares
  - Flow 3: Viewer cannot Add Records (button absent; direct API call rejected)
  - **Exit:** all pass in CI

- [ ] **2.13** — Performance tests for Phase 2
  - `listsSharedWithMe` for user with 200+ shares: p95 < 1.5s
  - Audit log query for list with 10k events: p95 < 2s
  - **Exit:** baselines in perf-baselines.json

- [ ] **2.14** — Phase 2 PR
  - Branch `feat/lists-phase-2-sharing`
  - **Exit:** CI green

### Phase 3 — Audience Source Abstraction

- [ ] **3.1** — Hoist `AudienceSource` in `@memberjunction/lists`
  - Same shape as `ListSource` + optional `'union'` kind
  - `AudienceResolver` re-exports `ListOperations.ResolveSource` under friendly name
  - **Exit:** types compile; existing usage continues to work

- [ ] **3.2** — Angular: `<mj-audience-source-picker>` component
  - New package `@memberjunction/ng-audience-source`
  - Matches [`mockups/20-audience-picker.html`](mockups/20-audience-picker.html)
  - Three tabs (List / View / Ad-hoc Filter)
  - Emits typed `AudienceSource`; companion `<mj-audience-source-summary>`
  - **Exit:** picker renders; emits correct typed values; summary updates live

- [ ] **3.3** — Communications: `SendToAudience` in `@memberjunction/communication-engine`
  - Takes `AudienceSource` + `MessageTemplate` + `FieldMapping`
  - Resolves audience via `AudienceResolver`
  - Skips records missing the mapped field with a warning
  - Existing `MessageRecipient[]` API still works
  - **Exit:** function callable

- [ ] **3.4** — Angular: Communications New Message using audience picker
  - Matches [`mockups/21-communications-audience.html`](mockups/21-communications-audience.html)
  - Field-mapping dropdown defaults to entity's email field; user can override
  - Audience Summary panel shows total / will receive / missing / unsubscribed counts
  - **Exit:** end-to-end send to a List audience works in dev

- [ ] **3.5** — Required Action: `ResolveAudienceAction`
  - Read-only; returns resolved record set
  - **Exit:** callable

- [ ] **3.6** — Unit tests for Phase 3
  - Resolution per kind; field-mapping skip behavior
  - **Exit:** pass

- [ ] **3.7** — UI suite for Phase 3
  - Pick List → send → recipient gets email
  - Pick View → send → recipient set matches current view result
  - Pick ad-hoc filter → send
  - **Exit:** all pass

- [ ] **3.8** — Performance: audience resolution 10k / 50k / 100k
  - p95 < 5s for 50k; >50k routes async
  - **Exit:** baselines committed

- [ ] **3.9** — Phase 3 PR
  - Branch `feat/lists-phase-3-audience`
  - **Exit:** CI green

### Phase 4 — Tags on Lists UI

- [ ] **4.1** — `<mj-tag-chips>` reusable component
  - In `@memberjunction/ng-shared` if a generic version doesn't already exist
  - Input `(entityName, recordId)` — queries MJ: Tagged Items
  - Render chips + inline add/remove
  - **Exit:** works on any entity

- [ ] **4.2** — Embed on List cards + detail view
  - Cards per [`mockups/22-tags-on-lists.html`](mockups/22-tags-on-lists.html)
  - Detail view gets a Tags section
  - **Exit:** tags visible and editable on all List surfaces

- [ ] **4.3** — Filter-by-tag chip row in Browse toolbar
  - Click tag → narrows list to those with that tag
  - Multi-tag = intersection (AND)
  - **Exit:** filter functional; URL state preserves filter

- [ ] **4.4** — Unit + UI tests
  - Component renders; add/remove tags; filter narrows results
  - **Exit:** pass

- [ ] **4.5** — Phase 4 PR
  - **Exit:** CI green

### Phase 5 — Polish

- [ ] **5.1** — Excel export (existing TODO + extension)
  - Replace TODO at [lists-operations-resource.component.ts:1916](../../packages/Angular/Explorer/dashboards/src/Lists/components/lists-operations-resource.component.ts#L1916)
  - Add Export to single-list detail
  - Column-picker dialog per [`mockups/26-excel-export.html`](mockups/26-excel-export.html)
  - Use `MJExportEngine`
  - **Exit:** 1k row list exports correctly; column choice respected

- [ ] **5.2** — Bulk-edit toolbar on single-list view
  - Multi-select triggers floating toolbar per [`mockups/23-bulk-edit-members.html`](mockups/23-bulk-edit-members.html)
  - Operations: Move, Copy, Set Status, Remove
  - Move + Remove route through `<mj-list-delta-confirm>` per [`mockups/24-move-records-delta.html`](mockups/24-move-records-delta.html)
  - **Exit:** all four bulk ops work; drop-warning shown on Move

- [ ] **5.3** — Favorites / pinning
  - Reuse existing `UserFavorite` entity
  - Star icon on list cards
  - Favorites tab in Browse per [`mockups/25-favorites-stats.html`](mockups/25-favorites-stats.html)
  - **Exit:** star/unstar persists; tab shows favorites

- [ ] **5.4** — Usage stats panel on list detail
  - Right-side panel per [`mockups/25-favorites-stats.html`](mockups/25-favorites-stats.html)
  - Member count, growth-this-month, active shares, time since last activity
  - Recent activity feed (5 most recent audit events)
  - **Exit:** stats populate; refresh on data change

- [ ] **5.5** — Required Actions for Phase 5
  - `MoveListMembersAction` (uses delta, requires `ConfirmDrops`)
  - `BulkUpdateListItemStatusAction`
  - **Exit:** callable

- [ ] **5.6** — Unit + UI tests for Phase 5
  - Bulk-move triggers drop-warning
  - Excel export produces valid file
  - Favorites persist across sessions
  - **Exit:** pass

- [ ] **5.7** — Performance: bulk operations
  - Bulk-move 5k records: p95 < 8s
  - Excel export of 50k-row list: p95 < 30s
  - **Exit:** baselines committed

- [ ] **5.8** — Phase 5 PR
  - **Exit:** CI green

### Final Wrap-Up

- [ ] **F.1** — End-to-end regression sweep against AssociationDB
  - Run full Playwright suite against AssociationDB-backed dev environment
  - Resolve any flakes or regressions before declaring complete
  - **Exit:** full suite green on AssociationDB

- [ ] **F.2** — Update root README + relevant package READMEs
  - Document `@memberjunction/lists` public API
  - Update [packages/Angular/Generic/list-management/](../../packages/Angular/Generic/list-management/) README with new components
  - **Exit:** READMEs reflect shipped state

- [ ] **F.3** — Changeset for release
  - `npx changeset` documenting user-facing changes per package
  - **Exit:** changeset committed

---

## 11. Files & Paths Reference

- Core model package: `packages/Lists/`
- Resolver: `packages/MJServer/src/resolvers/ListOperationsResolver.ts`
- DP helper: `packages/GraphQLDataProvider/src/clients/ListsClient.ts` (verify path matches existing structure)
- Angular list-mgmt: `packages/Angular/Generic/list-management/`
- Angular Lists app: `packages/Angular/Explorer/dashboards/src/Lists/`
- New Audience picker: `packages/Angular/Generic/audience-source/`
- Migrations: `migrations/v5/`
- Mockups: [`mockups/`](mockups/) (this directory) — start at [`mockups/index.html`](mockups/index.html)
- Perf tests: `packages/Lists/perf/`
- E2E tests: `e2e/lists/`
