/**
 * @memberjunction/lists-base — public type surface.
 *
 * These types are isomorphic (no runtime, no Node-only or DOM-only APIs) and
 * are the single source of truth shared by:
 *   - `@memberjunction/lists` (server-side operations)
 *   - `@memberjunction/graphql-dataprovider` (browser client)
 *   - Angular UI packages
 *
 * Naming: PascalCase for public members (per MJ convention).
 */

// ---------------------------------------------------------------------------
// List operations — refresh modes, sources, deltas, set-ops, materialize
// ---------------------------------------------------------------------------

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
 * operation. The same shape is exported as `AudienceSource` — they are
 * intentionally identical so the audience picker and the list-operations
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
 * `AudienceSource` is the same discriminated union as `ListSource` — same
 * `kind` discriminator, same payload shape — but named after its primary
 * downstream consumer (the Communications module). Defining it as a type
 * alias lets the Angular picker, the SendToAudience helper, and any
 * future audience-aware feature share one vocabulary with the list
 * operations stack without forcing them to import a "list" type.
 */
export type AudienceSource = ListSource;

/**
 * Resolved record set returned by list-source resolution.
 *
 * `RecordIds` are stringified composite-key payloads in the same format used
 * by `MJ: List Detail.RecordID`. For single-column primary keys this is just
 * the ID; for composite keys it is the canonical `Field1|Value1||Field2|…`
 * format.
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

/** Discriminator for set-operations. */
export type SetOpKind = 'union' | 'intersection' | 'difference';

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

// ---------------------------------------------------------------------------
// Sharing — permission levels, capabilities, share targets, results
// ---------------------------------------------------------------------------

/** Permission level granted to a share recipient. Mirrors the
 *  MJResourcePermission `PermissionLevel` field exactly. */
export type SharePermissionLevel = 'View' | 'Edit' | 'Owner';

/**
 * Capability flags derived from a permission level. The mapping mirrors
 * the gating rules from mockup 19:
 *   - Viewer: hide Add/Remove/Refresh/Edit/Share/Delete/Operations
 *   - Editor: hide Delete/Share
 *   - Owner: show everything
 * Server-side enforcement remains the source of truth — this is a UX
 * convenience so users don't see buttons they'll be rejected on.
 */
export interface ListCapabilities {
  CanRead: boolean;
  CanEdit: boolean;
  CanRefresh: boolean;
  CanShare: boolean;
  CanDelete: boolean;
  CanRunOperations: boolean;
}

/**
 * Pure mapping function from a permission level (or `null` for "no access")
 * to a capability flag set. Stateless, no runtime dependencies — safe to use
 * in any context.
 */
export function CapabilitiesForLevel(level: SharePermissionLevel | null): ListCapabilities {
  if (level === 'Owner') {
    return {
      CanRead: true, CanEdit: true, CanRefresh: true,
      CanShare: true, CanDelete: true, CanRunOperations: true,
    };
  }
  if (level === 'Edit') {
    return {
      CanRead: true, CanEdit: true, CanRefresh: true,
      CanShare: false, CanDelete: false, CanRunOperations: true,
    };
  }
  if (level === 'View') {
    return {
      CanRead: true, CanEdit: false, CanRefresh: false,
      CanShare: false, CanDelete: false, CanRunOperations: false,
    };
  }
  // No access at all — caller should hide the list entirely.
  return {
    CanRead: false, CanEdit: false, CanRefresh: false,
    CanShare: false, CanDelete: false, CanRunOperations: false,
  };
}

/**
 * Target of a direct share: either an MJ user or an MJ role. Discriminated
 * union so the type system enforces exactly one of `userId` / `roleId` is
 * provided (mirrors the `ValidateTypeAndRoleOrUserIDExclusive` rule on
 * `MJResourcePermission`).
 */
export type ShareTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'role'; roleId: string };

/** Summary of one share row returned by `GetSharesForList`. */
export interface ListShareSummary {
  PermissionID: string;
  ListID: string;
  Target: ShareTarget;
  PermissionLevel: SharePermissionLevel;
  Status: 'Approved' | 'Requested' | 'Rejected' | 'Revoked';
  SharedByUserID: string | null;
  CreatedAt: Date;
}

/** Summary of one List visible to the current user via shares. */
export interface SharedListSummary {
  ListID: string;
  ListName: string;
  PermissionLevel: SharePermissionLevel;
  SharedByUserID: string | null;
  SharedAt: Date;
}

/** Status codes returned by sharing operations. */
export type ShareResultCode =
  | 'SUCCESS'
  | 'INVALID_PARAMETER'
  | 'LIST_NOT_FOUND'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_ALREADY_USED'
  | 'INVITATION_REVOKED'
  | 'PERMISSION_NOT_FOUND'
  | 'EMAIL_RECIPIENT_NOT_FOUND'
  | 'UNEXPECTED_ERROR';

export interface ShareResult {
  Success: boolean;
  ResultCode: ShareResultCode;
  Message: string;
  PermissionID?: string;
}

export interface InviteResult {
  Success: boolean;
  ResultCode: ShareResultCode;
  Message: string;
  InvitationID?: string;
  Token?: string;
  ExpiresAt?: Date;
}

export interface AcceptInvitationResult {
  Success: boolean;
  ResultCode: ShareResultCode;
  Message: string;
  PermissionID?: string;
  ListID?: string;
}

// ---------------------------------------------------------------------------
// Delta token payload — type surface only. The runtime sign/verify lives
// server-side in @memberjunction/lists.
// ---------------------------------------------------------------------------

/** Token validity window — matches the 5-minute requirement in the plan. */
export const TOKEN_TTL_MS = 5 * 60 * 1000;

/** Mode tag baked into the payload — drives drop-guard enforcement. */
export type DeltaTokenMode = 'Additive' | 'Sync' | 'SetOp';

/**
 * Canonical payload shape. Kept tiny + versioned so we can evolve the
 * signing scheme without breaking running clients.
 */
export interface DeltaTokenPayload {
  v: 1;
  tid: string | null;
  ssig: string;
  m: DeltaTokenMode;
  iat: number;
}

/**
 * Reasons a token can fail verification. Mapped 1:1 by the resolver layer
 * onto user-visible `ApplyResultCode` values.
 */
export type DeltaTokenError = 'INVALID_TOKEN' | 'EXPIRED_TOKEN';
