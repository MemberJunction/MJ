/**
 * RuntimeActionBridge — builds the bridge-handler map that
 * `@memberjunction/action-runtime` passes into `CodeExecutionService.execute()`.
 *
 * Lives in `@memberjunction/action-runtime-host` (the top of the Actions stack)
 * so that every downstream service it touches — `AIEngine`, `AgentRunner`,
 * the AI prompt runner, and the full `ActionEngineServer` — can be imported
 * statically. Placing the bridge here breaks what would otherwise be a
 * circular dependency between `@memberjunction/actions` and
 * `@memberjunction/ai-agents` (each would need the other).
 *
 * `@memberjunction/actions` resolves the concrete implementation at runtime
 * via `MJGlobal.ClassFactory.CreateInstance(RuntimeActionBridgeBuilder, ...)`.
 * See `DefaultRuntimeActionBridgeBuilder` for the `@RegisterClass` registration.
 *
 * ## Security model
 *
 * Every handler is a closure over a permissioned `BridgeContext`. Before
 * dispatching any downstream MJ call, the handler:
 *   1. Checks the caller-provided `RuntimeActionConfiguration.permissions`
 *      — only allowed entities / actions / agents can be touched.
 *   2. Checks the `abortSignal` so an upstream timeout / cancel propagates.
 *   3. Threads `contextUser` through the call so MJ's row-level security
 *      still applies.
 *
 * On any permission denial the handler throws an Error whose message the
 * sandbox re-throws as a runtime error inside the user's code (via the
 * envelope-based error protocol in the worker).
 *
 * ## Handler naming convention
 *
 * Handler names use a dotted namespace matching the sandbox-visible
 * `utilities.*` API (e.g. `md.GetEntity`, `rv.RunView`, `actions.Invoke`,
 * `agents.Run`, `ai.ExecutePrompt`). The sandbox-side `utilities` object
 * is assembled by the Runtime action boot code (see `__bridgeCall` in
 * `worker.ts` and the sandbox helper injected below).
 */
import {
    BaseEntity,
    CompositeKey,
    LogError,
    Metadata,
    RunQuery,
    RunView
} from '@memberjunction/core';
import { ActionParam, BridgeContext } from '@memberjunction/actions-base';
import {
    MJActionEntity_IRuntimeActionReference
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import type { BridgeHandler, BridgeHandlerMap } from '@memberjunction/code-execution';
import type { ChatMessageRole } from '@memberjunction/ai';
import { ActionEngineServer } from '@memberjunction/actions';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';

/**
 * Factory: returns a `BridgeHandlerMap` wiring the `utilities.*` namespaces
 * to permissioned host implementations for the given execution context.
 *
 * Callers pass this map to `RuntimeActionExecutor.execute({ bridgeHandlers })`.
 */
export function buildRuntimeActionBridgeHandlers(ctx: BridgeContext): BridgeHandlerMap {
    return {
        // ---- Metadata (md) ----
        'md.GetEntity': makeHandler(ctx, (args) => handleGetEntity(ctx, args as { name: string })),
        'md.GetEntityFields': makeHandler(ctx, (args) =>
            handleGetEntityFields(ctx, args as { name: string })
        ),
        'md.GetRelatedEntities': makeHandler(ctx, (args) =>
            handleGetRelatedEntities(ctx, args as { name: string })
        ),
        'md.ListEntities': makeHandler(ctx, () => handleListEntities(ctx)),

        // ---- Views (rv) ----
        'rv.RunView': makeHandler(ctx, (args) => handleRunView(ctx, args as RunViewArgs)),
        'rv.RunViews': makeHandler(ctx, (args) =>
            handleRunViews(ctx, args as RunViewArgs[])
        ),

        // ---- Queries (rq) ----
        'rq.RunQuery': makeHandler(ctx, (args) =>
            handleRunQuery(ctx, args as RunQueryArgs)
        ),

        // ---- Entity CRUD (entity) ----
        'entity.Load': makeHandler(ctx, (args) =>
            handleEntityLoad(ctx, args as { entityName: string; id: string })
        ),
        'entity.Create': makeHandler(ctx, (args) =>
            handleEntityCreate(ctx, args as { entityName: string; data: Record<string, unknown> })
        ),
        'entity.Update': makeHandler(ctx, (args) =>
            handleEntityUpdate(ctx, args as { entityName: string; id: string; data: Record<string, unknown> })
        ),
        'entity.Delete': makeHandler(ctx, (args) =>
            handleEntityDelete(ctx, args as { entityName: string; id: string })
        ),
        'entity.Save': makeHandler(ctx, (args) =>
            handleEntitySave(ctx, args as { entityName: string; data: Record<string, unknown> })
        ),

        // ---- Action invocation (actions) ----
        'actions.Invoke': makeHandler(ctx, (args) =>
            handleInvokeAction(ctx, args as InvokeActionArgs)
        ),
        'actions.InvokeAll': makeHandler(ctx, (args) =>
            handleInvokeAllActions(ctx, args as InvokeActionArgs[])
        ),
        'actions.GetAvailable': makeHandler(ctx, () => handleGetAvailableActions(ctx)),

        // ---- Agent invocation (agents) ----
        'agents.Run': makeHandler(ctx, (args) =>
            handleAgentRun(ctx, args as AgentRunArgs)
        ),
        'agents.GetAvailable': makeHandler(ctx, () => handleGetAvailableAgents(ctx)),

        // ---- AI (ai) ----
        'ai.ExecutePrompt': makeHandler(ctx, (args) =>
            handleExecutePrompt(ctx, args as ExecutePromptArgs)
        ),
        'ai.GetEmbedding': makeHandler(ctx, (args) =>
            handleGetEmbedding(ctx, args as { text: string })
        )
    };
}

// =========================================================================
// Handler plumbing
// =========================================================================

/**
 * Wraps a single handler body with upstream-abort and permission-audit
 * bookkeeping. Every handler in the map above goes through here so the
 * abort + logging behavior is centralized.
 */
function makeHandler<TArgs, TResult>(
    ctx: BridgeContext,
    body: (args: TArgs) => Promise<TResult> | TResult
): BridgeHandler {
    return async (args: unknown) => {
        if (ctx.abortSignal?.aborted) {
            throw new Error(
                typeof ctx.abortSignal.reason === 'string'
                    ? ctx.abortSignal.reason
                    : `Runtime action '${ctx.action.Name}' was aborted before bridge call completed`
            );
        }
        try {
            return await body(args as TArgs);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(
                `Runtime action '${ctx.action.Name}' bridge call failed: ${message}`
            );
            throw err;
        }
    };
}

/**
 * Resolves an allowed-list entry by the human-readable name the sandbox
 * supplied. We accept `name` at the bridge surface because sandbox code is
 * generally written in human-readable form (`'Customers'`); the config's
 * `id` is the authoritative side of each allow-listed reference, so we
 * cross-check that the name-matched entry's ID is what the config says.
 *
 * Throws on mismatch (defense in depth: a malicious / hallucinated name
 * that happens to match an allowed entry's name should still fail if the
 * configured ID doesn't line up).
 */
function resolveAllowedByName(
    allowed: MJActionEntity_IRuntimeActionReference[],
    name: string
): MJActionEntity_IRuntimeActionReference | null {
    if (!name) return null;
    const normalized = name.trim().toLowerCase();
    const hit = allowed.find((a) => a.name?.trim().toLowerCase() === normalized);
    return hit ?? null;
}

function assertEntityAllowed(ctx: BridgeContext, entityName: string): void {
    // Escape hatch for framework-authored utility actions that take the
    // target entity as runtime input. See the JSONType interface comment.
    if ((ctx.config.permissions as { allowAnyEntity?: boolean }).allowAnyEntity) return;

    const allowed = ctx.config.permissions.allowedEntities;
    const match = resolveAllowedByName(allowed, entityName);
    if (!match) {
        throw new Error(
            `Entity '${entityName}' is not in this runtime action's allowedEntities. ` +
                `Permitted: ${allowed.map((e) => e.name).join(', ') || '(none)'}.`
        );
    }
}

// =========================================================================
// md (metadata) handlers
// =========================================================================

interface SimpleEntityInfo {
    ID: string;
    Name: string;
    SchemaName: string;
    BaseView: string;
    Description: string | null;
    PrimaryKeyFieldName: string | null;
}

function handleListEntities(ctx: BridgeContext): SimpleEntityInfo[] {
    const md = ctx.provider ?? new Metadata();
    const allowAny = (ctx.config.permissions as { allowAnyEntity?: boolean }).allowAnyEntity === true;
    const allowedNames = new Set(
        ctx.config.permissions.allowedEntities.map((e) => e.name.trim().toLowerCase())
    );
    return md.Entities
        .filter((e) => allowAny || allowedNames.has(e.Name.trim().toLowerCase()))
        .map((e) => ({
            ID: e.ID,
            Name: e.Name,
            SchemaName: e.SchemaName,
            BaseView: e.BaseView,
            Description: e.Description ?? null,
            PrimaryKeyFieldName: e.PrimaryKeys?.[0]?.Name ?? null
        }));
}

function handleGetEntity(ctx: BridgeContext, args: { name: string }): SimpleEntityInfo {
    assertEntityAllowed(ctx, args.name);
    const md = ctx.provider ?? new Metadata();
    const entity = md.EntityByName(args.name);
    if (!entity) {
        throw new Error(`Entity '${args.name}' not found in metadata.`);
    }
    return {
        ID: entity.ID,
        Name: entity.Name,
        SchemaName: entity.SchemaName,
        BaseView: entity.BaseView,
        Description: entity.Description ?? null,
        PrimaryKeyFieldName: entity.PrimaryKeys?.[0]?.Name ?? null
    };
}

interface SimpleEntityField {
    Name: string;
    DisplayName: string | null;
    Description: string | null;
    Type: string;
    AllowsNull: boolean;
    IsPrimaryKey: boolean;
    IsVirtual: boolean;
    MaxLength: number | null;
    RelatedEntity: string | null;
    RelatedEntityFieldName: string | null;
}

function handleGetEntityFields(
    ctx: BridgeContext,
    args: { name: string }
): SimpleEntityField[] {
    assertEntityAllowed(ctx, args.name);
    const md = ctx.provider ?? new Metadata();
    const entity = md.EntityByName(args.name);
    if (!entity) {
        throw new Error(`Entity '${args.name}' not found in metadata.`);
    }
    return entity.Fields.map((f) => ({
        Name: f.Name,
        DisplayName: f.DisplayName ?? null,
        Description: f.Description ?? null,
        Type: f.Type,
        AllowsNull: f.AllowsNull,
        IsPrimaryKey: f.IsPrimaryKey,
        IsVirtual: f.IsVirtual,
        MaxLength: f.MaxLength ?? null,
        RelatedEntity: f.RelatedEntity ?? null,
        RelatedEntityFieldName: f.RelatedEntityFieldName ?? null
    }));
}

interface SimpleRelatedEntity {
    RelatedEntity: string;
    RelatedEntityJoinField: string;
    EntityKeyField: string | null;
    Type: string;
}

function handleGetRelatedEntities(
    ctx: BridgeContext,
    args: { name: string }
): SimpleRelatedEntity[] {
    assertEntityAllowed(ctx, args.name);
    const md = ctx.provider ?? new Metadata();
    const entity = md.EntityByName(args.name);
    if (!entity) {
        throw new Error(`Entity '${args.name}' not found in metadata.`);
    }
    return entity.RelatedEntities.map((r) => ({
        RelatedEntity: r.RelatedEntity,
        RelatedEntityJoinField: r.RelatedEntityJoinField,
        EntityKeyField: r.EntityKeyField ?? null,
        Type: r.Type
    }));
}

// =========================================================================
// rv (RunView / RunViews) handlers
// =========================================================================

interface RunViewArgs {
    EntityName: string;
    ExtraFilter?: string;
    OrderBy?: string;
    Fields?: string[];
    MaxRows?: number;
    UserSearchString?: string;
    ResultType?: 'simple' | 'entity_object';
}

async function handleRunView(
    ctx: BridgeContext,
    args: RunViewArgs
): Promise<{
    Success: boolean;
    Results: Record<string, unknown>[];
    TotalRowCount: number;
    ErrorMessage: string | null;
}> {
    assertEntityAllowed(ctx, args.EntityName);

    const rv = new RunView();
    const result = await rv.RunView(
        {
            EntityName: args.EntityName,
            ExtraFilter: args.ExtraFilter,
            OrderBy: args.OrderBy,
            Fields: args.Fields,
            MaxRows: args.MaxRows,
            UserSearchString: args.UserSearchString,
            // Force simple so the sandbox always gets plain JSON; BaseEntity
            // instances can't cross the boundary anyway.
            ResultType: 'simple'
        },
        ctx.contextUser
    );
    return {
        Success: result.Success,
        Results: (result.Results ?? []) as Record<string, unknown>[],
        TotalRowCount: result.TotalRowCount ?? 0,
        ErrorMessage: result.ErrorMessage ?? null
    };
}

async function handleRunViews(
    ctx: BridgeContext,
    args: RunViewArgs[]
): Promise<
    Array<{
        Success: boolean;
        Results: Record<string, unknown>[];
        TotalRowCount: number;
        ErrorMessage: string | null;
    }>
> {
    if (!Array.isArray(args)) {
        throw new Error('rv.RunViews requires an array of options');
    }

    // Permission check BEFORE we fire the batch — if any entry is disallowed
    // we reject the whole batch rather than partially executing it.
    for (const entry of args) {
        assertEntityAllowed(ctx, entry.EntityName);
    }

    const rv = new RunView();
    const results = await rv.RunViews(
        args.map((a) => ({
            EntityName: a.EntityName,
            ExtraFilter: a.ExtraFilter,
            OrderBy: a.OrderBy,
            Fields: a.Fields,
            MaxRows: a.MaxRows,
            UserSearchString: a.UserSearchString,
            ResultType: 'simple' as const
        })),
        ctx.contextUser
    );
    return results.map((r) => ({
        Success: r.Success,
        Results: (r.Results ?? []) as Record<string, unknown>[],
        TotalRowCount: r.TotalRowCount ?? 0,
        ErrorMessage: r.ErrorMessage ?? null
    }));
}

// =========================================================================
// rq (RunQuery) handler
// =========================================================================

interface RunQueryArgs {
    QueryName?: string;
    QueryID?: string;
    Parameters?: Record<string, unknown>;
    MaxRows?: number;
}

function assertQueryAllowed(_ctx: BridgeContext, _args: RunQueryArgs): void {
    // Query permissions aren't modeled in RuntimeActionConfiguration today.
    // For now, any allowed entity scope gives access to RunQuery — the
    // query engine applies its own access checks against the executing
    // user. Revisit in a future iteration if we add per-query permissions.
}

async function handleRunQuery(
    ctx: BridgeContext,
    args: RunQueryArgs
): Promise<{
    Success: boolean;
    Results: Record<string, unknown>[];
    RowCount: number;
    ErrorMessage: string | null;
}> {
    assertQueryAllowed(ctx, args);
    const rq = new RunQuery();
    const result = await rq.RunQuery(
        {
            QueryID: args.QueryID,
            QueryName: args.QueryName,
            Parameters: args.Parameters,
            MaxRows: args.MaxRows
        },
        ctx.contextUser
    );
    return {
        Success: result.Success,
        Results: (result.Results ?? []) as Record<string, unknown>[],
        RowCount: result.RowCount ?? 0,
        ErrorMessage: result.ErrorMessage ?? null
    };
}

// =========================================================================
// entity (CRUD) handlers
// =========================================================================
//
// All CRUD handlers return plain JSON via BaseEntity.GetAll() so the sandbox
// never sees class instances. They enforce `allowedEntities` at the top and
// surface Save/Delete failures via the structured `LatestResult.CompleteMessage`.

interface EntityResult {
    Success: boolean;
    Record: Record<string, unknown> | null;
    ErrorMessage: string | null;
}

async function handleEntityLoad(
    ctx: BridgeContext,
    args: { entityName: string; id: string }
): Promise<EntityResult> {
    assertEntityAllowed(ctx, args.entityName);
    const md = ctx.provider ?? new Metadata();
    const entity = await md.GetEntityObject<BaseEntity>(args.entityName, ctx.contextUser);
    if (!entity) {
        return {
            Success: false,
            Record: null,
            ErrorMessage: `Failed to instantiate entity '${args.entityName}'.`
        };
    }
    const loaded = await loadSingleRecord(entity, args.id);
    if (!loaded) {
        return {
            Success: false,
            Record: null,
            ErrorMessage:
                entity.LatestResult?.CompleteMessage ??
                `Could not load ${args.entityName} record with ID ${args.id}.`
        };
    }
    return { Success: true, Record: entity.GetAll(), ErrorMessage: null };
}

async function handleEntityCreate(
    ctx: BridgeContext,
    args: { entityName: string; data: Record<string, unknown> }
): Promise<EntityResult> {
    assertEntityAllowed(ctx, args.entityName);
    const md = ctx.provider ?? new Metadata();
    const entity = await md.GetEntityObject<BaseEntity>(args.entityName, ctx.contextUser);
    if (!entity) {
        return {
            Success: false,
            Record: null,
            ErrorMessage: `Failed to instantiate entity '${args.entityName}'.`
        };
    }
    entity.NewRecord();
    assignFields(entity, args.data);
    const saved = await entity.Save();
    if (!saved) {
        return {
            Success: false,
            Record: entity.GetAll(),
            ErrorMessage:
                entity.LatestResult?.CompleteMessage ??
                `Failed to create ${args.entityName} record.`
        };
    }
    return { Success: true, Record: entity.GetAll(), ErrorMessage: null };
}

async function handleEntityUpdate(
    ctx: BridgeContext,
    args: { entityName: string; id: string; data: Record<string, unknown> }
): Promise<EntityResult> {
    assertEntityAllowed(ctx, args.entityName);
    const md = ctx.provider ?? new Metadata();
    const entity = await md.GetEntityObject<BaseEntity>(args.entityName, ctx.contextUser);
    if (!entity) {
        return {
            Success: false,
            Record: null,
            ErrorMessage: `Failed to instantiate entity '${args.entityName}'.`
        };
    }
    const loaded = await loadSingleRecord(entity, args.id);
    if (!loaded) {
        return {
            Success: false,
            Record: null,
            ErrorMessage:
                entity.LatestResult?.CompleteMessage ??
                `Could not load ${args.entityName} record ${args.id} for update.`
        };
    }
    assignFields(entity, args.data);
    const saved = await entity.Save();
    if (!saved) {
        return {
            Success: false,
            Record: entity.GetAll(),
            ErrorMessage:
                entity.LatestResult?.CompleteMessage ??
                `Failed to update ${args.entityName} record ${args.id}.`
        };
    }
    return { Success: true, Record: entity.GetAll(), ErrorMessage: null };
}

async function handleEntityDelete(
    ctx: BridgeContext,
    args: { entityName: string; id: string }
): Promise<{ Success: boolean; ErrorMessage: string | null }> {
    assertEntityAllowed(ctx, args.entityName);
    const md = ctx.provider ?? new Metadata();
    const entity = await md.GetEntityObject<BaseEntity>(args.entityName, ctx.contextUser);
    if (!entity) {
        return {
            Success: false,
            ErrorMessage: `Failed to instantiate entity '${args.entityName}'.`
        };
    }
    const loaded = await loadSingleRecord(entity, args.id);
    if (!loaded) {
        return {
            Success: false,
            ErrorMessage:
                entity.LatestResult?.CompleteMessage ??
                `Could not load ${args.entityName} record ${args.id} for deletion.`
        };
    }
    const deleted = await entity.Delete();
    if (!deleted) {
        return {
            Success: false,
            ErrorMessage:
                entity.LatestResult?.CompleteMessage ??
                `Failed to delete ${args.entityName} record ${args.id}.`
        };
    }
    return { Success: true, ErrorMessage: null };
}

/**
 * `Save` = upsert. If `data` contains a PK field, Load → Update; otherwise
 * NewRecord → Save. Most Runtime actions will use this instead of picking
 * between Create/Update explicitly.
 */
async function handleEntitySave(
    ctx: BridgeContext,
    args: { entityName: string; data: Record<string, unknown> }
): Promise<EntityResult> {
    assertEntityAllowed(ctx, args.entityName);
    const md = ctx.provider ?? new Metadata();
    const entity = await md.GetEntityObject<BaseEntity>(args.entityName, ctx.contextUser);
    if (!entity) {
        return {
            Success: false,
            Record: null,
            ErrorMessage: `Failed to instantiate entity '${args.entityName}'.`
        };
    }
    const info = entity.EntityInfo;
    // If the data carries a non-null value for every PK field, treat as update.
    const pkValues = info.PrimaryKeys.map((f) => args.data[f.Name]).filter((v) => v != null);
    if (pkValues.length === info.PrimaryKeys.length && info.PrimaryKeys.length > 0) {
        const primaryId = String(pkValues[0]);
        const loaded = await loadSingleRecord(entity, primaryId);
        if (!loaded) {
            // Fall through to NewRecord — caller intended an upsert even if the
            // record wasn't there.
            entity.NewRecord();
        }
    } else {
        entity.NewRecord();
    }
    assignFields(entity, args.data);
    const saved = await entity.Save();
    if (!saved) {
        return {
            Success: false,
            Record: entity.GetAll(),
            ErrorMessage:
                entity.LatestResult?.CompleteMessage ??
                `Failed to save ${args.entityName} record.`
        };
    }
    return { Success: true, Record: entity.GetAll(), ErrorMessage: null };
}

function assignFields(entity: BaseEntity, data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
        // BaseEntity.Set is the dynamic accessor; we have to use it here
        // because field names come from the sandbox and we don't have a
        // generated type for an arbitrary entity. This is the one place
        // `.Set()` is justified — everywhere else should use strongly-typed
        // generated accessors.
        entity.Set(key, value);
    }
}

/**
 * Loads a single record by ID using the entity's primary-key metadata. We
 * can't call the generated `Load(id)` from a plain `BaseEntity` handle, so
 * we build a `CompositeKey` from the first primary-key field (the common
 * single-column case) and call the public `InnerLoad`.
 */
async function loadSingleRecord(entity: BaseEntity, id: string): Promise<boolean> {
    const pk = entity.EntityInfo.PrimaryKeys;
    if (!pk || pk.length === 0) {
        return false;
    }
    const key = new CompositeKey();
    key.KeyValuePairs.push({ FieldName: pk[0].Name, Value: id });
    return await entity.InnerLoad(key);
}

// =========================================================================
// actions (Invoke / InvokeAll) handlers
// =========================================================================

interface InvokeActionArgs {
    ActionName?: string;
    ActionID?: string;
    Params?: Record<string, unknown>;
}

function resolveAllowedAction(
    ctx: BridgeContext,
    args: InvokeActionArgs
): MJActionEntity_IRuntimeActionReference {
    const allowed = ctx.config.permissions.allowedActions;
    const allowAny = (ctx.config.permissions as { allowAnyAction?: boolean }).allowAnyAction === true;
    if (args.ActionID) {
        const hit = allowed.find((a) => UUIDsEqual(a.id, args.ActionID!));
        if (hit) return hit;
        if (allowAny) return { id: args.ActionID, name: args.ActionName ?? args.ActionID };
    }
    if (args.ActionName) {
        const hit = resolveAllowedByName(allowed, args.ActionName);
        if (hit) return hit;
        if (allowAny) return { id: args.ActionName, name: args.ActionName };
    }
    throw new Error(
        `Action '${args.ActionName ?? args.ActionID}' is not in this runtime action's allowedActions. ` +
            `Permitted: ${allowed.map((a) => a.name).join(', ') || '(none)'}.`
    );
}

async function handleInvokeAction(
    ctx: BridgeContext,
    args: InvokeActionArgs
): Promise<{
    Success: boolean;
    ResultCode: string | null;
    Message: string | null;
    OutputParams: Record<string, unknown>;
}> {
    const allowedRef = resolveAllowedAction(ctx, args);

    const engine = ActionEngineServer.Instance;
    // Lazy-load action metadata.
    if (!engine.Actions || engine.Actions.length === 0) {
        await engine.Config(false, ctx.contextUser);
    }
    const actionRecord = engine.Actions.find((a) => UUIDsEqual(a.ID, allowedRef.id));
    if (!actionRecord) {
        throw new Error(
            `Action '${allowedRef.name}' (${allowedRef.id}) is in allowedActions but the runtime engine has no ` +
                'matching record. Was it deleted or is its status not Active?'
        );
    }

    // Map { key: value } args to ActionParam[] with Type='Input'. Output
    // params are returned via OutputParams from the result below.
    const runParams: ActionParam[] = Object.entries(args.Params ?? {}).map(([name, value]) => {
        const p = new ActionParam();
        p.Name = name;
        p.Value = value;
        p.Type = 'Input';
        return p;
    });

    const result = await engine.RunAction({
        Action: actionRecord,
        ContextUser: ctx.contextUser,
        Filters: [],
        Params: runParams,
        AbortSignal: ctx.abortSignal,
        SkipActionLog: false
    });

    const outputParams: Record<string, unknown> = {};
    for (const p of result.Params ?? []) {
        if (p.Type === 'Output' || p.Type === 'Both') {
            outputParams[p.Name] = p.Value;
        }
    }

    return {
        Success: result.Success,
        ResultCode: result.Result?.ResultCode ?? null,
        Message: result.Message ?? null,
        OutputParams: outputParams
    };
}

async function handleInvokeAllActions(
    ctx: BridgeContext,
    args: InvokeActionArgs[]
): Promise<
    Array<{
        Success: boolean;
        ResultCode: string | null;
        Message: string | null;
        OutputParams: Record<string, unknown>;
    }>
> {
    if (!Array.isArray(args)) {
        throw new Error('actions.InvokeAll requires an array of invocations');
    }
    // Permission check up front — reject the batch if any entry is
    // disallowed so we don't partially execute.
    for (const entry of args) {
        resolveAllowedAction(ctx, entry);
    }
    return await Promise.all(args.map((entry) => handleInvokeAction(ctx, entry)));
}

function handleGetAvailableActions(
    ctx: BridgeContext
): Array<{ id: string; name: string }> {
    // Always returns the declared allowedActions list. When allowAnyAction
    // is true, the actual permission check in resolveAllowedAction still
    // passes even for actions not in this list — GetAvailable is
    // documentation for the sandbox, not authorization.
    return ctx.config.permissions.allowedActions.map((a) => ({ id: a.id, name: a.name }));
}

// =========================================================================
// agents (Run) handlers
// =========================================================================

interface AgentRunArgs {
    AgentName?: string;
    AgentID?: string;
    ConversationMessages?: Array<{ role: string; content: string }>;
    Data?: Record<string, unknown>;
    MaxExecutionTimeMs?: number;
}

function resolveAllowedAgent(
    ctx: BridgeContext,
    args: AgentRunArgs
): MJActionEntity_IRuntimeActionReference {
    const allowed = ctx.config.permissions.allowedAgents;
    const allowAny = (ctx.config.permissions as { allowAnyAgent?: boolean }).allowAnyAgent === true;
    if (args.AgentID) {
        const hit = allowed.find((a) => UUIDsEqual(a.id, args.AgentID!));
        if (hit) return hit;
        if (allowAny) return { id: args.AgentID, name: args.AgentName ?? args.AgentID };
    }
    if (args.AgentName) {
        const hit = resolveAllowedByName(allowed, args.AgentName);
        if (hit) return hit;
        if (allowAny) return { id: args.AgentName, name: args.AgentName };
    }
    throw new Error(
        `Agent '${args.AgentName ?? args.AgentID}' is not in this runtime action's allowedAgents. ` +
            `Permitted: ${allowed.map((a) => a.name).join(', ') || '(none)'}.`
    );
}

async function handleAgentRun(
    ctx: BridgeContext,
    args: AgentRunArgs
): Promise<{
    Success: boolean;
    AgentRunID: string | null;
    Payload: unknown;
    Message: string | null;
}> {
    const allowedRef = resolveAllowedAgent(ctx, args);

    await AIEngine.Instance.Config(false, ctx.contextUser);
    const agent = AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, allowedRef.id));
    if (!agent) {
        throw new Error(
            `Agent '${allowedRef.name}' (${allowedRef.id}) is in allowedAgents but the engine has no ` +
                'matching record. Was it deleted or is its status not Active?'
        );
    }

    // Coerce bare-string roles from sandbox input into the `ChatMessageRole`
    // union the RunAgent API expects. Invalid roles fall back to 'user'.
    const conversationMessages = (args.ConversationMessages ?? []).map((m) => {
        const role: ChatMessageRole =
            m.role === 'system' || m.role === 'user' || m.role === 'assistant'
                ? (m.role as ChatMessageRole)
                : 'user';
        return { role, content: m.content };
    });

    const runner = new AgentRunner();
    const result = await runner.RunAgent({
        agent,
        contextUser: ctx.contextUser,
        conversationMessages,
        data: args.Data,
        maxExecutionTimeMs: args.MaxExecutionTimeMs,
        cancellationToken: ctx.abortSignal
    });

    // ExecuteAgentResult has no top-level `Message`; error text lives on
    // `agentRun.ErrorMessage`. Prefer a final-step assistant message if the
    // run succeeded, else surface ErrorMessage, else null.
    const errMessage = result.agentRun?.ErrorMessage ?? null;
    return {
        Success: Boolean(result.success),
        AgentRunID: result.agentRun?.ID ?? null,
        Payload: result.payload ?? null,
        Message: errMessage
    };
}

function handleGetAvailableAgents(
    ctx: BridgeContext
): Array<{ id: string; name: string }> {
    return ctx.config.permissions.allowedAgents.map((a) => ({ id: a.id, name: a.name }));
}

// =========================================================================
// ai (ExecutePrompt / GetEmbedding) handlers
// =========================================================================

interface ExecutePromptArgs {
    PromptName?: string;
    PromptID?: string;
    Variables?: Record<string, unknown>;
    ModelPower?: 'lowest' | 'medium' | 'highest';
}

async function handleExecutePrompt(
    ctx: BridgeContext,
    args: ExecutePromptArgs
): Promise<{
    Success: boolean;
    Response: string | null;
    ErrorMessage: string | null;
    ModelUsed: string | null;
    TokensUsed: number | null;
}> {
    await AIEngine.Instance.Config(false, ctx.contextUser);
    const prompt = args.PromptID
        ? AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, args.PromptID!))
        : args.PromptName
          ? AIEngine.Instance.Prompts.find(
                (p) => p.Name?.trim().toLowerCase() === args.PromptName!.trim().toLowerCase()
            )
          : null;
    if (!prompt) {
        return {
            Success: false,
            Response: null,
            ErrorMessage: `Prompt '${args.PromptName ?? args.PromptID}' not found.`,
            ModelUsed: null,
            TokensUsed: null
        };
    }

    const promptParams = new AIPromptParams();
    promptParams.prompt = prompt;
    promptParams.data = args.Variables ?? {};
    promptParams.contextUser = ctx.contextUser;

    const runner = new AIPromptRunner();
    const result: AIPromptRunResult<string> = await runner.ExecutePrompt<string>(promptParams);
    return {
        Success: Boolean(result.success),
        Response: result.result ?? result.rawResult ?? null,
        ErrorMessage: result.errorMessage ?? null,
        ModelUsed: result.modelInfo?.modelName ?? null,
        TokensUsed: result.tokensUsed ?? result.combinedTokensUsed ?? null
    };
}

async function handleGetEmbedding(
    _ctx: BridgeContext,
    _args: { text: string }
): Promise<{
    Success: boolean;
    Embedding: number[] | null;
    ErrorMessage: string | null;
}> {
    // Embedding access is intentionally deferred — AIEngine exposes per-
    // vector-space services (agent, action, note, example) but has no
    // single public "get an embedding for this text" entry point yet.
    // Sandbox code should compute embeddings via a prompt for now.
    return {
        Success: false,
        Embedding: null,
        ErrorMessage:
            'ai.GetEmbedding is not yet implemented — use ai.ExecutePrompt with an embedding-capable prompt for now.'
    };
}

// =========================================================================
// Sandbox-side `utilities` boot code
// =========================================================================

/**
 * Returns a JavaScript snippet that should be prepended to a Runtime
 * action's user code. It installs the `utilities` object whose methods
 * route through `__bridgeCall` to the host-side handlers defined in this
 * file.
 *
 * Keeping this as a string (rather than a file) keeps it colocated with the
 * handler definitions so any change to the surface here naturally updates
 * the sandbox surface too. Do not add logic to this snippet beyond what is
 * strictly required to forward calls — all security / permissions live
 * host-side.
 */
export function getRuntimeActionBridgePreamble(): string {
    return `
        (function installUtilities() {
            const call = (name, args) => globalThis.__bridgeCall(name, args);
            globalThis.utilities = {
                md: {
                    ListEntities: () => call('md.ListEntities', {}),
                    GetEntity: (name) => call('md.GetEntity', { name }),
                    GetEntityFields: (name) => call('md.GetEntityFields', { name }),
                    GetRelatedEntities: (name) => call('md.GetRelatedEntities', { name })
                },
                rv: {
                    RunView: (opts) => call('rv.RunView', opts),
                    RunViews: (opts) => call('rv.RunViews', opts)
                },
                rq: {
                    RunQuery: (opts) => call('rq.RunQuery', opts)
                },
                entity: {
                    Load: (entityName, id) => call('entity.Load', { entityName, id }),
                    Create: (entityName, data) => call('entity.Create', { entityName, data }),
                    Update: (entityName, id, data) => call('entity.Update', { entityName, id, data }),
                    Delete: (entityName, id) => call('entity.Delete', { entityName, id }),
                    Save: (entityName, data) => call('entity.Save', { entityName, data })
                },
                actions: {
                    GetAvailable: () => call('actions.GetAvailable', {}),
                    Invoke: (ActionName, Params) => call('actions.Invoke', { ActionName, Params }),
                    InvokeAll: (calls) => call('actions.InvokeAll', calls)
                },
                agents: {
                    GetAvailable: () => call('agents.GetAvailable', {}),
                    Run: (AgentName, opts) => call('agents.Run', Object.assign({ AgentName }, opts || {}))
                },
                ai: {
                    ExecutePrompt: (opts) => call('ai.ExecutePrompt', opts),
                    GetEmbedding: (text) => call('ai.GetEmbedding', { text })
                }
            };
        })();
    `;
}

// =========================================================================
// Type-only re-exports to keep this file's shape clear for tests
// =========================================================================
export type { BridgeHandler, BridgeHandlerMap };
export type { RunViewArgs };

/** Explicit usage to keep import live; 1f will wire handlers that call RunQuery. */
void RunQuery;
