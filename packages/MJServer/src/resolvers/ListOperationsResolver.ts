import { LogError, UserInfo } from '@memberjunction/core';
import {
  ListOperations,
  type ApplyResult as CoreApplyResult,
  type ListDelta as CoreListDelta,
  type ListDeltaWarning as CoreListDeltaWarning,
  type ListSource as CoreListSource,
  type MaterializeOptions as CoreMaterializeOptions,
  type SetOpKind,
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

@InputType('ComposeListsInput')
export class ComposeListsInput {
  @Field(() => String, { description: 'Set-op kind: union | intersection | difference.' })
  Op!: SetOpKind;

  @Field(() => [ListSourceInput]) Inputs!: ListSourceInput[];

  @Field(() => ListSourceInput, { nullable: true, description: 'Optional target list (for in-place set-op). Omit to preview against a new list.' })
  Target?: ListSourceInput;
}

// ---------------------------------------------------------------------------
// Boundary converters
// ---------------------------------------------------------------------------

function toCoreSource(input: ListSourceInput): CoreListSource {
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

function fromCoreDelta(delta: CoreListDelta): ListDeltaType {
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

function fromCoreWarning(w: CoreListDeltaWarning): ListDeltaWarningType {
  return {
    Code: w.Code,
    Message: w.Message,
    DetailsJSON: w.Details ? JSON.stringify(w.Details) : undefined,
  };
}

function fromCoreApplyResult(r: CoreApplyResult): ApplyListResultType {
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

function rebuildDeltaFromInput(input: ApplyDeltaInput): CoreListDelta {
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

  // --- private helpers ---------------------------------------------------

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
