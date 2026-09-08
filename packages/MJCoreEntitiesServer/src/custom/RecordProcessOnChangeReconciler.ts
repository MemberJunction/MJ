/**
 * @fileoverview Reconciles a Record Process's **on-change** trigger onto the Entity Action rows the
 * save pipeline already reads.
 *
 * `RecordProcess.OnChangeEnabled` has described this since the column shipped — *"the process runs
 * per-record on save via an owned Entity Action"* — and `OnChangeFilter` promised to *"compile into
 * the owned Entity Action Filter"*. Neither owned anything: the schedule trigger reconciled and the
 * change trigger was a flag that read as configured and did nothing. That is the worst shape for a
 * trigger to be in, because the UI shows it enabled and no run ever appears.
 *
 * Split out of the entity subclass rather than added to it because the schedule reconciliation is
 * already a hundred lines of the same shape and a single `Save()` override owning both would be the
 * kind of method nobody can safely change. Both call sites stay in the subclass; the substrate work
 * lives here.
 *
 * **Nothing here is new machinery.** `HandleEntityActions` has fired entity actions from the save
 * pipeline all along, `Run Record Process` is an existing action, and `ActionFilter` evaluation with
 * the change context landed with transition filters. What was missing was rows.
 *
 * @module @memberjunction/core-entities-server
 */
import { BuildChangeFilterCode } from '@memberjunction/actions-base';
import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
    MJActionEntity,
    MJActionFilterEntity,
    MJActionParamEntity,
    MJEntityActionEntity,
    MJEntityActionFilterEntity,
    MJEntityActionInvocationEntity,
    MJEntityActionInvocationTypeEntity,
    MJEntityActionParamEntity,
    MJRecordProcessEntity,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/** The Action an on-change binding dispatches to. Exists already; this only binds to it. */
export const RUN_RECORD_PROCESS_ACTION = 'Run Record Process';

/**
 * Turns the record that changed into the action's `Scope` parameter.
 *
 * Evaluated per-invocation as an `EntityActionParam` of ValueType `Script`, because the whole point
 * of an on-change trigger is that the record differs every time — a Static value would pin the
 * binding to whichever record happened to be open when it was configured.
 *
 * `ToConcatenatedString()` and not `ToString()`: `RecordRef.RecordID` is documented as the primary
 * key "serialized to a composite-key-safe string", which is that format. `ToString()` is a display
 * format and would silently fail to resolve a composite key.
 */
export const ON_CHANGE_SCOPE_SCRIPT =
    "EntityActionContext.result = JSON.stringify({ Kind: 'records', " +
    'RecordIDs: [EntityActionContext.entityObject.PrimaryKey.ToConcatenatedString()] });';

/**
 * Whether a process should own an *active* on-change binding.
 *
 * Pure and exported so the decision is testable without a database. An invocation type is required
 * rather than defaulted: guessing `AfterUpdate` would produce a trigger firing on an event the
 * author never chose, and on the wrong one there is no error — only runs nobody expected.
 */
export function decideOnChangeAction(p: {
    status: string;
    onChangeEnabled: boolean;
    onChangeInvocationType: string | null;
}): 'upsert' | 'disable' {
    return p.status === 'Active' && p.onChangeEnabled && !!p.onChangeInvocationType ? 'upsert' : 'disable';
}

/** Everything the reconciler needs from its caller. */
export type OnChangeReconcileContext = {
    Provider: IMetadataProvider;
    ContextUser: UserInfo;
};

/**
 * Brings a Record Process's owned Entity Action binding in line with its on-change settings.
 *
 * Turning the trigger off **disables** the binding rather than deleting it, matching how the
 * schedule reconciler treats its owned job: the row carries the history of what this process used to
 * fire on, and a trigger someone switched off by mistake should be recoverable.
 */
export async function ReconcileRecordProcessOnChange(
    process: MJRecordProcessEntity,
    context: OnChangeReconcileContext,
): Promise<void> {
    const action = decideOnChangeAction({
        status: process.Status,
        onChangeEnabled: process.OnChangeEnabled,
        onChangeInvocationType: process.OnChangeInvocationType,
    });

    const existing = await findOwnedEntityAction(process, context);

    if (action === 'disable') {
        if (existing && existing.Status !== 'Disabled') {
            existing.Status = 'Disabled';
            if (!(await existing.Save())) {
                throw new Error(
                    `failed disabling the on-change binding: ${existing.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
        return;
    }

    const actionRow = await resolveAction(context);
    const invocationTypeID = await resolveInvocationTypeID(process.OnChangeInvocationType as string, context);

    const binding = existing ?? await context.Provider.GetEntityObject<MJEntityActionEntity>('MJ: Entity Actions', context.ContextUser);
    if (!existing) {
        binding.NewRecord();
        binding.EntityID = process.EntityID;
        binding.ActionID = actionRow.ID;
    }
    binding.Status = 'Active';
    if (!(await binding.Save())) {
        throw new Error(`failed saving the on-change binding: ${binding.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    // The invocation type is reconciled as a set, not edited in place: switching from AfterUpdate to
    // AfterCreate must leave the process firing on exactly one event. Editing the existing row would
    // work; leaving the old one Active alongside a new one would double-fire, which is the failure
    // this replaces rather than risks.
    await reconcileInvocation(binding.ID, invocationTypeID, context);

    await upsertActionParam(binding.ID, actionRow.ID, 'RecordProcessID', 'Static', process.ID, context);
    await upsertActionParam(binding.ID, actionRow.ID, 'Scope', 'Script', ON_CHANGE_SCOPE_SCRIPT, context);

    await reconcileFilter(binding.ID, process.OnChangeFilter, context);
}

/**
 * The binding this process owns, if it has one.
 *
 * Matched on the `RecordProcessID` param rather than on entity + action, because `Run Record Process`
 * is one shared action: every process watching a given entity would otherwise collide on the same
 * pair, and reusing that row means rewriting its `RecordProcessID` — silently repointing the first
 * process's trigger at the second process's definition, with the first still looking configured.
 */
async function findOwnedEntityAction(
    process: MJRecordProcessEntity,
    context: OnChangeReconcileContext,
): Promise<MJEntityActionEntity | null> {
    const rv = RunView.FromMetadataProvider(context.Provider);
    const candidates = await rv.RunView<MJEntityActionEntity>(
        {
            EntityName: 'MJ: Entity Actions',
            ExtraFilter: `EntityID='${process.EntityID}'`,
            ResultType: 'entity_object',
        },
        context.ContextUser,
    );
    const rows = candidates.Results ?? [];
    if (rows.length === 0) return null;

    const params = await rv.RunView<MJEntityActionParamEntity>(
        {
            EntityName: 'MJ: Entity Action Params',
            ExtraFilter: `ActionParam='RecordProcessID' AND EntityActionID IN (${rows.map((r) => `'${r.ID}'`).join(',')})`,
            ResultType: 'entity_object',
        },
        context.ContextUser,
    );
    const mine = (params.Results ?? []).find((p) => p.Value != null && UUIDsEqual(p.Value, process.ID));
    return mine ? rows.find((r) => UUIDsEqual(r.ID, mine.EntityActionID)) ?? null : null;
}

/** Resolves the `Run Record Process` action, or says plainly that the seed is missing. */
async function resolveAction(context: OnChangeReconcileContext): Promise<MJActionEntity> {
    const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJActionEntity>(
        { EntityName: 'MJ: Actions', ExtraFilter: `Name='${RUN_RECORD_PROCESS_ACTION}'`, ResultType: 'entity_object' },
        context.ContextUser,
    );
    const action = result.Results?.[0];
    if (!action) {
        throw new Error(`the '${RUN_RECORD_PROCESS_ACTION}' action is not present — has the metadata seed been pushed?`);
    }
    return action;
}

/** Resolves the invocation type the process named. */
async function resolveInvocationTypeID(name: string, context: OnChangeReconcileContext): Promise<string> {
    const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJEntityActionInvocationTypeEntity>(
        { EntityName: 'MJ: Entity Action Invocation Types', ExtraFilter: `Name='${name}'`, ResultType: 'simple' },
        context.ContextUser,
    );
    const row = result.Results?.[0];
    if (!row) throw new Error(`entity action invocation type '${name}' is not seeded`);
    return row.ID;
}

/** Makes the named invocation the only active one on this binding. */
async function reconcileInvocation(
    entityActionID: string,
    invocationTypeID: string,
    context: OnChangeReconcileContext,
): Promise<void> {
    const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJEntityActionInvocationEntity>(
        {
            EntityName: 'MJ: Entity Action Invocations',
            ExtraFilter: `EntityActionID='${entityActionID}'`,
            ResultType: 'entity_object',
        },
        context.ContextUser,
    );

    let found = false;
    for (const row of result.Results ?? []) {
        const wanted = UUIDsEqual(row.InvocationTypeID, invocationTypeID);
        found ||= wanted;
        const status = wanted ? 'Active' : 'Disabled';
        if (row.Status !== status) {
            row.Status = status;
            if (!(await row.Save())) {
                LogError(
                    `RecordProcess on-change: could not set invocation ${row.ID} to ${status}: ` +
                    `${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
    }
    if (found) return;

    const row = await context.Provider.GetEntityObject<MJEntityActionInvocationEntity>('MJ: Entity Action Invocations', context.ContextUser);
    row.NewRecord();
    row.EntityActionID = entityActionID;
    row.InvocationTypeID = invocationTypeID;
    row.Status = 'Active';
    if (!(await row.Save())) {
        throw new Error(`failed creating the on-change invocation: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/** Finds or creates one Entity Action Param binding for the on-change trigger. */
async function upsertActionParam(
    entityActionID: string,
    actionID: string,
    paramName: string,
    valueType: MJEntityActionParamEntity['ValueType'],
    value: string,
    context: OnChangeReconcileContext,
): Promise<void> {
    const rv = RunView.FromMetadataProvider(context.Provider);
    const paramResult = await rv.RunView<MJActionParamEntity>(
        {
            EntityName: 'MJ: Action Params',
            ExtraFilter: `ActionID='${actionID}' AND Name='${paramName}'`,
            ResultType: 'entity_object',
        },
        context.ContextUser,
    );
    const actionParam = paramResult.Results?.[0];
    if (!actionParam) {
        throw new Error(`the '${RUN_RECORD_PROCESS_ACTION}' action has no ${paramName} parameter to bind`);
    }

    const existingResult = await rv.RunView<MJEntityActionParamEntity>(
        {
            EntityName: 'MJ: Entity Action Params',
            ExtraFilter: `EntityActionID='${entityActionID}' AND ActionParamID='${actionParam.ID}'`,
            ResultType: 'entity_object',
        },
        context.ContextUser,
    );
    const existing = existingResult.Results?.[0];
    const row = existing ?? await context.Provider.GetEntityObject<MJEntityActionParamEntity>('MJ: Entity Action Params', context.ContextUser);
    if (!existing) row.NewRecord();

    row.EntityActionID = entityActionID;
    row.ActionParamID = actionParam.ID;
    row.ValueType = valueType;
    row.Value = value;
    if (!(await row.Save())) {
        throw new Error(`failed binding ${paramName} to the on-change trigger: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/**
 * Compiles `OnChangeFilter` into the owned Action Filter, exactly as the column documents.
 *
 * Shares `BuildChangeFilterCode` with the workflow trigger, so `DidFieldChangeToValue('Status',
 * 'Approved')` means the same thing in both places — a user who learned one surface has learned the
 * other. Clearing the filter disables the binding rather than deleting the row, so the expression
 * survives a mis-click.
 */
async function reconcileFilter(
    entityActionID: string,
    filter: string | null,
    context: OnChangeReconcileContext,
): Promise<void> {
    const rv = RunView.FromMetadataProvider(context.Provider);
    const bindingResult = await rv.RunView<MJEntityActionFilterEntity>(
        {
            EntityName: 'MJ: Entity Action Filters',
            ExtraFilter: `EntityActionID='${entityActionID}'`,
            OrderBy: 'Sequence ASC',
            ResultType: 'entity_object',
        },
        context.ContextUser,
    );
    const binding = bindingResult.Results?.[0] ?? null;
    const expression = filter?.trim() ?? '';

    if (!expression) {
        if (binding && binding.Status !== 'Disabled') {
            binding.Status = 'Disabled';
            if (!(await binding.Save())) {
                throw new Error(`failed clearing the on-change filter: ${binding.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
        return;
    }

    const filterRow = await context.Provider.GetEntityObject<MJActionFilterEntity>('MJ: Action Filters', context.ContextUser);
    if (!binding?.ActionFilterID || !(await filterRow.Load(binding.ActionFilterID))) {
        filterRow.NewRecord();
    }
    filterRow.Code = BuildChangeFilterCode(expression);
    filterRow.UserDescription = expression;
    filterRow.CodeExplanation =
        "Generated from a Record Process's OnChangeFilter. Evaluated against the record change that fired the " +
        'trigger; the process runs for that record only when it is true.';
    if (!(await filterRow.Save())) {
        throw new Error(`failed saving the on-change filter: ${filterRow.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    const row = binding ?? await context.Provider.GetEntityObject<MJEntityActionFilterEntity>('MJ: Entity Action Filters', context.ContextUser);
    if (!binding) row.NewRecord();
    row.EntityActionID = entityActionID;
    row.ActionFilterID = filterRow.ID;
    row.Sequence = 1;
    row.Status = 'Active';
    if (!(await row.Save())) {
        throw new Error(`failed binding the on-change filter: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}
