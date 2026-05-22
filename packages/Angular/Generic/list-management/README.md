# @memberjunction/ng-list-management

Angular components for the MemberJunction Lists feature: list-membership
management, sharing, refresh-from-source preview, audience picking,
tagging, and lightweight stats. Drop-in pieces that any MJ app can use;
the components here own the UI shape, and
[`@memberjunction/lists`](../../../Lists/README.md) owns the underlying
business logic.

## Installation

```bash
npm install @memberjunction/ng-list-management
```

## Module import

```typescript
import { ListManagementModule } from '@memberjunction/ng-list-management';

@NgModule({
  imports: [ListManagementModule]
})
export class YourModule {}
```

All components below are exported via this single module.

## Components

| Selector                       | Component                            | Purpose                                                                                     |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `mj-list-management-dialog`    | `ListManagementDialogComponent`      | Dialog for adding/removing records to/from lists                                            |
| `mj-list-share-dialog`         | `ListShareDialogComponent`           | Share-with-users-or-roles dialog (audit-log + notification footer links)                    |
| `mj-list-delta-confirm`        | `ListDeltaConfirmComponent`          | Preview-and-confirm dialog for any mutating list op (drop-guard UX)                         |
| `mj-save-view-as-list-dialog`  | `SaveViewAsListDialogComponent`      | Materialize a User View into a new static List (with optional lineage + filter snapshot)    |
| `mj-list-invitations`          | `ListInvitationsComponent`           | Per-list invitations management — Pending / Accepted / Expired / Revoked tabs + send form   |
| `mj-list-audit-log`            | `ListAuditLogComponent`              | Per-list audit-log viewer reading the generic `MJ: Audit Logs` table                        |
| `mj-lists-shared-with-me`      | `ListsSharedWithMeComponent`         | Browse-style grid of all lists shared with the current user                                 |
| `mj-list-stats`                | `ListStatsComponent`                 | Side-panel usage stats (members, monthly growth, active shares, recent-activity feed)       |
| `mj-tag-chips`                 | `TagChipsComponent`                  | Compact tag chips for any entity record (read-only + editable variants)                     |
| `mj-audience-source-picker`    | `AudienceSourcePickerComponent`      | Three-tab audience picker — List / View / Ad-hoc Filter — emits typed `AudienceSource`      |
| `mj-audience-source-summary`   | `AudienceSourceSummaryComponent`     | Compact friendly-name summary of a selected `AudienceSource`                                |

## Component reference

### `mj-list-delta-confirm`

The **only** UI path that emits a valid `DeltaToken` to apply a list
mutation. Two visual states — safe (green) and drop-warning (red with a
required acknowledgement checkbox).

```html
<mj-list-delta-confirm
  [Visible]="confirmVisible && !!delta"
  [Delta]="delta"
  [TargetListName]="listName"
  [SourceLabel]="sourceName"
  (Confirm)="onConfirm($event)"
  (Cancel)="onCancel()">
</mj-list-delta-confirm>
```

`(Confirm)` emits the `DeltaToken` string; pass it back to
`GraphQLListsClient.ApplyListDelta({ Delta, ConfirmDrops })`.

### `mj-save-view-as-list-dialog`

Materializes a User View into a new List. Surfaces the lineage
options (one-time snapshot vs. remember source view) and the
freeze-filter toggle (`UseSnapshot`).

```html
<mj-save-view-as-list-dialog
  [Provider]="provider"
  [Visible]="dialogVisible"
  [ViewId]="viewId"
  [ViewName]="viewName"
  [RecordCount]="viewRowCount"
  (Save)="onSaveAsList($event)"
  (Cancel)="onCancel()">
</mj-save-view-as-list-dialog>
```

`(Save)` emits a `SaveViewAsListResult` — caller invokes
`GraphQLListsClient.MaterializeFromView(viewId, opts)`.

### `mj-list-invitations`

Full invitations management for one list. Drives the `Invite` /
`RevokeInvitation` / "Resend" flows from `ListSharing`.

```html
<mj-list-invitations
  [Provider]="provider"
  [ListID]="listId"
  [ListName]="listName">
</mj-list-invitations>
```

### `mj-list-audit-log`

Per-list audit log viewer. Reads from `MJ: Audit Logs` filtered to the
List entity + this list's ID. Joins users + audit-log-types in a single
batch query so the table renders names, not UUIDs.

```html
<mj-list-audit-log
  [Provider]="provider"
  [ListID]="listId"
  [PageSize]="200">
</mj-list-audit-log>
```

### `mj-lists-shared-with-me`

Browse-style grid for lists shared with the current user. Click events
bubble up via `OpenList` so the host app can route through its own
navigation.

```html
<mj-lists-shared-with-me
  [Provider]="provider"
  (OpenList)="onOpenList($event.ListID)">
</mj-lists-shared-with-me>
```

### `mj-list-stats`

Compact side panel for a list detail view. Surfaces member count,
this-month growth, active share count, time-since-last-activity, and a
recent-activity feed pulled from the audit log.

```html
<mj-list-stats [Provider]="provider" [ListID]="listId"></mj-list-stats>
```

### `mj-tag-chips`

Compact, reusable tag chips for any entity record. Backed by
`MJ: Tagged Items`. Read-only by default; passing `[Editable]="true"`
shows an inline autocomplete add field and per-chip remove buttons.

```html
<!-- Read-only chips on a card -->
<mj-tag-chips
  [Provider]="provider"
  EntityName="MJ: Lists"
  [RecordID]="listId"
  [MaxDisplay]="3"
  (TagClicked)="onFilterByTag($event)">
</mj-tag-chips>

<!-- Editable chips on a detail view -->
<mj-tag-chips
  [Provider]="provider"
  EntityName="MJ: Lists"
  [RecordID]="listId"
  [Editable]="true"
  [MaxDisplay]="20">
</mj-tag-chips>
```

### `mj-audience-source-picker` + `mj-audience-source-summary`

Reusable audience picker for Communications and any other
audience-aware feature. Emits a typed `AudienceSource` discriminated
union (same shape as `ListSource` from `@memberjunction/lists`).

```html
<mj-audience-source-picker
  [Provider]="provider"
  [LockedEntityName]="entityName"
  [Source]="currentSource"
  (SourceChange)="audience = $event">
</mj-audience-source-picker>

<mj-audience-source-summary
  [Provider]="provider"
  [Source]="audience"
  [RecordCount]="resolvedCount">
</mj-audience-source-summary>
```

Three tabs: **List** (pick a saved `MJ: List`), **View** (pick a
`MJ: User View`, marked "live"), **Ad-hoc Filter** (entity + free-form
`ExtraFilter`).

## Services

| Service               | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `ListManagementService` | Add/remove/create list operations from the management dialog       |
| `ListSharingService`    | Direct share writes from the share dialog (Phase 1 path; new code prefer the server-side `ListSharing` via `GraphQLListsClient`) |

## Companion packages

For the underlying business logic and the wire-format client:

- [`@memberjunction/lists`](../../../Lists/README.md) — `ListOperations`,
  `ListSharing`, `AudienceResolver`, delta-token contract.
- [`@memberjunction/graphql-dataprovider`](../../../GraphQLDataProvider/README.md)
  — `GraphQLListsClient` (typed client mirroring the `ListOperationsResolver`).
- [`@memberjunction/core-actions`](../../../Actions/CoreActions/README.md)
  — `MaterializeListFromView`, `ShareList`, `Compose Lists`, `Move List Members`,
  `Resolve Audience`, etc. — every UI capability also available as an MJ Action.

## Dependencies

- [@memberjunction/core](../../MJCore/README.md) — `Metadata`, `RunView`
- [@memberjunction/core-entities](../../MJCoreEntities/README.md) — generated entity types
- [@memberjunction/lists](../../../Lists/README.md) — `AudienceSource`, `ListDelta`, `SharePermissionLevel`, etc.
- [@memberjunction/graphql-dataprovider](../../../GraphQLDataProvider/README.md) — `GraphQLListsClient`
- [@memberjunction/ng-base-types](../base-types/README.md) — `BaseAngularComponent` for multi-provider support
- [@memberjunction/ng-shared-generic](../shared/README.md) — loading component
- [@memberjunction/ng-ui-components](../ui-components/README.md) — `mj-dialog`, `mjButton`, etc.
