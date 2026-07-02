/**
 * remote-op-wire-progress.checks.ts — the 'remote-op-wire-progress' bundle (WIRE1), CLIENT transport.
 * Graduated verbatim from integration-test-scripts/remote-op-wire-progress-tests.ts.
 *
 * Over-the-wire RO-3 proof: a GraphQLDataProvider client calls RecordProcess.RunNow with an `onProgress`
 * callback and asserts the typed RemoteOpProgress emitted server-side arrives over the
 * `RemoteOperationProgress` GraphQL subscription (client subscribe → mutation → server emitProgress →
 * PubSub → subscription → client onProgress). Runs only on the client transport (needs a live MJAPI),
 * parked exactly like IT03 / client-cache — the dispatcher skips cleanly when MJAPI is unreachable.
 *
 * The bundle lifecycle creates its fixtures over the wire (2 Action Categories + a FieldRules Record
 * Process) and tears them down after.
 */
import { RunView } from '@memberjunction/core';
import type { RemoteOpProgress } from '@memberjunction/core';
import {
    MJActionCategoryEntity,
    MJRecordProcessEntity,
    MJProcessRunEntity,
    RecordProcessRunNowOperation,
} from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

const ACT_ENTITY = 'MJ: Action Categories';
const PREFIX = 'mj-remote-op-wire';

function fx(ctx: IntegrationCheckContext) {
    Assert(ctx.RemoteOpWireProgressFixture != null, 'remote-op-wire-progress fixture missing (bundle Setup did not run)');
    return ctx.RemoteOpWireProgressFixture!;
}

export const RemoteOpWireProgressChecks: NamedCheck[] = [
    {
        Id: 'remote-op-wire-progress.WIRE1',
        Name: 'WIRE1: RunNow over the wire returns the run summary AND streams typed progress to onProgress',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Rp, CatIds } = fx(ctx);
            const events: RemoteOpProgress[] = [];
            // No provider passed -> uses the global GraphQLDataProvider -> marshalled over GraphQL.
            const result = await new RecordProcessRunNowOperation().Execute(
                { recordProcessID: Rp.ID, dryRun: true, scope: { Kind: 'records', RecordIDs: CatIds } },
                { onProgress: (p) => events.push(p) },
            );
            Assert(result.Success, `op failed over the wire: ${result.ErrorMessage}`);
            AssertEqual(result.Output?.processed, 2, 'processed count came back over the wire');
            Assert(events.length >= 1, `expected >= 1 progress event over the wire, got ${events.length}`);
            for (const e of events) {
                AssertEqual(e.OperationKey, 'RecordProcess.RunNow', 'wire progress OperationKey');
            }
            console.log(`      → over-the-wire: processed ${result.Output?.processed}, received ${events.length} streamed progress event(s)`);
        }
    }
];

for (const check of RemoteOpWireProgressChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('remote-op-wire-progress', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const provider = ctx.Provider;
        const user = ctx.User;
        const entityID = provider.EntityByName(ACT_ENTITY)!.ID;
        const catIds: string[] = [];
        for (const n of [1, 2]) {
            const cat = await provider.GetEntityObject<MJActionCategoryEntity>(ACT_ENTITY, user);
            cat.NewRecord();
            cat.Name = `${PREFIX}-cat-${n}`;
            cat.Status = 'Active';
            Assert(await cat.Save(), `creating fixture category ${n} failed: ${cat.LatestResult?.CompleteMessage}`);
            catIds.push(cat.ID);
        }
        const ruleSet = { Rules: [{ TargetField: 'Description', Source: { Kind: 'formula', Expression: "fields.Name + ' — wire'" } }] };
        const rp = await provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', user);
        rp.NewRecord();
        rp.Name = `${PREFIX}-record-process (safe to delete)`;
        rp.EntityID = entityID;
        rp.Status = 'Active';
        rp.WorkType = 'FieldRules';
        rp.ScopeType = 'Filter';
        rp.ScopeFilter = '1 = 0';
        rp.Configuration = JSON.stringify(ruleSet);
        rp.BatchSize = 10;
        Assert(await rp.Save(), `creating the FieldRules Record Process failed: ${rp.LatestResult?.CompleteMessage}`);
        ctx.RemoteOpWireProgressFixture = { Rp: rp, CatIds: catIds };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.RemoteOpWireProgressFixture;
        if (!f) {
            return;
        }
        const provider = ctx.Provider;
        const user = ctx.User;
        const runRes = await new RunView().RunView<MJProcessRunEntity>(
            { EntityName: 'MJ: Process Runs', ExtraFilter: `RecordProcessID='${f.Rp.ID}'`, ResultType: 'entity_object' }, user,
        );
        for (const run of runRes.Results ?? []) {
            const details = await new RunView().RunView(
                { EntityName: 'MJ: Process Run Details', ExtraFilter: `ProcessRunID='${run.ID}'`, ResultType: 'entity_object' }, user,
            );
            for (const d of details.Results ?? []) {
                await (d as MJProcessRunEntity).Delete().catch(() => undefined);
            }
            await run.Delete().catch(() => undefined);
        }
        await f.Rp.Delete().catch(() => undefined);
        for (const id of f.CatIds) {
            const cat = await provider.GetEntityObject<MJActionCategoryEntity>(ACT_ENTITY, user);
            if (await cat.Load(id)) {
                await cat.Delete().catch(() => undefined);
            }
        }
        ctx.RemoteOpWireProgressFixture = undefined;
    }
});
