/**
 * Bundle 'fp-live-jobtitle': the installed job-title Feature Pipeline (bizapps-common), at temperature 0 with seed 42,
 * answers the 58 golden titles (52 labelled, 6 required injection and non-title cases) identically over three runs. An
 * abstention is an answer: a seniority withheld below its confidence floor, or an empty function list, must also repeat.
 * Each run is a dry run with the Dedup Cache bypassed, so the model answers every time and nothing but AI Prompt Runs is
 * written.
 */
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { GetValueAtPath, NormalizeUUID } from '@memberjunction/global';
import { InferProcessor } from '@memberjunction/record-set-processor';
import type { RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import { FeaturePipelineGoldenSetDriver } from '@memberjunction/testing-engine';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { JOB_TITLE_RP_ID } from './fp-gates/fp-gate-fixture';
import { ALL_GOLDEN_TITLES, type GoldenTitle } from './fp-gates/golden-titles';

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

    /** The seniority of an answer whose seniority the confidence floor withheld (an abstention). */
    public static readonly WITHHELD = '(withheld)';

    /** The primary function of an answer whose function list is empty (an abstention). */
    public static readonly NO_FUNCTION = '(none)';

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
            const records: RecordRef[] = ALL_GOLDEN_TITLES.map((g) => ({ EntityID: rp.EntityID, RecordID: recordID(g), Record: { CurrentJobTitle: g.Title } }));
            const results = await processor.ProcessBatch(records, context);
            await JobTitleConsistency.RecordCost(ctx, results); // before any answer is read: a failed record must not lose the spend
            runs.push(ALL_GOLDEN_TITLES.map((g) => JobTitleConsistency.AnswerOf(results.get(recordID(g)), g.Title)));
        }
        return runs;
    }

    /**
     * Adds to `ctx.CostUSD` what the batch's model calls cost, read by prompt-run ID
     * ({@link FeaturePipelineGoldenSetDriver.PromptRunCost}), so nothing else running at the same time is counted.
     * @throws Error when the prompt runs cannot be read: an unknown cost is never reported as 0
     */
    public static async RecordCost(ctx: IntegrationCheckContext, results: Map<string, RecordResult>): Promise<void> {
        ctx.CostUSD = (ctx.CostUSD || 0) + await FeaturePipelineGoldenSetDriver.PromptRunCost(results.values(), ctx.Provider, ctx.User);
    }

    /**
     * The compared parts of one record's result; throws when the record has no result or did not succeed. A seniority
     * the confidence floor withheld is {@link WITHHELD}, and an empty function list's primary is {@link NO_FUNCTION}:
     * abstentions are answers too. A part the payload lacks entirely is null (no answer).
     */
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
        const withheld = (result.BelowConfidenceOutputs || []).includes('SeniorityLevel');
        return {
            Seniority: withheld ? JobTitleConsistency.WITHHELD : typeof seniority === 'string' ? seniority : null,
            PrimaryFunction: typeof primaryID === 'string' ? NormalizeUUID(primaryID) : Array.isArray(functions) && functions.length === 0 ? JobTitleConsistency.NO_FUNCTION : null,
            Full: JSON.stringify(list),
        };
    }

    /** How many titles got the same non-null answer part in every run. */
    public static Identical(runs: JobTitleAnswer[][], pick: (a: JobTitleAnswer) => string | null): number {
        return ALL_GOLDEN_TITLES.filter((_, i) => pick(runs[0][i]) !== null && runs.every((run) => pick(run[i]) === pick(runs[0][i]))).length;
    }
}

export const FpLiveJobTitleChecks: NamedCheck[] = [
    {
        Id: 'fp-live-jobtitle.L1', Name: 'L1 three runs at temperature 0 give identical answers on 58/58 titles', RequiresLiveModel: true,
        Fn: async (ctx) => {
            const n = ALL_GOLDEN_TITLES.length;
            AssertEqual(n, 58, 'the golden-title copy holds the 52 adjudicated titles and the 6 required cases');
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
