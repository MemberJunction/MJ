/**
 * Bundle 'fp-live-jobtitle': the installed job-title Feature Pipeline (bizapps-common), at temperature 0 with seed 42,
 * answers the 52 golden titles identically over three runs. Each run is a dry run with the Dedup Cache bypassed, so the
 * model answers every time and nothing but AI Prompt Runs is written.
 */
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { GetValueAtPath, NormalizeUUID } from '@memberjunction/global';
import { InferProcessor } from '@memberjunction/record-set-processor';
import type { RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { JOB_TITLE_RP_ID } from './fp-gates/fp-gate-fixture';
import { GOLDEN_TITLES, type GoldenTitle } from './fp-gates/golden-titles';

/** What one run answered for one title: the parts the consistency measurement compares. */
export interface JobTitleAnswer {
    Seniority: string | null;
    PrimaryFunction: string | null;
    /** The whole function list with confidences, serialized. */
    Full: string;
}

/** The consistency measurement: three dry runs over the golden titles, compared title by title. */
export class JobTitleConsistency {
    /** How many times every title is classified. */
    public static readonly RUNS = 3;

    /** Classifies every golden title `RUNS` times; a failed record stops the measurement after its run (its message is the finding). */
    public static async Measure(ctx: IntegrationCheckContext): Promise<JobTitleAnswer[][]> {
        const rp = await ctx.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', ctx.User);
        Assert(await rp.Load(JOB_TITLE_RP_ID), 'the job-title pipeline is installed (bizapps-common)');
        const processor = InferProcessor.FromRecordProcess(rp, ctx.Provider);
        const context: RecordProcessorContext = {
            contextUser: ctx.User, provider: ctx.Provider, recordProcessID: rp.ID, entityID: rp.EntityID,
            DryRun: true, BypassCache: true, TriggeredBy: 'Manual',
        };
        // The run-level gate a real run goes through: a dry run is never refused, but an unresolvable prompt is.
        await processor.Preflight(context);
        const runs: JobTitleAnswer[][] = [];
        // The runs go in sequence, each one batch through the processor's batch path (the path a real run takes).
        for (let rep = 0; rep < JobTitleConsistency.RUNS; rep++) {
            const recordID = (g: GoldenTitle): string => `live-${g.ID}-${rep}`;
            const records: RecordRef[] = GOLDEN_TITLES.map((g) => ({ EntityID: rp.EntityID, RecordID: recordID(g), Record: { CurrentJobTitle: g.Title } }));
            const results = await processor.ProcessBatch(records, context);
            runs.push(GOLDEN_TITLES.map((g) => JobTitleConsistency.AnswerOf(results.get(recordID(g)), g.Title)));
        }
        return runs;
    }

    /** The compared parts of one record's result; throws when the record has no result or did not succeed. */
    public static AnswerOf(result: RecordResult | undefined, title: string): JobTitleAnswer {
        if (!result || result.Status !== 'Succeeded') {
            throw new Error(`'${title}' was not classified (${result?.Status || 'no result'}): ${result?.ErrorMessage || 'no message'}`);
        }
        const payload = result.ResultPayload;
        const functions = GetValueAtPath(payload, 'Functions');
        const list = Array.isArray(functions) ? functions : [];
        const primary = list.find((f) => GetValueAtPath(f, 'Sequence') === 1) || list[0];
        const primaryID = primary === undefined ? undefined : GetValueAtPath(primary, 'JobFunctionID');
        const seniority = GetValueAtPath(payload, 'SeniorityLevel');
        return {
            Seniority: typeof seniority === 'string' ? seniority : null,
            PrimaryFunction: typeof primaryID === 'string' ? NormalizeUUID(primaryID) : null,
            Full: JSON.stringify(list),
        };
    }

    /** How many titles got the same non-null answer part in every run. */
    public static Identical(runs: JobTitleAnswer[][], pick: (a: JobTitleAnswer) => string | null): number {
        return GOLDEN_TITLES.filter((_, i) => pick(runs[0][i]) !== null && runs.every((run) => pick(run[i]) === pick(runs[0][i]))).length;
    }
}

export const FpLiveJobTitleChecks: NamedCheck[] = [
    {
        Id: 'fp-live-jobtitle.L1', Name: 'L1 three runs at temperature 0 give identical answers on 52/52 titles', RequiresLiveModel: true,
        Fn: async (ctx) => {
            const n = GOLDEN_TITLES.length;
            AssertEqual(n, 52, 'the golden-title copy holds the 52 adjudicated titles');
            const runs = await JobTitleConsistency.Measure(ctx);
            const seniority = JobTitleConsistency.Identical(runs, (a) => a.Seniority);
            const primary = JobTitleConsistency.Identical(runs, (a) => a.PrimaryFunction);
            const full = JobTitleConsistency.Identical(runs, (a) => a.Full);
            console.log(`      → identical over ${JobTitleConsistency.RUNS} runs: seniority ${seniority}/${n}, primary function ${primary}/${n}, full list with confidences ${full}/${n}`);
            AssertEqual(seniority, n, `seniority identical on ${n}/${n}`);
            AssertEqual(primary, n, `primary function identical on ${n}/${n}`);
        },
    },
];

for (const c of FpLiveJobTitleChecks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
