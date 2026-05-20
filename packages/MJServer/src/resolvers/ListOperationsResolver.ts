import { LogError, UserInfo } from '@memberjunction/core';
import {
  ListOperations,
  ListSharing,
  type ApplyResult as CoreApplyResult,
  type ListDelta as CoreListDelta,
  type ListDeltaWarning as CoreListDeltaWarning,
  type ListShareSummary,
  type ListSource as CoreListSource,
  type MaterializeOptions as CoreMaterializeOptions,
  type SetOpKind,
  type SharePermissionLevel,
  type SharedListSummary,
  type ShareTarget,
} from '@memberjunction/lists';
import { Arg, Ctx, Field, InputType, Int, Mutation, ObjectType, Query, Resolver } from 'type-graphql';

import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';
import { GetReadWriteProvider } from '../util.js';

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

export function toCoreSource(input: ListSourceInput): CoreListSource {
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

export function fromCoreDelta(delta: CoreListDelta): ListDeltaType {
  return {
    TargetListId: delta.TargetListId,
    EntityName: delta.EntityName,
    ToAdd: delta.ToAdd,
    ToRemove: delta.ToRemove,
    Unchanged: delta.Unchanged,
    Counts: { ...delta.Counts },
    Warnings: delta.Warnings.map(fromCoreWarning),
    DeltaToken: delta.DeltaToken,
  };
}

export function fromCoreWarning(w: CoreListDeltaWarning): ListDeltaWarningType {
  return {
    Code: w.Code,
    Message: w.Message,
    DetailsJSON: w.Details ? JSON.stringify(w.Details) : undefined,
  };
}

export function fromCoreApplyResult(r: CoreApplyResult): ApplyListResultType {
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
  };
}

/** Convert a `ListShareSummary` from the core into the GraphQL DTO. */
export function fromCoreShareSummary(s: ListShareSummary): ListShareSummaryType {
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

/** Guard for required-when-Kind-X fields on discriminated inputs. */
export function requireField<T>(value: T | undefined, name: string): T {
  if (value == null) throw new Error(`'${name}' is required`);
  return value;
}

/** Three failure helpers — one per output type — keep the try/catch
 *  sites in the resolver methods tiny. */
export function shareUnexpected(e: unknown, op: string): ShareResultType {
  const message = e instanceof Error ? e.message : String(e);
  return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: `${op}: ${message}` };
}
export function inviteUnexpected(e: unknown, op: string): InviteResultType {
  const message = e instanceof Error ? e.message : String(e);
  return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: `${op}: ${message}` };
}
export function acceptInvitationUnexpected(e: unknown, op: string): AcceptInvitationResultType {
  const message = e instanceof Error ? e.message : String(e);
  return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: `${op}: ${message}` };
}

export function rebuildDeltaFromInput(input: ApplyDeltaInput): CoreListDelta {
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

// ---------------------------------------------------------------------------
// Resolver
//
// All public capability flows through one `ListOperations` instance per
// request, constructed with the per-request read-write provider and the
// authenticated user. Auth is enforced at two layers: this resolver checks
// the user is authenticated (via UserPayload), and `ListOperations` itself
// enforces the drop-guard / token / staleness contract.
// ---------------------------------------------------------------------------

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
    const source = toCoreSource(input.Source);
    const target = input.Target === 'new' ? 'new' : ({ kind: 'list', listId: input.Target } as const);
    const delta = await ops.ComputeDelta(target, source, input.Mode);
    return fromCoreDelta(delta);
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
      const delta = rebuildDeltaFromInput(input);
      const result = await ops.ApplyDelta(delta, {
        ConfirmDrops: input.ConfirmDrops,
        DeltaToken: input.DeltaToken,
      });
      return fromCoreApplyResult(result);
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
      return fromCoreApplyResult(result);
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
      return fromCoreApplyResult(result);
    } catch (e) {
      return this.unexpectedFailure(e, 'AddViewResultsToList');
    }
  }

  @Mutation(() => ApplyListResultType)
  async RefreshListFromSource(
    @Arg('listId', () => String) listId: string,
    @Arg('mode', () => String) mode: 'Additive' | 'Sync',
    @Arg('confirmDrops', () => Boolean) confirmDrops: boolean,
    @Ctx() ctx: AppContext,
  ): Promise<ApplyListResultType> {
    const ops = this.buildOps(ctx);
    try {
      const result = await ops.RefreshFromSource(listId, mode, { ConfirmDrops: confirmDrops });
      return fromCoreApplyResult(result);
    } catch (e) {
      return this.unexpectedFailure(e, 'RefreshListFromSource');
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
    const inputs = input.Inputs.map(toCoreSource);
    const target = input.Target ? toCoreSource(input.Target) : undefined;
    const delta = await ops.ComputeSetOp(input.Op, inputs, target);
    return fromCoreDelta(delta);
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
          ? { kind: 'user', userId: requireField(input.Target.UserID, 'Target.UserID') }
          : { kind: 'role', roleId: requireField(input.Target.RoleID, 'Target.RoleID') };
      const result = await sharing.Share({
        ListID: input.ListID,
        Target: target,
        PermissionLevel: input.PermissionLevel,
      });
      return result;
    } catch (e) {
      return shareUnexpected(e, 'ShareList');
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
      return shareUnexpected(e, 'UnshareList');
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
      return inviteUnexpected(e, 'InviteToList');
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
      return acceptInvitationUnexpected(e, 'AcceptListInvitation');
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
      return shareUnexpected(e, 'RevokeListInvitation');
    }
  }

  @Query(() => [ListShareSummaryType])
  async ListSharesForList(
    @Arg('listId', () => String) listId: string,
    @Ctx() ctx: AppContext,
  ): Promise<ListShareSummaryType[]> {
    const sharing = this.buildSharing(ctx);
    const shares = await sharing.GetSharesForList(listId);
    return shares.map(fromCoreShareSummary);
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
