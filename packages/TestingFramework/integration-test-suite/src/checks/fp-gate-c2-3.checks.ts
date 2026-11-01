/**
 * Gate G7.3 "C1 → C2.3": a second run of the same pipeline version on the same inputs leaves identical value
 * checksums and 0 duplicate rows, and 0 human-entered values are overwritten. Run 2 also writes nothing at all to the
 * fixture's records: no Record Changes on the people, their job functions or the pipeline's Feature Values.
 */
import { RunView } from '@memberjunction/core';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { Assert, AssertDeepEqual, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { FeaturePipelineGateFixtures as F, PREFIX, type FixtureChecksums } from './fp-gates/fp-gate-fixture';
import { GOLDEN_TITLES } from './fp-gates/golden-titles';

/** Row counts that a second, identical run must leave as they are. */
interface RowCounts {
    /** The pipeline's own (Source 'Pipeline') Feature Values. */
    PipelineValues: number;
    /** The fixture people's job-function rows. */
    JobFunctions: number;
}

/** What run 1 and the hand edits leave for run 2 to compare against; reset by the bundle's Setup. */
class RunOneState {
    /** Run 1's pipeline version. */
    public static FirstVersion: number | null = null;
    /** The checksums after the hand edits, before run 2. */
    public static ChecksumsBeforeRun2: FixtureChecksums | null = null;
    /** The row counts after the hand edits, before run 2. */
    public static CountsBeforeRun2: RowCounts | null = null;
    /** The `RecordID`s (`ID|<id>`) of the fixture's job-function rows and the pipeline's Feature Values before run 2. */
    public static TrackedRecordIDs: string[] = [];

    /** Forgets a previous bundle run's state. */
    public static Reset(): void {
        RunOneState.FirstVersion = null;
        RunOneState.ChecksumsBeforeRun2 = null;
        RunOneState.CountsBeforeRun2 = null;
        RunOneState.TrackedRecordIDs = [];
    }
}

/** The steps of the second-run checks. */
class SecondRunSteps {
    /** Turns off the watermark skip, so run 2 really re-derives every record (through BaseEntity, not direct DML). */
    public static async DisableSkipUnchanged(ctx: IntegrationCheckContext): Promise<void> {
        const rp = await ctx.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', ctx.User);
        Assert(await rp.Load(F.Require(ctx).RecordProcessID), 'load fixture pipeline');
        rp.SkipUnchanged = false;
        Assert(await rp.Save(), `turn off SkipUnchanged: ${rp.LatestResult?.CompleteMessage}`);
    }

    /** The pipeline's own Feature Values and the fixture people's job-function rows, counted (physical read). */
    public static async Counts(ctx: IntegrationCheckContext): Promise<RowCounts> {
        const rows = await F.Query<RowCounts>(ctx, `SELECT
            (SELECT COUNT(*) FROM [__mj].[FeatureValue] WHERE RecordProcessID = '${EscapeSQLString(F.Require(ctx).RecordProcessID)}' AND Source = 'Pipeline') AS PipelineValues,
            (SELECT COUNT(*) FROM [__mj_BizAppsCommon].[PersonJobFunction] WHERE PersonID LIKE '${PREFIX}%') AS JobFunctions`);
        return rows[0];
    }

    /** The Record Change keys (`ID|<id>`) of the fixture's job-function rows and the pipeline's own Feature Values. */
    public static async TrackedRecordIDs(ctx: IntegrationCheckContext): Promise<string[]> {
        const rows = await F.Query<{ ID: string }>(ctx, `SELECT ID FROM [__mj_BizAppsCommon].[PersonJobFunction] WHERE PersonID LIKE '${PREFIX}%'
            UNION ALL SELECT ID FROM [__mj].[FeatureValue] WHERE RecordProcessID = '${EscapeSQLString(F.Require(ctx).RecordProcessID)}' AND Source = 'Pipeline'`);
        return rows.map((r) => `ID|${r.ID}`);
    }

    /** The database's clock (Record Changes are stamped by it, not by this process). */
    public static async DatabaseNow(ctx: IntegrationCheckContext): Promise<string> {
        const rows = await F.Query<{ Now: string }>(ctx, `SELECT CONVERT(NVARCHAR(40), SYSDATETIMEOFFSET(), 127) AS Now`);
        return rows[0].Now;
    }

    /**
     * Record Changes written since `since` to the fixture people (by their ID prefix) and to the job-function rows and
     * Feature Values in `trackedIDs`. New rows are caught by {@link Counts}, not here.
     */
    public static async RecordChangesSince(ctx: IntegrationCheckContext, since: string, trackedIDs: string[]): Promise<number> {
        const entityID = (name: string): string => {
            const entity = ctx.Provider.EntityByName(name);
            if (!entity) {
                throw new Error(`${name} is not in metadata`);
            }
            return entity.ID;
        };
        const ids = trackedIDs.length > 0 ? trackedIDs.map((id) => `'${EscapeSQLString(id)}'`).join(',') : `''`;
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
            EntityName: 'MJ: Record Changes', ResultType: 'count_only', BypassCache: true,
            ExtraFilter: `ChangedAt >= '${EscapeSQLString(since)}' AND (
                (EntityID = '${entityID('MJ_BizApps_Common: People')}' AND RecordID LIKE 'ID|${PREFIX}%')
                OR (EntityID IN ('${entityID('MJ_BizApps_Common: Person Job Functions')}', '${entityID('MJ: Feature Values')}') AND RecordID IN (${ids})))`,
        }, ctx.User);
        Assert(res.Success, `counting Record Changes: ${res.ErrorMessage}`);
        return res.TotalRowCount ?? 0;
    }
}

export const FpGateC23Checks: NamedCheck[] = [
    {
        Id: 'fp-gate-c2-3.G1', Name: 'C2.3 run 1 classifies the 52 fixture people', RequiresMutation: true,
        Fn: async (ctx) => {
            const run = await F.Run(ctx);
            AssertEqual(run.Status, 'Completed', 'run 1 status');
            const summary = await F.Summary(ctx, run.ProcessRunID);
            AssertEqual(summary.Upserted, GOLDEN_TITLES.length, 'run 1 wrote every fixture person');
            // `??` because PipelineVersion is a number: only an absent pin means "no version".
            RunOneState.FirstVersion = summary.Pin?.PipelineVersion ?? null;
            Assert(RunOneState.FirstVersion !== null, 'run 1 recorded its pipeline version');
        },
    },
    {
        Id: 'fp-gate-c2-3.G2', Name: 'C2.3 people edit three values by hand (two seniorities, one job function)', RequiresMutation: true,
        Fn: async (ctx) => {
            // A person's edit in another app, through the entity layer like a real edit.
            const boardMember = await F.LookupID(ctx, 'MJ_BizApps_Common: Seniority Levels', `Name = 'Board Member'`);
            const [people, functions] = await Promise.all([
                F.UpdateBizAppsRows(ctx, 'MJ_BizApps_Common: People', `ID IN ('${F.PersonID(1)}', '${F.PersonID(2)}')`, { SeniorityLevelID: boardMember }),
                F.UpdateBizAppsRows(ctx, 'MJ_BizApps_Common: Person Job Functions', `PersonID = '${F.PersonID(3)}' AND Sequence = 1`, { Source: 'Manual', Confidence: null }),
            ]);
            AssertEqual(people + functions, 3, 'the three hand edits were saved');
            RunOneState.ChecksumsBeforeRun2 = await F.Checksums(ctx);
            // A NULL checksum would make "identical" hold vacuously (NULL = NULL): run 1 must have written values.
            Assert(RunOneState.ChecksumsBeforeRun2.Values !== null, 'the pipeline holds Feature Values before run 2');
            RunOneState.CountsBeforeRun2 = await SecondRunSteps.Counts(ctx);
            RunOneState.TrackedRecordIDs = await SecondRunSteps.TrackedRecordIDs(ctx);
        },
    },
    {
        Id: 'fp-gate-c2-3.G3', Name: 'C2.3 run 2 (same version, same inputs, no watermark skip): identical checksums, 0 duplicates, 0 human values overwritten, 0 writes', RequiresMutation: true,
        Fn: async (ctx) => {
            const fx = F.Require(ctx);
            Assert(RunOneState.ChecksumsBeforeRun2 !== null && RunOneState.CountsBeforeRun2 !== null, 'the hand-edit check recorded the state before run 2');
            await SecondRunSteps.DisableSkipUnchanged(ctx);
            const since = await SecondRunSteps.DatabaseNow(ctx);
            const run = await F.Run(ctx);
            AssertEqual(run.Status, 'Completed', 'run 2 status');
            AssertEqual(run.Error, 0, 'run 2: 0 failures (no unique-key errors)');
            const s = await F.Summary(ctx, run.ProcessRunID);
            AssertEqual(s.Pin?.PipelineVersion ?? null, RunOneState.FirstVersion, 'same pipeline version');
            AssertEqual(s.HumanValuesPreserved, 3, 'the three human values were preserved');
            const after = await F.Checksums(ctx);
            AssertDeepEqual(after, RunOneState.ChecksumsBeforeRun2, 'identical value checksums');
            // Counts, not a duplicate query: the unique index makes a duplicate key impossible, while an extra row is not.
            AssertDeepEqual(await SecondRunSteps.Counts(ctx), RunOneState.CountsBeforeRun2, '0 extra Feature Values or job-function rows');
            const changes = await SecondRunSteps.RecordChangesSince(ctx, since, RunOneState.TrackedRecordIDs);
            AssertEqual(changes, 0, 'run 2 wrote nothing to the fixture people, their job functions or the pipeline Feature Values (Record Changes)');
            const human = await F.Query<{ B: number; M: number }>(ctx, `SELECT
                (SELECT COUNT(*) FROM [__mj_BizAppsCommon].[Person] p JOIN [__mj_BizAppsCommon].[SeniorityLevel] s ON s.ID = p.SeniorityLevelID
                    WHERE p.ID IN ('${F.PersonID(1)}','${F.PersonID(2)}') AND s.Name = N'Board Member') AS B,
                (SELECT COUNT(*) FROM [__mj_BizAppsCommon].[PersonJobFunction] WHERE PersonID = '${F.PersonID(3)}' AND Sequence = 1 AND Source = N'Manual') AS M`);
            AssertDeepEqual(human[0], { B: 2, M: 1 }, '0 human-entered values overwritten');
            const humanRows = await F.Query<{ H: number }>(ctx, `SELECT COUNT(*) AS H FROM [__mj].[FeatureValue] WHERE RecordProcessID = '${EscapeSQLString(fx.RecordProcessID)}' AND Source = 'Human'`);
            Assert(humanRows[0].H >= 2, 'the preserved seniorities are recorded as Human Feature Values');
            console.log(`      → run 2 ${run.ProcessRunID}: checksums ${JSON.stringify(after)}, counts ${JSON.stringify(RunOneState.CountsBeforeRun2)}, Record Changes 0, HumanValuesPreserved ${s.HumanValuesPreserved}`);
        },
    },
];

for (const c of FpGateC23Checks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
IntegrationCheckRegistry.Instance.RegisterLifecycle('fp-gate-c2-3', {
    Setup: async (ctx) => { RunOneState.Reset(); await F.Setup(ctx); },
    Teardown: async (ctx) => { await F.Teardown(ctx); },
});
