# @memberjunction/lists

Pure TypeScript core for MemberJunction Lists. Owns list materialization,
set algebra, delta computation, lineage tracking, refresh modes, drop
guards, sharing, and audience resolution. Framework-agnostic — no
GraphQL, HTTP, or Angular dependencies.

This is the **source of truth** for the type contracts that the rest of
the stack (the `ListOperationsResolver` in `@memberjunction/server`, the
`GraphQLListsClient` in `@memberjunction/graphql-dataprovider`, the
Phase-N list Actions in `@memberjunction/core-actions`, and the Angular
components in `@memberjunction/ng-list-management`) all import from.

## Installation

```bash
npm install @memberjunction/lists
```

## What's in here

```
ListOperations    → materialize / refresh / compose / preview-and-apply
ListSharing       → direct shares, email invitations, audit log, capabilities
AudienceResolver  → friendly-named re-export of ResolveSource (Communications)
deltaToken        → HMAC-signed preview-token contract (server enforced)
types             → ListSource, ListDelta, ListCapabilities, etc.
```

## Public API surface

### Core types (`types.ts`)

```typescript
type ListRefreshMode = 'Additive' | 'Sync';

type ListSource =
  | { kind: 'list'; listId: string }
  | { kind: 'view'; viewId: string; runtimeParams?: Record<string, unknown> }
  | { kind: 'adhoc'; entityName: string; extraFilter: string };

interface ResolvedRecordSet {
  EntityName: string;
  RecordIds: string[];       // MJ: List Detail.RecordID format
  TotalCount?: number;
}

interface ListDelta {
  TargetListId: string | null;
  EntityName: string;
  ToAdd: string[];
  ToRemove: string[];
  Unchanged: string[];
  Counts: { Add; Remove; Unchanged; SourceTotal; TargetTotal };
  Warnings: ListDeltaWarning[];
  DeltaToken: string;        // HMAC, 5-min TTL
}

interface ApplyResult {
  Success: boolean;
  ResultCode: 'SUCCESS' | 'DROP_NOT_CONFIRMED' | 'STALE_DELTA' |
              'INVALID_TOKEN' | 'PERMISSION_DENIED' | 'TARGET_NOT_FOUND' |
              'PARTIAL_SUCCESS' | 'UNEXPECTED_ERROR';
  Message: string;
  CreatedListId?: string;
  TargetListId?: string;
  Counts?: { Added; Removed; Failed };
  Errors?: string[];
}
```

### `ListOperations`

Constructor: `new ListOperations(contextUser, provider?)`.

```typescript
// Read-only
ResolveSource(source: ListSource): Promise<ResolvedRecordSet>;
GetListMembers(listId: string): Promise<ResolvedRecordSet>;

// Preview (never mutates) — returns a signed DeltaToken
ComputeDelta(target: ListSource | 'new', source: ListSource, mode: ListRefreshMode): Promise<ListDelta>;
ComputeSetOp(op: 'union' | 'intersection' | 'difference', inputs: ListSource[], target?: ListSource | 'new'): Promise<ListDelta>;

// Commit (server enforces token validity + drop guard)
ApplyDelta(delta: ListDelta, opts: { ConfirmDrops: boolean; DeltaToken: string }): Promise<ApplyResult>;

// High-level convenience
MaterializeFromView(viewId: string, opts: MaterializeOptions): Promise<ApplyResult>;
AddViewResultsToList(viewId: string, listId: string): Promise<ApplyResult>;
RefreshFromSource(listId: string, mode: ListRefreshMode, opts: { ConfirmDrops: boolean }): Promise<ApplyResult>;
```

#### The drop-row warning contract

Every mutating list operation goes through `ComputeDelta` first. The
returned `DeltaToken` is an HMAC over `{targetListId, source signature,
mode, timestamp}` with a 5-minute TTL.

`ApplyDelta` enforces, **server-side**, in this order:

1. Token signature + 5-min TTL — else `INVALID_TOKEN`.
2. Re-compute against current target state — else `STALE_DELTA`.
3. `Counts.Remove > 0 && !ConfirmDrops` — else `DROP_NOT_CONFIRMED`.
4. Editor permission on target (placeholder; Phase 2 wires the real
   `ResourcePermission` check).

The Angular `<mj-list-delta-confirm>` dialog is the only UI path that
produces a valid token. The server rejects drops regardless of UI.

### `ListSharing`

Constructor: `new ListSharing(contextUser, provider?)`.

```typescript
type SharePermissionLevel = 'View' | 'Edit' | 'Owner';

type ShareTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'role'; roleId: string };

// Direct shares (recipient already has an MJ account)
Share(args: { ListID; Target; PermissionLevel }): Promise<ShareResult>;
Unshare(permissionId: string): Promise<ShareResult>;
GetSharesForList(listId: string): Promise<ListShareSummary[]>;
GetListsSharedWithUser(): Promise<SharedListSummary[]>;

// Email invitations (recipient may not yet have an account)
Invite(args: { ListID; Email; Role: 'Editor' | 'Viewer'; TtlMs? }): Promise<InviteResult>;
AcceptInvitation(token: string): Promise<AcceptInvitationResult>;
RevokeInvitation(invitationId: string): Promise<ShareResult>;

// Permission introspection for UI gating
ResolveEffectivePermission(listId: string): Promise<SharePermissionLevel | null>;
```

Every mutation also writes an `MJ: Audit Logs` entry. Audit log types
are seeded via metadata sync (see
[`metadata/audit-log-types/.list-sharing-audit-types.json`](../../../metadata/audit-log-types/.list-sharing-audit-types.json)).

Direct user-shares fan out via the platform `CreateShareNotification`
dispatcher (registered by `@memberjunction/notifications`) — recipients
get in-app + email notifications per their preferences. Role-target
shares are not fanned out per-user (that's a separate worker).

### Capability gating

UI components should derive button visibility from the caller's
effective permission level, not from raw entity-permission flags. The
mapping is centralized so UI and server agree:

```typescript
const level: SharePermissionLevel | null =
  await sharing.ResolveEffectivePermission(listId);

const caps: ListCapabilities = capabilitiesForLevel(level);
// caps.CanEdit / CanRefresh / CanShare / CanDelete / CanRunOperations
// Server-side enforcement remains the source of truth — these are a
// UX convenience so users don't see buttons they'll be rejected on.
```

Mapping per mockup 19:

| Level   | Read | Edit | Refresh | Share | Delete | Operations |
| ------- | :--: | :--: | :-----: | :---: | :----: | :--------: |
| Owner   | ✓    | ✓    | ✓       | ✓     | ✓      | ✓          |
| Editor  | ✓    | ✓    | ✓       | ✗     | ✗      | ✓          |
| Viewer  | ✓    | ✗    | ✗       | ✗     | ✗      | ✗          |
| null    | ✗    | ✗    | ✗       | ✗     | ✗      | ✗          |

### `AudienceResolver`

Friendly-named entry point for resolving an `AudienceSource` (= `ListSource`)
to a `ResolvedRecordSet`. Identical semantics to
`ListOperations.ResolveSource`, exposed under a name that reads
naturally for Communications and other audience-aware code.

```typescript
const resolver = new AudienceResolver(contextUser, provider);
const result = await resolver.Resolve({ kind: 'list', listId });
// result.RecordIds — array of record IDs in the target audience
```

### `deltaToken`

Internal helpers exposed for resolver-layer use. Server bootstrap must
set the HMAC secret:

```typescript
import { SetDeltaTokenSecret } from '@memberjunction/lists';

SetDeltaTokenSecret(process.env.MJ_LIST_DELTA_SECRET);
```

Falls back to the env var `MJ_LIST_DELTA_SECRET` if no explicit call is
made. Refuses to use a default secret — silent fallback would let a
misconfigured server hand out forgeable tokens.

## Examples

### Save a view's current results as a new list with lineage

```typescript
const ops = new ListOperations(currentUser, provider);
const result = await ops.MaterializeFromView('view-abc', {
  ListName: 'Q4 VIP Donors',
  Description: 'Materialized from the Q4 Donor View',
  CategoryId: 'cat-marketing',
  RememberLineage: true,     // can refresh from source later
  UseSnapshot: false,        // refresh re-reads the live view
  RefreshMode: 'Additive',   // default refresh mode for this list
});
// result.CreatedListId, result.Counts.Added
```

### Refresh a lineage-bearing list (Sync mode, will drop missing rows)

```typescript
const result = await ops.RefreshFromSource(listId, 'Sync', {
  ConfirmDrops: true,    // required when Sync mode would remove records
});
```

### Preview a 3-way intersection without committing

```typescript
const delta = await ops.ComputeSetOp('intersection', [
  { kind: 'list', listId: 'list-a' },
  { kind: 'view', viewId: 'view-b' },
  { kind: 'view', viewId: 'view-c' },
]);
// delta.ToAdd has the resulting record IDs; nothing has been saved.
```

### Share a list with an Editor

```typescript
const sharing = new ListSharing(currentUser, provider);
const result = await sharing.Share({
  ListID: 'list-abc',
  Target: { kind: 'user', userId: 'user-xyz' },
  PermissionLevel: 'Edit',
});
// In-app + email notification fires automatically via the platform handler.
```

### Invite someone by email

```typescript
const inv = await sharing.Invite({
  ListID: 'list-abc',
  Email: 'recipient@example.com',
  Role: 'Editor',
  TtlMs: 7 * 24 * 60 * 60 * 1000,
});
// inv.Token + inv.ExpiresAt — the caller builds the accept URL.
```

## Architecture

Sits at the bottom of a four-layer stack:

```
┌────────────────────────────────────────────────────────────┐
│  Angular UI (@memberjunction/ng-list-management,           │
│  @memberjunction/ng-explorer-core, etc.)                   │
└────────────────────────────┬───────────────────────────────┘
                             ↓ uses
┌────────────────────────────────────────────────────────────┐
│  GraphQLListsClient (@memberjunction/graphql-dataprovider) │
└────────────────────────────┬───────────────────────────────┘
                             ↓ wire format
┌────────────────────────────────────────────────────────────┐
│  ListOperationsResolver (@memberjunction/server)           │
└────────────────────────────┬───────────────────────────────┘
                             ↓ delegates to
┌────────────────────────────────────────────────────────────┐
│  ListOperations / ListSharing / AudienceResolver  ← this   │
│  (@memberjunction/lists)                                   │
└────────────────────────────────────────────────────────────┘
```

Every layer is a thin pass-through. The Actions in
`@memberjunction/core-actions` (`MaterializeListFromViewAction`,
`ShareListAction`, etc.) are parallel consumers — they import directly
from this package so AI agents, workflows, and scheduled jobs get the
same capability as the UI.

## Dependencies

- `@memberjunction/core` — `Metadata`, `RunView`, `UserInfo`, `IMetadataProvider`
- `@memberjunction/core-entities` — `MJListEntity`, `MJResourcePermissionEntity`, etc.
- `@memberjunction/global` — class registration utilities

No HTTP, no GraphQL, no Angular.

## Testing

```bash
cd packages/Lists
npm run test
```

76 vitest cases across `deltaToken` (HMAC roundtrip + secret resolution),
`ListOperations` (math, set-ops, drop guard, materialize, refresh modes,
snapshot vs live), `AudienceResolver`, and `ListSharing` (share / invite
/ accept / revoke lifecycle, capability mapping).

Coverage tracked at 88%+ lines; reports via `npm run test:coverage`.
