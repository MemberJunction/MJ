import { LogError } from '@memberjunction/core';
import type {
  AcceptInvitationResult,
  ApplyResult,
  InviteResult,
  ListDelta,
  ListDeltaWarning,
  ListRefreshMode,
  ListShareSummary,
  ListSource,
  MaterializeOptions,
  SetOpKind,
  SharePermissionLevel,
  SharedListSummary,
  ShareResult,
  ShareTarget,
} from '@memberjunction/lists';
import { gql } from 'graphql-request';

import type { GraphQLDataProvider } from './graphQLDataProvider';

/**
 * Typed client for the Lists Operations GraphQL surface. Mirrors
 * `@memberjunction/lists` 1:1 so callers (Angular, Actions, tests) get the
 * same type contract end-to-end. The client owns the wire-format mapping
 * (flat GraphQL inputs ↔ discriminated TypeScript unions) so consumers
 * don't need to learn the GraphQL surface.
 */
export class GraphQLListsClient {
  private readonly dataProvider: GraphQLDataProvider;

  constructor(dataProvider: GraphQLDataProvider) {
    this.dataProvider = dataProvider;
  }

  /** Preview a delta. Never mutates. The returned token is required by `ApplyDelta`. */
  public async PreviewListDelta(args: {
    Target: string | 'new';
    Source: ListSource;
    Mode: ListRefreshMode;
  }): Promise<ListDelta> {
    const query = gql`
      query PreviewListDelta($input: ComputeDeltaInput!) {
        PreviewListDelta(input: $input) {
          ...ListDeltaFields
        }
      }
      ${LIST_DELTA_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(query, {
      input: {
        Target: args.Target,
        Source: serializeListSource(args.Source),
        Mode: args.Mode,
      },
    });
    return parseListDelta(result?.PreviewListDelta);
  }

  /** Apply a previously-previewed delta. Server enforces the drop guard regardless of UI. */
  public async ApplyListDelta(args: {
    Delta: ListDelta;
    ConfirmDrops: boolean;
  }): Promise<ApplyResult> {
    const mutation = gql`
      mutation ApplyListDelta($input: ApplyDeltaInput!) {
        ApplyListDelta(input: $input) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      input: {
        TargetListId: args.Delta.TargetListId,
        EntityName: args.Delta.EntityName,
        ToAdd: args.Delta.ToAdd,
        ToRemove: args.Delta.ToRemove,
        Unchanged: args.Delta.Unchanged,
        AddCount: args.Delta.Counts.Add,
        RemoveCount: args.Delta.Counts.Remove,
        UnchangedCount: args.Delta.Counts.Unchanged,
        SourceTotal: args.Delta.Counts.SourceTotal,
        TargetTotal: args.Delta.Counts.TargetTotal,
        DeltaToken: args.Delta.DeltaToken,
        ConfirmDrops: args.ConfirmDrops,
      },
    });
    return parseApplyResult(result?.ApplyListDelta);
  }

  public async MaterializeFromView(viewId: string, options: MaterializeOptions): Promise<ApplyResult> {
    const mutation = gql`
      mutation MaterializeListFromView($viewId: String!, $options: MaterializeOptionsInput!) {
        MaterializeListFromView(viewId: $viewId, options: $options) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      viewId,
      options: {
        ListName: options.ListName,
        CategoryId: options.CategoryId,
        Description: options.Description,
        RememberLineage: options.RememberLineage,
        UseSnapshot: options.UseSnapshot,
        RefreshMode: options.RefreshMode,
      },
    });
    return parseApplyResult(result?.MaterializeListFromView);
  }

  public async AddViewResultsToList(viewId: string, listId: string): Promise<ApplyResult> {
    const mutation = gql`
      mutation AddViewResultsToList($viewId: String!, $listId: String!) {
        AddViewResultsToList(viewId: $viewId, listId: $listId) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, { viewId, listId });
    return parseApplyResult(result?.AddViewResultsToList);
  }

  public async RefreshFromSource(args: {
    ListId: string;
    Mode: ListRefreshMode;
    ConfirmDrops: boolean;
  }): Promise<ApplyResult> {
    const mutation = gql`
      mutation RefreshListFromSource($listId: String!, $mode: String!, $confirmDrops: Boolean!) {
        RefreshListFromSource(listId: $listId, mode: $mode, confirmDrops: $confirmDrops) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      listId: args.ListId,
      mode: args.Mode,
      confirmDrops: args.ConfirmDrops,
    });
    return parseApplyResult(result?.RefreshListFromSource);
  }

  public async ComposeLists(args: {
    Op: SetOpKind;
    Inputs: ListSource[];
    Target?: ListSource;
  }): Promise<ListDelta> {
    const mutation = gql`
      mutation ComposeLists($input: ComposeListsInput!) {
        ComposeLists(input: $input) {
          ...ListDeltaFields
        }
      }
      ${LIST_DELTA_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      input: {
        Op: args.Op,
        Inputs: args.Inputs.map(serializeListSource),
        Target: args.Target ? serializeListSource(args.Target) : null,
      },
    });
    return parseListDelta(result?.ComposeLists);
  }

  // -------------------------------------------------------------------------
  // Sharing (Phase 2)
  // -------------------------------------------------------------------------

  /** Direct user/role share. Mirrors `ListSharing.Share`. */
  public async Share(args: {
    ListID: string;
    Target: ShareTarget;
    PermissionLevel: SharePermissionLevel;
  }): Promise<ShareResult> {
    const mutation = gql`
      mutation ShareList($input: ShareListInput!) {
        ShareList(input: $input) {
          ...ShareResultFields
        }
      }
      ${SHARE_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      input: {
        ListID: args.ListID,
        Target: serializeShareTarget(args.Target),
        PermissionLevel: args.PermissionLevel,
      },
    });
    return parseShareResult(result?.ShareList);
  }

  /** Revoke an existing share permission. */
  public async Unshare(permissionId: string): Promise<ShareResult> {
    const mutation = gql`
      mutation UnshareList($permissionId: String!) {
        UnshareList(permissionId: $permissionId) {
          ...ShareResultFields
        }
      }
      ${SHARE_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, { permissionId });
    return parseShareResult(result?.UnshareList);
  }

  /** Send an email invitation. Returns the invitation token — the caller
   *  is expected to build an accept URL from it.  */
  public async Invite(args: {
    ListID: string;
    Email: string;
    Role: 'Editor' | 'Viewer';
    TtlHours?: number;
  }): Promise<InviteResult> {
    const mutation = gql`
      mutation InviteToList($input: InviteToListInput!) {
        InviteToList(input: $input) {
          Success
          ResultCode
          Message
          InvitationID
          Token
          ExpiresAt
        }
      }
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      input: { ListID: args.ListID, Email: args.Email, Role: args.Role, TtlHours: args.TtlHours },
    });
    const raw = result?.InviteToList as
      | {
          Success: boolean;
          ResultCode: InviteResult['ResultCode'];
          Message: string;
          InvitationID?: string | null;
          Token?: string | null;
          ExpiresAt?: string | null;
        }
      | undefined;
    if (!raw) throw new Error('GraphQLListsClient: empty InviteResult response');
    return {
      Success: raw.Success,
      ResultCode: raw.ResultCode,
      Message: raw.Message,
      InvitationID: raw.InvitationID ?? undefined,
      Token: raw.Token ?? undefined,
      ExpiresAt: raw.ExpiresAt ? new Date(raw.ExpiresAt) : undefined,
    };
  }

  /** Accept a pending invitation by token. The caller is the new recipient. */
  public async AcceptInvitation(token: string): Promise<AcceptInvitationResult> {
    const mutation = gql`
      mutation AcceptListInvitation($token: String!) {
        AcceptListInvitation(token: $token) {
          Success
          ResultCode
          Message
          PermissionID
          ListID
        }
      }
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, { token });
    const raw = result?.AcceptListInvitation as
      | { Success: boolean; ResultCode: AcceptInvitationResult['ResultCode']; Message: string; PermissionID?: string | null; ListID?: string | null }
      | undefined;
    if (!raw) throw new Error('GraphQLListsClient: empty AcceptInvitation response');
    return {
      Success: raw.Success,
      ResultCode: raw.ResultCode,
      Message: raw.Message,
      PermissionID: raw.PermissionID ?? undefined,
      ListID: raw.ListID ?? undefined,
    };
  }

  /** Revoke a pending invitation. No-op once accepted (caller should
   *  `Unshare` the resulting permission instead). */
  public async RevokeInvitation(invitationId: string): Promise<ShareResult> {
    const mutation = gql`
      mutation RevokeListInvitation($invitationId: String!) {
        RevokeListInvitation(invitationId: $invitationId) {
          ...ShareResultFields
        }
      }
      ${SHARE_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, { invitationId });
    return parseShareResult(result?.RevokeListInvitation);
  }

  /** All current (non-revoked) shares for a list. */
  public async GetSharesForList(listId: string): Promise<ListShareSummary[]> {
    const query = gql`
      query ListSharesForList($listId: String!) {
        ListSharesForList(listId: $listId) {
          PermissionID
          ListID
          Target {
            Kind
            UserID
            RoleID
          }
          PermissionLevel
          Status
          SharedByUserID
          CreatedAt
        }
      }
    `;
    const result = await this.dataProvider.ExecuteGQL(query, { listId });
    const rows = (result?.ListSharesForList as unknown[]) ?? [];
    return rows.map(parseShareSummary);
  }

  /** All lists shared with the current user. Drives the "Shared With Me" tab. */
  public async ListsSharedWithMe(): Promise<SharedListSummary[]> {
    const query = gql`
      query ListsSharedWithMe {
        ListsSharedWithMe {
          ListID
          ListName
          PermissionLevel
          SharedByUserID
          SharedAt
        }
      }
    `;
    const result = await this.dataProvider.ExecuteGQL(query, {});
    const rows = (result?.ListsSharedWithMe as Array<{
      ListID: string;
      ListName: string;
      PermissionLevel: SharePermissionLevel;
      SharedByUserID?: string | null;
      SharedAt: string;
    }>) ?? [];
    return rows.map((r) => ({
      ListID: r.ListID,
      ListName: r.ListName,
      PermissionLevel: r.PermissionLevel,
      SharedByUserID: r.SharedByUserID ?? null,
      SharedAt: new Date(r.SharedAt),
    }));
  }
}

// ---------------------------------------------------------------------------
// Wire-format helpers — kept private to the file so callers can't bypass
// the parse / serialize boundary.
// ---------------------------------------------------------------------------

const LIST_DELTA_FRAGMENT = gql`
  fragment ListDeltaFields on ListDeltaType {
    TargetListId
    EntityName
    ToAdd
    ToRemove
    Unchanged
    Counts {
      Add
      Remove
      Unchanged
      SourceTotal
      TargetTotal
    }
    Warnings {
      Code
      Message
      DetailsJSON
    }
    DeltaToken
  }
`;

const APPLY_RESULT_FRAGMENT = gql`
  fragment ApplyResultFields on ApplyListResultType {
    Success
    ResultCode
    Message
    CreatedListId
    TargetListId
    AddedCount
    RemovedCount
    FailedCount
    Errors
  }
`;

const SHARE_RESULT_FRAGMENT = gql`
  fragment ShareResultFields on ShareResultType {
    Success
    ResultCode
    Message
    PermissionID
  }
`;

function serializeShareTarget(target: ShareTarget): Record<string, unknown> {
  return target.kind === 'user'
    ? { Kind: 'user', UserID: target.userId }
    : { Kind: 'role', RoleID: target.roleId };
}

function parseShareResult(raw: unknown): ShareResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('GraphQLListsClient: empty/invalid ShareResult response');
  }
  const r = raw as { Success: boolean; ResultCode: ShareResult['ResultCode']; Message: string; PermissionID?: string | null };
  return {
    Success: r.Success,
    ResultCode: r.ResultCode,
    Message: r.Message,
    PermissionID: r.PermissionID ?? undefined,
  };
}

function parseShareSummary(raw: unknown): ListShareSummary {
  const r = raw as {
    PermissionID: string;
    ListID: string;
    Target: { Kind: 'user' | 'role'; UserID?: string | null; RoleID?: string | null };
    PermissionLevel: SharePermissionLevel;
    Status: ListShareSummary['Status'];
    SharedByUserID?: string | null;
    CreatedAt: string;
  };
  const target: ShareTarget =
    r.Target.Kind === 'user'
      ? { kind: 'user', userId: r.Target.UserID! }
      : { kind: 'role', roleId: r.Target.RoleID! };
  return {
    PermissionID: r.PermissionID,
    ListID: r.ListID,
    Target: target,
    PermissionLevel: r.PermissionLevel,
    Status: r.Status,
    SharedByUserID: r.SharedByUserID ?? null,
    CreatedAt: new Date(r.CreatedAt),
  };
}

function serializeListSource(src: ListSource): Record<string, unknown> {
  switch (src.kind) {
    case 'list':
      return { Kind: 'list', ListID: src.listId };
    case 'view':
      return { Kind: 'view', ViewID: src.viewId };
    case 'adhoc':
      return { Kind: 'adhoc', EntityName: src.entityName, ExtraFilter: src.extraFilter };
  }
}

function parseListDelta(raw: unknown): ListDelta {
  if (!raw || typeof raw !== 'object') {
    throw new Error('GraphQLListsClient: empty/invalid ListDelta response from server');
  }
  const r = raw as {
    TargetListId: string | null;
    EntityName: string;
    ToAdd: string[];
    ToRemove: string[];
    Unchanged: string[];
    Counts: { Add: number; Remove: number; Unchanged: number; SourceTotal: number; TargetTotal: number };
    Warnings: Array<{ Code: string; Message: string; DetailsJSON?: string }>;
    DeltaToken: string;
  };
  return {
    TargetListId: r.TargetListId,
    EntityName: r.EntityName,
    ToAdd: r.ToAdd,
    ToRemove: r.ToRemove,
    Unchanged: r.Unchanged,
    Counts: r.Counts,
    Warnings: r.Warnings.map(parseWarning),
    DeltaToken: r.DeltaToken,
  };
}

function parseWarning(w: { Code: string; Message: string; DetailsJSON?: string }): ListDeltaWarning {
  let details: Record<string, unknown> | undefined;
  if (w.DetailsJSON) {
    try {
      details = JSON.parse(w.DetailsJSON) as Record<string, unknown>;
    } catch (e) {
      LogError(`GraphQLListsClient: failed to parse warning details JSON: ${e}`);
    }
  }
  return {
    Code: w.Code as ListDeltaWarning['Code'],
    Message: w.Message,
    Details: details,
  };
}

function parseApplyResult(raw: unknown): ApplyResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('GraphQLListsClient: empty/invalid ApplyResult response from server');
  }
  const r = raw as {
    Success: boolean;
    ResultCode: string;
    Message: string;
    CreatedListId?: string | null;
    TargetListId?: string | null;
    AddedCount?: number | null;
    RemovedCount?: number | null;
    FailedCount?: number | null;
    Errors?: string[] | null;
  };
  return {
    Success: r.Success,
    ResultCode: r.ResultCode as ApplyResult['ResultCode'],
    Message: r.Message,
    CreatedListId: r.CreatedListId ?? undefined,
    TargetListId: r.TargetListId ?? undefined,
    Counts:
      r.AddedCount != null || r.RemovedCount != null || r.FailedCount != null
        ? {
            Added: r.AddedCount ?? 0,
            Removed: r.RemovedCount ?? 0,
            Failed: r.FailedCount ?? 0,
          }
        : undefined,
    Errors: r.Errors ?? undefined,
  };
}
