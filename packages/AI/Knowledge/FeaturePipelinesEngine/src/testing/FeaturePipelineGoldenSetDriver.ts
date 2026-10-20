/**
 * @fileoverview Evaluates a Feature Pipeline version on its golden set and stores the result as the version's
 * activation. The pipeline runs as one dry-run batch (no cache, history, watermark, target or child writes) with the
 * cache bypassed, so the model answers every distinct case; AI Prompt Runs are recorded.
 * @module @memberjunction/feature-pipelines-engine
 */
import { EscapeSQLString, GetValueAtPath, RegisterClass, ResolveMappingRef, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJAIPromptRunEntity, MJFeaturePipelineVersionEntity, MJRecordProcessEntity } from '@memberjunction/core-entities';
import type { RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import {
    FeaturePipelineVersionService,
    MJFeaturePipelineVersionEntityExtended,
    type DataFeatureActivation,
    type GoldenSetResultDetails,
    type FeaturePipelinePinData,
    type ResolvedConstraint,
} from '@memberjunction/feature-pipelines';
import type { OracleResult } from '@memberjunction/testing-engine-base';
import { BaseTestDriver, type DriverExecutionContext, type DriverExecutionResult } from '@memberjunction/testing-engine';
import { InferProcessor } from '../processors/InferProcessor';
import { GoldenSetScorer, type GoldenAnswer, type GoldenCase, type GoldenSetScore } from './golden-set-scoring';
import { GoldenLabelQualityCheck, type GoldenLabelPolicy, type GoldenLabelQuality } from './golden-label-quality';

/** How one output's answer is compared: the array item order, and the value or its display name. */
export interface GoldenSetOutputSettings {
    /** For an array output, the item field to order by (the item with the lowest value is the primary). */
    PrimaryItemOrderBy?: string;
    /** Compare the value itself (default), or the display name the constraint shows the model for it. */
    Compare?: 'value' | 'display-name';
}

/** `Configuration` of a Feature Pipeline Golden Set test. */
export interface FeaturePipelineGoldenSetConfig {
    /** The `MJ: Record Processes` row (WorkType Infer) the test evaluates. */
    RecordProcessID: string;
    /** Per output name, how its answer is compared. */
    Outputs?: Record<string, GoldenSetOutputSettings>;
    /** Label-quality policy for model-made labels (default DEFAULT_GOLDEN_LABEL_POLICY). */
    LabelPolicy?: GoldenLabelPolicy;
}

/** `InputDefinition` of a Feature Pipeline Golden Set test: the cases and, for model-made labels, their quality record. */
export interface FeaturePipelineGoldenSetInput {
    Cases: GoldenCase[];
    LabelQuality?: GoldenLabelQuality;
}

/** Everything an evaluation needs once the test, its pipeline and its labels have been checked. */
export interface PreparedGoldenSetEvaluation {
    Config: FeaturePipelineGoldenSetConfig;
    Cases: GoldenCase[];
    LabelQuality: GoldenLabelQuality | undefined;
    RecordProcess: MJRecordProcessEntity;
    Processor: InferProcessor;
    Activation: DataFeatureActivation;
}

/**
 * A golden-set evaluation that must not produce a result (misconfigured test, a pipeline that would not run, a case the
 * run could not answer). The driver reports it as an Error result and stores nothing on the version.
 */
export class GoldenSetEvaluationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GoldenSetEvaluationError';
    }
}

/** The cases' answers and what the model calls that produced them cost. */
export interface GoldenSetAnswers {
    Answers: GoldenAnswer[];
    /** Sum of `TotalCost` over the distinct AI Prompt Runs the batch recorded. */
    CostUSD: number;
}

/** The target type every result of this driver names: the version it evaluated. */
const TARGET_TYPE = 'Feature Pipeline Version';

/**
 * Test driver of the "Feature Pipeline Golden Set" test type. Evaluates the version the pipeline would run now (its
 * current pin) on the test's golden cases and stores the result on that version through the version registry, which
 * activates it when the result meets the threshold the pipeline's `Activation` declares, and refuses it otherwise.
 */
@RegisterClass(BaseTestDriver, 'FeaturePipelineGoldenSetDriver')
export class FeaturePipelineGoldenSetDriver extends BaseTestDriver {
    /** Evaluates the pipeline on its golden set; every reason not to store a result is one Error result. */
    public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        const started = Date.now();
        try {
            const prepared = await this.Prepare(context);
            return await this.Evaluate(prepared, context, started);
        } catch (e) {
            if (e instanceof Error) {
                return this.errorResult(e.message, started);
            }
            throw e;
        }
    }

    /**
     * Parses the test, loads its pipeline and checks that the pipeline names this test as its golden set and that the
     * labels may gate it, before any model call.
     * @throws GoldenSetEvaluationError naming the first reason the test may not evaluate
     */
    protected async Prepare(context: DriverExecutionContext): Promise<PreparedGoldenSetEvaluation> {
        const config = this.parseConfig<FeaturePipelineGoldenSetConfig>(context.test);
        const input = this.parseInputDefinition<FeaturePipelineGoldenSetInput>(context.test);
        // `||`: a definition without `Cases` is an empty golden set, which the label check refuses.
        const cases = input.Cases || [];
        if (!config.RecordProcessID) {
            throw new GoldenSetEvaluationError('Configuration.RecordProcessID is required');
        }
        const rp = await this.LoadRecordProcess(config.RecordProcessID, context.contextUser);
        if (!rp) {
            throw new GoldenSetEvaluationError(`Record Process '${config.RecordProcessID}' not found`);
        }
        const processor = InferProcessor.FromRecordProcess(rp, this.Provider);
        const activation = processor.Spec?.Activation;
        // The result is stored as the pipeline's activation evidence, so only the test the pipeline names may write it.
        if (!activation || !UUIDsEqual(activation.GoldenSetTestID, context.test.ID)) {
            throw new GoldenSetEvaluationError(`Pipeline '${rp.Name}' does not declare this test as its Activation.GoldenSetTestID`);
        }
        // Model-made labels gate nothing until their automated quality record passes.
        const labelProblems = await GoldenLabelQualityCheck.Check(cases, input.LabelQuality, config.LabelPolicy);
        if (labelProblems.length > 0) {
            throw new GoldenSetEvaluationError(`Golden set labels failed the label-quality check: ${labelProblems.join('; ')}`);
        }
        return { Config: config, Cases: cases, LabelQuality: input.LabelQuality, RecordProcess: rp, Processor: processor, Activation: activation };
    }

    /**
     * Runs the cases under the pipeline's current pin, scores them and stores the score on that pin's version.
     * @throws GoldenSetEvaluationError when the pipeline would not run or a case could not be answered
     */
    protected async Evaluate(p: PreparedGoldenSetEvaluation, context: DriverExecutionContext, started: number): Promise<DriverExecutionResult> {
        const rp = p.RecordProcess;
        const ctx = this.BuildRunContext(rp, context.contextUser);
        const refusal = await this.PreflightRefusal(p.Processor, ctx);
        if (refusal) {
            throw new GoldenSetEvaluationError(`Pipeline '${rp.Name}' would not run: ${refusal}`);
        }
        const pin = await p.Processor.ResolveRunPin(ctx);
        const { Answers: answers, CostUSD: cost } = await this.AnswerCases(p.Processor, rp.EntityID, p.Cases, ctx, p.Config);
        const score = GoldenSetScorer.Score(p.Cases, answers, p.Activation.Metric);
        const row = await this.StoreResult(pin, rp, p.Activation, score, answers, p.LabelQuality, context);
        return this.BuildResult(score, row, p.Activation, p.Cases.length, started, cost, p.Cases.filter((c) => c.Required === true).length);
    }

    /** The pipeline's `MJ: Record Processes` row, read on this driver's provider; null when it does not exist. */
    protected async LoadRecordProcess(recordProcessID: string, contextUser: UserInfo): Promise<MJRecordProcessEntity | null> {
        const rp = await this.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', contextUser);
        return (await rp.Load(recordProcessID)) ? rp : null;
    }

    /** A dry run (no writes) with the cache bypassed: the evaluation measures the model, not cached answers. */
    protected BuildRunContext(rp: MJRecordProcessEntity, contextUser: UserInfo): RecordProcessorContext {
        return {
            ContextUser: contextUser, Provider: this.Provider, RecordProcessID: rp.ID, EntityID: rp.EntityID,
            DryRun: true, BypassCache: true, TriggeredBy: 'Manual',
        };
    }

    /**
     * Why a real run of the pipeline would not compute at all; null when it would. The processor's read-only Preflight
     * on the dry-run context, where the version gate's refusal is only a warning (evaluating is how it is cleared).
     */
    protected async PreflightRefusal(processor: InferProcessor, ctx: RecordProcessorContext): Promise<string | null> {
        try {
            await processor.Preflight(ctx);
            return null;
        } catch (e) {
            if (e instanceof Error) {
                // `||`: an Error with an empty message must still refuse, so it falls back to the error's name.
                return e.message || e.name;
            }
            throw e;
        }
    }

    /** Stores the score on the version of the pin the cases ran under, with the per-case answers and the label-quality record as its details. */
    protected async StoreResult(pin: FeaturePipelinePinData, rp: MJRecordProcessEntity, activation: DataFeatureActivation, score: GoldenSetScore,
        answers: GoldenAnswer[], labelQuality: GoldenLabelQuality | undefined, context: DriverExecutionContext): Promise<MJFeaturePipelineVersionEntity> {
        // typed against the stored shape the version service reads (its refusal names the wrong required cases)
        const details: GoldenSetResultDetails & { Answers: GoldenAnswer[]; LabelQuality: GoldenLabelQuality | null } = {
            Score: score, Answers: answers, LabelQuality: labelQuality || null,
        };
        return FeaturePipelineVersionService.Instance.RecordGoldenSetResult({
            RecordProcessID: rp.ID, Pin: pin, Activation: activation, TestRunID: context.testRun.ID,
            Result: { Value: score.Value, Lower: score.Lower, Upper: score.Upper, N: score.N, Details: JSON.stringify(details) },
            ApprovedByUserID: context.contextUser.ID, ContextUser: context.contextUser, Provider: this.Provider,
        });
    }

    /**
     * Runs every case through the pipeline in one batch and reads each answer's comparable values and the batch's cost.
     * A record rejected for breaking its constraints is a wrong answer; any other failure fails the evaluation.
     * @throws GoldenSetEvaluationError when a case could not be answered for a reason other than its answer
     */
    protected async AnswerCases(processor: InferProcessor, entityID: string, cases: GoldenCase[], ctx: RecordProcessorContext,
        config: FeaturePipelineGoldenSetConfig): Promise<GoldenSetAnswers> {
        const constraints = await processor.GetResolvedConstraints(ctx);
        const records: RecordRef[] = cases.map((c) => ({ EntityID: entityID, RecordID: `golden-${c.ID}`, Record: { ...c.Input } }));
        const results = await processor.ProcessBatch(records, ctx);
        const cost = await FeaturePipelineGoldenSetDriver.PromptRunCost(results.values(), this.Provider, ctx.ContextUser);
        FeaturePipelineGoldenSetDriver.AssertAnswered(cases, results);
        const answers = cases.map((c): GoldenAnswer => {
            const r = results.get(`golden-${c.ID}`);
            const withheld = r?.BelowConfidenceOutputs || [];
            return {
                CaseID: c.ID, Values: r?.Status === 'Succeeded' ? this.AnswerValues(r.ResultPayload, processor, constraints, config) : null,
                // the outputs the confidence floor withheld: an abstention, for a case expecting one
                ...(withheld.length > 0 ? { Withheld: withheld } : {}),
            };
        });
        return { Answers: answers, CostUSD: cost };
    }

    /**
     * What a batch's model calls cost: the sum of `TotalCost` over the distinct AI Prompt Runs the results name (records
     * that share a cache key share one prompt run); 0 when none does.
     * @throws Error when the prompt runs cannot be read: an unknown cost is never reported as 0
     */
    public static async PromptRunCost(results: Iterable<RecordResult>, provider: IMetadataProvider, contextUser: UserInfo): Promise<number> {
        // The set only de-duplicates; the IDs put in the filter are the ones the results carry, never normalized copies.
        const seen = new UUIDSet();
        const ids: string[] = [];
        for (const id of [...results].map((r) => r.AIPromptRunID)) {
            if (id && !seen.Has(id)) {
                seen.Add(id);
                ids.push(id);
            }
        }
        if (ids.length === 0) {
            return 0;
        }
        const runs = await RunView.FromMetadataProvider(provider).RunView<Pick<MJAIPromptRunEntity, 'ID' | 'TotalCost'>>({
            EntityName: 'MJ: AI Prompt Runs',
            ExtraFilter: `ID IN (${ids.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`,
            Fields: ['ID', 'TotalCost'],
        }, contextUser);
        if (!runs.Success) {
            throw new Error(`could not read the AI Prompt Runs to report their cost: ${runs.ErrorMessage}`);
        }
        return runs.Results.reduce((sum, r) => sum + (r.TotalCost || 0), 0);
    }

    /**
     * Fails when a case's result is missing, skipped, or failed for a reason other than `RejectedInvalid` (a broken
     * constraint is the model's answer and is scored).
     * @throws GoldenSetEvaluationError naming how many cases failed and the first case's error
     */
    protected static AssertAnswered(cases: GoldenCase[], results: Map<string, RecordResult>): void {
        const failed = cases.filter((c) => {
            const r = results.get(`golden-${c.ID}`);
            return !r || (r.Status !== 'Succeeded' && r.FailureKind !== 'RejectedInvalid');
        });
        if (failed.length > 0) {
            const first = results.get(`golden-${failed[0].ID}`);
            const reason = first ? first.ErrorMessage || first.Status : 'no result';
            throw new GoldenSetEvaluationError(`${failed.length} of ${cases.length} golden cases could not be run (case ${failed[0].ID}: ${reason}); nothing was stored`);
        }
    }

    /**
     * The comparable value of each output in a result payload. `unknown` because the payload is the model's structured
     * answer, whose shape the pipeline's spec declares at run time; each output is read at its spec `Ref`.
     */
    protected AnswerValues(payload: unknown, processor: InferProcessor, constraints: Map<string, ResolvedConstraint | null>,
        config: FeaturePipelineGoldenSetConfig): Record<string, string | null> {
        const out: Record<string, string | null> = {};
        for (const o of processor.Spec?.Outputs || []) {
            const settings = config.Outputs?.[o.Name] || {};
            const resolved = constraints.get(o.Name) || null;
            const value = this.PrimaryValue(o.Name, ResolveMappingRef(o.Ref, { $: payload }), resolved, settings.PrimaryItemOrderBy);
            out[o.Name] = settings.Compare === 'display-name' ? this.DisplayName(value, resolved) : value;
        }
        return out;
    }

    /**
     * An output's value as text; for an array, the item with the lowest `orderBy` value (else the first item), read at
     * the constraint's ItemRef. `unknown`: part of the model's answer, as in {@link AnswerValues}.
     * @throws GoldenSetEvaluationError when the value is still an object (no ItemRef), which would compare as text
     */
    protected PrimaryValue(output: string, value: unknown, resolved: ResolvedConstraint | null, orderBy: string | undefined): string | null {
        let v = value;
        if (Array.isArray(value)) {
            const list: unknown[] = value;
            const items = orderBy
                ? [...list].sort((a, b) => FeaturePipelineGoldenSetDriver.CompareOrder(a, b, orderBy))
                : list;
            v = resolved?.ItemRef ? ResolveMappingRef(resolved.ItemRef, { $: items[0] }) : items[0];
        }
        if (v === null || v === undefined) {
            return null;
        }
        if (typeof v === 'object') {
            throw new GoldenSetEvaluationError(`Output '${output}' answered a structured value; give its constraint an ItemRef naming the field to compare`);
        }
        return String(v);
    }

    /** Orders two array items by their numeric `orderBy` value, ascending; an item without one sorts last. */
    protected static CompareOrder(a: unknown, b: unknown, orderBy: string): number {
        const x = FeaturePipelineGoldenSetDriver.OrderValue(a, orderBy);
        const y = FeaturePipelineGoldenSetDriver.OrderValue(b, orderBy);
        // Explicit comparison: Infinity − Infinity is NaN, which would leave the order undefined.
        return x === y ? 0 : x < y ? -1 : 1;
    }

    /** An item's numeric `orderBy` value; +Infinity when it is missing, empty or not a number. */
    protected static OrderValue(item: unknown, orderBy: string): number {
        const v = GetValueAtPath(item, orderBy);
        const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
        return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
    }

    /**
     * The display name the constraint shows the model for a value, else the value: the text before the first " — " of
     * the lookup's display text (its first display field).
     */
    protected DisplayName(value: string | null, resolved: ResolvedConstraint | null): string | null {
        const displays = resolved?.ValueDisplays;
        if (value === null || !displays) {
            return value;
        }
        const wanted = GoldenSetScorer.NormalizeLabel(value);
        const key = Object.keys(displays).find((k) => GoldenSetScorer.NormalizeLabel(k) === wanted);
        return key ? displays[key].split(' — ')[0] : value;
    }

    /**
     * One oracle per output (its value against the threshold), one for the required cases (when the set has any), plus
     * the activation outcome, which decides the status.
     */
    protected BuildResult(score: GoldenSetScore, row: MJFeaturePipelineVersionEntity, activation: DataFeatureActivation,
        caseCount: number, started: number, costUSD: number, requiredCount: number): DriverExecutionResult {
        const oracles: OracleResult[] = Object.entries(score.PerOutput).map(([name, s]) => ({
            oracleType: `golden-set.${name}`, passed: s.Value >= activation.Threshold, score: s.Value,
            message: `${name}: ${s.Correct}/${s.N} = ${s.Value.toFixed(4)} [${s.Lower.toFixed(4)}, ${s.Upper.toFixed(4)}] (threshold ${activation.Threshold})`,
        }));
        if (requiredCount > 0) {
            oracles.push(FeaturePipelineGoldenSetDriver.RequiredOracle(score, requiredCount));
        }
        const active = row.Status === 'Active';
        oracles.push({ oracleType: 'golden-set.activation', passed: active, score: active ? 1 : 0, message: `Version v${row.Version} ${row.Status}` });
        const passed = oracles.filter((o) => o.passed).length;
        return {
            targetType: TARGET_TYPE, targetLogId: row.ID, status: active ? 'Passed' : 'Failed',
            score: score.Value, oracleResults: oracles, passedChecks: passed, failedChecks: oracles.length - passed, totalChecks: oracles.length,
            inputData: { cases: caseCount }, actualOutput: score, durationMs: Date.now() - started, totalCost: costUSD,
        };
    }

    /** The required cases' oracle: passed when none is wrong, else naming each wrong case and its wrong outputs. */
    protected static RequiredOracle(score: GoldenSetScore, requiredCount: number): OracleResult {
        const wrong = score.RequiredFailures;
        return {
            oracleType: 'golden-set.required', passed: wrong.length === 0, score: (requiredCount - wrong.length) / requiredCount,
            message: wrong.length === 0
                ? `${requiredCount}/${requiredCount} required case(s) right`
                : MJFeaturePipelineVersionEntityExtended.FormatRequiredFailures(wrong),
        };
    }

    private errorResult(message: string, started: number): DriverExecutionResult {
        return {
            targetType: TARGET_TYPE, targetLogId: '', status: 'Error', score: 0, oracleResults: [],
            passedChecks: 0, failedChecks: 0, totalChecks: 0, errorMessage: message, durationMs: Date.now() - started, totalCost: 0,
        };
    }
}
