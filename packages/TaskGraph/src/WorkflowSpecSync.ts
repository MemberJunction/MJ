/**
 * @fileoverview Persists a `WorkflowSpec` by **reconciling substrates that already exist**.
 *
 * **The central design constraint: no new storage.** There is no `Workflow` table and there will not
 * be one. A workflow's WHAT is a Flow agent (the graph); its WHEN is a Scheduled Job or an Entity
 * Action binding. Inventing a parallel `Workflow` row would create a second definition of "a
 * scheduled thing", and the scheduler would then have two masters that can disagree — which is
 * exactly the class of divergence this whole program has been removing.
 *
 * So this is a **reconciler**, not a writer. It follows the pattern
 * `MJRecordProcessEntityServer.Save()` already proved: resolve the job type, find the rows this
 * definition owns, then upsert or disable them so the substrate matches the spec. Rows are matched
 * by a marker in their own `Configuration`, which is what makes ownership survive a rename.
 *
 * **Agent persistence crosses a seam.** Writing the Flow agent behind the graph is `AgentSpecSync`'s
 * job — it already owns atomic multi-entity agent writes and the mutation audit. Importing it here
 * would pull the agent-manager package into the execution substrate, so the host injects it instead.
 * A caller with no agent writer still gets correct trigger reconciliation and an honest error rather
 * than a half-persisted workflow.
 *
 * @module @memberjunction/task-graph
 */
import { IMetadataProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import {
    MJActionEntity,
    MJActionFilterEntity,
    MJActionParamEntity,
    MJEntityActionEntity,
    MJEntityActionFilterEntity,
    MJEntityActionInvocationEntity,
    MJEntityActionParamEntity,
    MJEntityActionInvocationTypeEntity,
    MJScheduledJobEntity,
    MJScheduledJobTypeEntity,
} from '@memberjunction/core-entities';
import {
    BuildTriggerFilterCode,
    FormatWorkflowValidationErrors,
    NormalizeInvocationType,
    NormalizeTriggers,
    ValidateWorkflowSpec,
    type WorkflowEntityEventTrigger,
    type WorkflowScheduleTrigger,
    type WorkflowSpec,
} from '@memberjunction/ai-core-plus';

/**
 * Scheduled Job Type that runs a workflow's Flow agent.
 *
 * `'Agent'` is an existing seeded type backed by `AgentScheduledJobDriver` — a workflow's schedule
 * reuses it rather than introducing a parallel one. `ScheduledJobType.DriverClass` is UNIQUE, so a
 * second type for the same driver is not merely redundant, it is impossible; discovering that is
 * what confirmed the substrate was already there and only the authoring surface was missing.
 */
export const RUN_WORKFLOW_JOB_TYPE = 'Agent';

/** Marker written into an owned row's `Configuration`, so ownership survives a rename. */
export const WORKFLOW_OWNER_KEY = 'WorkflowAgentID';

/**
 * The Action an entity-change trigger dispatches to.
 *
 * `Execute Agent` already exists and was written for exactly this: "a concrete dispatch target for
 * `AIAgent.ExposeAsAction`". Entity-action *invocation* is likewise already wired — the save pipeline
 * fires validate / before-save / after-save / before-delete / after-delete through
 * `HandleEntityActions`. So an entity-change trigger needs no new machinery at all; it needs a
 * binding row, which is what this creates.
 */
export const EXECUTE_AGENT_ACTION = 'Execute Agent';

/**
 * A trigger's scope, resolved from names to the IDs the binding stores.
 *
 * Both null means "every record of the entity". Present values narrow the binding through the
 * engine's own scope resolver, which is what makes "watch THIS invoice" actually watch one invoice.
 */
type TriggerScope = { EntityID: string | null; RecordID: string | null };

/** Everything reconciliation needs beyond the spec itself. */
export type WorkflowSyncContext = {
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
};

/**
 * Persists the Flow agent behind a workflow's graph.
 *
 * Injected rather than imported so this package does not depend on the agent-manager. The host
 * supplies an implementation backed by `AgentSpecSync`, which is the one place that writes an agent.
 */
export type WorkflowAgentWriter = {
    /** Creates or updates the Flow agent for this workflow. Returns its ID. */
    PersistFlowAgent(spec: WorkflowSpec, context: WorkflowSyncContext): Promise<string>;
};

export type WorkflowSyncResult = {
    Success: boolean;
    /** The Flow agent the workflow's graph persisted as — the handle for everything downstream. */
    AgentID?: string;
    /** Scheduled Jobs created, updated or disabled by this reconciliation. */
    ScheduledJobIDs: string[];
    /** Triggers the spec asked for that this build cannot yet reconcile, stated rather than dropped. */
    Unreconciled: string[];
    ErrorMessage?: string;
};

export class WorkflowSpecSync {
    constructor(private readonly agentWriter: WorkflowAgentWriter | null = null) {}

    /**
     * Reconciles every substrate a workflow owns, so they match the spec.
     *
     * Order matters: the agent is persisted first because a Scheduled Job needs its ID to point at,
     * and a job pointing at an agent that does not exist would be a scheduled no-op — the failure
     * mode where everything looks configured and nothing ever runs.
     */
    public async Persist(spec: WorkflowSpec, context: WorkflowSyncContext): Promise<WorkflowSyncResult> {
        const validation = ValidateWorkflowSpec(spec);
        if (!validation.Valid) {
            const message = `Workflow "${spec?.name}" is invalid:\n${FormatWorkflowValidationErrors(validation.Errors)}`;
            LogError(`[WorkflowSpecSync] ${message}`);
            return { Success: false, ScheduledJobIDs: [], Unreconciled: [], ErrorMessage: message };
        }

        if (!this.agentWriter) {
            const message =
                'No workflow agent writer is registered on this host, so the workflow could not be saved. ' +
                'Persisting a workflow requires the agent-authoring package to be loaded.';
            LogError(`[WorkflowSpecSync] ${message}`);
            return { Success: false, ScheduledJobIDs: [], Unreconciled: [], ErrorMessage: message };
        }

        try {
            const agentID = await this.agentWriter.PersistFlowAgent(spec, context);
            const { ScheduledJobIDs, Unreconciled } = await this.reconcileTriggers(spec, agentID, context);

            LogStatus(
                `[WorkflowSpecSync] Saved "${spec.name}" as agent ${agentID}; ` +
                `${ScheduledJobIDs.length} scheduled job(s) reconciled.`,
            );
            return { Success: true, AgentID: agentID, ScheduledJobIDs, Unreconciled };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[WorkflowSpecSync] Persist failed for "${spec.name}": ${message}`);
            return { Success: false, ScheduledJobIDs: [], Unreconciled: [], ErrorMessage: message };
        }
    }

    /**
     * Brings the workflow's owned trigger rows in line with its spec.
     *
     * A trigger the spec no longer names has its owned row **disabled rather than deleted**. Deleting
     * would destroy the run history attached to it, and a workflow whose schedule someone removed by
     * mistake should be recoverable — the row carries counts, last-run and next-run that are the only
     * record that it ever fired.
     */
    private async reconcileTriggers(
        spec: WorkflowSpec,
        agentID: string,
        context: WorkflowSyncContext,
    ): Promise<{ ScheduledJobIDs: string[]; Unreconciled: string[] }> {
        const triggers = NormalizeTriggers(spec);
        const schedules = triggers.filter((t): t is WorkflowScheduleTrigger => t.type === 'Schedule');

        const events = triggers.filter((t): t is WorkflowEntityEventTrigger => t.type === 'EntityEvent');
        const unreconciled: string[] = [];
        for (const event of events) {
            try {
                await this.reconcileEntityEvent(event, agentID, context);
            } catch (e) {
                // Reported, never dropped: a user who asked for "run this when an invoice changes"
                // and got a workflow that never fires has no way to discover why from the UI.
                unreconciled.push(`EntityEvent on ${event.entityName}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        const typeID = await this.resolveJobTypeID(context);
        const owned = await this.findOwnedJobs(typeID, agentID, context);
        const jobIDs: string[] = [];
        const keep = new Set<string>();

        for (const schedule of schedules) {
            const key = this.scheduleKey(schedule);
            keep.add(key);
            const existing = owned.find((j) => this.scheduleKeyOf(j) === key) ?? null;
            jobIDs.push(await this.upsertScheduledJob(spec, agentID, typeID, schedule, existing, context));
        }

        for (const job of owned) {
            if (keep.has(this.scheduleKeyOf(job) ?? '')) continue;
            if (job.Status === 'Disabled') continue;
            job.Status = 'Disabled';
            if (await job.Save()) {
                jobIDs.push(job.ID);
                LogStatus(`[WorkflowSpecSync] Disabled scheduled job ${job.ID} — its trigger is no longer in the workflow.`);
            } else {
                LogError(`[WorkflowSpecSync] Could not disable scheduled job ${job.ID}: ${job.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }

        return { ScheduledJobIDs: jobIDs, Unreconciled: unreconciled };
    }

    /** Identity of a schedule within a workflow — cron plus zone, matching `TriggerKey`. */
    private scheduleKey(trigger: WorkflowScheduleTrigger): string {
        return `${trigger.cron}|${trigger.timezone ?? ''}`;
    }

    /** The same identity, read back off a persisted job. */
    private scheduleKeyOf(job: MJScheduledJobEntity): string | null {
        return job.CronExpression ? `${job.CronExpression}|${job.Timezone ?? ''}` : null;
    }

    /**
     * Binds an entity-change trigger by creating the Entity Action rows the save pipeline already
     * reads.
     *
     * Nothing here teaches the platform a new trick. `HandleEntityActions` has fired entity actions
     * from the save pipeline all along; what was missing was a row saying "when an Invoice is
     * updated, run Execute Agent with this agent". Three rows express that: the `EntityAction`
     * (which entity, which action), the `EntityActionInvocation` (which change fires it), and an
     * `EntityActionParam` carrying the agent to run.
     *
     * Idempotent by lookup rather than by delete-and-recreate: re-saving a workflow must not detach
     * and re-attach a live trigger, because a change landing in that window would be missed.
     *
     * **Scope reconciles onto the binding's own `ScopeEntityID`/`ScopeRecordID`.** Those columns and
     * the engine's scope resolver already exist for exactly this; leaving them unset while the spec
     * declared a scope produced a workflow firing on every record of the entity while its author
     * believed it was watching one. `filter` reconciles the same way — onto an `ActionFilter` bound
     * through `EntityActionFilter`, the row the invocation path already consults.
     */
    private async reconcileEntityEvent(
        trigger: WorkflowEntityEventTrigger,
        agentID: string,
        context: WorkflowSyncContext,
    ): Promise<void> {
        const rv = RunView.FromMetadataProvider(context.Provider);

        const entity = context.Provider.EntityByName(trigger.entityName);
        if (!entity) throw new Error(`entity "${trigger.entityName}" not found in metadata`);

        const scope = this.resolveScope(trigger, context);

        const actionResult = await rv.RunView<MJActionEntity>(
            { EntityName: 'MJ: Actions', ExtraFilter: `Name='${EXECUTE_AGENT_ACTION}'`, ResultType: 'entity_object' },
            context.ContextUser,
        );
        const action = actionResult.Results?.[0];
        if (!action) throw new Error(`the '${EXECUTE_AGENT_ACTION}' action is not present — has the metadata seed been pushed?`);

        // Resolved through the shared normalizer so the shorthand an author writes ("Update") and
        // the name the platform fires ("AfterUpdate") cannot drift apart.
        const invocationName = NormalizeInvocationType(trigger.invocationType);
        if (!invocationName) throw new Error(`invocation type "${trigger.invocationType}" is not one this platform fires`);

        const invocationResult = await rv.RunView<MJEntityActionInvocationTypeEntity>(
            {
                EntityName: 'MJ: Entity Action Invocation Types',
                ExtraFilter: `Name='${invocationName}'`,
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );
        const invocationType = invocationResult.Results?.[0];
        if (!invocationType) throw new Error(`invocation type "${invocationName}" is not seeded`);

        const entityAction = await this.upsertEntityAction(entity.ID, action.ID, agentID, scope, context);
        await this.upsertInvocation(entityAction.ID, invocationType.ID, context);

        // Which agent to run — fixed for the life of the binding.
        await this.upsertActionParam(entityAction.ID, action.ID, 'AgentID', 'Static', agentID, context);

        // WHICH RECORD changed. Without this the trigger fires and the agent has no idea what it is
        // looking at — a workflow that runs on every invoice update knowing nothing about any
        // invoice. `Entity Object Data` rather than `Entity Object` is not a preference: a
        // BaseEntity serializes to `{}` because its fields are getters, not enumerable own
        // properties, so the live instance would arrive empty. `GetAll()` is what survives the wire.
        await this.upsertActionParam(entityAction.ID, action.ID, 'Data', 'Entity Object Data', null, context);

        await this.reconcileTriggerFilter(entityAction.ID, trigger.filter ?? null, context);
    }

    /**
     * Brings the binding's filter row in line with the trigger's predicate.
     *
     * The trigger's `filter` is an expression; what the platform evaluates is an `ActionFilter.Code`
     * bound through `EntityActionFilter`. That indirection is what lets a workflow narrow *when* it
     * fires without the workflow layer inventing an evaluator of its own — `RunSingleFilter` already
     * compiles, caches and fail-closes this code, and the change context it hands the expression is
     * the same one every other entity action sees.
     *
     * **Removing a filter disables the binding rather than deleting the row.** The `ActionFilter`
     * survives with its code intact, so re-adding the predicate is recoverable and the audit trail of
     * what this trigger used to be narrowed by does not evaporate on a save. A `Disabled` binding is
     * genuinely inert — {@link EntityActionInvocationSingleRecord.ResolveFilters} skips it, which
     * matters because filters fail closed, so a disabled-but-honored filter would not be a no-op, it
     * would be a permanent block.
     */
    private async reconcileTriggerFilter(
        entityActionID: string,
        filter: string | null,
        context: WorkflowSyncContext,
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
                    throw new Error(
                        `could not clear the trigger's filter: ${binding.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    );
                }
            }
            return;
        }

        const filterRow = await this.upsertActionFilter(binding?.ActionFilterID ?? null, expression, context);

        const row = binding
            ?? await context.Provider.GetEntityObject<MJEntityActionFilterEntity>('MJ: Entity Action Filters', context.ContextUser);
        if (!binding) row.NewRecord();
        row.EntityActionID = entityActionID;
        row.ActionFilterID = filterRow.ID;
        row.Sequence = 1;
        row.Status = 'Active';
        if (!(await row.Save())) {
            throw new Error(`could not bind the trigger's filter: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Writes the filter row holding the generated predicate.
     *
     * Reuses the row the binding already points at, so editing a workflow's filter edits one row
     * rather than accumulating an orphan per save. `UserDescription` keeps the author's expression
     * verbatim next to the generated code — without it, reading the row back tells you what the
     * machine produced but not what the person asked for.
     */
    private async upsertActionFilter(
        existingID: string | null,
        expression: string,
        context: WorkflowSyncContext,
    ): Promise<MJActionFilterEntity> {
        const row = await context.Provider.GetEntityObject<MJActionFilterEntity>('MJ: Action Filters', context.ContextUser);
        if (existingID) {
            if (!(await row.Load(existingID))) {
                // The binding pointed at a row that is gone. Falling back to a fresh row is right:
                // the alternative is refusing to save a workflow because of a dangling reference the
                // author never created and cannot see.
                row.NewRecord();
            }
        } else {
            row.NewRecord();
        }

        row.Code = BuildTriggerFilterCode(expression);
        row.UserDescription = expression;
        row.CodeExplanation =
            'Generated from a workflow trigger filter. The expression is evaluated against the record change ' +
            'that fired the trigger; the run proceeds only when it is true.';
        if (!(await row.Save())) {
            throw new Error(`could not save the trigger's filter: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return row;
    }

    /**
     * Turn the spec's scope names into the IDs the binding stores.
     *
     * A scope that names an entity the instance does not have is an error rather than a silent
     * widening: "watch this one invoice" degrading to "watch every invoice" is the failure the
     * scope columns exist to prevent.
     */
    private resolveScope(trigger: WorkflowEntityEventTrigger, context: WorkflowSyncContext): TriggerScope {
        if (!trigger.scopeEntityName?.trim()) {
            return { EntityID: null, RecordID: null };
        }
        const scopeEntity = context.Provider.EntityByName(trigger.scopeEntityName);
        if (!scopeEntity) throw new Error(`scope entity "${trigger.scopeEntityName}" not found in metadata`);
        return { EntityID: scopeEntity.ID, RecordID: trigger.scopeRecordID?.trim() || null };
    }

    /**
     * Finds or creates the Entity Action binding this workflow needs.
     *
     * **Each workflow owns its own binding row.** `Execute Agent` is one shared action, so every
     * workflow watching a given entity would otherwise land on the same `(EntityID, ActionID)` pair
     * — and reusing that row means rewriting its `AgentID`, which silently repoints the first
     * workflow's trigger at the second workflow's agent. Workflow A keeps looking configured, keeps
     * showing its trigger, and never runs again.
     *
     * That shape was briefly impossible: `UQ_EntityAction_ActionID_EntityID`, added by the v5.37.x
     * junction sweep, permitted one binding per (entity, action). The sweep's own stated scope was
     * "pure junction tables ... with no other meaningful data columns", which `EntityAction` — with
     * Status, Sequence, LoggingMode, scope columns and three owned child collections — never met.
     * `V202608080100__v6.1.x__Drop_EntityAction_Uniqueness` removes it, which also unblocks the
     * ordinary case of one action bound to one entity at two different events with different params.
     *
     * Ownership is therefore matched on the agent and the scope, not on entity + action alone.
     */
    private async upsertEntityAction(
        entityID: string,
        actionID: string,
        agentID: string,
        scope: TriggerScope,
        context: WorkflowSyncContext,
    ): Promise<MJEntityActionEntity> {
        const existing = await this.findOwnedEntityAction(entityID, actionID, agentID, scope, context);
        if (existing) {
            if (existing.Status !== 'Active') {
                existing.Status = 'Active';
                if (!(await existing.Save())) {
                    throw new Error(`could not reactivate the entity-action binding: ${existing.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }
            return existing;
        }

        const row = await context.Provider.GetEntityObject<MJEntityActionEntity>('MJ: Entity Actions', context.ContextUser);
        row.NewRecord();
        row.EntityID = entityID;
        row.ActionID = actionID;
        row.ScopeEntityID = scope.EntityID;
        row.ScopeRecordID = scope.RecordID;
        row.Status = 'Active';
        if (!(await row.Save())) {
            throw new Error(`could not create the entity-action binding: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return row;
    }

    /**
     * This workflow's own binding at this scope, if it already has one.
     *
     * Ownership lives in the `AgentID` param rather than on the binding row, so candidates are
     * narrowed in SQL by entity + action + scope and then matched on that param. Scope is part of
     * the identity because narrowing a trigger to a different record is a *different* subscription,
     * not an edit of the existing one — matching without it would silently re-point the old binding.
     */
    private async findOwnedEntityAction(
        entityID: string,
        actionID: string,
        agentID: string,
        scope: TriggerScope,
        context: WorkflowSyncContext,
    ): Promise<MJEntityActionEntity | null> {
        const rv = RunView.FromMetadataProvider(context.Provider);
        const scopeFilter =
            `AND ScopeEntityID ${scope.EntityID ? `= '${scope.EntityID}'` : 'IS NULL'} ` +
            `AND ScopeRecordID ${scope.RecordID ? `= '${scope.RecordID}'` : 'IS NULL'}`;

        const result = await rv.RunView<MJEntityActionEntity>(
            {
                EntityName: 'MJ: Entity Actions',
                ExtraFilter: `EntityID='${entityID}' AND ActionID='${actionID}' ${scopeFilter}`,
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );
        const candidates = result.Results ?? [];
        if (candidates.length === 0) return null;

        const params = await rv.RunView<MJEntityActionParamEntity>(
            {
                EntityName: 'MJ: Entity Action Params',
                ExtraFilter:
                    `ActionParam='AgentID' AND EntityActionID IN (${candidates.map((c) => `'${c.ID}'`).join(',')})`,
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );
        const mine = (params.Results ?? []).find((p) => p.Value != null && UUIDsEqual(p.Value, agentID));
        return mine ? candidates.find((c) => UUIDsEqual(c.ID, mine.EntityActionID)) ?? null : null;
    }

    /** Finds or creates the invocation row that says which change fires the action. */
    private async upsertInvocation(
        entityActionID: string,
        invocationTypeID: string,
        context: WorkflowSyncContext,
    ): Promise<void> {
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJEntityActionInvocationEntity>(
            {
                EntityName: 'MJ: Entity Action Invocations',
                ExtraFilter: `EntityActionID='${entityActionID}' AND InvocationTypeID='${invocationTypeID}'`,
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );
        const existing = result.Results?.[0];
        if (existing) {
            if (existing.Status !== 'Active') {
                existing.Status = 'Active';
                await existing.Save();
            }
            return;
        }

        const row = await context.Provider.GetEntityObject<MJEntityActionInvocationEntity>('MJ: Entity Action Invocations', context.ContextUser);
        row.NewRecord();
        row.EntityActionID = entityActionID;
        row.InvocationTypeID = invocationTypeID;
        row.Status = 'Active';
        if (!(await row.Save())) {
            throw new Error(`could not create the invocation binding: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Finds or creates one Entity Action Param binding.
     *
     * `value` is null for value types the platform derives at invocation time (`Entity Object Data`,
     * `Entity Object`, `Entity Field`) — for those the ValueType *is* the instruction.
     */
    private async upsertActionParam(
        entityActionID: string,
        actionID: string,
        paramName: string,
        valueType: MJEntityActionParamEntity['ValueType'],
        value: string | null,
        context: WorkflowSyncContext,
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
            // Surfaced rather than left as a trigger that fires and does nothing useful.
            throw new Error(`the '${EXECUTE_AGENT_ACTION}' action has no ${paramName} parameter to bind`);
        }

        const existingResult = await rv.RunView<MJEntityActionParamEntity>(
            {
                EntityName: 'MJ: Entity Action Params',
                ExtraFilter: `EntityActionID='${entityActionID}' AND ActionParamID='${actionParam.ID}'`,
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );
        const row = existingResult.Results?.[0]
            ?? await context.Provider.GetEntityObject<MJEntityActionParamEntity>('MJ: Entity Action Params', context.ContextUser);
        if (!existingResult.Results?.[0]) row.NewRecord();

        row.EntityActionID = entityActionID;
        row.ActionParamID = actionParam.ID;
        row.ValueType = valueType;
        row.Value = value;
        if (!(await row.Save())) {
            throw new Error(`could not bind ${paramName} to the trigger: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    private async resolveJobTypeID(context: WorkflowSyncContext): Promise<string> {
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJScheduledJobTypeEntity>(
            {
                EntityName: 'MJ: Scheduled Job Types',
                ExtraFilter: `Name='${RUN_WORKFLOW_JOB_TYPE}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            context.ContextUser,
        );
        if (!result.Success || (result.Results?.length ?? 0) === 0) {
            throw new Error(
                `Scheduled Job Type '${RUN_WORKFLOW_JOB_TYPE}' not found — has the metadata seed been pushed?`,
            );
        }
        return result.Results![0].ID;
    }

    /**
     * Finds the Scheduled Jobs this workflow owns.
     *
     * Matched on a marker inside `Configuration` rather than on name, so renaming a workflow does not
     * orphan its schedule and leave a second one firing alongside the new row.
     */
    private async findOwnedJobs(
        typeID: string,
        agentID: string,
        context: WorkflowSyncContext,
    ): Promise<MJScheduledJobEntity[]> {
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJScheduledJobEntity>(
            { EntityName: 'MJ: Scheduled Jobs', ExtraFilter: `JobTypeID='${typeID}'`, ResultType: 'entity_object' },
            context.ContextUser,
        );
        if (!result.Success) return [];

        return (result.Results ?? []).filter((job) => {
            const cfg = SafeJSONParse<Record<string, string>>(job.Configuration ?? '');
            const owner = cfg?.[WORKFLOW_OWNER_KEY];
            return !!owner && UUIDsEqual(owner, agentID);
        });
    }

    /** Creates or updates one owned Scheduled Job so it matches the trigger. */
    private async upsertScheduledJob(
        spec: WorkflowSpec,
        agentID: string,
        typeID: string,
        trigger: WorkflowScheduleTrigger,
        existing: MJScheduledJobEntity | null,
        context: WorkflowSyncContext,
    ): Promise<string> {
        const job = existing ?? await context.Provider.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', context.ContextUser);
        if (!existing) {
            job.NewRecord();
            if (context.ContextUser?.ID) job.OwnerUserID = context.ContextUser.ID;
        }

        job.JobTypeID = typeID;
        job.Name = `Workflow: ${spec.name}`;
        job.Description = spec.description ?? null;
        job.CronExpression = trigger.cron;
        job.Timezone = trigger.timezone ?? null;
        job.Configuration = JSON.stringify({ [WORKFLOW_OWNER_KEY]: agentID, AgentID: agentID });
        // The spec's own status governs. A Draft or Paused workflow persists its schedule but does
        // not fire — which is what lets someone build the whole thing, look at it, and then turn it on.
        job.Status = spec.status === 'Active' ? 'Active' : 'Disabled';

        if (spec.notifications) {
            job.NotifyOnFailure = true;
            job.NotifyOnSuccess = spec.notifications.condition === 'Always';
        }

        if (!(await job.Save())) {
            throw new Error(
                `Could not save the schedule for workflow "${spec.name}": ${job.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return job.ID;
    }
}
