# Lists Enhancement Plan

Branch: `an-plan-lists-enhancements`
Author: planning agent, 2026-05-15

## Goals & Non-Goals

**Goals.** Bridge Lists (static materialized sets) and User Views (dynamic filtered queries) without collapsing the distinction; finish the half-built Sharing model; introduce a reusable "audience source" abstraction starting with Communications; surface Tags on Lists; ship a few high-ROI polish items. Establish a clean four-layer architecture (core model → resolver → DP helper → Angular) so every consumer gets the same behavior, including the mandatory drop-row warning contract.

**Non-Goals.** Do NOT make Lists dynamic, do NOT allow multi-entity Lists at the data layer, do NOT replace User Views, do NOT redesign Tagging. Cross-entity power comes from *composition* (multiple List/View inputs into one output List), not from changing the List entity.

## Architectural Principles

Strict four-layer stack — each layer is a thin pass-through over the one below:

1. **Core object model** — pure TypeScript, framework-agnostic, lives in a new `@memberjunction/lists` package (see Phase 0 rationale). Owns business logic: list materialization, set algebra, delta computation, lineage tracking, refresh modes. Has no GraphQL/HTTP/Angular dependencies. Talks to data via `RunView` ([runView.ts](packages/MJCore/src/views/runView.ts#L106)) and `BaseEntity` save patterns already used in [add-records-to-list.action.ts](packages/Actions/CoreActions/src/custom/lists/add-records-to-list.action.ts) and [remove-records-from-list.action.ts](packages/Actions/CoreActions/src/custom/lists/remove-records-from-list.action.ts).
2. **GraphQL resolver layer** — wraps core methods, deals with auth context, returns typed payloads. Pattern follows [UserViewResolver.ts](packages/MJServer/src/resolvers/UserViewResolver.ts).
3. **GraphQLDataProvider helper** — a `ListsClient` class shipped in (or alongside) [packages/GraphQLDataProvider](packages/GraphQLDataProvider) that exposes typed methods to any client consumer (Angular, MCP, MJExplorer, third-party apps).
4. **Angular components** — thin: they bind to forms, render results, and call `ListsClient`. No SQL, no business logic, no entity-save orchestration. The existing [list-sharing.service.ts](packages/Angular/Generic/list-management/src/lib/services/list-sharing.service.ts) becomes a thin adapter over `ListsClient`, NOT the place where rules live.

The action layer in [packages/Actions/CoreActions/src/custom/lists/](packages/Actions/CoreActions/src/custom/lists/) becomes a 5th, optional consumer of the core model — Actions wrap core methods so AI agents/Workflows get the same surface.

## Phase 0 — Foundation (core model package + drop-warning contract)

**Decision: create a new `@memberjunction/lists` package** rather than extending `MJCoreEntitiesServer`. Reasons: (a) the logic is provider-agnostic and runs on both client and server (Angular needs it for preview without a roundtrip in some flows), (b) `MJCoreEntitiesServer` is server-only and tightly coupled to the SQL provider, (c) Actions, Resolvers, and Angular all need it, so a shared peer package avoids circular deps. The package depends on `@memberjunction/core` (for `RunView`, `Metadata`, `BaseEntity`) and `@memberjunction/core-entities` (for `MJListEntity`, `MJListDetailEntity` types).

Public API surface (TypeScript):

```ts
// packages/Lists/src/ListOperations.ts
export type ListRefreshMode = 'Additive' | 'Sync';
export type ListSource =
  | { kind: 'list'; listId: string }
  | { kind: 'view'; viewId: string; runtimeParams?: Record<string, unknown> }
  | { kind: 'adhoc'; entityName: string; extraFilter: string };

export interface ListDelta {
  targetListId: string | null;   // null when previewing into a not-yet-created list
  entityName: string;
  toAdd: string[];               // RecordIDs (composite keys serialized like ListDetail.RecordID today)
  toRemove: string[];            // RecordIDs that are in target but not in source (Sync mode only)
  unchanged: string[];           // intersection
  counts: { add: number; remove: number; unchanged: number; sourceTotal: number; targetTotal: number };
  warnings: ListDeltaWarning[];
}

export interface ListDeltaWarning {
  level: 'info' | 'warn' | 'block';
  code: 'WILL_REMOVE_RECORDS' | 'ENTITY_MISMATCH' | 'LARGE_DELTA' | 'PERMISSION_DENIED' | 'NO_PRIMARY_KEY';
  message: string;
  affectedCount?: number;
}

export class ListOperations {
  constructor(private contextUser: UserInfo, private provider?: IMetadataProvider) {}

  // ---- Read / resolve ----
  resolveSource(source: ListSource): Promise<ResolvedRecordSet>;            // entity + RecordIDs
  getListMembers(listId: string): Promise<ResolvedRecordSet>;

  // ---- Preview (never mutates) ----
  computeDelta(target: ListSource | 'new', source: ListSource, mode: ListRefreshMode): Promise<ListDelta>;
  computeSetOp(op: 'union'|'intersection'|'difference', inputs: ListSource[], target?: ListSource | 'new'): Promise<ListDelta>;

  // ---- Commit (always takes a Delta produced above; refuses if stale) ----
  applyDelta(delta: ListDelta, opts: { confirmDrops: boolean; deltaToken: string }): Promise<ApplyResult>;

  // ---- High-level convenience (preview+apply pair, requires explicit confirmDrops) ----
  materializeFromView(viewId: string, opts: { name: string; categoryId?: string; rememberLineage?: boolean }): Promise<ApplyResult>;
  addViewResultsToList(viewId: string, listId: string): Promise<ApplyResult>;        // additive only — no drops possible
  refreshFromSource(listId: string, mode: ListRefreshMode, opts: { confirmDrops: boolean }): Promise<ApplyResult>;
}
```

**Drop-row warning contract (hard requirement).** Every mutating operation MUST go through `computeDelta` first. `applyDelta` refuses to run when `delta.counts.remove > 0` unless `opts.confirmDrops === true`. The `deltaToken` is an HMAC of `(targetListId, source signature, mode, timestamp)` returned by `computeDelta` — `applyDelta` recomputes and aborts with `STALE_DELTA` if records have changed since the preview, forcing the UI to re-confirm. This makes "preview then commit" enforceable across every layer including agent-initiated calls.

Operations that CAN produce drops: `refreshFromSource(mode:'Sync')`, `computeSetOp('intersection'|'difference')` when target is an existing list, any future "replace contents" op. Operations that CANNOT: `materializeFromView` (target is new), `addViewResultsToList` (additive by definition), `computeSetOp('union')` into existing.

Existing precedent for preview-style UX: the venn-diagram operations panel already renders `previewRecordsDisplay` ([lists-operations-resource.component.ts:234-254](packages/Angular/Explorer/dashboards/src/Lists/components/lists-operations-resource.component.ts#L234)). The new `<mj-list-delta-confirm>` component (Cross-cutting section) generalizes this pattern.

**Tests for Phase 0.** Unit tests in `@memberjunction/lists` covering: entity-mismatch detection, additive vs sync semantics, set-op math against fixtures, stale-delta detection, large-delta warning thresholds. Use Vitest matching the project convention ([vitest.config.ts](packages/Communication/Engine/vitest.config.ts)).

## Phase 1 — Lists ↔ Views Bridge

**Data model changes** on `MJ: Lists` ([entity_subclasses.ts:17754](packages/MJCoreEntities/src/generated/entity_subclasses.ts#L17754)):
- `SourceViewID uniqueidentifier NULL` FK to `MJ: User Views`
- `SourceFilterSnapshot nvarchar(MAX) NULL` — serialized `ExtraFilter` at time of materialization, so refresh works even if the view is later edited (the user can opt in/out)
- `LastRefreshedAt datetimeoffset NULL`
- `LastRefreshedByUserID uniqueidentifier NULL`
- `RefreshMode nvarchar(20) NULL` — `'Additive' | 'Sync' | NULL` (NULL = lineage-aware but no preferred mode)
- (Optional, P1.5) `ListSourceLink` join table for multi-source composition — defer if not needed for first ship.

Migration: `migrations/v5/V20260516xxxx__v5.35.x__List_Lineage_Fields.sql` adds nullable columns, no backfill (existing lists remain un-lineaged, which is correct). Follow style of [V202605091143__v5.34.x__Add_IsComputed_To_EntityField.sql](migrations/v5/V202605091143__v5.34.x__Add_IsComputed_To_EntityField.sql) for additive column adds and the metadata-sync pattern in the same folder.

**Core model.** Implements `materializeFromView`, `addViewResultsToList`, `refreshFromSource`, `computeSetOp`. View resolution uses `RunView` with `ViewID` ([runView.ts:106](packages/MJCore/src/views/runView.ts#L106)) — the existing list actions already do this ([create-list.action.ts:55](packages/Actions/CoreActions/src/custom/lists/create-list.action.ts#L55)). Lineage detection: a List is "lineage-aware" iff `SourceViewID IS NOT NULL OR SourceFilterSnapshot IS NOT NULL`.

**GraphQL resolver.** New `ListOperationsResolver` exposing:
- `query previewListDelta(input: ListDeltaInput!): ListDeltaPayload!`
- `mutation applyListDelta(deltaToken: String!, confirmDrops: Boolean!): ApplyResultPayload!`
- `mutation materializeListFromView(input: MaterializeFromViewInput!): ApplyResultPayload!`
- `mutation refreshListFromSource(listId: ID!, mode: ListRefreshMode!, confirmDrops: Boolean!): ApplyResultPayload!`
- `mutation composeLists(input: ComposeListsInput!): ApplyResultPayload!`

The generated entity resolver for `MJ: Lists` already exists; we add a hand-written sibling resolver pattern (same approach as [UserViewResolver.ts](packages/MJServer/src/resolvers/UserViewResolver.ts) extending the generated base).

**DP helper.** `ListsClient` (new file in `@memberjunction/graphql-dataprovider`) wrapping each mutation with typed inputs and returning `ListDelta` / `ApplyResult` mirrored from the core types. Single source of truth for type defs lives in `@memberjunction/lists`; both server and client import from it.

**Angular UI.**
- Extend [lists-operations-resource.component.ts](packages/Angular/Explorer/dashboards/src/Lists/components/lists-operations-resource.component.ts) operand picker to accept Views in addition to Lists. The venn diagram itself ([venn-diagram.component.ts](packages/Angular/Explorer/dashboards/src/Lists/components/venn-diagram/venn-diagram.component.ts)) is operand-type-agnostic — only the operand sourcing and label rendering change.
- New thin component `mj-list-from-view-button` rendered on User View toolbars: "Save as List" / "Add to existing List". Calls `ListsClient.materializeFromView` / `addViewResultsToList`.
- New "Refresh from source" button on the single-list view (in [list-management-dialog](packages/Angular/Generic/list-management/src/lib/components/list-management-dialog)) visible only when the list is lineage-aware. Always routes through `<mj-list-delta-confirm>` before commit.

**Risks.** (a) Composite primary keys: `ListDetail.RecordID` is `nvarchar(445)` and existing code stores composite keys serialized — re-use whatever serializer `add-records-to-list.action.ts` uses to avoid drift. Confirm format before implementing. (b) View runtime params: if a View takes parameters, the snapshot must capture them; document that re-running a parametrized View at refresh time uses *stored* params unless the user explicitly edits them.

## Phase 2 — Finish Sharing

Current state: `ListShareInfo` is wired through the **ResourcePermission system** ([list-sharing.service.ts:16-67](packages/Angular/Generic/list-management/src/lib/services/list-sharing.service.ts#L16)) — *not* through the `MJListShare` entity. Important: both exist, and they overlap. Open question (see end): consolidate on ResourcePermission and deprecate `MJListShare`/`MJListInvitation`, OR keep both and document the split. Recommendation: **keep `MJListInvitation` for the email-flow (pending invites by email, before user exists) and let `MJListShare` remain as a denormalized view, but route all *active* permission decisions through ResourcePermission** so we have one authoritative source.

**Build out:**
- Invitation flow (send/revoke/accept/decline) — core methods `ListSharing.invite(listId, email, role)`, `acceptInvitation(token)`, `revokeInvitation(id)`. Token already exists on the entity ([entity_subclasses.ts:17638](packages/MJCoreEntities/src/generated/entity_subclasses.ts#L17638)).
- Email notification on share/invite via `NotificationEngine` and the existing share-handler pattern in [shareNotificationHandler.ts](packages/Communication/notifications/src/shareNotificationHandler.ts) — verify whether it already handles Lists; if not, register a handler keyed on the List ResourceType.
- "Shared with me" tab in [lists-browse-resource.component.ts](packages/Angular/Explorer/dashboards/src/Lists/components/lists-browse-resource.component.ts) — query ResourcePermissions where current user has Viewer/Editor on a List.
- Permission-level enforcement in Angular: Viewer hides Add/Remove/Refresh/Operations buttons; Editor hides Delete/Share. Owner sees all. Currently the UI doesn't gate these — wire a `ListPermissionLevel` selector into [list-management.service.ts](packages/Angular/Generic/list-management/src/lib/services/list-management.service.ts).
- Audit log: new `ListAccessLog` entity (or reuse generic audit log if present — investigate `AuditLog` entity before adding new one). Events: `Shared`, `Unshared`, `InvitationSent`, `InvitationAccepted`, `Refreshed`, `BulkOperation`.

**Migration.** If we add `ListAccessLog`, new table + CodeGen run. Otherwise no schema change for Phase 2.

**Tests.** Resolver tests for invite/accept/revoke with token expiry; integration test that Viewer cannot call mutating endpoints (resolver-level auth must reject, not just UI hiding).

## Phase 3 — Audience Source Abstraction

**Concept.** An `AudienceSource` is a polymorphic descriptor that resolves to a record set at execution time:
```ts
type AudienceSource =
  | { kind: 'list'; listId: string }
  | { kind: 'view'; viewId: string; params?: Record<string, unknown> }
  | { kind: 'adhoc'; entityName: string; extraFilter: string }
  | { kind: 'union'; sources: AudienceSource[] };          // optional, V2
```

This is the same shape as `ListSource` in Phase 0 — and that's intentional. Hoist `ListSource` to a top-level type in `@memberjunction/lists` (rename `AudienceSource` if cleaner) so the Audience picker and list composition share the same type and the same resolver function.

**Core.** `AudienceResolver.resolve(source, contextUser): Promise<ResolvedRecordSet>`. Already implemented as `ListOperations.resolveSource` in Phase 0 — Phase 3 just exposes it under a friendly name.

**Angular.** New `<mj-audience-source-picker>` in `@memberjunction/ng-list-management` (or a new sibling `@memberjunction/ng-audience-source`). Tabs: "List" | "View" | "Filter". Emits an `AudienceSource` value. Companion `<mj-audience-source-summary>` shows count + entity + "Preview records" link.

**Communications integration.** Today, Communication Engine takes `MessageRecipient[]` ([Engine.ts:1](packages/Communication/Engine/src/Engine.ts#L1)). Add a higher-level `sendToAudience(audience: AudienceSource, message: MessageTemplate)` that internally resolves the audience and maps records to recipients via field-mapping config (which entity field is the email/phone). Keep the existing recipient API untouched.

**Risks.** Field mapping: the audience source produces records of *some* entity, but Communications needs an email address. The picker must let the user choose which field maps to "to". Make this explicit in the UI; don't auto-guess.

## Phase 4 — Tags on Lists UI

Pure UI work — `MJ: Tags` and `MJ: Tagged Items` already exist; the generated form for MJTaggedItem is at [mjtaggeditem.form.component.ts](packages/Angular/Explorer/core-entity-forms/src/lib/generated/Entities/MJTaggedItem/mjtaggeditem.form.component.ts).

- New `<mj-tag-chips>` reusable component (if one doesn't already exist — verify in `@memberjunction/ng-shared`) that renders tags for any `(entityName, recordId)` pair.
- Embed `<mj-tag-chips [entity]="'MJ: Lists'" [recordId]="list.ID">` on list cards in [lists-browse-resource.component.ts](packages/Angular/Explorer/dashboards/src/Lists/components/lists-browse-resource.component.ts) and [lists-my-lists-resource.component.ts](packages/Angular/Explorer/dashboards/src/Lists/components/lists-my-lists-resource.component.ts).
- Filter-by-tag chip row at the top of browse views. Filter is client-side over already-loaded results (cheap, small N) or RunView with subquery if lists are paginated.
- On list detail, a "Tags" section with add/remove. Reuse existing tag-picker if it exists; otherwise build a minimal one.

No data model changes. No core-model changes.

## Phase 5 — Polish

- **Excel export.** Implement [lists-operations-resource.component.ts:1916-1918](packages/Angular/Explorer/dashboards/src/Lists/components/lists-operations-resource.component.ts#L1916). Use existing `@memberjunction/ng-export` or the `MJExportEngine` package (verify which is the current standard) rather than re-rolling.
- **Bulk edit on single-list view.** Multi-select rows → "Set status" / "Remove from list" / "Move to another list". Calls `ListOperations.applyDelta` (move = delta with `toRemove` on source + `toAdd` on target — preview required). This naturally uses the drop-warning UX.
- **Favorites/pinning.** Reuse `UserFavorite` ([UserFavoriteResolver.ts](packages/MJServer/src/resolvers/UserFavoriteResolver.ts)) — no new entity. Add a star icon to list cards.
- **Usage stats.** Member count is already cheap (`COUNT(*) FROM ListDetail WHERE ListID = ...`). `LastModified` exists. Item-count trend requires a new lightweight `ListSnapshot` table OR computing from a delta of audit logs — defer unless trivial. Recommend: ship just count + last-modified; trend is V2.

## Cross-cutting Concerns

**Drop-row warning UX pattern.** New shared component `<mj-list-delta-confirm>` (in `@memberjunction/ng-list-management/lib/components/`). Inputs: `ListDelta`. Outputs: `confirm` (emits `deltaToken`), `cancel`. Renders:
- Counts panel: green "X to add", yellow "Y unchanged", **red "Z to remove" with a bold warning icon when Z > 0**
- Expandable preview lists (first 50 records each, links to record detail)
- Required checkbox "I understand Z records will be removed" — disables Confirm button until checked, only shown when Z > 0
- Action buttons: Cancel | Confirm
This component is the *only* UI path that produces a `deltaToken` for `applyListDelta`. Every mutating flow (Sync refresh, set-op into existing, bulk-move) routes through it.

**Performance / scale.** For 10k+ row lists: delta computation does set diff in memory after two `RunView` calls — fine up to ~50k. Beyond that, push the diff into SQL via a temp-table-based stored proc (`spComputeListDelta`) that returns counts + sample rows. Trigger threshold: if `sourceTotal + targetTotal > 25k`, the resolver auto-switches to the SQL-side path. `applyDelta` for large adds uses the existing batch-insert pattern in [add-records-to-list.action.ts](packages/Actions/CoreActions/src/custom/lists/add-records-to-list.action.ts). For truly large async operations (>100k), enqueue via `MJQueue` and return a job handle — defer to a follow-up phase.

**Permissions / RLS.** All resolver endpoints check the user's role on the target List via the ResourcePermission system. `previewListDelta` requires Viewer (preview is non-mutating); `applyListDelta` requires Editor; `materializeFromView` requires Editor on the target category (or Create on Lists if no category). View resolution honors the existing View access rules — `RunView` already enforces them.

**Telemetry.** Emit structured events from `ListOperations` (start/success/failure with counts) via the existing logging/telemetry hook. Specifically log every Sync-mode refresh with `removedCount` for forensics.

## Migration & Rollout Order

1. **Phase 0** (foundation, no UI shipped) — `@memberjunction/lists` package + tests. Internal-only release.
2. **Phase 1.a** schema migration + lineage fields + `materializeFromView` + `addViewResultsToList` (no drop paths yet, so low risk).
3. **Phase 1.b** `refreshFromSource` + set-op composition + `<mj-list-delta-confirm>` — first user-visible drop-warning UX.
4. **Phase 2** sharing finish — independent of Phase 1, can run in parallel.
5. **Phase 3** audience picker — depends on Phase 0's `resolveSource`.
6. **Phase 4** tags UI — fully independent, any time.
7. **Phase 5** polish — independent, ship piecemeal.

Each phase ships with its own migration file under `migrations/v5/` (only Phase 1 and possibly Phase 2 actually add schema). CodeGen run after each schema change to refresh [entity_subclasses.ts](packages/MJCoreEntities/src/generated/entity_subclasses.ts).

## Open Questions for User

1. **ResourcePermission vs MJListShare/MJListInvitation duality.** Current code uses ResourcePermission for active shares ([list-sharing.service.ts:65](packages/Angular/Generic/list-management/src/lib/services/list-sharing.service.ts#L65)) but `MJListShare` and `MJListInvitation` entities also exist. Confirm: keep both (invitations = pending-by-email, ResourcePermission = active) and deprecate `MJListShare` as redundant? Or migrate everything to one model?
2. **View-source snapshot vs live linkage.** When a List is materialized from a View, do we (a) store the view's `ExtraFilter` at materialization time (snapshot — survives view edits), (b) reference `SourceViewID` only (live — always re-reads the view's current filter), or (c) both with a user toggle per List? Recommendation: both, with a per-list `UseSnapshot` flag, default false (live). Confirm.
3. **Multi-source lineage.** Should a List composed via `union` of three Views remember all three sources, or just be marked "composed" with no refresh path? Adding `ListSourceLink` is cheap but adds API surface. Recommend deferring to V2 unless you want it now.
4. **Bulk async threshold.** What's the largest List size we care about for synchronous operations? Plan assumes 25k sync / 100k async via MJQueue. Confirm or adjust.
5. **Audience field-mapping persistence.** Should mapping config (e.g., "for Contacts, the email field is `EmailPrimary`") be per-entity global config, or per-message config? Recommend per-entity default with per-message override.
6. **Audit log scope.** Use existing AuditLog entity (if it exists and is generic) or new `ListAccessLog`? Need to inspect existing AuditLog usage before deciding.
7. **CommunicationEngine integration depth.** Phase 3 adds `sendToAudience`. Confirm this should live in `@memberjunction/communication-engine` or in a new `@memberjunction/audience` package that Communications consumes.
