/**
 * @fileoverview CLI harness to measure duplicate record entry check across reasoning arms:
 *  1. Vector threshold arm
 *  2. Decision prompt arm (DecisionReasoningProvider)
 *  3. Decision · production arm (PassedThreshold && IsPlausible)
 *  4. Full prompt arm (PromptReasoningProvider)
 *  5. Prompt · production arm (PassedThreshold && (Merge || Uncertain))
 *
 * All arms evaluate the exact same candidates retrieved per check.
 *
 * USAGE:
 *   npx tsx rigs/dupe-check-measurement.ts --entity "MJ: Actions" --corpus <dir> --out <dir> \
 *     [--reps 1] [--top-k 5] [--arms threshold,decision,prompt] [--decision-prompt "<name>"] \
 *     [--decision-model "<name>"] [--dry-run]
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

import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
import { AIDecisionParams, AIDecisionRunner } from '@memberjunction/ai-prompts';
import {
    DecisionReasoningProvider,
    DuplicateDecisionResult,
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
    DuplicateCorpusLabel,
    NewCorpusLabel,
    ReadCorpusFiles,
    RecordCheckObservation,
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
        contextUser?: UserInfo
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
        entityInfo: EntityInfo
    ) {
        return this.LoadReadableCandidateNames(candidates, entityInfo);
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
 * and pinned decision models (disabling failover).
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

    public override async DecideCandidates(
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): Promise<DuplicateDecisionResult> {
        if (input.Candidates.length === 0) {
            return { Success: true, Candidates: [], AIPromptRunID: null };
        }
        try {
            await AIEngine.Instance.Config(false, context.ContextUser, context.Provider);
            const prompt = this.ResolveDecisionPrompt();
            if (!prompt) {
                return {
                    Success: false,
                    ErrorMessage: `Decision prompt "${this.customPromptName ?? DecisionReasoningProvider.DEFAULT_PROMPT_NAME}" not found`,
                    Candidates: [],
                    AIPromptRunID: null,
                };
            }
            const params = new AIDecisionParams();
            params.prompt = prompt;
            params.contextUser = context.ContextUser;
            params.State = this.BuildDecisionState(input);
            params.Questions = this.BuildQuestions(input);
            if (this.pinnedModelId) {
                params.override = { modelId: this.pinnedModelId };
            }
            const run = await new AIDecisionRunner().ExecuteDecision(params);
            const runID = run.promptRun?.ID ?? null;
            if (!run.success) {
                return {
                    Success: false,
                    ErrorMessage: run.errorMessage ?? 'Decision execution failed',
                    Candidates: [],
                    AIPromptRunID: runID,
                };
            }
            const candidates = input.Candidates.map((candidate, index) => {
                const answer = run.Answers[this.QuestionKey(index)];
                const prob = answer?.Kind === 'Likelihood' ? answer.Probability : null;
                return {
                    RecordID: candidate.RecordID,
                    Probability: prob,
                };
            });
            return { Success: true, Candidates: candidates, AIPromptRunID: runID };
        } catch (e) {
            return {
                Success: false,
                ErrorMessage: e instanceof Error ? e.message : String(e),
                Candidates: [],
                AIPromptRunID: null,
            };
        }
    }
}

export function ToPromptRecommendation(
    val: string | null | undefined
): 'Merge' | 'NotDuplicate' | 'Uncertain' | null {
    if (val === 'Merge' || val === 'NotDuplicate' || val === 'Uncertain') {
        return val;
    }
    return null;
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

    const metadata = new Metadata();
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

async function executeSingleEntryCheck(
    env: MeasurementEnv,
    record: CorpusRecord,
    label: DuplicateCorpusLabel | NewCorpusLabel,
    options: MeasurementCliOptions,
    rep: number
): Promise<RecordCheckObservation> {
    const { detector, entityInfo, entityDocument, configuredThreshold, bootstrapCtx, decisionProvider, promptProvider } = env;

    // 1. Unsaved record
    const unsaved = await detector.BuildRecord(entityInfo, record.Values, bootstrapCtx.user);

    // 2. Candidate retrieval (retrieve TopK with threshold 0 so all arms evaluate the exact same candidates)
    const retrievalStart = performance.now();
    const query = await detector.QueryCandidates(
        unsaved,
        entityDocument,
        { TopK: options.TopK, PotentialMatchThreshold: 0 },
        bootstrapCtx.user
    );
    const retrievalLatencyMs = performance.now() - retrievalStart;

    const allCandidates = query?.Duplicates?.Duplicates ?? [];
    const displayNames = await detector.ReadableCandidateNames(allCandidates, entityInfo);
    const readableCandidates = allCandidates.filter(c =>
        displayNames.has(NormalizeUUID(c.ToCompactURLSegment()))
    );

    // 3. Reasoning input
    let reasoningInput: DuplicateReasoningInput | null = null;
    if (
        readableCandidates.length > 0 &&
        query &&
        (options.Arms.includes('decision') || options.Arms.includes('prompt'))
    ) {
        const readableQuery: CandidateQuery = {
            ...query,
            Duplicates: {
                ...query.Duplicates,
                Duplicates: readableCandidates,
            },
        };
        reasoningInput = await detector.ReasoningInput(
            readableQuery,
            entityInfo,
            entityDocument,
            bootstrapCtx.user,
            unsaved
        );
    }

    // 4. Decision arm
    let decisionLatencyMs: number | null = null;
    let decisionPromptRunId: string | null = null;
    const decisionProbabilities = new Map<string, number | null>();

    if (options.Arms.includes('decision') && reasoningInput && readableCandidates.length > 0) {
        const dStart = performance.now();
        const decisionRes = await decisionProvider.DecideCandidates(reasoningInput, {
            Provider: bootstrapCtx.provider,
            ContextUser: bootstrapCtx.user,
        });
        decisionLatencyMs = performance.now() - dStart;
        decisionPromptRunId = decisionRes.AIPromptRunID ?? null;

        if (decisionRes.Success && decisionRes.Candidates) {
            for (const cand of decisionRes.Candidates) {
                decisionProbabilities.set(NormalizeUUID(cand.RecordID), cand.Probability);
            }
        }
    }

    // 5. Prompt arm
    let promptLatencyMs: number | null = null;
    let promptRunId: string | null = null;
    const promptRecommendations = new Map<string, string | null>();

    if (options.Arms.includes('prompt') && reasoningInput && readableCandidates.length > 0) {
        const pStart = performance.now();
        const promptRes = await promptProvider.Reason(reasoningInput, {
            Provider: bootstrapCtx.provider,
            ContextUser: bootstrapCtx.user,
        });
        promptLatencyMs = performance.now() - pStart;
        promptRunId = promptRes.AIPromptRunID ?? null;

        if (promptRes.Success && promptRes.CandidateVerdicts) {
            for (const cand of promptRes.CandidateVerdicts) {
                promptRecommendations.set(NormalizeUUID(cand.RecordID), cand.Recommendation);
            }
        }
    }

    // 6. Build candidate pair observations
    const candidatePairs: CandidatePairObservation[] = readableCandidates.map(cand => {
        const candId = cand.ToCompactURLSegment();
        const isDupePair =
            label.Label === 'duplicate' &&
            NormalizeUUID(candId) === NormalizeUUID(label.SourceRecordId);
        const vectorScore = cand.ProbabilityScore;
        const passedThreshold = vectorScore >= configuredThreshold;
        const thresholdFlagged = passedThreshold;

        const decProb = decisionProbabilities.get(NormalizeUUID(candId)) ?? null;
        const decisionFlagged = decProb !== null && decisionProvider.IsPlausible(decProb);

        const pRec = promptRecommendations.get(NormalizeUUID(candId)) ?? null;
        // Prompt arm flag rule: Merge OR Uncertain counts as flagged; only NotDuplicate does not
        const promptFlagged = pRec === 'Merge' || pRec === 'Uncertain';

        return {
            RecordId: record.Id,
            CandidateId: candId,
            IsDuplicatePair: isDupePair,
            VectorScore: vectorScore,
            InTopK: true,
            PassedThreshold: passedThreshold,
            ThresholdFlagged: thresholdFlagged,
            DecisionProbability: decProb,
            DecisionFlagged: decisionFlagged,
            PromptRecommendation: ToPromptRecommendation(pRec),
            PromptFlagged: promptFlagged,
        };
    });

    return {
        RecordId: record.Id,
        Rep: rep,
        Label: label,
        RetrievalLatencyMs: retrievalLatencyMs,
        Candidates: candidatePairs,
        DecisionResult:
            options.Arms.includes('decision') && decisionLatencyMs !== null
                ? {
                      LatencyMs: decisionLatencyMs,
                      Model: 'Pending',
                      PromptRunId: decisionPromptRunId,
                      CostUSD: null,
                  }
                : undefined,
        PromptResult:
            options.Arms.includes('prompt') && promptLatencyMs !== null
                ? {
                      LatencyMs: promptLatencyMs,
                      PromptRunId: promptRunId,
                      CostUSD: null,
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
        Arms: ['threshold', 'decision', 'decision · production', 'prompt', 'prompt · production'],
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
    if (existsSync(checksJsonlPath)) {
        rmSync(checksJsonlPath);
    }

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
