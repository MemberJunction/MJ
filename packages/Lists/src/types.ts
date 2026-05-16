/**
 * @memberjunction/lists — public type surface.
 *
 * Naming: PascalCase for public members (per MJ convention). These types are
 * the single source of truth shared by the core, the GraphQL resolver layer,
 * the GraphQLDataProvider client, and the Angular UI.
 */

/**
 * How a refresh operation reconciles a target list against its source.
 *
 * - `Additive`: only adds new members from the source; never removes.
 * - `Sync`: makes the target exactly equal the source — may remove members
 *   that are no longer in the source. This is the only refresh mode that can
 *   produce drops, and therefore the only one that requires `ConfirmDrops`.
 */
export type ListRefreshMode = 'Additive' | 'Sync';

/**
 * Discriminated union identifying any source of records that can feed a list
 * operation. The same shape is exported as `AudienceSource` in Phase 3 — they
 * are intentionally identical so the audience picker and the list-operations
 * pipeline share a vocabulary.
 *
 * - `list`: an existing MJ List, resolved via its members.
 * - `view`: a User View, resolved via RunView with optional runtime params.
 * - `adhoc`: an arbitrary entity + filter — no persisted view backing it.
 */
export type ListSource =
  | { kind: 'list'; listId: string }
  | { kind: 'view'; viewId: string; runtimeParams?: Record<string, unknown> }
  | { kind: 'adhoc'; entityName: string; extraFilter: string };

/**
 * Resolved record set returned by `ListOperations.ResolveSource`.
 *
 * `RecordIds` are stringified composite-key payloads in the same format used
 * by `MJ: List Detail.RecordID` (see `AddRecordsToListAction`). For
 * single-column primary keys this is just the ID; for composite keys it is
 * the JSON-encoded key object.
 *
 * `EntityName` is single-valued — Lists are single-entity by design. If a
 * caller mixes sources of different entities, the operation surfaces an
 * `ENTITY_MISMATCH` warning rather than silently coercing.
 */
export interface ResolvedRecordSet {
  EntityName: string;
  RecordIds: string[];
  /** Optional total count when the source is paged or streamed. */
  TotalCount?: number;
}

/**
 * Category of warning surfaced by a delta or set-op preview. Warnings do not
 * block — `ApplyDelta` enforces the hard rules (drop confirmation, stale
 * tokens, permissions). Use warnings to drive UX hints.
 */
export type ListDeltaWarningCode =
  | 'WILL_REMOVE_RECORDS'
  | 'ENTITY_MISMATCH'
  | 'EMPTY_SOURCE'
  | 'EMPTY_TARGET'
  | 'LARGE_OPERATION';

/**
 * Single warning attached to a `ListDelta`. `Message` is human-readable;
 * `Code` drives any UI logic that needs to react to a specific class of
 * warning (most importantly `WILL_REMOVE_RECORDS`, which the delta-confirm
 * dialog uses to require explicit acknowledgement).
 */
export interface ListDeltaWarning {
  Code: ListDeltaWarningCode;
  Message: string;
  /** Optional structured payload for the UI. */
  Details?: Record<string, unknown>;
}

/**
 * Aggregate counts on a `ListDelta`. Always present — clients can render
 * "+N / −M / Unchanged K" summary tiles without re-counting arrays.
 */
export interface ListDeltaCounts {
  Add: number;
  Remove: number;
  Unchanged: number;
  SourceTotal: number;
  TargetTotal: number;
}

/**
 * Result of a preview call (`ComputeDelta` or `ComputeSetOp`). Never mutates.
 *
 * `DeltaToken` is a server-signed HMAC of `{ targetListId, source signature,
 * mode, timestamp }` with a 5-minute TTL. `ApplyDelta` will reject any token
 * that fails to verify, has expired, or no longer reflects current state
 * (which it detects by re-computing on the server).
 *
 * `TargetListId` is `null` when the operation creates a new list rather than
 * mutating an existing one (e.g. `MaterializeFromView`).
 */
export interface ListDelta {
  TargetListId: string | null;
  EntityName: string;
  ToAdd: string[];
  ToRemove: string[];
  Unchanged: string[];
  Counts: ListDeltaCounts;
  Warnings: ListDeltaWarning[];
  DeltaToken: string;
}

/**
 * Options for `MaterializeFromView` — creates a new list from a view result.
 *
 * `RememberLineage` controls whether the new list captures the source view
 * ID + filter snapshot. With it `false`, the list is a one-shot copy and
 * cannot be refreshed.
 *
 * `UseSnapshot` controls refresh behaviour when lineage is remembered: when
 * `true`, refreshes re-apply the captured filter snapshot; when `false`,
 * refreshes re-read the live view (default).
 */
export interface MaterializeOptions {
  ListName: string;
  CategoryId?: string;
  Description?: string;
  RememberLineage: boolean;
  UseSnapshot: boolean;
  RefreshMode: ListRefreshMode;
}

/**
 * Result codes returned by `ApplyDelta` and the high-level convenience
 * operations. Every non-`SUCCESS` code maps to a user-visible failure mode
 * the UI must handle explicitly.
 */
export type ApplyResultCode =
  | 'SUCCESS'
  | 'DROP_NOT_CONFIRMED'
  | 'STALE_DELTA'
  | 'INVALID_TOKEN'
  | 'PERMISSION_DENIED'
  | 'TARGET_NOT_FOUND'
  | 'PARTIAL_SUCCESS'
  | 'UNEXPECTED_ERROR';

/**
 * Outcome of a mutating list operation. `Counts` reports what actually
 * happened (which may differ from the preview if records were concurrently
 * modified — that case surfaces as `STALE_DELTA` rather than silent skew).
 */
export interface ApplyResult {
  Success: boolean;
  ResultCode: ApplyResultCode;
  Message: string;
  /** Populated when `MaterializeFromView` (or similar) creates a new list. */
  CreatedListId?: string;
  TargetListId?: string;
  Counts?: { Added: number; Removed: number; Failed: number };
  Errors?: string[];
}
