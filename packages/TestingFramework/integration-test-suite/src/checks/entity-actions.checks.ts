/**
 * @fileoverview IT75 — the entity-action substrate, driven against a live database.
 *
 * **Why this bundle exists.** Everything the Track A runbook fixed is invisible to unit tests in the
 * one way that matters: the seams. `HandleEntityActions` builds a change context from an entity the
 * save is about to reload; a filter is compiled from a row and evaluated fail-closed; a scoped
 * binding is refused by a resolver that walks real foreign keys; a durable binding is handed to a
 * substrate that persists rows. Each half is unit-tested with the other half mocked, which is
 * exactly the arrangement that lets a contract look correct on both sides and still not meet in the
 * middle.
 *
 * **What is deliberately NOT here.** Nothing runs a model, nothing needs a credential, and nothing
 * starts a dispatcher — those live in IT74. This bundle drives the entity-action layer itself:
 * dispatch, scope, filters, the change contract, and the shape of what durable dispatch submits.
 *
 * **Mutation-class throughout.** Every check saves records to fire lifecycle events, so the whole
 * bundle is gated behind `RUN_MUTATION_TESTS=1` and unwinds what it created, FK-ordered.
 *
 * @module @memberjunction/integration-test-suite
 */
import { RunView, type BaseEntity } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import {
    MJActionEntity,
    MJActionFilterEntity,
    MJEntityActionEntity,
    MJEntityActionFilterEntity,
    MJEntityActionInvocationEntity,
    MJEntityActionInvocationTypeEntity,
    MJEntityActionParamEntity,
    MJListEntity,
} from '@memberjunction/core-entities';
import {
    BuildChangeFilterCode,
    BuildEntityChangeContext,
    DurableEntityActionRegistry,
    type DurableEntityActionRequest,
    type DurableEntityActionSubmission,
    type DurableEntityActionSubmitter,
} from '@memberjunction/actions-base';
import { ACTION_PREVENTED_BY_FILTER_MESSAGE, ActionEngineServer, EntityActionEngineServer } from '@memberjunction/actions';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/**
 * The entity these checks fire lifecycle events on.
 *
 * `MJ: Lists` is chosen for being small, writable, unrelated to anything the rest of the suite
 * asserts on, and — critically — having a nullable free-text column (`Description`) a transition
 * filter can watch without colliding with a real business rule.
 */
const SUBJECT_ENTITY = 'MJ: Lists';

/** Rows this bundle created, unwound in reverse dependency order. */
const CREATED = {
    EntityActionFilters: [] as string[],
    ActionFilters: [] as string[],
    EntityActionParams: [] as string[],
    EntityActionInvocations: [] as string[],
    EntityActions: [] as string[],
    Lists: [] as string[],
};

/** How long to wait for a fire-and-forget After-hook to land before giving up. */
const AFTER_HOOK_TIMEOUT_MS = 8_000;

/** Records every durable submission so a check can assert what was handed over. */
class RecordingSubmitter implements DurableEntityActionSubmitter {
    public readonly Requests: DurableEntityActionRequest[] = [];
    public FailWith: string | null = null;

    public async Submit(request: DurableEntityActionRequest): Promise<DurableEntityActionSubmission> {
        this.Requests.push(request);
        return this.FailWith
            ? { Success: false, ErrorMessage: this.FailWith }
            : { Success: true, ParentTaskID: 'stub-parent' };
    }
}

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────

/** The entity ID of the subject entity, from metadata. */
function subjectEntityID(ctx: IntegrationCheckContext): string {
    const info = ctx.Provider.EntityByName(SUBJECT_ENTITY);
    Assert(!!info, `${SUBJECT_ENTITY} is not in metadata`);
    return info!.ID;
}

/**
 * An action safe to bind and fire.
 *
 * Deliberately resolved rather than created: creating an Action would mean creating its params, its
 * result codes and a driver class the engine can resolve — a fixture large enough to be its own
 * source of failures. Any Active action serves, because what is under test is the dispatch, not the
 * action's own behaviour.
 */
async function resolveAction(ctx: IntegrationCheckContext): Promise<MJActionEntity> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJActionEntity>(
        { EntityName: 'MJ: Actions', ExtraFilter: `Status='Active'`, OrderBy: 'Name ASC', MaxRows: 1, ResultType: 'entity_object' },
        ctx.User,
    );
    const action = res.Results?.[0];
    Assert(!!action, 'could not resolve an Active action to bind');
    return action!;
}

/** The invocation-type row for a named lifecycle event. */
async function resolveInvocationType(ctx: IntegrationCheckContext, name: string): Promise<MJEntityActionInvocationTypeEntity> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJEntityActionInvocationTypeEntity>(
        { EntityName: 'MJ: Entity Action Invocation Types', ExtraFilter: `Name='${name}'`, ResultType: 'entity_object' },
        ctx.User,
    );
    const row = res.Results?.[0];
    Assert(!!row, `invocation type '${name}' is not seeded`);
    return row!;
}

/** Creates a binding on the subject entity, registered for teardown. */
async function createBinding(
    ctx: IntegrationCheckContext,
    action: MJActionEntity,
    invocationTypeName: string,
    options: { RunMode?: 'Inline' | 'Durable'; ScopeRecordID?: string; ScopeEntityID?: string } = {},
): Promise<MJEntityActionEntity> {
    const binding = await ctx.Provider.GetEntityObject<MJEntityActionEntity>('MJ: Entity Actions', ctx.User);
    binding.NewRecord();
    binding.EntityID = subjectEntityID(ctx);
    binding.ActionID = action.ID;
    binding.Status = 'Active';
    binding.RunMode = options.RunMode ?? 'Inline';
    binding.ScopeEntityID = options.ScopeEntityID ?? null;
    binding.ScopeRecordID = options.ScopeRecordID ?? null;
    Assert(await binding.Save(), `could not create the binding: ${binding.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    CREATED.EntityActions.push(binding.ID);

    const invocationType = await resolveInvocationType(ctx, invocationTypeName);
    const inv = await ctx.Provider.GetEntityObject<MJEntityActionInvocationEntity>('MJ: Entity Action Invocations', ctx.User);
    inv.NewRecord();
    inv.EntityActionID = binding.ID;
    inv.InvocationTypeID = invocationType.ID;
    inv.Status = 'Active';
    Assert(await inv.Save(), `could not create the invocation: ${inv.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    CREATED.EntityActionInvocations.push(inv.ID);

    return binding;
}

/** Attaches a filter to a binding, from a change-filter expression. */
async function attachFilter(
    ctx: IntegrationCheckContext,
    binding: MJEntityActionEntity,
    expression: string,
    status: 'Active' | 'Disabled' = 'Active',
): Promise<{ Filter: MJActionFilterEntity; Binding: MJEntityActionFilterEntity }> {
    const filter = await ctx.Provider.GetEntityObject<MJActionFilterEntity>('MJ: Action Filters', ctx.User);
    filter.NewRecord();
    filter.Code = BuildChangeFilterCode(expression);
    filter.UserDescription = expression;
    Assert(await filter.Save(), `could not create the filter: ${filter.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    CREATED.ActionFilters.push(filter.ID);

    const link = await ctx.Provider.GetEntityObject<MJEntityActionFilterEntity>('MJ: Entity Action Filters', ctx.User);
    link.NewRecord();
    link.EntityActionID = binding.ID;
    link.ActionFilterID = filter.ID;
    link.Sequence = 1;
    link.Status = status;
    Assert(await link.Save(), `could not bind the filter: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    CREATED.EntityActionFilters.push(link.ID);

    return { Filter: filter, Binding: link };
}

/** Creates a subject record, registered for teardown. */
async function createList(ctx: IntegrationCheckContext, name: string, description: string | null = null): Promise<MJListEntity> {
    const list = await ctx.Provider.GetEntityObject<MJListEntity>(SUBJECT_ENTITY, ctx.User);
    list.NewRecord();
    list.Name = name;
    list.Description = description;
    list.EntityID = subjectEntityID(ctx);
    list.UserID = ctx.User.ID;
    Assert(await list.Save(), `could not create the subject record: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    CREATED.Lists.push(list.ID);
    return list;
}

/**
 * Reloads the engine so newly-created binding rows are visible.
 *
 * `EntityActionEngineServer` caches its metadata, and every fixture here writes rows it must then
 * dispatch on. Without the refresh a check would create a binding and then watch nothing fire —
 * indistinguishable, from the assertion's seat, from a dispatch path that is broken.
 */
async function refreshEngine(ctx: IntegrationCheckContext): Promise<void> {
    await EntityActionEngineServer.Instance.Config(true, ctx.User);
}

/**
 * Waits for a fire-and-forget After-hook to be observable.
 *
 * After-hooks are dispatched without an await by design, so a check that asserted immediately after
 * `Save()` would be racing the very thing it is testing. Polls a predicate rather than sleeping a
 * fixed interval, so a fast machine is not slowed and a slow one is not flaky.
 */
async function waitFor(predicate: () => boolean | Promise<boolean>, what: string): Promise<void> {
    const deadline = Date.now() + AFTER_HOOK_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await settle(100);
    }
    Assert(false, `timed out waiting for ${what}`);
}

/**
 * How many times this binding actually EXECUTED its action.
 *
 * Not simply "how many log rows exist". A run a filter prevented also writes a row — deliberately,
 * so an operator can see that a filter refused rather than wondering why nothing happened — so
 * counting rows would report a working filter as a failure to gate. The refusal is identified by the
 * shared message constant rather than by matching prose here, so the two cannot drift.
 */
async function logRowsFor(
    ctx: IntegrationCheckContext,
    entityActionID: string,
): Promise<Array<{ ID: string; Message: string | null }>> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string; Message: string | null }>(
        {
            EntityName: 'MJ: Action Execution Logs',
            ExtraFilter: `EntityActionID='${entityActionID}'`,
            Fields: ['ID', 'Message'],
            ResultType: 'simple',
            // The log is written fire-and-forget through a save queue; a cached read here would show
            // the rows as they were before the run.
            BypassCache: true,
        },
        ctx.User,
    );
    return res.Results ?? [];
}

async function executionCountFor(ctx: IntegrationCheckContext, entityActionID: string): Promise<number> {
    const rows = await logRowsFor(ctx, entityActionID);
    return rows.filter((r) => r.Message !== ACTION_PREVENTED_BY_FILTER_MESSAGE).length;
}

/** The marker a durable submission leaves on its log row. */
const SUBMITTED_MARKER = 'Submitted for durable execution';

/**
 * How many times this binding actually ran the action IN THIS PROCESS.
 *
 * Excludes both a filter refusal and a durable submission. All three write a log row — the run
 * happened in every case, it simply ended differently — so "a row exists" answers none of the
 * questions these checks ask.
 */
async function inProcessCountFor(ctx: IntegrationCheckContext, entityActionID: string): Promise<number> {
    const rows = await logRowsFor(ctx, entityActionID);
    return rows.filter((r) =>
        r.Message !== ACTION_PREVENTED_BY_FILTER_MESSAGE && !(r.Message ?? '').includes(SUBMITTED_MARKER),
    ).length;
}

/** How many runs of this binding were handed to the durable substrate. */
async function submissionCountFor(ctx: IntegrationCheckContext, entityActionID: string): Promise<number> {
    const rows = await logRowsFor(ctx, entityActionID);
    return rows.filter((r) => (r.Message ?? '').includes(SUBMITTED_MARKER)).length;
}

/** How many times a filter PREVENTED this binding — the positive proof a gate did its job. */
async function preventedCountFor(ctx: IntegrationCheckContext, entityActionID: string): Promise<number> {
    const rows = await logRowsFor(ctx, entityActionID);
    return rows.filter((r) => r.Message === ACTION_PREVENTED_BY_FILTER_MESSAGE).length;
}

// ── checks ───────────────────────────────────────────────────────────────────────────────────────

export const EntityActionChecks: NamedCheck[] = [
    {
        Id: 'entity-actions.EA1',
        Name: 'EA1: an AfterUpdate binding fires when its record is saved',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // The baseline every other check here depends on. Asserted through the execution log
            // rather than through the action's own effect, because what is under test is the
            // dispatch — whether the action did something useful is the action's business.
            const action = await resolveAction(ctx);
            const binding = await createBinding(ctx, action, 'AfterUpdate');
            await refreshEngine(ctx);

            const list = await createList(ctx, `mj-it-ea1 ${Date.now()} (safe to delete)`);
            const before = await executionCountFor(ctx, binding.ID);

            list.Description = 'changed';
            Assert(await list.Save(), 'the subject save must succeed');

            await waitFor(async () => (await executionCountFor(ctx, binding.ID)) > before,
                'the AfterUpdate binding to produce an execution-log row');
        },
    },

    {
        Id: 'entity-actions.EA2',
        Name: 'EA2: a transition filter sees the values on BOTH sides of the save',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // The seam unit tests cannot reach. HandleEntityActions captures the change context
            // synchronously, before its first await, because the save then reloads the entity and
            // resets every OldValue. If that capture ever moves after a yield, this check fails and
            // nothing else in the suite would.
            const action = await resolveAction(ctx);
            const binding = await createBinding(ctx, action, 'AfterUpdate');
            await attachFilter(ctx, binding, "DidFieldChangeToValue('Description', 'approved')");
            await refreshEngine(ctx);

            const list = await createList(ctx, `mj-it-ea2 ${Date.now()} (safe to delete)`, 'draft');

            // A save that does NOT make the transition must not fire.
            const baseline = await executionCountFor(ctx, binding.ID);
            list.Description = 'still-draft';
            Assert(await list.Save(), 'the non-transition save must succeed');
            await settle(1500);
            AssertEqual(await executionCountFor(ctx, binding.ID), baseline,
                'a save that did not make the transition must not fire the binding');
            Assert(await preventedCountFor(ctx, binding.ID) > 0,
                'the filter must have been evaluated and refused — not merely absent');

            // The transition itself must.
            list.Description = 'approved';
            Assert(await list.Save(), 'the transition save must succeed');
            await waitFor(async () => (await executionCountFor(ctx, binding.ID)) > baseline,
                'the transition to fire the binding');

            // And saving again while it is ALREADY approved must not — that is the state/transition
            // distinction the whole change contract exists to draw.
            const afterTransition = await executionCountFor(ctx, binding.ID);
            list.Name = `${list.Name} (touched)`;
            Assert(await list.Save(), 'the re-save must succeed');
            await settle(1500);
            AssertEqual(await executionCountFor(ctx, binding.ID), afterTransition,
                'a record that was ALREADY approved did not become approved again');
        },
    },

    {
        Id: 'entity-actions.EA3',
        Name: 'EA3: a Disabled filter binding does not gate — filters fail closed, so it must be skipped',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // Not a cosmetic detail. Filters prevent on any non-true verdict, so a disabled binding
            // that was still consulted would not be inert — it would permanently block the action,
            // and the only symptom is a trigger that quietly stopped firing.
            const action = await resolveAction(ctx);
            const binding = await createBinding(ctx, action, 'AfterUpdate');
            // A predicate that can never be true, so the ONLY way the action runs is if the binding
            // was skipped for being Disabled.
            await attachFilter(ctx, binding, "DidFieldChangeToValue('Description', '\\u0000never')", 'Disabled');
            await refreshEngine(ctx);

            const list = await createList(ctx, `mj-it-ea3 ${Date.now()} (safe to delete)`);
            const before = await executionCountFor(ctx, binding.ID);

            list.Description = 'anything';
            Assert(await list.Save(), 'the subject save must succeed');

            await waitFor(async () => (await executionCountFor(ctx, binding.ID)) > before,
                'the binding to run despite a Disabled filter — a Disabled filter must not gate');
        },
    },

    {
        Id: 'entity-actions.EA4',
        Name: 'EA4: a filter that cannot be resolved prevents the run rather than running unfiltered',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // Running unfiltered would ignore the narrowing the row exists to express — the worst
            // available reading of a misconfiguration, and the one that costs money when the action
            // behind it is an agent.
            const action = await resolveAction(ctx);
            const binding = await createBinding(ctx, action, 'AfterUpdate');
            const { Filter, Binding: link } = await attachFilter(ctx, binding, 'true');

            // Leave a dangling reference by removing the filter from the ENGINE's view rather than
            // from the database: the junction row's FK means the row itself cannot be deleted while
            // the binding points at it, and dropping the junction row too would remove the binding
            // being tested rather than break it.
            const filters = ActionEngineServer.Instance.ActionFilters;
            const at = filters.findIndex((f) => UUIDsEqual(f.ID, Filter.ID));
            Assert(at >= 0, 'the filter fixture must be visible to the engine before it is removed');
            filters.splice(at, 1);
            void link;
            await refreshEngine(ctx);

            const list = await createList(ctx, `mj-it-ea4 ${Date.now()} (safe to delete)`);
            const before = await executionCountFor(ctx, binding.ID);

            list.Description = 'anything';
            Assert(await list.Save(), 'the save itself must still succeed — an After-hook cannot fail it');

            await settle(2000);
            AssertEqual(await executionCountFor(ctx, binding.ID), before,
                'an unresolvable filter must prevent the action, not run it unfiltered');
        },
    },

    {
        Id: 'entity-actions.EA5',
        Name: 'EA5: a scoped binding does not fire for records outside its scope',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // Scope resolution walks real foreign keys through a ClassFactory-resolved resolver, so
            // it is exactly the kind of thing that passes with a mocked resolver and fails against a
            // schema. A scoped trigger that silently widens to every record is the failure the scope
            // columns exist to prevent.
            const action = await resolveAction(ctx);
            const inScope = await createList(ctx, `mj-it-ea5-in ${Date.now()} (safe to delete)`);
            const outOfScope = await createList(ctx, `mj-it-ea5-out ${Date.now()} (safe to delete)`);

            const binding = await createBinding(ctx, action, 'AfterUpdate', {
                ScopeEntityID: subjectEntityID(ctx),
                ScopeRecordID: inScope.ID,
            });
            await refreshEngine(ctx);

            const before = await executionCountFor(ctx, binding.ID);
            outOfScope.Description = 'changed';
            Assert(await outOfScope.Save(), 'the out-of-scope save must succeed');
            await settle(2000);
            AssertEqual(await executionCountFor(ctx, binding.ID), before,
                'a record outside the binding\'s scope must not fire it');
        },
    },

    {
        Id: 'entity-actions.EA6',
        Name: 'EA6: a Durable binding is handed to the submitter with redacted params, not run inline',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // The whole D14 handoff, asserted at the boundary rather than through the dispatcher —
            // IT74 already proves the dispatcher executes what it is given. What is under test here
            // is that the provider reaches the seam at all, and hands it a complete request.
            const action = await resolveAction(ctx);
            const binding = await createBinding(ctx, action, 'AfterUpdate', { RunMode: 'Durable' });
            await refreshEngine(ctx);

            const submitter = new RecordingSubmitter();
            DurableEntityActionRegistry.Instance.Register(submitter);
            try {
                const list = await createList(ctx, `mj-it-ea6 ${Date.now()} (safe to delete)`);
                const beforeLogs = await inProcessCountFor(ctx, binding.ID);

                list.Description = 'changed';
                Assert(await list.Save(), 'the subject save must succeed');

                // Filtered to THIS binding: every Durable binding an earlier check created is still
                // Active on the same entity, so a shared submitter sees their submissions too.
                const mine = () => submitter.Requests.filter((r) => UUIDsEqual(r.EntityActionID, binding.ID));
                await waitFor(() => mine().length > 0, 'the durable submission');
                const request = mine()[0];
                AssertEqual(request.EntityActionID, binding.ID, 'the request must name the binding that fired');
                AssertEqual(request.ActionID, action.ID, 'the request must name the action to run');
                AssertEqual(request.InvocationType, 'AfterUpdate', 'the request must name the event that fired it');
                Assert(NormalizeUUID(request.RecordID).includes(NormalizeUUID(list.ID)), 'the request must carry the record that changed');
                Assert(!!request.EntityName, 'the request must name the entity, for a readable task');
                Assert(typeof request.RedactedParams === 'object', 'params must arrive as a plain JSON-safe object');

                // A submitted run IS logged, and should be: the dispatch happened, it simply handed
                // the work on. What must NOT happen is the action also executing here — so the
                // assertion is on WHAT the log says, not on whether a row exists.
                await settle(1500);
                AssertEqual(mine().length, 1, 'the binding must have been submitted exactly once');
                const submitted = await submissionCountFor(ctx, binding.ID);
                Assert(submitted > 0, 'the run must be recorded as submitted, not silently absent');
                AssertEqual(await inProcessCountFor(ctx, binding.ID), beforeLogs,
                    'a submitted binding must not also execute in-process');
            } finally {
                DurableEntityActionRegistry.Instance.Clear();
            }
        },
    },

    {
        Id: 'entity-actions.EA7',
        Name: 'EA7: a Durable binding falls back to running inline when submission fails',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // RunMode='Durable' asks for the work to be HARDER to lose. Dropping it when the durable
            // path is unavailable would make opting in less reliable than leaving it off — so the
            // fallback is the feature, not an afterthought.
            const action = await resolveAction(ctx);
            const binding = await createBinding(ctx, action, 'AfterUpdate', { RunMode: 'Durable' });
            await refreshEngine(ctx);

            const submitter = new RecordingSubmitter();
            submitter.FailWith = 'simulated submission failure';
            DurableEntityActionRegistry.Instance.Register(submitter);
            try {
                const list = await createList(ctx, `mj-it-ea7 ${Date.now()} (safe to delete)`);
                const before = await executionCountFor(ctx, binding.ID);

                list.Description = 'changed';
                Assert(await list.Save(), 'the subject save must succeed');

                await waitFor(async () => (await executionCountFor(ctx, binding.ID)) > before,
                    'the inline fallback to run the action after a failed submission');
                AssertEqual(submitter.Requests.filter((r) => UUIDsEqual(r.EntityActionID, binding.ID)).length, 1,
                    'submission must have been attempted exactly once for THIS binding');
            } finally {
                DurableEntityActionRegistry.Instance.Clear();
            }
        },
    },

    {
        Id: 'entity-actions.EA8',
        Name: 'EA8: the change context reports a create as having no before, and an update as having both',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // Asserted against real BaseEntity field state rather than a hand-built stand-in. The
            // builder reads EntityField.OldValue, whose population is BaseEntity's business and not
            // something a unit test's fake can vouch for.
            const list = await ctx.Provider.GetEntityObject<MJListEntity>(SUBJECT_ENTITY, ctx.User);
            list.NewRecord();
            list.Name = `mj-it-ea8 ${Date.now()} (safe to delete)`;
            list.Description = 'initial';
            list.EntityID = subjectEntityID(ctx);
            list.UserID = ctx.User.ID;

            const onCreate = BuildEntityChangeContext(list);
            Assert(onCreate.IsCreate, 'an unsaved record must report IsCreate');
            AssertEqual(onCreate.ChangedFields.length, 0,
                'a record that started at a value did not CHANGE to it — otherwise every "becomes X" trigger fires on insert');

            Assert(await list.Save(), 'the subject save must succeed');
            CREATED.Lists.push(list.ID);

            list.Description = 'updated';
            const onUpdate = BuildEntityChangeContext(list);
            Assert(!onUpdate.IsCreate, 'a saved record must not report IsCreate');
            Assert(onUpdate.ChangedFields.some((f) => f.toLowerCase() === 'description'),
                'the changed field must be reported');
            AssertEqual(onUpdate.OldValues['Description'], 'initial', 'the before-value must survive');
            AssertEqual(onUpdate.NewValues['Description'], 'updated', 'the after-value must be present');
        },
    },
];

for (const check of EntityActionChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('entity-actions', {
    Setup: async () => { /* each check builds its own binding; nothing is shared across them */ },
    /**
     * Unwound child-first: filter bindings before filters, params and invocations before their
     * binding, bindings before the records they watched. Anything left behind would keep firing on
     * the next run of the suite.
     */
    Teardown: async (ctx: IntegrationCheckContext) => {
        // A durable submitter registered by a check that threw would otherwise survive into whatever
        // runs next, silently re-homing its dispatches.
        DurableEntityActionRegistry.Instance.Clear();

        const purge = async <T extends BaseEntity>(entityName: string, ids: string[]): Promise<void> => {
            if (ids.length === 0) return;
            const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<T>(
                {
                    EntityName: entityName,
                    ExtraFilter: `ID IN (${ids.map((i) => `'${i}'`).join(',')})`,
                    ResultType: 'entity_object',
                },
                ctx.User,
            );
            for (const row of res.Results ?? []) {
                await row.Delete();
            }
            ids.length = 0;
        };

        await purge<MJEntityActionFilterEntity>('MJ: Entity Action Filters', CREATED.EntityActionFilters);
        await purge<MJActionFilterEntity>('MJ: Action Filters', CREATED.ActionFilters);
        await purge<MJEntityActionParamEntity>('MJ: Entity Action Params', CREATED.EntityActionParams);
        await purge<MJEntityActionInvocationEntity>('MJ: Entity Action Invocations', CREATED.EntityActionInvocations);
        await purge<MJEntityActionEntity>('MJ: Entity Actions', CREATED.EntityActions);
        await purge<MJListEntity>(SUBJECT_ENTITY, CREATED.Lists);

        // The engine cached every binding this bundle created; leaving it loaded would have the next
        // consumer dispatch on rows that no longer exist.
        await EntityActionEngineServer.Instance.Config(true, ctx.User);
    },
});
