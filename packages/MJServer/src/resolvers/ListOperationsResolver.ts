import { LogError, UserInfo } from '@memberjunction/core';
import { type CheckedCallerSQL, ListFromQuery, type ListFromQueryOutcome, type ListFromQueryRequest, ListOperations, ListSharing } from '@memberjunction/lists';
import type {
  ApplyResult as CoreApplyResult,
  ListDelta as CoreListDelta,
  ListDeltaWarning as CoreListDeltaWarning,
  ListRefreshPreview as CoreListRefreshPreview,
  ListShareSummary,
  ListSource as CoreListSource,
  ListSourceChange as CoreListSourceChange,
  MaterializeOptions as CoreMaterializeOptions,
  SetOpKind,
  SharePermissionLevel,
  SharedListSummary,
  ShareTarget,
} from '@memberjunction/lists-base';
import { Arg, Ctx, Field, InputType, Int, Mutation, ObjectType, Query, Resolver } from 'type-graphql';

import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';
import { GetReadOnlyProvider, GetReadWriteProvider } from '../util.js';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';
import { ActionEngineServer } from '@memberjunction/actions';

// ---------------------------------------------------------------------------
// GraphQL types — mirror the @memberjunction/lists shape one-to-one.
//
// Why duplicate: GraphQL types must be decorated with `@ObjectType` /
// `@InputType` / `@Field`, but @memberjunction/lists is intentionally
// framework-agnostic and ships zero type-graphql metadata. The duplication
// stays cheap because there's a single converter at each boundary
// (`fromCoreDelta`, `toCoreSource`) — drift gets caught at compile time
// when fields change shape.
// ---------------------------------------------------------------------------

/**
 * Discriminated source descriptor as a flat input. GraphQL does not support
 * tagged unions in inputs, so we encode the discriminator in `Kind` and
 * the variant-specific payload in optional fields. Runtime validation
 * enforces the right field-presence per kind.
 */
@InputType('ListSourceInput')
export class ListSourceInput {
  @Field(() => String, { description: 'Discriminator. One of: list | view | adhoc.' })
  Kind!: 'list' | 'view' | 'adhoc';

  @Field(() => String, { nullable: true, description: 'List ID, required when Kind=list.' })
  ListID?: string;

  @Field(() => String, { nullable: true, description: 'User View ID, required when Kind=view.' })
  ViewID?: string;

  @Field(() => String, { nullable: true, description: 'Entity name, required when Kind=adhoc.' })
  EntityName?: string;

  @Field(() => String, { nullable: true, description: 'WHERE clause expression, required when Kind=adhoc.' })
  ExtraFilter?: string;
}

@InputType('MaterializeOptionsInput')
export class MaterializeOptionsInput {
  @Field(() => String) ListName!: string;
  @Field(() => String, { nullable: true }) CategoryId?: string;
  @Field(() => String, { nullable: true }) Description?: string;
  @Field(() => Boolean) RememberLineage!: boolean;
  @Field(() => Boolean) UseSnapshot!: boolean;

  @Field(() => String, { description: 'Refresh mode: Additive | Sync.' })
  RefreshMode!: 'Additive' | 'Sync';
}

@ObjectType('ListDeltaCountsType')
export class ListDeltaCountsType {
  @Field(() => Int) Add!: number;
  @Field(() => Int) Remove!: number;
  @Field(() => Int) Unchanged!: number;
  @Field(() => Int) SourceTotal!: number;
  @Field(() => Int) TargetTotal!: number;
}

@ObjectType('ListDeltaWarningType')
export class ListDeltaWarningType {
  @Field(() => String) Code!: string;
  @Field(() => String) Message!: string;
  /** Structured payload, JSON-stringified for GraphQL-over-the-wire portability. */
  @Field(() => String, { nullable: true }) DetailsJSON?: string;
}

@ObjectType('ListDeltaType')
export class ListDeltaType {
  @Field(() => String, { nullable: true }) TargetListId?: string | null;
  @Field(() => String) EntityName!: string;
  @Field(() => [String]) ToAdd!: string[];
  @Field(() => [String]) ToRemove!: string[];
  @Field(() => [String]) Unchanged!: string[];
  @Field(() => ListDeltaCountsType) Counts!: ListDeltaCountsType;
  @Field(() => [ListDeltaWarningType]) Warnings!: ListDeltaWarningType[];
  @Field(() => String) DeltaToken!: string;
}

@ObjectType('ListSourceChangeType', {
  description: 'The source query or view of a list changed after the list was linked to it, or after its owner last approved it.',
})
export class ListSourceChangeType {
  @Field(() => String, { description: 'view | query' }) SourceKind!: 'view' | 'query';
  @Field(() => String) SourceID!: string;
  @Field(() => String) SourceName!: string;
  @Field(() => Date, { nullable: true, description: 'When the source was last saved, if known.' }) ChangedAt?: Date | null;
  @Field(() => String) LinkedFingerprint!: string;
  @Field(() => String) CurrentFingerprint!: string;
}

@ObjectType('ListRefreshPreviewType', {
  description: 'What refreshing a list from its source would change. Apply its Delta with ApplyListRefresh.',
})
export class ListRefreshPreviewType {
  @Field(() => Boolean) Success!: boolean;
  @Field(() => String) ResultCode!: string;
  @Field(() => String) Message!: string;
  @Field(() => ListDeltaType, { nullable: true }) Delta?: ListDeltaType;
  @Field(() => ListSourceChangeType, { nullable: true, description: 'Set when ResultCode is SOURCE_CHANGED.' })
  SourceChange?: ListSourceChangeType;
}

@ObjectType('ApplyListResultType')
export class ApplyListResultType {
  @Field(() => Boolean) Success!: boolean;
  @Field(() => String) ResultCode!: string;
  @Field(() => String) Message!: string;
  @Field(() => String, { nullable: true }) CreatedListId?: string;
  @Field(() => String, { nullable: true }) TargetListId?: string;
  @Field(() => Int, { nullable: true }) AddedCount?: number;
  @Field(() => Int, { nullable: true }) RemovedCount?: number;
  @Field(() => Int, { nullable: true }) FailedCount?: number;
  @Field(() => [String], { nullable: true }) Errors?: string[];
  @Field(() => ListSourceChangeType, { nullable: true, description: 'Set when ResultCode is SOURCE_CHANGED.' })
  SourceChange?: ListSourceChangeType;
}

@InputType('CreateListFromQueryInput')
export class CreateListFromQueryInput {
  @Field(() => String) ListName!: string;
  @Field(() => String, { nullable: true }) Description?: string;
  @Field(() => String, { nullable: true, description: 'List Category to file the new list under.' }) CategoryID?: string;
  @Field(() => String, { nullable: true, description: 'A saved query to link the list to. Pass QueryID or SQL, not both.' })
  QueryID?: string;
  @Field(() => String, {
    nullable: true,
    description: 'SQL written in a conversation. It gets the ExecuteAdhocQuery checks, is saved as a Pending query in the caller\'s User Lists, and the list is linked to it.',
  })
  SQL?: string;
  @Field(() => String, { nullable: true, description: 'Required with SQL: the entity whose records the query returns.' }) EntityName?: string;
  @Field(() => String, { nullable: true, description: "The query column holding the entity's primary key." }) KeyField?: string;
  @Field(() => String, { nullable: true, description: "For a saved query: its parameter values, as a JSON object." }) ParametersJSON?: string;
  @Field(() => String, { description: 'Refresh mode: Additive | Sync.' }) RefreshMode!: 'Additive' | 'Sync';
  @Field(() => Boolean, { description: 'Refresh the list on the Lists app schedule.' }) AutoRefresh!: boolean;
}

@ObjectType('CreateListFromQueryResult')
export class CreateListFromQueryResultType extends ApplyListResultType {
  @Field(() => String, { nullable: true, description: 'The query the list refreshes from; empty when it will not refresh.' })
  SourceQueryID?: string;
  @Field(() => String, { nullable: true }) SourceQueryName?: string;
  @Field(() => Boolean, { description: 'True when the SQL was saved by this call, as a Pending query.' }) SavedNewQuery!: boolean;
  @Field(() => Boolean, { description: 'True when the list is linked to a query and can refresh.' }) Refreshes!: boolean;
  @Field(() => String, { nullable: true, description: 'Why the list will not refresh, when it will not.' }) StaticReason?: string;
}

@InputType('ComputeDeltaInput')
export class ComputeDeltaInput {
  @Field(() => String, { description: 'TargetListId, or the literal string "new" to materialize.' })
  Target!: string;

  @Field(() => ListSourceInput) Source!: ListSourceInput;

  @Field(() => String, { description: 'Refresh mode: Additive | Sync.' })
  Mode!: 'Additive' | 'Sync';
}

@InputType('ApplyDeltaInput')
export class ApplyDeltaInput {
  @Field(() => String) TargetListId!: string;
  @Field(() => String) EntityName!: string;
  @Field(() => [String]) ToAdd!: string[];
  @Field(() => [String]) ToRemove!: string[];
  @Field(() => [String]) Unchanged!: string[];
  @Field(() => Int) AddCount!: number;
  @Field(() => Int) RemoveCount!: number;
  @Field(() => Int) UnchangedCount!: number;
  @Field(() => Int) SourceTotal!: number;
  @Field(() => Int) TargetTotal!: number;
  @Field(() => String) DeltaToken!: string;
  @Field(() => Boolean) ConfirmDrops!: boolean;
}

// ---------------------------------------------------------------------------
// Sharing inputs / outputs (Phase 2)
// ---------------------------------------------------------------------------

@InputType('ShareTargetInput')
export class ShareTargetInput {
  @Field(() => String, { description: 'Target kind: user | role.' })
  Kind!: 'user' | 'role';

  @Field(() => String, { nullable: true, description: 'User ID, required when Kind=user.' })
  UserID?: string;

  @Field(() => String, { nullable: true, description: 'Role ID, required when Kind=role.' })
  RoleID?: string;
}

@InputType('ShareListInput')
export class ShareListInput {
  @Field(() => String) ListID!: string;
  @Field(() => ShareTargetInput) Target!: ShareTargetInput;
  @Field(() => String, { description: 'Permission level: View | Edit | Owner.' })
  PermissionLevel!: SharePermissionLevel;
}

@InputType('InviteToListInput')
export class InviteToListInput {
  @Field(() => String) ListID!: string;
  @Field(() => String) Email!: string;
  @Field(() => String, { description: 'Role: Editor | Viewer.' })
  Role!: 'Editor' | 'Viewer';
  @Field(() => Int, { nullable: true, description: 'Optional TTL in hours. Defaults to 7 days.' })
  TtlHours?: number;
}

@ObjectType('ShareTargetType')
export class ShareTargetType {
  @Field(() => String) Kind!: 'user' | 'role';
  @Field(() => String, { nullable: true }) UserID?: string;
  @Field(() => String, { nullable: true }) RoleID?: string;
}

@ObjectType('ListShareSummaryType')
export class ListShareSummaryType {
  @Field(() => String) PermissionID!: string;
  @Field(() => String) ListID!: string;
  @Field(() => ShareTargetType) Target!: ShareTargetType;
  @Field(() => String) PermissionLevel!: SharePermissionLevel;
  @Field(() => String) Status!: string;
  @Field(() => String, { nullable: true }) SharedByUserID?: string;
  @Field(() => Date) CreatedAt!: Date;
}

@ObjectType('SharedListSummaryType')
export class SharedListSummaryType {
  @Field(() => String) ListID!: string;
  @Field(() => String) ListName!: string;
  @Field(() => String) PermissionLevel!: SharePermissionLevel;
  @Field(() => String, { nullable: true }) SharedByUserID?: string;
  @Field(() => Date) SharedAt!: Date;
}

@ObjectType('ShareResultType')
export class ShareResultType {
  @Field(() => Boolean) Success!: boolean;
  @Field(() => String) ResultCode!: string;
  @Field(() => String) Message!: string;
  @Field(() => String, { nullable: true }) PermissionID?: string;
}

@ObjectType('InviteResultType')
export class InviteResultType {
  @Field(() => Boolean) Success!: boolean;
  @Field(() => String) ResultCode!: string;
  @Field(() => String) Message!: string;
  @Field(() => String, { nullable: true }) InvitationID?: string;
  @Field(() => String, { nullable: true }) Token?: string;
  @Field(() => Date, { nullable: true }) ExpiresAt?: Date;
}

@ObjectType('AcceptInvitationResultType')
export class AcceptInvitationResultType {
  @Field(() => Boolean) Success!: boolean;
  @Field(() => String) ResultCode!: string;
  @Field(() => String) Message!: string;
  @Field(() => String, { nullable: true }) PermissionID?: string;
  @Field(() => String, { nullable: true }) ListID?: string;
}

@InputType('ComposeListsInput')
export class ComposeListsInput {
  @Field(() => String, { description: 'Set-op kind: union | intersection | difference.' })
  Op!: SetOpKind;

  @Field(() => [ListSourceInput]) Inputs!: ListSourceInput[];

  @Field(() => ListSourceInput, { nullable: true, description: 'Optional target list (for in-place set-op). Omit to preview against a new list.' })
  Target?: ListSourceInput;
}

// ---------------------------------------------------------------------------
// Boundary converters — exported for unit testing. Kept as standalone
// functions (not methods) so tests don't have to construct a full
// AppContext / type-graphql runtime.
// ---------------------------------------------------------------------------

export function ToCoreSource(input: ListSourceInput): CoreListSource {
  switch (input.Kind) {
    case 'list':
      if (!input.ListID) throw new Error("ListSourceInput.ListID is required when Kind='list'");
      return { kind: 'list', listId: input.ListID };
    case 'view':
      if (!input.ViewID) throw new Error("ListSourceInput.ViewID is required when Kind='view'");
      return { kind: 'view', viewId: input.ViewID };
    case 'adhoc':
      if (!input.EntityName || input.ExtraFilter == null) {
        throw new Error("ListSourceInput.EntityName and ExtraFilter are required when Kind='adhoc'");
      }
      return { kind: 'adhoc', entityName: input.EntityName, extraFilter: input.ExtraFilter };
    default:
      throw new Error(`Unknown ListSourceInput.Kind: ${String(input.Kind)}`);
  }
}

/** @deprecated Use {@link ToCoreSource}. */
export function toCoreSource(input: ListSourceInput): CoreListSource {
  return ToCoreSource(input);
}

export function FromCoreDelta(delta: CoreListDelta): ListDeltaType {
  return {
    TargetListId: delta.TargetListId,
    EntityName: delta.EntityName,
    ToAdd: delta.ToAdd,
    ToRemove: delta.ToRemove,
    Unchanged: delta.Unchanged,
    Counts: { ...delta.Counts },
    Warnings: delta.Warnings.map(FromCoreWarning),
    DeltaToken: delta.DeltaToken,
  };
}

/** @deprecated Use {@link FromCoreDelta}. */
export function fromCoreDelta(delta: CoreListDelta): ListDeltaType {
  return FromCoreDelta(delta);
}

export function FromCoreWarning(w: CoreListDeltaWarning): ListDeltaWarningType {
  return {
    Code: w.Code,
    Message: w.Message,
    DetailsJSON: w.Details ? JSON.stringify(w.Details) : undefined,
  };
}

/** @deprecated Use {@link FromCoreWarning}. */
export function fromCoreWarning(w: CoreListDeltaWarning): ListDeltaWarningType {
  return FromCoreWarning(w);
}

export function FromCoreApplyResult(r: CoreApplyResult): ApplyListResultType {
  return {
    Success: r.Success,
    ResultCode: r.ResultCode,
    Message: r.Message,
    CreatedListId: r.CreatedListId,
    TargetListId: r.TargetListId,
    AddedCount: r.Counts?.Added,
    RemovedCount: r.Counts?.Removed,
    FailedCount: r.Counts?.Failed,
    Errors: r.Errors,
    SourceChange: r.SourceChange ? FromCoreSourceChange(r.SourceChange) : undefined,
  };
}

export function FromCoreRefreshPreview(p: CoreListRefreshPreview): ListRefreshPreviewType {
  return {
    Success: p.Success,
    ResultCode: p.ResultCode,
    Message: p.Message,
    Delta: p.Delta ? FromCoreDelta(p.Delta) : undefined,
    SourceChange: p.SourceChange ? FromCoreSourceChange(p.SourceChange) : undefined,
  };
}

export function FromCoreSourceChange(c: CoreListSourceChange): ListSourceChangeType {
  return {
    SourceKind: c.SourceKind,
    SourceID: c.SourceID,
    SourceName: c.SourceName,
    ChangedAt: c.ChangedAt,
    LinkedFingerprint: c.LinkedFingerprint,
    CurrentFingerprint: c.CurrentFingerprint,
  };
}

/**
 * Parses the optional JSON object of source query parameter values sent to ApproveListSource.
 * Returns undefined for a missing or blank value; throws on anything but a JSON object.
 */
export function ParseSourceParameters(json: string | null | undefined): Record<string, unknown> | undefined {
  if (!json?.trim()) return undefined;
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('ParametersJSON must be a JSON object of query parameter values');
  }
  return parsed as Record<string, unknown>;
}

/** @deprecated Use {@link FromCoreApplyResult}. */
export function fromCoreApplyResult(r: CoreApplyResult): ApplyListResultType {
  return FromCoreApplyResult(r);
}

/** Convert a `ListShareSummary` from the core into the GraphQL DTO. */
export function FromCoreShareSummary(s: ListShareSummary): ListShareSummaryType {
  return {
    PermissionID: s.PermissionID,
    ListID: s.ListID,
    Target:
      s.Target.kind === 'user'
        ? { Kind: 'user', UserID: s.Target.userId }
        : { Kind: 'role', RoleID: s.Target.roleId },
    PermissionLevel: s.PermissionLevel,
    Status: s.Status,
    SharedByUserID: s.SharedByUserID ?? undefined,
    CreatedAt: s.CreatedAt,
  };
}

/** @deprecated Use {@link FromCoreShareSummary}. */
export function fromCoreShareSummary(s: ListShareSummary): ListShareSummaryType {
  return FromCoreShareSummary(s);
}

/** Guard for required-when-Kind-X fields on discriminated inputs. */
export function RequireField<T>(value: T | undefined, name: string): T {
  if (value == null) throw new Error(`'${name}' is required`);
  return value;
}

/** @deprecated Use {@link RequireField}. */
export function requireField<T>(value: T | undefined, name: string): T {
  return RequireField(value, name);
}

/** Three failure helpers — one per output type — keep the try/catch
 *  sites in the resolver methods tiny. */
export function ShareUnexpected(e: unknown, op: string): ShareResultType {
  const message = e instanceof Error ? e.message : String(e);
  return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: `${op}: ${message}` };
}

/** @deprecated Use {@link ShareUnexpected}. */
export function shareUnexpected(e: unknown, op: string): ShareResultType {
  return ShareUnexpected(e, op);
}
export function InviteUnexpected(e: unknown, op: string): InviteResultType {
  const message = e instanceof Error ? e.message : String(e);
  return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: `${op}: ${message}` };
}

/** @deprecated Use {@link InviteUnexpected}. */
export function inviteUnexpected(e: unknown, op: string): InviteResultType {
  return InviteUnexpected(e, op);
}
export function AcceptInvitationUnexpected(e: unknown, op: string): AcceptInvitationResultType {
  const message = e instanceof Error ? e.message : String(e);
  return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: `${op}: ${message}` };
}

/** @deprecated Use {@link AcceptInvitationUnexpected}. */
export function acceptInvitationUnexpected(e: unknown, op: string): AcceptInvitationResultType {
  return AcceptInvitationUnexpected(e, op);
}

export function RebuildDeltaFromInput(input: ApplyDeltaInput): CoreListDelta {
  return {
    TargetListId: input.TargetListId,
    EntityName: input.EntityName,
    ToAdd: input.ToAdd,
    ToRemove: input.ToRemove,
    Unchanged: input.Unchanged,
    Counts: {
      Add: input.AddCount,
      Remove: input.RemoveCount,
      Unchanged: input.UnchangedCount,
      SourceTotal: input.SourceTotal,
      TargetTotal: input.TargetTotal,
    },
    Warnings: [],
    DeltaToken: input.DeltaToken,
  };
}

/** @deprecated Use {@link RebuildDeltaFromInput}. */
export function rebuildDeltaFromInput(input: ApplyDeltaInput): CoreListDelta {
  return RebuildDeltaFromInput(input);
}

// ---------------------------------------------------------------------------
// Resolver
//
// All public capability flows through one `ListOperations` instance per
// request, constructed with the per-request read-write provider and the
// authenticated user. Auth is enforced at two layers: this resolver checks
// the user is authenticated (via UserPayload), and `ListOperations` itself
// enforces the drop-guard / token / staleness contract.
// ---------------------------------------------------------------------------

/** The mutation's input as a `ListFromQuery` request, or why it is not valid. */
export function ToListFromQueryRequest(input: CreateListFromQueryInput): ListFromQueryRequest | string {
  if (!input.ListName?.trim()) return 'ListName is required.';
  if (input.RefreshMode !== 'Additive' && input.RefreshMode !== 'Sync') return `RefreshMode must be 'Additive' or 'Sync', got '${input.RefreshMode}'.`;
  let parameters: Record<string, unknown> | undefined;
  if (input.ParametersJSON?.trim()) {
    try {
      const parsed: unknown = JSON.parse(input.ParametersJSON);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'ParametersJSON must be a JSON object.';
      parameters = parsed as Record<string, unknown>;
    } catch {
      return 'ParametersJSON must be a JSON object.';
    }
  }
  return {
    ListName: input.ListName.trim(),
    Description: input.Description?.trim() || undefined,
    CategoryID: input.CategoryID || undefined,
    Parameters: parameters,
    EntityName: input.EntityName?.trim() || undefined,
    KeyField: input.KeyField?.trim() || undefined,
    RefreshMode: input.RefreshMode,
    AutoRefresh: input.AutoRefresh,
  };
}

function refusedListFromQuery(code: string, message: string): CreateListFromQueryResultType {
  return { Success: false, ResultCode: code, Message: message, SavedNewQuery: false, Refreshes: false };
}

export function FromListFromQueryOutcome(outcome: ListFromQueryOutcome): CreateListFromQueryResultType {
  if (outcome.Kind === 'Refused') return refusedListFromQuery(outcome.Code, outcome.Message);
  return {
    ...FromCoreApplyResult(outcome.Result),
    SourceQueryID: outcome.SourceQueryID ?? undefined,
    SourceQueryName: outcome.SourceQueryName ?? undefined,
    SavedNewQuery: outcome.SavedNewQuery,
    Refreshes: !!outcome.Result.CreatedListId && !outcome.StaticReason,
    StaticReason: outcome.StaticReason ?? undefined,
  };
}

@Resolver()
export class ListOperationsResolver extends ResolverBase {
  @Query(() => ListDeltaType, {
    description:
      'Preview a list operation. Returns a signed DeltaToken that ApplyListDelta will accept (subject to TTL + drift checks).',
  })
  async PreviewListDelta(
    @Arg('input', () => ComputeDeltaInput) input: ComputeDeltaInput,
    @Ctx() ctx: AppContext,
  ): Promise<ListDeltaType> {
    const ops = this.buildOps(ctx);
    const source = ToCoreSource(input.Source);
    const target = input.Target === 'new' ? 'new' : ({ kind: 'list', listId: input.Target } as const);
    const delta = await ops.ComputeDelta(target, source, input.Mode);
    return FromCoreDelta(delta);
  }

  @Mutation(() => ApplyListResultType, {
    description: 'Apply a previously-previewed delta. Server enforces the drop-guard regardless of UI.',
  })
  async ApplyListDelta(
    @Arg('input', () => ApplyDeltaInput) input: ApplyDeltaInput,
    @Ctx() ctx: AppContext,
  ): Promise<ApplyListResultType> {
    const ops = this.buildOps(ctx);
    try {
      const delta = RebuildDeltaFromInput(input);
      const result = await ops.ApplyDelta(delta, {
        ConfirmDrops: input.ConfirmDrops,
        DeltaToken: input.DeltaToken,
      });
      return FromCoreApplyResult(result);
    } catch (e) {
      return this.unexpectedFailure(e, 'ApplyListDelta');
    }
  }

  @Mutation(() => ApplyListResultType)
  async MaterializeListFromView(
    @Arg('viewId', () => String) viewId: string,
    @Arg('options', () => MaterializeOptionsInput) options: MaterializeOptionsInput,
    @Ctx() ctx: AppContext,
  ): Promise<ApplyListResultType> {
    const ops = this.buildOps(ctx);
    try {
      const opts: CoreMaterializeOptions = {
        ListName: options.ListName,
        CategoryId: options.CategoryId,
        Description: options.Description,
        RememberLineage: options.RememberLineage,
        UseSnapshot: options.UseSnapshot,
        RefreshMode: options.RefreshMode,
      };
      const result = await ops.MaterializeFromView(viewId, opts);
      return FromCoreApplyResult(result);
    } catch (e) {
      return this.unexpectedFailure(e, 'MaterializeListFromView');
    }
  }

  @Mutation(() => ApplyListResultType)
  async AddViewResultsToList(
    @Arg('viewId', () => String) viewId: string,
    @Arg('listId', () => String) listId: string,
    @Ctx() ctx: AppContext,
  ): Promise<ApplyListResultType> {
    const ops = this.buildOps(ctx);
    try {
      const result = await ops.AddViewResultsToList(viewId, listId);
      return FromCoreApplyResult(result);
    } catch (e) {
      return this.unexpectedFailure(e, 'AddViewResultsToList');
    }
  }

  @Mutation(() => ApplyListResultType, {
    description:
      "Refresh a list from its linked source. With no mode, the list's own RefreshMode applies. " +
      'Returns SOURCE_CHANGED, applying nothing, when the source changed since it was approved.',
  })
  async RefreshListFromSource(
    @Arg('listId', () => String) listId: string,
    @Arg('mode', () => String, { nullable: true }) mode: 'Additive' | 'Sync' | null | undefined,
    @Arg('confirmDrops', () => Boolean) confirmDrops: boolean,
    @Ctx() ctx: AppContext,
  ): Promise<ApplyListResultType> {
    const ops = this.buildOps(ctx);
    try {
      const result = await ops.RefreshFromSource(listId, mode, { ConfirmDrops: confirmDrops });
      return FromCoreApplyResult(result);
    } catch (e) {
      return this.unexpectedFailure(e, 'RefreshListFromSource');
    }
  }

  @Query(() => ListRefreshPreviewType, {
    description:
      'Preview refreshing a list from its linked source (view or query). Never mutates. With acceptCurrentSource ' +
      "(owner only), previews a changed source's current definition, optionally with new query parameter values.",
  })
  async PreviewListRefresh(
    @Arg('listId', () => String) listId: string,
    @Arg('mode', () => String, { nullable: true }) mode: 'Additive' | 'Sync' | null | undefined,
    @Arg('acceptCurrentSource', () => Boolean, { nullable: true }) acceptCurrentSource: boolean | null | undefined,
    @Arg('parametersJSON', () => String, { nullable: true }) parametersJSON: string | null | undefined,
    @Ctx() ctx: AppContext,
  ): Promise<ListRefreshPreviewType> {
    const ops = this.buildOps(ctx);
    try {
      const preview = await ops.PreviewRefreshFromSource(listId, {
        Mode: mode,
        AcceptCurrentSource: acceptCurrentSource ?? false,
        Parameters: ParseSourceParameters(parametersJSON),
      });
      return FromCoreRefreshPreview(preview);
    } catch (e) {
      return this.unexpectedFailure(e, 'PreviewListRefresh');
    }
  }

  @Mutation(() => ApplyListResultType, {
    description:
      'Apply a delta from PreviewListRefresh. Re-checks the source first, stamps the list and writes a refresh audit row.',
  })
  async ApplyListRefresh(
    @Arg('input', () => ApplyDeltaInput) input: ApplyDeltaInput,
    @Ctx() ctx: AppContext,
  ): Promise<ApplyListResultType> {
    const ops = this.buildOps(ctx);
    try {
      const result = await ops.ApplyRefreshPreview(RebuildDeltaFromInput(input), {
        ConfirmDrops: input.ConfirmDrops,
        DeltaToken: input.DeltaToken,
      });
      return FromCoreApplyResult(result);
    } catch (e) {
      return this.unexpectedFailure(e, 'ApplyListRefresh');
    }
  }

  @Mutation(() => ApplyListResultType, {
    description:
      "The list owner approves its source's current definition (and, for a query, optionally new parameter " +
      'values), resumes a paused refresh routine, and refreshes the list right away.',
  })
  async ApproveListSource(
    @Arg('listId', () => String) listId: string,
    @Arg('confirmDrops', () => Boolean) confirmDrops: boolean,
    @Arg('parametersJSON', () => String, { nullable: true }) parametersJSON: string | null | undefined,
    @Ctx() ctx: AppContext,
  ): Promise<ApplyListResultType> {
    const ops = this.buildOps(ctx);
    try {
      const result = await ops.ApproveListSource(listId, {
        ConfirmDrops: confirmDrops,
        Parameters: ParseSourceParameters(parametersJSON),
      });
      return FromCoreApplyResult(result);
    } catch (e) {
      return this.unexpectedFailure(e, 'ApproveListSource');
    }
  }

  @Mutation(() => CreateListFromQueryResultType, {
    description:
      'Creates a list from a saved query, or from SQL written in a conversation, linked so it refreshes. SQL is checked like ExecuteAdhocQuery and saved as a Pending query in the caller\'s User Lists; when the caller cannot save queries, the list is made but will not refresh.',
  })
  async CreateListFromQuery(
    @Arg('input', () => CreateListFromQueryInput) input: CreateListFromQueryInput,
    @Ctx() ctx: AppContext,
  ): Promise<CreateListFromQueryResultType> {
    try {
      const user = this.requireUser(ctx);
      const request = ToListFromQueryRequest(input);
      if (typeof request === 'string') return refusedListFromQuery('INVALID_PARAMETER', request);
      if (!!input.QueryID === !!input.SQL) return refusedListFromQuery('MISSING_PARAMETER', 'Pass QueryID or SQL, not both.');
      const service = new ListFromQuery(user, GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: false }));
      if (input.QueryID) return FromListFromQueryOutcome(await service.FromSavedQueryAsync({ ID: input.QueryID }, request));
      const sql = this.checkCallerSQL(ctx, user, input.SQL!);
      if (typeof sql === 'string') return refusedListFromQuery('PERMISSION_DENIED', sql);
      return FromListFromQueryOutcome(await service.FromSQLAsync(sql, request));
    } catch (e) {
      return { ...this.unexpectedFailure(e, 'CreateListFromQuery'), SavedNewQuery: false, Refreshes: false };
    }
  }

  @Mutation(() => ListDeltaType, {
    description:
      'Preview a set-op (union / intersection / difference) across N sources, optionally projected into a target list.',
  })
  async ComposeLists(
    @Arg('input', () => ComposeListsInput) input: ComposeListsInput,
    @Ctx() ctx: AppContext,
  ): Promise<ListDeltaType> {
    const ops = this.buildOps(ctx);
    const inputs = input.Inputs.map(ToCoreSource);
    const target = input.Target ? ToCoreSource(input.Target) : undefined;
    const delta = await ops.ComputeSetOp(input.Op, inputs, target);
    return FromCoreDelta(delta);
  }

  // -----------------------------------------------------------------------
  // Sharing (Phase 2). Auth is enforced at two layers — this resolver checks
  // the user is authenticated; `ListSharing` itself enforces the audit-log /
  // status-transition contracts. Server-side notification dispatch fires
  // automatically through the registered share-notification handler.
  // -----------------------------------------------------------------------

  @Mutation(() => ShareResultType)
  async ShareList(
    @Arg('input', () => ShareListInput) input: ShareListInput,
    @Ctx() ctx: AppContext,
  ): Promise<ShareResultType> {
    const sharing = this.buildSharing(ctx);
    try {
      const target: ShareTarget =
        input.Target.Kind === 'user'
          ? { kind: 'user', userId: RequireField(input.Target.UserID, 'Target.UserID') }
          : { kind: 'role', roleId: RequireField(input.Target.RoleID, 'Target.RoleID') };
      const result = await sharing.Share({
        ListID: input.ListID,
        Target: target,
        PermissionLevel: input.PermissionLevel,
      });
      return result;
    } catch (e) {
      return ShareUnexpected(e, 'ShareList');
    }
  }

  @Mutation(() => ShareResultType)
  async UnshareList(
    @Arg('permissionId', () => String) permissionId: string,
    @Ctx() ctx: AppContext,
  ): Promise<ShareResultType> {
    const sharing = this.buildSharing(ctx);
    try {
      return await sharing.Unshare(permissionId);
    } catch (e) {
      return ShareUnexpected(e, 'UnshareList');
    }
  }

  @Mutation(() => InviteResultType)
  async InviteToList(
    @Arg('input', () => InviteToListInput) input: InviteToListInput,
    @Ctx() ctx: AppContext,
  ): Promise<InviteResultType> {
    const sharing = this.buildSharing(ctx);
    try {
      return await sharing.Invite({
        ListID: input.ListID,
        Email: input.Email,
        Role: input.Role,
        TtlMs: input.TtlHours != null ? input.TtlHours * 60 * 60 * 1000 : undefined,
      });
    } catch (e) {
      return InviteUnexpected(e, 'InviteToList');
    }
  }

  @Mutation(() => AcceptInvitationResultType)
  async AcceptListInvitation(
    @Arg('token', () => String) token: string,
    @Ctx() ctx: AppContext,
  ): Promise<AcceptInvitationResultType> {
    const sharing = this.buildSharing(ctx);
    try {
      return await sharing.AcceptInvitation(token);
    } catch (e) {
      return AcceptInvitationUnexpected(e, 'AcceptListInvitation');
    }
  }

  @Mutation(() => ShareResultType)
  async RevokeListInvitation(
    @Arg('invitationId', () => String) invitationId: string,
    @Ctx() ctx: AppContext,
  ): Promise<ShareResultType> {
    const sharing = this.buildSharing(ctx);
    try {
      return await sharing.RevokeInvitation(invitationId);
    } catch (e) {
      return ShareUnexpected(e, 'RevokeListInvitation');
    }
  }

  @Query(() => [ListShareSummaryType])
  async ListSharesForList(
    @Arg('listId', () => String) listId: string,
    @Ctx() ctx: AppContext,
  ): Promise<ListShareSummaryType[]> {
    const sharing = this.buildSharing(ctx);
    const shares = await sharing.GetSharesForList(listId);
    return shares.map(FromCoreShareSummary);
  }

  @Query(() => [SharedListSummaryType])
  async ListsSharedWithMe(@Ctx() ctx: AppContext): Promise<SharedListSummaryType[]> {
    const sharing = this.buildSharing(ctx);
    const summaries = await sharing.GetListsSharedWithUser();
    return summaries.map((s) => ({
      ListID: s.ListID,
      ListName: s.ListName,
      PermissionLevel: s.PermissionLevel,
      SharedByUserID: s.SharedByUserID ?? undefined,
      SharedAt: s.SharedAt,
    }));
  }

  // --- private helpers ---------------------------------------------------

  private buildSharing(ctx: AppContext): ListSharing {
    const user = this.requireUser(ctx);
    const provider = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: false });
    return new ListSharing(user, provider);
  }

  private buildOps(ctx: AppContext): ListOperations {
    const user = this.requireUser(ctx);
    const provider = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: false });
    return new ListOperations(user, provider);
  }

  /**
   * SECURITY: the ExecuteAdhocQuery checks for SQL a caller wrote. Scope-limited sessions are
   * refused, the SQL runs only on the read-only login, the authorizer must accept the rendered SQL
   * (one read statement reading only entity views the caller may read in full), and the server's
   * timeout applies. The authorizer is the one MJServer registers with the action engine at
   * startup (`CreateAdhocSQLAuthorizer`), so this applies ExecuteAdhocQuery's exact check; with
   * none registered, SQL is refused. Returns the refusal message, or the SQL ready to run.
   */
  private checkCallerSQL(ctx: AppContext, user: UserInfo, sql: string): CheckedCallerSQL | string {
    if (IsScopeLimitedPrincipal(user)) return 'Creating a list from SQL is not permitted for scope-limited sessions.';
    const provider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: false, purpose: 'adhoc' });
    if (!provider) return 'No read-only data source is available to run the SQL.';
    const authorizer = ActionEngineServer.Instance.AdhocSQLAuthorizer;
    if (!authorizer) return 'Running SQL is not configured on this server: no ad-hoc SQL authorizer is registered.';
    const refusal = authorizer.Authorize(sql, provider, user);
    if (refusal) return `Not permitted to run this query: ${refusal}`;
    const timeoutSeconds = authorizer.ClampTimeoutSeconds(undefined);
    return {
      SQL: sql,
      Run: async (maxRows) => {
        const result = await provider.RunQuery({ SQL: sql, MaxRows: maxRows, TimeoutSeconds: timeoutSeconds }, user);
        return { Success: result.Success, Results: (result.Results ?? []) as Record<string, unknown>[], ErrorMessage: result.ErrorMessage };
      },
    };
  }

  private requireUser(ctx: AppContext): UserInfo {
    const user = ctx.userPayload.userRecord as UserInfo | undefined;
    if (!user) throw new Error('User is not authenticated');
    return user;
  }

  private unexpectedFailure(e: unknown, op: string): ApplyListResultType {
    const message = e instanceof Error ? e.message : String(e);
    LogError(`${op} threw: ${message}`);
    return {
      Success: false,
      ResultCode: 'UNEXPECTED_ERROR',
      Message: message,
    };
  }
}

export default ListOperationsResolver;
