/**
 * Gate G7.2 "C1 → C2.2": forced out-of-taxonomy job-title outputs are rejected and counted on the run, with 0 stored
 * as feature values. A supplementary check dry-runs a clone of the pipeline with its constraints removed: the dry run
 * must report the foreign-key failure its real write would hit, and write nothing.
 */
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, SafeJSONParse } from '@memberjunction/global';
import type { DataFeatureSpec } from '@memberjunction/feature-pipelines';
import { Assert, AssertDeepEqual, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { FeaturePipelineGateFixtures as F, FIXTURE_NAME_PREFIX } from './fp-gates/fp-gate-fixture';
import { FORCED_INVALID, GOLDEN_TITLES, NON_EXISTENT_FUNCTION_ID } from './fp-gates/golden-titles';

/** The three people whose titles the stub answers outside the taxonomy (seniority, job function, both). */
const FORCED = [F.PersonID(901), F.PersonID(902), F.PersonID(903)];
const inList = (ids: ReadonlyArray<string>): string => ids.map((i) => `'${EscapeSQLString(i)}'`).join(',');

/** What a dry run of the clone over person 902 could write, counted (physical read). */
interface DryRunFootprint {
    /** Feature Values of the clone or of person 902. */
    FV: number;
    /** The clone's Dedup Cache rows. */
    Cache: number;
    /** Person 902's job-function rows. */
    Children: number;
    /** 1 when person 902 holds a seniority. */
    Seniority: number;
    /** The clone's watermarks. */
    Watermarks: number;
}

/** The steps of the forced-invalid checks: the unconstrained clone and the dry run's footprint. */
class ForcedInvalidSteps {
    /** Everything a dry run of `cloneID` over person 902 could write, scoped to that clone and that person. */
    public static async DryRunFootprint(ctx: IntegrationCheckContext, cloneID: string): Promise<DryRunFootprint> {
        const rp = `'${EscapeSQLString(cloneID)}'`;
        const person = `'${F.PersonID(902)}'`;
        const rows = await F.Query<DryRunFootprint>(ctx, `SELECT
            (SELECT COUNT(*) FROM [__mj].[FeatureValue] WHERE RecordProcessID = ${rp} OR RecordID = ${person}) AS FV,
            (SELECT COUNT(*) FROM [__mj].[FeatureValueCache] WHERE RecordProcessID = ${rp}) AS Cache,
            (SELECT COUNT(*) FROM [__mj_BizAppsCommon].[PersonJobFunction] WHERE PersonID = ${person}) AS Children,
            (SELECT COUNT(*) FROM [__mj_BizAppsCommon].[Person] WHERE ID = ${person} AND SeniorityLevelID IS NOT NULL) AS Seniority,
            (SELECT COUNT(*) FROM [__mj].[RecordProcessWatermark] WHERE RecordProcessID = ${rp}) AS Watermarks`);
        return rows[0];
    }

    /** A clone of the fixture pipeline with every output constraint removed, so the stub's bad job function ID reaches write-back. */
    public static async UnconstrainedClone(ctx: IntegrationCheckContext): Promise<MJRecordProcessEntity> {
        const src = await ctx.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', ctx.User);
        Assert(await src.Load(F.Require(ctx).RecordProcessID), 'load fixture pipeline');
        const spec = src.Configuration ? SafeJSONParse<DataFeatureSpec>(src.Configuration) : null;
        if (!spec) {
            throw new Error('the fixture pipeline has no readable DataFeatureSpec');
        }
        const clone = await ctx.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', ctx.User);
        clone.NewRecord();
        clone.Name = `${FIXTURE_NAME_PREFIX}unconstrained clone`; // the fixture teardown deletes it by this prefix
        clone.CategoryID = src.CategoryID;
        clone.EntityID = src.EntityID;
        clone.Status = 'Active';
        clone.WorkType = 'Infer';
        clone.PromptID = src.PromptID;
        clone.ScopeType = 'Filter';
        clone.ScopeFilter = src.ScopeFilter;
        clone.OnDemandEnabled = true;
        clone.OutputMapping = src.OutputMapping;
        clone.SkipUnchanged = false;
        const unconstrained: DataFeatureSpec = { ...spec, Outputs: spec.Outputs.map((o) => ({ ...o, Constraint: undefined, ConfidenceRef: undefined })) };
        clone.Configuration = JSON.stringify(unconstrained);
        Assert(await clone.Save(), `save clone: ${clone.LatestResult?.CompleteMessage}`);
        return clone;
    }
}

export const FpGateC22Checks: NamedCheck[] = [
    {
        Id: 'fp-gate-c2-2.G1', Name: 'C2.2 forced out-of-taxonomy outputs are rejected and counted on the run', RequiresMutation: true,
        Fn: async (ctx) => {
            const run = await F.Run(ctx);
            AssertEqual(run.Status, 'Failed', 'a run with rejected records ends Failed');
            const s = await F.Summary(ctx, run.ProcessRunID);
            AssertEqual(s.RejectedInvalid, FORCED.length, 'rejected count on the run');
            AssertEqual(s.Failed, 0, 'no record failed for another reason');
            AssertEqual(s.Upserted + s.Unchanged, GOLDEN_TITLES.length, 'the other 52 records succeeded');
            const details = await F.Query<{ RecordID: string; Status: string }>(ctx, `SELECT RecordID, Status FROM [__mj].[ProcessRunDetail]
                WHERE ProcessRunID = '${EscapeSQLString(run.ProcessRunID || '')}' AND RecordID IN (${inList(FORCED)})`);
            AssertEqual(details.filter((d) => d.Status === 'Failed').length, FORCED.length, 'each forced record Failed');
            console.log(`      → run ${run.ProcessRunID}: RejectedInvalid ${s.RejectedInvalid}, Upserted ${s.Upserted}, Unchanged ${s.Unchanged}`);
        },
    },
    {
        Id: 'fp-gate-c2-2.G2', Name: 'C2.2 0 stored: no Feature Value, cache row, field or child row for the rejected outputs', RequiresMutation: true,
        Fn: async (ctx) => {
            const fx = F.Require(ctx);
            const titles = [FORCED_INVALID.Seniority, FORCED_INVALID.Function, FORCED_INVALID.Both].map((t) => `N'${EscapeSQLString(t)}'`).join(',');
            const counts = await F.Query<{ FV: number; Cache: number; Seniority: number; Children: number }>(ctx, `SELECT
                (SELECT COUNT(*) FROM [__mj].[FeatureValue] WHERE RecordProcessID = '${EscapeSQLString(fx.RecordProcessID)}' AND RecordID IN (${inList(FORCED)})) AS FV,
                (SELECT COUNT(*) FROM [__mj].[FeatureValueCache] WHERE RecordProcessID = '${EscapeSQLString(fx.RecordProcessID)}' AND KeyDisplay IN (${titles})) AS Cache,
                (SELECT COUNT(*) FROM [__mj_BizAppsCommon].[Person] WHERE ID IN (${inList(FORCED)}) AND SeniorityLevelID IS NOT NULL) AS Seniority,
                (SELECT COUNT(*) FROM [__mj_BizAppsCommon].[PersonJobFunction] WHERE PersonID IN (${inList(FORCED)})) AS Children`);
            AssertDeepEqual(counts[0], { FV: 0, Cache: 0, Seniority: 0, Children: 0 }, 'nothing stored for rejected outputs');
        },
    },
    {
        Id: 'fp-gate-c2-2.C2.2.d', Name: 'C2.2.d a dry run names the FK failure the real write would hit, and writes nothing', RequiresMutation: true,
        Fn: async (ctx) => {
            const clone = await ForcedInvalidSteps.UnconstrainedClone(ctx);
            const before = await ForcedInvalidSteps.DryRunFootprint(ctx, clone.ID);
            AssertEqual(before.Seniority, 0, 'person 902 holds no seniority before the dry run');
            const run = await F.Run(ctx, { RecordProcessID: clone.ID, Records: [F.PersonID(902)], DryRun: true });
            const detail = await F.Query<{ Status: string; ErrorMessage: string | null }>(ctx,
                `SELECT Status, ErrorMessage FROM [__mj].[ProcessRunDetail] WHERE ProcessRunID = '${EscapeSQLString(run.ProcessRunID || '')}'`);
            AssertEqual(detail.length, 1, 'one dry-run detail');
            AssertEqual(detail[0].Status, 'Failed', 'dry-run record status');
            const message = detail[0].ErrorMessage || '';
            Assert(message.startsWith('Dry run: the real write would fail:'), `message: ${message}`);
            // The failure must be the foreign-key one on the stub's job function ID, not any other write problem.
            Assert(message.toLowerCase().includes(NON_EXISTENT_FUNCTION_ID.toLowerCase()), `the message names the missing job function: ${message}`);
            Assert(message.includes('(the real write fails on its foreign key)'), `the message names the foreign-key failure: ${message}`);
            AssertDeepEqual(await ForcedInvalidSteps.DryRunFootprint(ctx, clone.ID), before, 'a dry run writes nothing (values, cache, children, seniority, watermarks)');
        },
    },
];

for (const c of FpGateC22Checks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
IntegrationCheckRegistry.Instance.RegisterLifecycle('fp-gate-c2-2', {
    Setup: async (ctx) => { await F.Setup(ctx, { ForcedInvalid: true }); },
    Teardown: async (ctx) => { await F.Teardown(ctx); },
});
