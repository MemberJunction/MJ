/**
 * @fileoverview Evaluates a Feature Pipeline version on its golden set and stores the result as the version's
 * activation. The pipeline runs as one dry-run batch (no cache, history, watermark, target or child writes) with the
 * cache bypassed, so the model answers every distinct case; AI Prompt Runs are recorded.
 * @module @memberjunction/testing-engine
 */
import { EscapeSQLString, GetValueAtPath, RegisterClass, ResolveMappingRef, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJAIPromptRunEntity, MJFeaturePipelineVersionEntity, MJRecordProcessEntity } from '@memberjunction/core-entities';
import { InferProcessor } from '@memberjunction/record-set-processor';
import type { RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import {
    FeaturePipelinePin,
    FeaturePipelineVersionService,
    MJFeaturePipelineVersionEntityExtended,
    type DataFeatureActivation,
    type GoldenSetResultDetails,
    type FeaturePipelinePinData,
    type ResolvedConstraint,
} from '@memberjunction/feature-pipelines';
import type { OracleResult } from '@memberjunction/testing-engine-base';
import { BaseTestDriver } from './BaseTestDriver';
import type { DriverExecutionContext, DriverExecutionResult } from '../types';
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

/** The AI Prompt Runs that hold a batch's cost could not be read, so the cost is unknown (never reported as 0). */
export class PromptRunCostReadError extends Error {
    /** @param ReadMessage the read's own error message */
    constructor(public readonly ReadMessage: string) {
        super(`could not read the AI Prompt Runs to report their cost: ${ReadMessage}`);
        this.name = 'PromptRunCostReadError';
    }
}

/**
 * A golden-set evaluation that must not produce a result: the test is misconfigured, the pipeline would not run, or the
 * run could not answer every case. The driver reports it as an Error result and stores nothing on the version.
 */
export class GoldenSetEvaluationError extends Error {
    /**
     * @param message why the evaluation produced no result
     * @param CostUSD what the evaluation's model calls cost before it stopped (0 when it stopped before any call)
     */
    constructor(message: string, public readonly CostUSD: number = 0) {
        super(message);
        this.name = 'GoldenSetEvaluationError';
    }
}

/** The cases' answers and what the model calls that produced them cost. */
export interface GoldenSetAnswers {
    Answers: GoldenAnswer[];
    /** Sum of `TotalCost` over the distinct AI Prompt Runs the batch recorded (cache bypassed, so one per distinct case). */
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
    /**
     * Evaluates the pipeline on its golden set. Every reason not to evaluate, or not to store a result (bad test JSON,
     * a pipeline that would not run, a case the run could not answer, an edit during the run), is one Error result.
     */
    public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        const started = Date.now();
        try {
            const prepared = await this.Prepare(context);
            return await this.Evaluate(prepared, context, started);
        } catch (e) {
            if (e instanceof GoldenSetEvaluationError) {
                return this.errorResult(e.message, started, e.CostUSD);
            }
            if (e instanceof Error) {
                return this.errorResult(e.message, started);
            }
            throw e;
        }
    }

    /**
     * Parses the test, loads its pipeline and checks that the pipeline names this test as its golden set and that the
     * labels may gate it. Nothing runs before these pass, so a refused test costs no model call.
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
        // Model-made labels gate nothing until their automated quality record passes; the version is left as it is,
        // so the run gate keeps refusing it.
        const labelProblems = await GoldenLabelQualityCheck.Check(cases, input.LabelQuality, config.LabelPolicy);
        if (labelProblems.length > 0) {
            throw new GoldenSetEvaluationError(`Golden set labels failed the label-quality check: ${labelProblems.join('; ')}`);
        }
        return { Config: config, Cases: cases, LabelQuality: input.LabelQuality, RecordProcess: rp, Processor: processor, Activation: activation };
    }

    /**
     * Runs the cases under the pipeline's current pin, scores them and stores the score on that pin's version. The pin
     * is captured before the batch and checked again after it, so a result is stored only on the version every case
     * ran under.
     * @throws GoldenSetEvaluationError when the pipeline would not run, a case could not be answered, or the pin changed
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
        await this.AssertPinUnchanged(p.Processor, ctx, pin, rp.Name, cost);
        const score = GoldenSetScorer.Score(p.Cases, answers, p.Activation.Metric);
        const row = await this.StoreResult(pin, rp, p.Activation, score, answers, p.LabelQuality, context);
        return this.BuildResult(score, row, p.Activation, p.Cases.length, started, cost, p.Cases.filter((c) => c.Required === true).length);
    }

    /** The pipeline's `MJ: Record Processes` row, read on this driver's provider; null when it does not exist. */
    protected async LoadRecordProcess(recordProcessID: string, contextUser: UserInfo): Promise<MJRecordProcessEntity | null> {
        const rp = await this.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', contextUser);
        return (await rp.Load(recordProcessID)) ? rp : null;
    }

    /**
     * The context the cases run under: a dry run writes no Feature Value, history, watermark, target or child row, and
     * the cache is bypassed, because the evaluation measures the model rather than answers cached under an older version.
     */
    protected BuildRunContext(rp: MJRecordProcessEntity, contextUser: UserInfo): RecordProcessorContext {
        return {
            contextUser, provider: this.Provider, recordProcessID: rp.ID, entityID: rp.EntityID,
            DryRun: true, BypassCache: true, TriggeredBy: 'Manual',
        };
    }

    /**
     * Why a real run of the pipeline would not compute at all (prompt or driver unresolvable, template missing the
     * constraint block); null when it would. The processor's own Preflight on the dry-run context: read-only, it
     * registers and activates nothing. The version gate's refusal is not a reason: on a dry run it only becomes a
     * warning, and evaluating the version is how it is cleared (a Refused version can be evaluated again).
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

    /**
     * Fails the evaluation when the pipeline's pin changed while the cases ran (a prompt, model, parameter or spec edit),
     * so a score is never stored on a version none of the cases ran under.
     * @param costUSD what the cases' model calls cost, carried on the error so the test run still reports it
     * @throws GoldenSetEvaluationError when the pin after the batch differs from the one captured before it
     */
    protected async AssertPinUnchanged(processor: InferProcessor, ctx: RecordProcessorContext, pin: FeaturePipelinePinData, name: string,
        costUSD: number): Promise<void> {
        const after = await FeaturePipelinePin.ComputeHash(await processor.ResolveRunPin(ctx));
        if (after !== (await FeaturePipelinePin.ComputeHash(pin))) {
            throw new GoldenSetEvaluationError(`Pipeline '${name}' changed (prompt, model, parameters or spec) during the evaluation; nothing was stored`, costUSD);
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
     * Runs every case through the pipeline in one batch, reads each answer's comparable values and what the batch's
     * model calls cost. A record rejected for breaking its constraints is the model's wrong answer (null values). Any
     * other failure (provider outage, timeout, a missing result) says nothing about the version's quality, so it fails
     * the evaluation instead of being scored.
     * @throws GoldenSetEvaluationError (carrying the batch's cost) when a case could not be answered for a reason other
     * than its answer
     */
    protected async AnswerCases(processor: InferProcessor, entityID: string, cases: GoldenCase[], ctx: RecordProcessorContext,
        config: FeaturePipelineGoldenSetConfig): Promise<GoldenSetAnswers> {
        const constraints = await processor.GetResolvedConstraints(ctx);
        const records: RecordRef[] = cases.map((c) => ({ EntityID: entityID, RecordID: `golden-${c.ID}`, Record: { ...c.Input } }));
        const results = await processor.ProcessBatch(records, ctx);
        const cost = await this.EvaluationCost(results, ctx.contextUser);
        FeaturePipelineGoldenSetDriver.AssertAnswered(cases, results, cost);
        const answers = cases.map((c): GoldenAnswer => {
            const r = results.get(`golden-${c.ID}`);
            const withheld = r?.BelowConfidenceOutputs || [];
            return {
                CaseID: c.ID, Values: r?.Status === 'Succeeded' ? this.AnswerValues(r.ResultPayload, processor, constraints, config) : null,
                // the outputs the confidence floor withheld (or failed the record on): an abstention, for a case expecting one
                ...(withheld.length > 0 ? { Withheld: withheld } : {}),
            };
        });
        return { Answers: answers, CostUSD: cost };
    }

    /**
     * What the batch's model calls cost: the sum of `TotalCost` over the distinct AI Prompt Runs its results name, read
     * on this driver's provider. Distinct, because records that share a cache key share one prompt run. 0 when no result
     * names a prompt run (nothing reached the model).
     * @throws GoldenSetEvaluationError when the prompt runs cannot be read: an unknown cost is never reported as 0
     */
    protected async EvaluationCost(results: Map<string, RecordResult>, contextUser: UserInfo): Promise<number> {
        try {
            return await FeaturePipelineGoldenSetDriver.PromptRunCost(results.values(), this.Provider, contextUser);
        } catch (e) {
            if (e instanceof PromptRunCostReadError) {
                throw new GoldenSetEvaluationError(`could not read the evaluation's AI Prompt Runs to report its cost: ${e.ReadMessage}`);
            }
            throw e;
        }
    }

    /**
     * What a batch's model calls cost: the sum of `TotalCost` over the distinct AI Prompt Runs the results name
     * (`AIPromptRunID`), read by ID on `provider`. Distinct, because records that share a cache key share one prompt
     * run. 0 when no result names a prompt run. Shared by every caller that reports a batch's spend, so the readers
     * cannot drift.
     * @throws PromptRunCostReadError when the prompt runs cannot be read: an unknown cost is never reported as 0
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
            throw new PromptRunCostReadError(runs.ErrorMessage);
        }
        return runs.Results.reduce((sum, r) => sum + (r.TotalCost || 0), 0);
    }

    /**
     * Fails when any case has no answer and no rejection of its answer: its result is missing, skipped, or failed for a
     * reason other than `RejectedInvalid` (a constraint) or `BelowConfidence` (a `fail` confidence floor). Both are the
     * model's answer, so they are scored.
     * @param costUSD what the batch cost, carried on the error so the test run still reports it
     * @throws GoldenSetEvaluationError naming how many cases failed and the first case's error
     */
    protected static AssertAnswered(cases: GoldenCase[], results: Map<string, RecordResult>, costUSD: number): void {
        const failed = cases.filter((c) => {
            const r = results.get(`golden-${c.ID}`);
            return !r || (r.Status !== 'Succeeded' && r.FailureKind !== 'RejectedInvalid' && r.FailureKind !== 'BelowConfidence');
        });
        if (failed.length > 0) {
            const first = results.get(`golden-${failed[0].ID}`);
            const reason = first ? first.ErrorMessage || first.Status : 'no result';
            throw new GoldenSetEvaluationError(`${failed.length} of ${cases.length} golden cases could not be run (case ${failed[0].ID}: ${reason}); nothing was stored`, costUSD);
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
     * An output's value as text; for an array, the item with the lowest `orderBy` value (items without a numeric one
     * last, else the first item), read at the constraint's ItemRef. `unknown` for the same reason as
     * {@link AnswerValues}' payload.
     * @throws GoldenSetEvaluationError when the value is still a structured object (an array of objects whose
     * constraint has no ItemRef): as text it would compare as "[object Object]" and score every case wrong silently
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

    /**
     * Orders two array items by their numeric `orderBy` value, ascending; an item without one sorts last. `unknown`
     * because the items come from the model's structured answer, whose shape the spec declares at run time (as in
     * {@link AnswerValues}).
     */
    protected static CompareOrder(a: unknown, b: unknown, orderBy: string): number {
        const x = FeaturePipelineGoldenSetDriver.OrderValue(a, orderBy);
        const y = FeaturePipelineGoldenSetDriver.OrderValue(b, orderBy);
        // Explicit comparison: Infinity − Infinity is NaN, which would leave the order undefined.
        return x === y ? 0 : x < y ? -1 : 1;
    }

    /**
     * An item's numeric `orderBy` value; +Infinity when it is missing, empty or not a number. `unknown` for the same
     * reason as {@link CompareOrder}: the item is part of the model's answer, shaped by the spec at run time.
     */
    protected static OrderValue(item: unknown, orderBy: string): number {
        const v = GetValueAtPath(item, orderBy);
        const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
        return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
    }

    /**
     * The display name the constraint shows the model for a value, else the value. Keys are matched with the golden
     * set's one label normalisation. A lookup's display text joins its display fields with " — ", and its first
     * display field is the name, so the name is the text before the first one.
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
     * the activation outcome, which decides the status: a wrong required case stores a gate value of 0, so the version
     * is refused and the test fails. `costUSD` is the evaluation's model cost, which the test run records as its CostUSD.
     */
    protected BuildResult(score: GoldenSetScore, row: MJFeaturePipelineVersionEntity, activation: DataFeatureActivation,
        caseCount: number, started: number, costUSD: number, requiredCount: number): DriverExecutionResult {
        const oracles: OracleResult[] = Object.entries(score.PerOutput).map(([name, s]) => ({
            oracleType: `golden-set.${name}`, passed: s.Value >= activation.Threshold, score: s.Value,
            message: `${name}: ${s.Correct}/${s.N} = ${s.Value.toFixed(4)}${s.Lower !== null && s.Upper !== null ? ` [${s.Lower.toFixed(4)}, ${s.Upper.toFixed(4)}]` : ''} (threshold ${activation.Threshold})`,
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

    private errorResult(message: string, started: number, costUSD: number = 0): DriverExecutionResult {
        return {
            targetType: TARGET_TYPE, targetLogId: '', status: 'Error', score: 0, oracleResults: [],
            passedChecks: 0, failedChecks: 0, totalChecks: 0, errorMessage: message, durationMs: Date.now() - started, totalCost: costUSD,
        };
    }
}
