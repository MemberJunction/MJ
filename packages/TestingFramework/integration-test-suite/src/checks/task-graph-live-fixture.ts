/**
 * @fileoverview What a task-graph integration bundle needs to drive the real dispatcher against a
 * live database: submit a graph, run a dispatcher with stub runners, read rows back, wait for a
 * condition, and unwind everything it created.
 *
 * One instance per bundle, so each bundle tears down only what it submitted.
 *
 * @module @memberjunction/integration-test-suite
 */
import { RunView, ServerOperationScopeManager, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { MJTaskEntity, MJTaskTypeEntity, MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { TASK_GRAPH_RUNTIME_SECURITY_OPERATION, type TaskGraphSpec } from '@memberjunction/ai-core-plus';
import {
    TaskGraphDispatcher,
    TaskGraphService,
    type ProviderFactory,
    type TaskActionRunner,
    type TaskAgentRunner,
    type TaskPromptRunner,
} from '@memberjunction/task-graph';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { Assert, settle, type IntegrationCheckContext } from '@memberjunction/testing-integration';

/** The runners a dispatcher is started with. Absent ones leave their steps Pending, as on a real host. */
export type TaskGraphLiveRunners = {
    Agent: TaskAgentRunner;
    Action?: TaskActionRunner;
    Prompt?: TaskPromptRunner;
};

const TERMINAL = new Set(['Complete', 'Failed', 'Cancelled', 'Blocked']);

/** A value for a failure message: entity objects by their fields, anything else as JSON. */
function describe(value: unknown): string {
    if (value && typeof value === 'object' && 'GetAll' in value && typeof (value as { GetAll: unknown }).GetAll === 'function') {
        const fields = (value as { GetAll: () => Record<string, unknown> }).GetAll();
        return JSON.stringify({ ID: fields['ID'], Status: fields['Status'], AttemptCount: fields['AttemptCount'], ErrorMessage: fields['ErrorMessage'] });
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export class TaskGraphLiveFixture {
    /** Parent tasks this bundle submitted, unwound children-first in {@link Teardown}. */
    private readonly createdParentIDs: string[] = [];
    /** TaskTypes created only when the install had none. */
    private readonly createdTaskTypeIDs: string[] = [];

    /**
     * @param label shown in fixture names, so a leftover row says which bundle made it
     * @param pollSeconds how often a started dispatcher polls
     * @param settleTimeoutMs how long {@link WaitFor} waits before failing the check
     */
    constructor(
        private readonly label: string,
        private readonly pollSeconds = 0.25,
        private readonly settleTimeoutMs = 30_000,
    ) {}

    /** A dispatcher on its own provider per task, as MJAPI runs it. */
    public BuildDispatcher(ctx: IntegrationCheckContext, instanceID: string, runners: TaskGraphLiveRunners): TaskGraphDispatcher {
        return new TaskGraphDispatcher(
            this.providerFactory(ctx),
            runners.Agent,
            ctx.User as UserInfo,
            {
                InstanceID: instanceID,
                PollIntervalSeconds: this.pollSeconds,
                ClaimTTLSeconds: 300,
                ReconciliationIntervalSeconds: 3600,
                MaxConcurrentTasks: 5,
                RetryBackoffBaseMs: 1000,
            },
            undefined,
            undefined,
            runners.Action,
            runners.Prompt,
        );
    }

    /** Starts a dispatcher, runs `body`, and always stops it. */
    public async WithDispatcher<T>(
        ctx: IntegrationCheckContext,
        instanceID: string,
        runners: TaskGraphLiveRunners,
        body: () => Promise<T>,
    ): Promise<T> {
        const dispatcher = this.BuildDispatcher(ctx, instanceID, runners);
        await dispatcher.Start();
        try {
            return await body();
        } finally {
            await dispatcher.Stop();
        }
    }

    /** Submits a graph; the result carries the refusal when submission refused it. */
    public async TrySubmit(ctx: IntegrationCheckContext, spec: TaskGraphSpec): Promise<{ ParentTaskID?: string; ErrorMessage?: string }> {
        await this.ensureTaskType(ctx);
        const environmentID = await this.FirstID(ctx, 'MJ: Environments');
        Assert(!!environmentID, 'could not resolve an Environment');
        const result = await new TaskGraphService().Submit(spec, {
            EnvironmentID: environmentID!,
            ConversationDetailID: null,
            ContextUser: ctx.User,
            Provider: ctx.Provider,
        });
        if (result.ParentTaskID) this.createdParentIDs.push(result.ParentTaskID);
        return { ParentTaskID: result.ParentTaskID, ErrorMessage: result.Success ? undefined : result.ErrorMessage };
    }

    /** Submits a graph, failing the check when submission refuses it. */
    public async Submit(ctx: IntegrationCheckContext, spec: TaskGraphSpec): Promise<string> {
        const r = await this.TrySubmit(ctx, spec);
        Assert(!!r.ParentTaskID && !r.ErrorMessage, `submission failed: ${r.ErrorMessage}`);
        return r.ParentTaskID!;
    }

    public async LoadTask(ctx: IntegrationCheckContext, id: string): Promise<MJTaskEntity> {
        const t = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
        Assert(await t.Load(id), `task ${id} could not be loaded`);
        return t;
    }

    public async ChildNamed(ctx: IntegrationCheckContext, parentID: string, name: string): Promise<MJTaskEntity> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
        );
        const child = (res.Results ?? []).find((t) => t.Name === name);
        Assert(!!child, `step "${name}" not found`);
        return child!;
    }

    /** Polls until `done`, or fails the check naming what it waited for. */
    public async WaitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, what: string): Promise<T> {
        const deadline = Date.now() + this.settleTimeoutMs;
        let latest = await read();
        while (Date.now() < deadline && !done(latest)) {
            await settle(200);
            latest = await read();
        }
        // The message is built only on failure: building it eagerly stringified whatever was read,
        // which throws on an entity object even when the wait succeeded.
        if (!done(latest)) Assert(false, `${what} (last saw ${describe(latest)})`);
        return latest;
    }

    /**
     * Cancels every graph this bundle submitted that has not settled.
     *
     * A dispatcher works on every graph in the database, not only the one its check submitted, so a
     * check that failed part-way would otherwise leave runnable work for the NEXT check's dispatcher
     * — run with that check's stub runners, and counted against that check.
     */
    public async CancelUnfinished(ctx: IntegrationCheckContext): Promise<void> {
        const environmentID = await this.FirstID(ctx, 'MJ: Environments');
        for (const parentID of this.createdParentIDs) {
            const parent = await this.LoadTask(ctx, parentID);
            if (TERMINAL.has(parent.Status)) continue;
            await new TaskGraphService().Cancel(parentID, {
                EnvironmentID: environmentID!,
                ConversationDetailID: null,
                ContextUser: ctx.User,
                Provider: ctx.Provider,
            });
        }
    }

    public async WaitForParent(ctx: IntegrationCheckContext, parentID: string): Promise<MJTaskEntity> {
        await this.WaitFor(async () => (await this.LoadTask(ctx, parentID)).Status, (s) => TERMINAL.has(s), `graph ${parentID} did not settle`);
        return this.LoadTask(ctx, parentID);
    }

    /** The name of any row of an entity that has a Name column, failing the check when there is none. */
    public async AnyName(ctx: IntegrationCheckContext, entity: string): Promise<string> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string }>(
            { EntityName: entity, Fields: ['Name'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
        );
        const name = res.Results?.[0]?.Name;
        Assert(!!name, `could not resolve any ${entity} row`);
        return name!;
    }

    public async FirstID(ctx: IntegrationCheckContext, entity: string): Promise<string | undefined> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
            { EntityName: entity, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
        );
        return res.Results?.[0]?.ID;
    }

    /** Deletes every graph this bundle submitted, children and edges first, then any TaskType it made. */
    public async Teardown(ctx: IntegrationCheckContext): Promise<void> {
        for (const parentID of this.createdParentIDs) {
            await this.deleteGraph(ctx, parentID);
        }
        this.createdParentIDs.length = 0;
        for (const id of this.createdTaskTypeIDs) {
            const row = await ctx.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', ctx.User);
            if (await row.Load(id)) await row.Delete();
        }
        this.createdTaskTypeIDs.length = 0;
    }

    private async deleteGraph(ctx: IntegrationCheckContext, parentID: string): Promise<void> {
        const childRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
        );
        const children = childRes.Results ?? [];
        if (children.length > 0) {
            const ids = children.map((c) => `'${c.ID}'`).join(',');
            const depRes = await RunView.FromMetadataProvider(ctx.Provider).RunView(
                { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${ids})`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
            );
            for (const dep of (depRes.Results ?? []) as Array<{ Delete: () => Promise<boolean> }>) {
                await ServerOperationScopeManager.Instance.RunWithAuthority(
                    { operationKey: TASK_GRAPH_RUNTIME_SECURITY_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: Task Dependencies'], userId: ctx.User.ID },
                    () => dep.Delete(),
                );
            }
            const requestRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentRequestEntity>(
                { EntityName: 'MJ: AI Agent Requests', ExtraFilter: `OriginatingTaskID IN (${ids})`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
            );
            for (const request of requestRes.Results ?? []) await request.Delete();
        }
        for (const c of children) await c.Delete();
        const parent = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
        if (await parent.Load(parentID)) await parent.Delete();
    }

    private providerFactory(ctx: IntegrationCheckContext): ProviderFactory {
        const pool = ctx.Pool;
        if (!pool) return { CreateProvider: async () => ctx.Provider };
        return {
            CreateProvider: async () => {
                const config = new SQLServerProviderConfigData(pool, ctx.Schema ?? '__mj', 0, undefined, undefined, false);
                const provider = new SQLServerDataProvider();
                await provider.Config(config);
                return provider;
            },
        };
    }

    private async ensureTaskType(ctx: IntegrationCheckContext): Promise<void> {
        if (await this.FirstID(ctx, 'MJ: Task Types')) return;
        const tt = await ctx.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', ctx.User);
        tt.NewRecord();
        tt.Name = `mj-integration-test-${this.label}-task-type (safe to delete)`;
        tt.Description = `Created by the ${this.label} integration bundle.`;
        Assert(await tt.Save(), `could not create a TaskType fixture: ${tt.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        this.createdTaskTypeIDs.push(tt.ID);
    }
}
