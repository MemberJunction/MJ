import { LogError } from '@memberjunction/core';
import type {
  AcceptInvitationResult,
  ApplyResult,
  CreateListFromQueryRequest,
  CreateListFromQueryResult,
  InviteResult,
  ListDelta,
  ListDeltaWarning,
  ListRefreshMode,
  ListRefreshPreview,
  ListRefreshPreviewOptions,
  ListShareSummary,
  ListSource,
  ListSourceChange,
  MaterializeOptions,
  SetOpKind,
  SharePermissionLevel,
  SharedListSummary,
  ShareResult,
  ShareTarget,
} from '@memberjunction/lists-base';
import { gql } from 'graphql-request';

import type { GraphQLDataProvider } from './graphQLDataProvider';

/**
 * Typed client for the Lists Operations GraphQL surface. Mirrors the
 * `@memberjunction/lists-base` type surface 1:1 so callers (Angular,
 * Actions, tests) get the same type contract end-to-end. The client owns
 * the wire-format mapping (flat GraphQL inputs ↔ discriminated TypeScript
 * unions) so consumers don't need to learn the GraphQL surface.
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
      input: serializeApplyDeltaInput(args.Delta, args.ConfirmDrops),
    });
    return parseApplyResult(result?.ApplyListDelta);
  }

  /**
   * Preview refreshing a list from its linked source, view or query. Never mutates. A changed
   * source returns `SOURCE_CHANGED` with `SourceChange` set, unless the owner passes
   * `AcceptCurrentSource` to preview what approving the change would apply.
   */
  public async PreviewRefresh(listId: string, options: ListRefreshPreviewOptions = {}): Promise<ListRefreshPreview> {
    const query = gql`
      query PreviewListRefresh($listId: String!, $mode: String, $acceptCurrentSource: Boolean, $parametersJSON: String) {
        PreviewListRefresh(listId: $listId, mode: $mode, acceptCurrentSource: $acceptCurrentSource, parametersJSON: $parametersJSON) {
          Success
          ResultCode
          Message
          Delta {
            ...ListDeltaFields
          }
          SourceChange {
            ...SourceChangeFields
          }
        }
      }
      ${LIST_DELTA_FRAGMENT}
      ${SOURCE_CHANGE_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(query, {
      listId,
      mode: options.Mode ?? null,
      acceptCurrentSource: options.AcceptCurrentSource ?? false,
      parametersJSON: options.Parameters ? JSON.stringify(options.Parameters) : null,
    });
    return parseRefreshPreview(result?.PreviewListRefresh);
  }

  /** Apply a delta from {@link PreviewRefresh}. The server re-checks the source and keeps the drop guard. */
  public async ApplyRefresh(args: { Delta: ListDelta; ConfirmDrops: boolean }): Promise<ApplyResult> {
    const mutation = gql`
      mutation ApplyListRefresh($input: ApplyDeltaInput!) {
        ApplyListRefresh(input: $input) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      input: serializeApplyDeltaInput(args.Delta, args.ConfirmDrops),
    });
    return parseApplyResult(result?.ApplyListRefresh);
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

  /**
   * Creates a list from a saved query, or from SQL written in a conversation, linked so it refreshes.
   * SQL gets the server's ad-hoc SQL checks and is saved as a Pending query in the caller's User
   * Lists. When the caller can't save queries, the list is still made, with `Refreshes: false` and
   * `StaticReason` saying why.
   */
  public async CreateListFromQuery(request: CreateListFromQueryRequest): Promise<CreateListFromQueryResult> {
    const mutation = gql`
      mutation CreateListFromQuery($input: CreateListFromQueryInput!) {
        CreateListFromQuery(input: $input) {
          ...CreateListFromQueryResultFields
        }
      }
      ${CREATE_LIST_FROM_QUERY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      input: {
        ListName: request.ListName,
        Description: request.Description,
        CategoryID: request.CategoryID,
        QueryID: request.QueryID,
        SQL: request.SQL,
        EntityName: request.EntityName,
        KeyField: request.KeyField,
        ParametersJSON: request.Parameters ? JSON.stringify(request.Parameters) : undefined,
        RefreshMode: request.RefreshMode,
        AutoRefresh: request.AutoRefresh,
      },
    });
    const raw = result?.CreateListFromQuery as
      | { SourceQueryID?: string | null; SourceQueryName?: string | null; SavedNewQuery?: boolean; Refreshes?: boolean; StaticReason?: string | null }
      | undefined;
    return {
      ...parseApplyResult(result?.CreateListFromQuery),
      SourceQueryID: raw?.SourceQueryID ?? undefined,
      SourceQueryName: raw?.SourceQueryName ?? undefined,
      SavedNewQuery: raw?.SavedNewQuery ?? false,
      Refreshes: raw?.Refreshes ?? false,
      StaticReason: raw?.StaticReason ?? undefined,
    };
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

  /**
   * Adds records to a list on the server. Records the list already holds are skipped.
   * `recordIds` are in `MJ: List Details.RecordID` form. `opts.Status` is the status of the new
   * members; `opts.SequenceFromOrder` saves each new member's input position as its `Sequence`.
   */
  public async AddRecordsToList(
    listId: string,
    recordIds: readonly string[],
    opts?: { Status?: string; SequenceFromOrder?: boolean },
  ): Promise<ApplyResult> {
    if (opts) return this.addRecordsToListWithOptions(listId, recordIds, opts);
    const mutation = gql`
      mutation AddRecordsToList($listId: String!, $recordIds: [String!]!) {
        AddRecordsToList(listId: $listId, recordIds: $recordIds) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, { listId, recordIds });
    return parseApplyResult(result?.AddRecordsToList);
  }

  /** `AddRecordsToList` with the status and sequence arguments. */
  private async addRecordsToListWithOptions(
    listId: string,
    recordIds: readonly string[],
    opts: { Status?: string; SequenceFromOrder?: boolean },
  ): Promise<ApplyResult> {
    const mutation = gql`
      mutation AddRecordsToList($listId: String!, $recordIds: [String!]!, $status: String, $sequenceFromOrder: Boolean) {
        AddRecordsToList(listId: $listId, recordIds: $recordIds, status: $status, sequenceFromOrder: $sequenceFromOrder) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const variables = { listId, recordIds, status: opts.Status ?? null, sequenceFromOrder: opts.SequenceFromOrder === true };
    const result = await this.dataProvider.ExecuteGQL(mutation, variables);
    return parseApplyResult(result?.AddRecordsToList);
  }

  /** Removes records from a list on the server. Records the list does not hold are ignored. */
  public async RemoveRecordsFromList(listId: string, recordIds: readonly string[]): Promise<ApplyResult> {
    const mutation = gql`
      mutation RemoveRecordsFromList($listId: String!, $recordIds: [String!]!) {
        RemoveRecordsFromList(listId: $listId, recordIds: $recordIds) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, { listId, recordIds });
    return parseApplyResult(result?.RemoveRecordsFromList);
  }

  /**
   * Copies a list and all its members into a new plain list owned by the caller. With no
   * `listName`, the name is the source name followed by " (Copy)". `CreatedListId` is the new list.
   */
  public async DuplicateList(listId: string, listName?: string): Promise<ApplyResult> {
    const mutation = gql`
      mutation DuplicateList($listId: String!, $listName: String) {
        DuplicateList(listId: $listId, listName: $listName) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, { listId, listName: listName ?? null });
    return parseApplyResult(result?.DuplicateList);
  }

  /**
   * Copies records from one list to another. With `RemoveFromSource` the records are then removed
   * from the source list, but only when every add succeeded; otherwise the result is
   * `PARTIAL_SUCCESS` and the source is unchanged.
   */
  public async CopyRecordsToList(args: {
    SourceListId: string;
    TargetListId: string;
    RecordIds: readonly string[];
    RemoveFromSource: boolean;
  }): Promise<ApplyResult> {
    const mutation = gql`
      mutation CopyRecordsToList($sourceListId: String!, $targetListId: String!, $recordIds: [String!]!, $removeFromSource: Boolean!) {
        CopyRecordsToList(sourceListId: $sourceListId, targetListId: $targetListId, recordIds: $recordIds, removeFromSource: $removeFromSource) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      sourceListId: args.SourceListId,
      targetListId: args.TargetListId,
      recordIds: args.RecordIds,
      removeFromSource: args.RemoveFromSource,
    });
    return parseApplyResult(result?.CopyRecordsToList);
  }

  /**
   * Sets the Status of list members on the server. `status` must be a `MJ: List Details.Status`
   * value or the result is `UNEXPECTED_ERROR`. `Counts.Updated` is the number of members changed.
   */
  public async SetRecordStatus(listId: string, recordIds: readonly string[], status: string): Promise<ApplyResult> {
    const mutation = gql`
      mutation SetListRecordStatus($listId: String!, $recordIds: [String!]!, $status: String!) {
        SetListRecordStatus(listId: $listId, recordIds: $recordIds, status: $status) {
          ...ApplyResultFields
          UpdatedCount
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, { listId, recordIds, status });
    return parseApplyResult(result?.SetListRecordStatus);
  }

  /** Creates a plain list (no source, never refreshes) holding the given records of an entity. */
  public async CreateListFromRecords(args: {
    EntityName: string;
    RecordIds: readonly string[];
    ListName: string;
    Description?: string;
    CategoryId?: string;
  }): Promise<ApplyResult> {
    const mutation = gql`
      mutation CreateListFromRecords($entityName: String!, $recordIds: [String!]!, $options: CreateListFromRecordsInput!) {
        CreateListFromRecords(entityName: $entityName, recordIds: $recordIds, options: $options) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      entityName: args.EntityName,
      recordIds: args.RecordIds,
      options: { ListName: args.ListName, Description: args.Description, CategoryId: args.CategoryId },
    });
    return parseApplyResult(result?.CreateListFromRecords);
  }

  /**
   * Refresh a list from its linked source. Leave `Mode` out to use the list's own RefreshMode.
   * When the source changed since it was approved, nothing is applied: the result is
   * `SOURCE_CHANGED` with `SourceChange` set, until the owner calls {@link ApproveSource}.
   */
  public async RefreshFromSource(args: {
    ListId: string;
    Mode?: ListRefreshMode | null;
    ConfirmDrops: boolean;
  }): Promise<ApplyResult> {
    const mutation = gql`
      mutation RefreshListFromSource($listId: String!, $mode: String, $confirmDrops: Boolean!) {
        RefreshListFromSource(listId: $listId, mode: $mode, confirmDrops: $confirmDrops) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      listId: args.ListId,
      mode: args.Mode ?? null,
      confirmDrops: args.ConfirmDrops,
    });
    return parseApplyResult(result?.RefreshListFromSource);
  }

  /**
   * The list owner approves its source's current definition, and for a query source optionally
   * new parameter values. A paused refresh routine resumes and the list refreshes right away.
   */
  public async ApproveSource(args: {
    ListId: string;
    ConfirmDrops: boolean;
    Parameters?: Record<string, unknown>;
  }): Promise<ApplyResult> {
    const mutation = gql`
      mutation ApproveListSource($listId: String!, $confirmDrops: Boolean!, $parametersJSON: String) {
        ApproveListSource(listId: $listId, confirmDrops: $confirmDrops, parametersJSON: $parametersJSON) {
          ...ApplyResultFields
        }
      }
      ${APPLY_RESULT_FRAGMENT}
    `;
    const result = await this.dataProvider.ExecuteGQL(mutation, {
      listId: args.ListId,
      confirmDrops: args.ConfirmDrops,
      parametersJSON: args.Parameters ? JSON.stringify(args.Parameters) : null,
    });
    return parseApplyResult(result?.ApproveListSource);
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

const SOURCE_CHANGE_FRAGMENT = gql`
  fragment SourceChangeFields on ListSourceChangeType {
    SourceKind
    SourceID
    SourceName
    ChangedAt
    LinkedFingerprint
    CurrentFingerprint
  }
`;

/** The fields of an apply result, shared by every result type that carries them. */
const APPLY_RESULT_SELECTION = `
    Success
    ResultCode
    Message
    CreatedListId
    TargetListId
    AddedCount
    RemovedCount
    FailedCount
    Errors
    SourceChange {
      ...SourceChangeFields
    }
`;

const APPLY_RESULT_FRAGMENT = gql`
  fragment ApplyResultFields on ApplyListResultType {
    ${APPLY_RESULT_SELECTION}
  }
  ${SOURCE_CHANGE_FRAGMENT}
`;

/**
 * `CreateListFromQueryResult` is its own GraphQL type (the server class extends
 * `ApplyListResultType`, which copies the fields, not the type), so a fragment on
 * `ApplyListResultType` can't be spread into it.
 */
const CREATE_LIST_FROM_QUERY_RESULT_FRAGMENT = gql`
  fragment CreateListFromQueryResultFields on CreateListFromQueryResult {
    ${APPLY_RESULT_SELECTION}
    SourceQueryID
    SourceQueryName
    SavedNewQuery
    Refreshes
    StaticReason
  }
  ${SOURCE_CHANGE_FRAGMENT}
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
    UpdatedCount?: number | null;
    Errors?: string[] | null;
    SourceChange?: WireSourceChange | null;
  };
  return {
    Success: r.Success,
    ResultCode: r.ResultCode as ApplyResult['ResultCode'],
    Message: r.Message,
    CreatedListId: r.CreatedListId ?? undefined,
    TargetListId: r.TargetListId ?? undefined,
    Counts:
      r.AddedCount != null || r.RemovedCount != null || r.FailedCount != null || r.UpdatedCount != null
        ? {
            Added: r.AddedCount ?? 0,
            Removed: r.RemovedCount ?? 0,
            Failed: r.FailedCount ?? 0,
            ...(r.UpdatedCount != null ? { Updated: r.UpdatedCount } : {}),
          }
        : undefined,
    Errors: r.Errors ?? undefined,
    SourceChange: r.SourceChange ? parseSourceChange(r.SourceChange) : undefined,
  };
}

function serializeApplyDeltaInput(delta: ListDelta, confirmDrops: boolean): Record<string, unknown> {
  return {
    TargetListId: delta.TargetListId,
    EntityName: delta.EntityName,
    ToAdd: delta.ToAdd,
    ToRemove: delta.ToRemove,
    Unchanged: delta.Unchanged,
    AddCount: delta.Counts.Add,
    RemoveCount: delta.Counts.Remove,
    UnchangedCount: delta.Counts.Unchanged,
    SourceTotal: delta.Counts.SourceTotal,
    TargetTotal: delta.Counts.TargetTotal,
    DeltaToken: delta.DeltaToken,
    ConfirmDrops: confirmDrops,
  };
}

function parseRefreshPreview(raw: unknown): ListRefreshPreview {
  if (!raw || typeof raw !== 'object') {
    throw new Error('GraphQLListsClient: empty/invalid PreviewListRefresh response from server');
  }
  const r = raw as {
    Success: boolean;
    ResultCode: string;
    Message: string;
    Delta?: unknown;
    SourceChange?: WireSourceChange | null;
  };
  return {
    Success: r.Success,
    ResultCode: r.ResultCode as ListRefreshPreview['ResultCode'],
    Message: r.Message,
    Delta: r.Delta ? parseListDelta(r.Delta) : undefined,
    SourceChange: r.SourceChange ? parseSourceChange(r.SourceChange) : undefined,
  };
}

/** `ListSourceChange` as it arrives over the wire: the date is a string. */
interface WireSourceChange {
  SourceKind: ListSourceChange['SourceKind'];
  SourceID: string;
  SourceName: string;
  ChangedAt?: string | null;
  LinkedFingerprint: string;
  CurrentFingerprint: string;
}

function parseSourceChange(c: WireSourceChange): ListSourceChange {
  return {
    SourceKind: c.SourceKind,
    SourceID: c.SourceID,
    SourceName: c.SourceName,
    ChangedAt: c.ChangedAt ? new Date(c.ChangedAt) : null,
    LinkedFingerprint: c.LinkedFingerprint,
    CurrentFingerprint: c.CurrentFingerprint,
  };
}
