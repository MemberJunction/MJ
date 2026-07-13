/**
 * remote-op-wire-progress-tests.ts — over-the-wire RO-3 test: a GraphQLDataProvider client (Node, system
 * API key) calls RecordProcess.RunNow with an `onProgress` callback, and asserts that the typed
 * RemoteOpProgress emitted server-side arrives over the `RemoteOperationProgress` GraphQL subscription.
 * This exercises the full attached-over-the-wire path: client subscribe -> mutation (with progressChannelId)
 * -> server emitProgress -> PubSub publish -> subscription -> client onProgress.
 *
 * SKIPS cleanly (exit 0) when MJAPI is not reachable, so it never fails CI on a server-less box. When MJAPI
 * is up it runs against it. Requires the server to be running the RO-3 resolver build.
 *
 * USAGE (from the repo root, with MJAPI running):
 *   npx tsx packages/MJServer/integration-test-scripts/remote-op-wire-progress-tests.ts
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = setup error.
 */
import { LoadEnv, LoadClientConfig, TestRunner, Assert, AssertEqual } from './lib/harness';
import { GraphQLProviderConfigData, setupGraphQLClient } from '@memberjunction/graphql-dataprovider';
import { Metadata, RunView, RemoteOpProgress } from '@memberjunction/core';
import {
    MJActionCategoryEntity,
    MJRecordProcessEntity,
    MJProcessRunEntity,
    RecordProcessRunNowOperation,
} from '@memberjunction/core-entities';

const ACT_ENTITY = 'MJ: Action Categories';
const PREFIX = 'mj-remote-op-wire';

async function reachable(url: string, apiKey: string): Promise<boolean> {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-mj-api-key': apiKey },
            body: JSON.stringify({ query: '{ __typename }' }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function main(): Promise<void> {
    LoadEnv();
    const client = LoadClientConfig();
    if (!(await reachable(client.Url, client.MJAPIKey))) {
        console.log(`remote-op-wire-progress-tests: SKIPPED — MJAPI not reachable at ${client.Url} (start MJAPI to run the over-the-wire RO-3 test).`);
        process.exit(0);
    }

    // ws endpoint derived from the http endpoint (http->ws / https->wss).
    const wsUrl = client.Url.replace(/^http/, 'ws');
    const config = new GraphQLProviderConfigData('', client.Url, wsUrl, async () => '', '__mj', undefined, undefined, client.MJAPIKey);
    await setupGraphQLClient(config);

    const provider = Metadata.Provider; // global-provider-ok: the GraphQLDataProvider just configured by setupGraphQLClient — this Node test IS the single global provider
    const user = provider.CurrentUser;
    const suite = new TestRunner('Remote Operations RO-3 over-the-wire progress (GraphQLDataProvider -> live MJAPI)');

    // Fixtures created over the wire: 2 throwaway Action Categories + a FieldRules Record Process.
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

    let failures = 0;
    try {
        suite.Test('WIRE1: RunNow over the wire returns the run summary AND streams typed progress to onProgress', async () => {
            const events: RemoteOpProgress[] = [];
            // No provider passed -> uses the global GraphQLDataProvider -> marshalled over GraphQL.
            const result = await new RecordProcessRunNowOperation().Execute(
                { recordProcessID: rp.ID, dryRun: true, scope: { Kind: 'records', RecordIDs: catIds } },
                { onProgress: (p) => events.push(p) },
            );
            Assert(result.Success, `op failed over the wire: ${result.ErrorMessage}`);
            AssertEqual(result.Output?.processed, 2, 'processed count came back over the wire');
            Assert(events.length >= 1, `expected >= 1 progress event over the wire, got ${events.length}`);
            for (const e of events) {
                AssertEqual(e.OperationKey, 'RecordProcess.RunNow', 'wire progress OperationKey');
            }
            console.log(`      → over-the-wire: processed ${result.Output?.processed}, received ${events.length} streamed progress event(s)`);
        });

        failures = await suite.Run();
    } finally {
        const runRes = await new RunView().RunView<MJProcessRunEntity>(
            { EntityName: 'MJ: Process Runs', ExtraFilter: `RecordProcessID='${rp.ID}'`, ResultType: 'entity_object' }, user,
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
        await rp.Delete().catch(() => undefined);
        for (const id of catIds) {
            const cat = await provider.GetEntityObject<MJActionCategoryEntity>(ACT_ENTITY, user);
            if (await cat.Load(id)) {
                await cat.Delete().catch(() => undefined);
            }
        }
    }

    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nSETUP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
