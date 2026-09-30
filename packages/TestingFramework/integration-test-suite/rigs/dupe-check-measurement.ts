/**
 * @fileoverview CLI harness to measure duplicate record entry check across reasoning arms:
 *  1. Vector threshold arm
 *  2. Decision prompt arm (DecisionReasoningProvider, banded on the calibrated probability as the entry check bands it)
 *  3. Decision · production arm (PassedThreshold && banded Uncertain on the calibrated probability)
 *  4. Full prompt arm (PromptReasoningProvider)
 *  5. Prompt · production arm (PassedThreshold && (Merge || Uncertain))
 *
 * All arms evaluate the exact same candidates retrieved per check. Retrieval runs with a threshold
 * of 0, so the decision and prompt calls see every readable top-K candidate, including any below
 * PotentialMatchThreshold; the `· production` views filter their verdicts afterwards.
 *
 * The decision arm flags as production's entry check does: a candidate a successful decision gave
 * no answer for is flagged, and a failed decision flags nothing, nor does one answered by a model with
 * no calibration (production logs that once per model; the rig still records its raw probabilities,
 * which the report's calibration section fits). Each call's success, error (withheld when it quotes
 * record text) and missing answers are recorded, and a failure is logged.
 *
 * The entry check's latency is timed from building the unsaved record through the decision call:
 * PreparationLatencyMs (record, retrieval, permission narrowing, candidate load) plus the decision.
 *
 * USAGE:
 *   npx tsx rigs/dupe-check-measurement.ts --entity "MJ: Actions" --corpus <dir> --out <dir> \
 *     [--reps 1] [--top-k 5] [--arms threshold,decision,prompt] [--decision-prompt "<name>"] \
 *     [--decision-model "<name>"] [--dry-run]
 *
 * Each candidate's DecisionProbability is the model's raw probability, which the report's calibration
 * section fits on; its DecisionFlagged comes from production's calibrated band.
 *
 * OUTPUTS:
 *   - checks.jsonl: observation for each entry check
 *   - report.md: markdown evaluation report with tables and clustered CIs
 *   - report.json: machine-readable summary of all metrics
 *
 * SAFETY:
 *   --out MUST be outside any git working tree. Inside-repo paths are refused by AssertOutputOutsideRepo.
 *   NO record text is ever written to reports or output files.
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AssertOutputOutsideRepo } from '@memberjunction/testing-engine';
import { LoadEnv } from '@memberjunction/testing-integration';
import {
    BaseEntity,
    DuplicateDetectionOptions,
    EntityInfo,
    Metadata,
    PotentialDuplicate,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { KnowledgeHubMetadataEngine, MJEntityDocumentEntity } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { AIDecisionParams } from '@memberjunction/ai-prompts';
import {
    DecisionReasoningProvider,
    DuplicateReasoningContext,
    DuplicateReasoningInput,
    DuplicateRecordDetector,
    PromptReasoningProvider,
} from '@memberjunction/ai-vector-dupe';
import '@memberjunction/server-bootstrap-lite';

import { BootstrapAI } from './lib/ai-bootstrap';
import {
    BuildMeasurementReport,
    CandidatePairObservation,
    CorpusRecord,
    DecisionArmReading,
    DuplicateCorpusLabel,
    NewCorpusLabel,
    PromptArmReading,
    ReadCorpusFiles,
    ReadDecisionArm,
    ReadPromptArm,
    RecordCheckObservation,
    RecordTextsOf,
    ReportOptions,
    WriteReportFiles,
} from '../src/dupe-check-measurement';

export interface MeasurementCliOptions {
    Entity: string;
    CorpusDir: string;
    OutDir: string;
    Reps: number;
    TopK: number;
    Arms: string[];
    DecisionPromptName: string;
    DecisionModelName?: string;
    DryRun: boolean;
}

interface AIPromptRunCostRow {
    ID: string;
    TotalCost: number | null;
    Cost: number | null;
    Model: string | null;
}

type CandidateQuery = NonNullable<
    Awaited<ReturnType<MeasuringDuplicateRecordDetector['QueryCandidates']>>
>;

/**
 * Subclass extending DuplicateRecordDetector to expose typed wrappers without widening protected methods,
 * and resolving the active entity document regardless of ReasoningMode.
 */
class MeasuringDuplicateRecordDetector extends DuplicateRecordDetector {
    public async ResolveActiveEntityDocument(entityName: string): Promise<MJEntityDocumentEntity | null> {
        await KnowledgeHubMetadataEngine.Instance.Config(false, this.CurrentUser);
        const documents = KnowledgeHubMetadataEngine.Instance.GetEntityDocumentsForEntity(entityName)
            .filter(d => d.Status === 'Active');
        return documents.sort(this.compareOldestFirst)[0] ?? null;
    }

    protected override async FindEntryCheckDocument(entityName: string): Promise<MJEntityDocumentEntity | null> {
        return this.ResolveActiveEntityDocument(entityName);
    }

    private compareOldestFirst(a: MJEntityDocumentEntity, b: MJEntityDocumentEntity): number {
        const byAge = (a.__mj_CreatedAt?.getTime() ?? 0) - (b.__mj_CreatedAt?.getTime() ?? 0);
        return byAge !== 0 ? byAge : NormalizeUUID(a.ID).localeCompare(NormalizeUUID(b.ID));
    }

    public async BuildRecord(
        entityInfo: EntityInfo,
        values: Record<string, unknown>,
        contextUser: UserInfo
    ) {
        return this.BuildUnsavedRecord(entityInfo, values, contextUser);
    }

    public async QueryCandidates(
        record: BaseEntity,
        entityDocument: MJEntityDocumentEntity,
        options: DuplicateDetectionOptions,
        contextUser?: UserInfo
    ) {
        return this.QueryCandidatesForRecord(record, entityDocument, options, contextUser);
    }

    public async ReadableCandidateNames(
        candidates: PotentialDuplicate[],
        entityInfo: EntityInfo,
        contextUser: UserInfo
    ) {
        return this.LoadReadableCandidateNames(candidates, entityInfo, contextUser);
    }

    /** The decision's input bounded as the entry check bounds it (field count and text length). */
    public EntryDecisionInput(input: DuplicateReasoningInput): DuplicateReasoningInput {
        return this.BoundEntryDecisionInput(input);
    }

    public async ReasoningInput(
        query: CandidateQuery,
        entityInfo: EntityInfo,
        entityDocument: MJEntityDocumentEntity,
        contextUser?: UserInfo,
        unsavedSource?: BaseEntity
    ) {
        return this.BuildReasoningInput(query, entityInfo, entityDocument, contextUser, unsavedSource);
    }

    public ResolveDecisionProvider(): DecisionReasoningProvider | null {
        return this.ResolveEntryDecisionProvider();
    }

    public async SetupProviders(entityDocument: MJEntityDocumentEntity): Promise<void> {
        return this.InitializeProviders(entityDocument);
    }
}

/**
 * Subclass extending DecisionReasoningProvider to support custom decision prompt names
 * and pinned decision models (disabling failover). Everything else, including calibration,
 * is production's `DecideCandidates`.
 */
export class MeasuringDecisionReasoningProvider extends DecisionReasoningProvider {
    private readonly customPromptName?: string;
    private readonly pinnedModelId?: string;

    constructor(options?: { promptName?: string; modelId?: string; uncertainAbove?: number }) {
        super(options?.uncertainAbove);
        this.customPromptName = options?.promptName;
        this.pinnedModelId = options?.modelId;
    }

    protected override ResolveDecisionPrompt(): MJAIPromptEntityExtended | null {
        const target = (this.customPromptName ?? DecisionReasoningProvider.DEFAULT_PROMPT_NAME).toLowerCase();
        return AIEngine.Instance.Prompts.find(p => (p.Name ?? '').trim().toLowerCase() === target) ?? null;
    }

    /** Production's params, with the pinned model, when there is one, as an override. */
    protected override BuildDecisionParams(
        prompt: MJAIPromptEntityExtended,
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): AIDecisionParams {
        const params = super.BuildDecisionParams(prompt, input, context);
        if (this.pinnedModelId) {
            params.override = { modelId: this.pinnedModelId };
        }
        return params;
    }
}

function readFlag(argv: string[], name: string): string | undefined {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
}

export function ParseCliArgs(argv: string[]): MeasurementCliOptions {
    const entity = readFlag(argv, 'entity') ?? 'MJ: Actions';
    const corpusDir = readFlag(argv, 'corpus');
    if (!corpusDir) {
        throw new Error('Missing required argument: --corpus <dir>');
    }
    const outDir = readFlag(argv, 'out');
    if (!outDir) {
        throw new Error('Missing required argument: --out <dir>');
    }

    const reps = Number.parseInt(readFlag(argv, 'reps') ?? '1', 10);
    const topK = Number.parseInt(readFlag(argv, 'top-k') ?? '5', 10);
    const armsRaw = readFlag(argv, 'arms') ?? 'threshold,decision,prompt';
    const arms = armsRaw.split(',').map(a => a.trim().toLowerCase()).filter(a => a.length > 0);
    const decisionPrompt = readFlag(argv, 'decision-prompt') ?? 'Default Decision';
    const decisionModel = readFlag(argv, 'decision-model');
    const dryRun = argv.includes('--dry-run');

    return {
        Entity: entity,
        CorpusDir: resolve(corpusDir),
        OutDir: resolve(outDir),
        Reps: reps,
        TopK: topK,
        Arms: arms,
        DecisionPromptName: decisionPrompt,
        DecisionModelName: decisionModel,
        DryRun: dryRun,
    };
}

function resolvePinnedModelId(modelName: string): string {
    const models = AIEngine.Instance.Models;
    const match = models.find(m => (m.Name ?? '').trim().toLowerCase() === modelName.trim().toLowerCase());
    if (!match) {
        const available = models.map(m => m.Name).filter(Boolean).join(', ');
        throw new Error(`Decision model "${modelName}" not found. Available models: ${available}`);
    }
    return match.ID;
}

interface MeasurementEnv {
    detector: MeasuringDuplicateRecordDetector;
    entityDocument: MJEntityDocumentEntity;
    entityInfo: EntityInfo;
    decisionProvider: DecisionReasoningProvider;
    promptProvider: PromptReasoningProvider;
    configuredThreshold: number;
    bootstrapCtx: Awaited<ReturnType<typeof BootstrapAI>>;
}

async function setupMeasurementEnvironment(
    options: MeasurementCliOptions
): Promise<MeasurementEnv> {
    LoadEnv();
    console.log(`Bootstrapping AI stack and connecting to database for measurement on "${options.Entity}"...`);
    const bootstrapCtx = await BootstrapAI();

    const detector = new MeasuringDuplicateRecordDetector();
    detector.CurrentUser = bootstrapCtx.user;

    const entityDocument = await detector.ResolveActiveEntityDocument(options.Entity);
    if (!entityDocument) {
        throw new Error(`No Active entity document found for entity "${options.Entity}".`);
    }

    if (entityDocument.PotentialMatchThreshold == null) {
        throw new Error(
            `Entity document "${entityDocument.Name}" (ID: ${entityDocument.ID}) has null PotentialMatchThreshold. Refusing to run.`
        );
    }
    const configuredThreshold = entityDocument.PotentialMatchThreshold;

    const metadata = new Metadata(); // global-provider-ok: a standalone measurement rig; its process has one provider
    const entityInfo = metadata.EntityByID(entityDocument.EntityID);
    if (!entityInfo) {
        throw new Error(`Entity metadata not found for EntityID ${entityDocument.EntityID}`);
    }

    await detector.SetupProviders(entityDocument);

    let pinnedModelId: string | undefined;
    if (options.DecisionModelName) {
        pinnedModelId = resolvePinnedModelId(options.DecisionModelName);
        console.log(`Pinned decision model: ${options.DecisionModelName} (ID: ${pinnedModelId})`);
    }

    const decisionProvider = new MeasuringDecisionReasoningProvider({
        promptName: options.DecisionPromptName,
        modelId: pinnedModelId,
        uncertainAbove: DecisionReasoningProvider.DEFAULT_UNCERTAIN_ABOVE,
    });
    const promptProvider = new PromptReasoningProvider();

    return {
        detector,
        entityDocument,
        entityInfo,
        decisionProvider,
        promptProvider,
        configuredThreshold,
        bootstrapCtx,
    };
}

/** The entry check's steps before its decision call, as production runs them. */
interface PreparedCheck {
    Unsaved: BaseEntity;
    /** The top-K candidates the context user can read. */
    Candidates: PotentialDuplicate[];
    /** Null when there are no readable candidates, or no model arm runs. */
    ReasoningInput: DuplicateReasoningInput | null;
    /** The vector query alone. */
    RetrievalLatencyMs: number;
    /** From building the unsaved record through loading the candidates for the reasoning input. */
    PreparationLatencyMs: number;
}

/** One model arm's call for a check. */
interface ArmCall<TReading> {
    Reading: TReading;
    LatencyMs: number;
    PromptRunId: string | null;
}

async function prepareCheck(env: MeasurementEnv, record: CorpusRecord, options: MeasurementCliOptions): Promise<PreparedCheck> {
    const { detector, entityInfo, entityDocument, bootstrapCtx } = env;
    const start = performance.now();
    const unsaved = await detector.BuildRecord(entityInfo, record.Values, bootstrapCtx.user);

    // Retrieve TopK with threshold 0 so all arms evaluate the exact same candidates
    const retrievalStart = performance.now();
    const query = await detector.QueryCandidates(
        unsaved,
        entityDocument,
        { TopK: options.TopK, PotentialMatchThreshold: 0 },
        bootstrapCtx.user
    );
    const retrievalLatencyMs = performance.now() - retrievalStart;

    const allCandidates = query?.Duplicates?.Duplicates ?? [];
    const displayNames = await detector.ReadableCandidateNames(allCandidates, entityInfo, bootstrapCtx.user);
    const readable = allCandidates.filter(c => displayNames.has(NormalizeUUID(c.ToCompactURLSegment())));

    let reasoningInput: DuplicateReasoningInput | null = null;
    if (readable.length > 0 && query && (options.Arms.includes('decision') || options.Arms.includes('prompt'))) {
        const readableQuery: CandidateQuery = {
            ...query,
            Duplicates: { ...query.Duplicates, Duplicates: readable },
        };
        reasoningInput = await detector.ReasoningInput(readableQuery, entityInfo, entityDocument, bootstrapCtx.user, unsaved);
    }

    return {
        Unsaved: unsaved,
        Candidates: readable,
        ReasoningInput: reasoningInput,
        RetrievalLatencyMs: retrievalLatencyMs,
        PreparationLatencyMs: performance.now() - start,
    };
}

async function runDecisionArm(
    env: MeasurementEnv,
    input: DuplicateReasoningInput,
    recordTexts: readonly string[]
): Promise<ArmCall<DecisionArmReading>> {
    const start = performance.now();
    const decision = await env.decisionProvider.DecideCandidates(input, {
        Provider: env.bootstrapCtx.provider,
        ContextUser: env.bootstrapCtx.user,
    });
    return {
        Reading: ReadDecisionArm(decision, env.decisionProvider, recordTexts),
        LatencyMs: performance.now() - start,
        PromptRunId: decision.AIPromptRunID ?? null,
    };
}

async function runPromptArm(
    env: MeasurementEnv,
    input: DuplicateReasoningInput,
    recordTexts: readonly string[]
): Promise<ArmCall<PromptArmReading>> {
    const start = performance.now();
    const output = await env.promptProvider.Reason(input, {
        Provider: env.bootstrapCtx.provider,
        ContextUser: env.bootstrapCtx.user,
    });
    return {
        Reading: ReadPromptArm(output, input.Candidates.map(c => c.RecordID), recordTexts),
        LatencyMs: performance.now() - start,
        PromptRunId: output.AIPromptRunID ?? null,
    };
}

function buildCandidatePairs(
    env: MeasurementEnv,
    record: CorpusRecord,
    label: DuplicateCorpusLabel | NewCorpusLabel,
    candidates: readonly PotentialDuplicate[],
    decision: ArmCall<DecisionArmReading> | null,
    prompt: ArmCall<PromptArmReading> | null
): CandidatePairObservation[] {
    return candidates.map(cand => {
        const candId = cand.ToCompactURLSegment();
        const key = NormalizeUUID(candId);
        const passedThreshold = cand.ProbabilityScore >= env.configuredThreshold;
        const pRec = prompt?.Reading.Recommendations.get(key) ?? null;
        return {
            RecordId: record.Id,
            CandidateId: candId,
            IsDuplicatePair: label.Label === 'duplicate' && NormalizeUUID(candId) === NormalizeUUID(label.SourceRecordId),
            VectorScore: cand.ProbabilityScore,
            InTopK: true,
            PassedThreshold: passedThreshold,
            ThresholdFlagged: passedThreshold,
            DecisionProbability: decision?.Reading.Probabilities.get(key) ?? null,
            // Production's flag: a failed decision leaves the map empty, so it flags nothing.
            DecisionFlagged: decision?.Reading.Flagged.get(key) ?? false,
            PromptRecommendation: pRec,
            // Prompt arm flag rule: Merge OR Uncertain counts as flagged; only NotDuplicate does not
            PromptFlagged: pRec === 'Merge' || pRec === 'Uncertain',
        };
    });
}

function warnOnFailure(arm: string, record: CorpusRecord, rep: number, reading: { Success: boolean; ErrorMessage?: string }): void {
    if (!reading.Success) {
        console.warn(`  ${arm} call failed for record ${record.Id} (rep ${rep}): ${reading.ErrorMessage ?? 'unknown error'}`);
    }
}

async function executeSingleEntryCheck(
    env: MeasurementEnv,
    record: CorpusRecord,
    label: DuplicateCorpusLabel | NewCorpusLabel,
    options: MeasurementCliOptions,
    rep: number
): Promise<RecordCheckObservation> {
    const prepared = await prepareCheck(env, record, options);
    const input = prepared.ReasoningInput;
    const recordTexts = RecordTextsOf(record.Values, input);

    // The decision sees the input bounded as the entry check bounds it; the prompt arm, like batch
    // Prompt mode, sees it whole.
    const decision = options.Arms.includes('decision') && input
        ? await runDecisionArm(env, env.detector.EntryDecisionInput(input), recordTexts)
        : null;
    const prompt = options.Arms.includes('prompt') && input ? await runPromptArm(env, input, recordTexts) : null;
    if (decision) {
        warnOnFailure('Decision', record, rep, decision.Reading);
    }
    if (prompt) {
        warnOnFailure('Prompt', record, rep, prompt.Reading);
    }

    return {
        RecordId: record.Id,
        Rep: rep,
        Label: label,
        RetrievalLatencyMs: prepared.RetrievalLatencyMs,
        PreparationLatencyMs: prepared.PreparationLatencyMs,
        Candidates: buildCandidatePairs(env, record, label, prepared.Candidates, decision, prompt),
        DecisionResult: decision
            ? {
                  LatencyMs: decision.LatencyMs,
                  Model: 'Pending',
                  PromptRunId: decision.PromptRunId,
                  CostUSD: null,
                  Success: decision.Reading.Success,
                  ErrorMessage: decision.Reading.ErrorMessage,
                  MissingAnswers: decision.Reading.MissingAnswers,
                  UncalibratedModel: decision.Reading.UncalibratedModel,
              }
            : undefined,
        PromptResult: prompt
            ? {
                  LatencyMs: prompt.LatencyMs,
                  PromptRunId: prompt.PromptRunId,
                  CostUSD: null,
                  Success: prompt.Reading.Success,
                  ErrorMessage: prompt.Reading.ErrorMessage,
                  MissingAnswers: prompt.Reading.MissingAnswers,
              }
            : undefined,
    };
}

async function backfillPromptRunCosts(
    observations: RecordCheckObservation[],
    user: UserInfo,
    timeoutMs: number = 60000
): Promise<void> {
    const runIds = new Set<string>();
    for (const obs of observations) {
        if (obs.DecisionResult?.PromptRunId) {
            runIds.add(NormalizeUUID(obs.DecisionResult.PromptRunId));
        }
        if (obs.PromptResult?.PromptRunId) {
            runIds.add(NormalizeUUID(obs.PromptResult.PromptRunId));
        }
    }

    if (runIds.size === 0) {
        return;
    }

    console.log(`Polling prompt run costs for ${runIds.size} run(s) (timeout: ${timeoutMs / 1000}s)...`);
    const results = new Map<string, AIPromptRunCostRow>();
    const pendingIds = new Set(runIds);
    const startTime = Date.now();

    while (pendingIds.size > 0 && Date.now() - startTime < timeoutMs) {
        const batchIds = Array.from(pendingIds);
        const chunkSize = 50;
        for (let i = 0; i < batchIds.length; i += chunkSize) {
            const chunk = batchIds.slice(i, i + chunkSize);
            const inFilter = chunk.map(id => `'${id}'`).join(',');
            const runView = new RunView();
            const res = await runView.RunView<AIPromptRunCostRow>(
                {
                    EntityName: 'MJ: AI Prompt Runs',
                    ExtraFilter: `ID IN (${inFilter})`,
                    Fields: ['ID', 'TotalCost', 'Cost', 'Model'],
                    ResultType: 'simple',
                    BypassCache: true,
                    IgnoreMaxRows: true,
                },
                user
            );

            if (res.Success && res.Results) {
                for (const row of res.Results) {
                    const normId = NormalizeUUID(row.ID);
                    const cost = row.TotalCost ?? row.Cost;
                    if (cost !== null && cost !== undefined) {
                        results.set(normId, row);
                        pendingIds.delete(normId);
                    } else if (!results.has(normId)) {
                        results.set(normId, row);
                    }
                }
            }
        }

        if (pendingIds.size > 0) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    if (pendingIds.size > 0) {
        console.warn(
            `Warning: ${pendingIds.size} AI Prompt Run(s) never recorded a cost within ${timeoutMs / 1000}s.`,
            Array.from(pendingIds)
        );
    }

    // Backfill into observations
    for (const obs of observations) {
        if (obs.DecisionResult?.PromptRunId) {
            const row = results.get(NormalizeUUID(obs.DecisionResult.PromptRunId));
            if (row) {
                obs.DecisionResult.CostUSD = row.TotalCost ?? row.Cost ?? null;
                obs.DecisionResult.Model = row.Model ?? 'Unknown';
                for (const cand of obs.Candidates) {
                    cand.DecisionModel = obs.DecisionResult.Model;
                }
            }
        }
        if (obs.PromptResult?.PromptRunId) {
            const row = results.get(NormalizeUUID(obs.PromptResult.PromptRunId));
            if (row) {
                obs.PromptResult.CostUSD = row.TotalCost ?? row.Cost ?? null;
            }
        }
    }
}

function writeFinalChecksJsonl(outDir: string, observations: readonly RecordCheckObservation[]): void {
    const checksJsonlPath = resolve(outDir, 'checks.jsonl');
    const content = observations.map(obs => JSON.stringify(obs)).join('\n') + '\n';
    writeFileSync(checksJsonlPath, content, 'utf8');
}

/** The report's arms: those that ran, each model arm with its production view. */
function reportArms(arms: readonly string[]): string[] {
    const reported: string[] = [];
    if (arms.includes('threshold')) {
        reported.push('threshold');
    }
    if (arms.includes('decision')) {
        reported.push('decision', 'decision · production');
    }
    if (arms.includes('prompt')) {
        reported.push('prompt', 'prompt · production');
    }
    return reported;
}

function generateAndWriteReports(
    options: MeasurementCliOptions,
    observations: readonly RecordCheckObservation[],
    corpusRecords: readonly CorpusRecord[],
    labelMap: Map<string, DuplicateCorpusLabel | NewCorpusLabel>
): void {
    console.log('Computing metrics and generating reports...');
    const reportOptions: ReportOptions = {
        EntityName: options.Entity,
        CorpusPath: options.CorpusDir,
        DuplicatesCount: corpusRecords.filter(r => labelMap.get(r.Id)?.Label === 'duplicate').length,
        NewCount: corpusRecords.filter(r => labelMap.get(r.Id)?.Label === 'new').length,
        Reps: options.Reps,
        TopK: options.TopK,
        DecisionPrompt: options.DecisionPromptName,
        Arms: reportArms(options.Arms),
    };
    const report = BuildMeasurementReport(observations, reportOptions);

    WriteReportFiles(options.OutDir, report, corpusRecords);
    console.log(`✔ Measurement complete. Results written to:`);
    console.log(`  - ${resolve(options.OutDir, 'checks.jsonl')}`);
    console.log(`  - ${resolve(options.OutDir, 'report.md')}`);
    console.log(`  - ${resolve(options.OutDir, 'report.json')}`);
}

async function main(): Promise<void> {
    const options = ParseCliArgs(process.argv.slice(2));
    AssertOutputOutsideRepo(options.OutDir);

    let corpusRecords: CorpusRecord[] = [];
    let corpusLabels: (DuplicateCorpusLabel | NewCorpusLabel)[] = [];

    if (existsSync(resolve(options.CorpusDir, 'corpus.jsonl'))) {
        const corpus = ReadCorpusFiles(options.CorpusDir);
        corpusRecords = corpus.Records;
        corpusLabels = corpus.Labels;
    } else if (!options.DryRun) {
        throw new Error(`Corpus file not found at ${resolve(options.CorpusDir, 'corpus.jsonl')}`);
    }

    if (options.DryRun) {
        console.log('=== Duplicate Check Measurement Plan (Dry Run) ===');
        console.log(`Target Entity:     ${options.Entity}`);
        console.log(`Corpus Directory:  ${options.CorpusDir}`);
        console.log(`Corpus Records:    ${corpusRecords.length > 0 ? corpusRecords.length : '(Corpus not yet loaded)'}`);
        console.log(`Output Directory:  ${options.OutDir}`);
        console.log(`Evaluated Arms:    ${options.Arms.join(', ')}`);
        console.log(`Reps:              ${options.Reps}`);
        console.log(`Top-K:             ${options.TopK}`);
        console.log(`Decision Prompt:   ${options.DecisionPromptName}`);
        console.log(`Decision Model:    ${options.DecisionModelName ?? '(Prompt default)'}`);
        console.log('');
        console.log(`Planned Checks:    ${corpusRecords.length * options.Reps} total entry checks.`);
        console.log('Dry run complete. No database queries or model calls were executed.');
        return;
    }

    const env = await setupMeasurementEnvironment(options);
    const labelMap = new Map<string, DuplicateCorpusLabel | NewCorpusLabel>();
    for (const label of corpusLabels) {
        labelMap.set(label.Id, label);
    }

    mkdirSync(options.OutDir, { recursive: true });
    const checksJsonlPath = resolve(options.OutDir, 'checks.jsonl');
    // Start the log empty by truncating it: no exists-check first, so nothing can change between a check and the writes.
    writeFileSync(checksJsonlPath, '', 'utf8');

    const observations: RecordCheckObservation[] = [];
    console.log(`Starting measurement run: ${corpusRecords.length} records × ${options.Reps} reps...`);

    for (let rep = 1; rep <= options.Reps; rep++) {
        console.log(`--- Running Repetition ${rep} / ${options.Reps} ---`);
        for (let i = 0; i < corpusRecords.length; i++) {
            const record = corpusRecords[i];
            const label = labelMap.get(record.Id);
            if (!label) {
                throw new Error(`Missing label for corpus record ${record.Id}`);
            }

            const observation = await executeSingleEntryCheck(env, record, label, options, rep);
            observations.push(observation);
            appendFileSync(checksJsonlPath, JSON.stringify(observation) + '\n', 'utf8');

            if ((i + 1) % 20 === 0 || i + 1 === corpusRecords.length) {
                console.log(`  Processed ${i + 1} / ${corpusRecords.length} records (Rep ${rep})`);
            }
        }
    }

    // Backfill prompt run costs and model names after fire-and-forget DB writes land
    await backfillPromptRunCosts(observations, env.bootstrapCtx.user);
    writeFinalChecksJsonl(options.OutDir, observations);

    generateAndWriteReports(options, observations, corpusRecords, labelMap);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
});
