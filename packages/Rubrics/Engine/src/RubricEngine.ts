import { SnapshotFromRows, type RubricAnswer, type RubricNodeSnapshot, type RubricScoreResult, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import type { EvaluationAgentRunner } from './AgentRubricEvaluator.js';
import { ShapeContent, type RubricSubjectContent } from './content.js';
import { HumanRubricEvaluator, type EvaluationDraftStore, type RubricTaskStore } from './HumanRubricEvaluator.js';
import { RubricEvaluator, type BaseRubricEvaluator } from './RubricEvaluator.js';
import { CreateRubricEvaluator, ResolveRubricEvaluatorSelection } from './evaluatorRegistry.js';
import type {
    RubricEvaluatorRun, RubricEvaluatorServices, RubricEvaluatorSettings, RubricEvaluatorType, RubricJsonValue, RubricPromptMode,
} from './evaluatorServices.js';
import { GetAgreement, GetConsensus, GetDiagnostics, type AgreementResult, type ConsensusResult, type DiagnosticFlag } from './statistics.js';

export interface RubricEvaluationRecord {
    id: string;
    status: 'Draft' | 'Submitted' | 'Failed';
    errorMessage?: string | null;
}

/**
 * Persistence the engine needs. Tests pass fakes. Production wraps the entity server.
 * submit must call the entity server's submit, which calls RubricScoring.
 */
export interface RubricEvaluationStore {
    createDraft(input: {
        versionId: string;
        rubricId: string;
        subjectEntityId: string;
        subjectRecordId: string;
        contextEntityId?: string | null;
        contextRecordId?: string | null;
        passThreshold?: number | null;
        /** The evaluator's EvaluatorType, stored as RubricEvaluation.EvaluatorType. */
        evaluatorType: RubricEvaluatorType;
        /** The agent run that produced the evaluation. */
        aiAgentRunId?: string | null;
        /** The prompt run that produced the evaluation. */
        aiPromptRunId?: string | null;
        evaluatorName?: string | null;
        metadata?: unknown;
    }): Promise<RubricEvaluationRecord>;
    submit(evaluationId: string, answers: RubricAnswer[]): Promise<RubricScoreResult>;
    fail(evaluationId: string, errorMessage: string): Promise<RubricEvaluationRecord>;
}

/** Rows the engine reads, and the one write that creates a Draft version. Tests pass a fake. */
export interface RubricRecords {
    rows(entityName: string, filter: string): Promise<Record<string, unknown>[]>;
    createDraft(input: { rubricId?: string; rubricName?: string; nodes: RubricNodeSnapshot[] }): Promise<{ id: string; status: string }>;
}

export interface EvaluateParams {
    version: RubricVersionSnapshot;
    subject: { entityName: string; recordId: string; entityId: string };
    content?: RubricSubjectContent;
    /** Used when content is omitted. Loads the subject record so the engine can shape it. */
    loadRecord?: (entityName: string, recordId: string) => Promise<Record<string, unknown>>;
    canRead?: (fieldName: string) => boolean;
    /** Optional context record. Stored with the evaluation when both halves are set. */
    context?: { entityName?: string; entityId: string; recordId: string };
    /** Stored on the draft as PassThresholdApplied. Null uses the version threshold. */
    passThreshold?: number | null;
    /** A registered evaluator name or alias: LLM, Decision, Agent, Deterministic, or a custom one. */
    evaluator: string;
    /** What the evaluator reads: prompt, model, mode, samples, agent, and custom extensions. */
    settings?: RubricEvaluatorSettings;
    /** Replaces the engine's services for this call, one by one. */
    services?: RubricEvaluatorServices;
}

export interface EvaluateRecordInput {
    rubricId?: string;
    rubricName?: string;
    subjectEntityName: string;
    subjectRecordId: string;
    contextEntityName?: string;
    contextRecordId?: string;
    /**
     * An evaluator selection in the `AIAgentRubric.EvaluatorConfig` shape, parsed or as JSON text.
     * See {@link ResolveRubricEvaluatorSelection}. `evaluator` and `settings` override what it names.
     */
    evaluatorConfig?: unknown;
    /** A registered evaluator name or alias. LLM when neither this nor evaluatorConfig names one. */
    evaluator?: string;
    /** Merged over the settings evaluatorConfig resolves to. */
    settings?: RubricEvaluatorSettings;
    /** SinglePass when omitted. Shorthand for settings.Mode. */
    promptMode?: RubricPromptMode;
    /** Used by the Agent evaluator in place of the engine's agent runner. */
    agent?: EvaluationAgentRunner;
    passThreshold?: number | null;
    /** When set, this version is used instead of the latest Published version. */
    versionId?: string;
    /**
     * Subject text already in memory. When set, EvaluateRecord does not load the
     * stored row. Self-check uses this because FinalPayload is written later.
     */
    content?: RubricSubjectContent;
}

export interface EvaluateRecordResult {
    evaluationId: string;
    score: number | null;
    outcome: RubricScoreResult['outcome'] | null;
    criteria: { key: string; normalizedScore: number | null; rationale?: string }[];
    /** Score mapped onto the version's display range. Null when the normalized score is null. */
    displayScore: number | null;
}

/**
 * Resolves a version the caller already loaded, runs an evaluator, saves a
 * Draft, and submits it through the evaluation store. A throw from the
 * evaluator becomes a Failed evaluation with ErrorMessage. It does not score
 * on its own: AI and deterministic evaluators call RubricScoring.
 */
const emptyRecords: RubricRecords = {
    async rows() { return []; },
    async createDraft() { throw new Error('This engine has no rubric catalog.'); },
};

const unsetEvaluations: RubricEvaluationStore = {
    async createDraft() { throw new Error('RubricEngine has no evaluation store.'); },
    async submit() { throw new Error('RubricEngine has no evaluation store.'); },
    async fail() { throw new Error('RubricEngine has no evaluation store.'); },
};

export class RubricEngine {
    private static singleton: RubricEngine | undefined;

    /** The process-wide engine. Constructing another engine does not rebind this one. */
    public static get Instance(): RubricEngine {
        if (!RubricEngine.singleton) RubricEngine.singleton = new RubricEngine();
        return RubricEngine.singleton;
    }

    /**
     * @param services What the engine lends every evaluator: the prompt and decision services and
     * the agent runner. A call can replace any of them through {@link EvaluateParams.services}.
     */
    public constructor(
        private evaluations: RubricEvaluationStore = unsetEvaluations,
        private records: RubricRecords = emptyRecords,
        private services: RubricEvaluatorServices = {},
    ) {}

    /**
     * Creates the named evaluator, runs it, saves the draft, and submits it. A throw from the
     * evaluator becomes a Failed evaluation carrying the message. An unregistered name, or an
     * evaluator a person completes such as Human, throws before anything is saved.
     */
    public async Evaluate(params: EvaluateParams): Promise<{ evaluation: RubricEvaluationRecord; output?: RubricEvaluatorRun }> {
        const evaluator = CreateRubricEvaluator(params.evaluator);
        if (!evaluator.IsAutomated) {
            throw new Error(`The ${evaluator.EvaluatorName} evaluator is completed by a person, not run by the engine.`);
        }
        let draft: RubricEvaluationRecord | null = null;
        try {
            const content = params.content ?? await this.resolveContent(params);
            const output = await evaluator.EvaluateRubric({
                Version: params.version,
                Content: content,
                Subject: { entityName: params.subject.entityName, recordId: params.subject.recordId },
                Settings: params.settings ?? {},
                Services: { ...this.services, ...definedServices(params.services) },
            });
            draft = await this.evaluations.createDraft(this.draftInput(params, evaluator, output));
            const result = await this.evaluations.submit(draft.id, output.answers);
            return { evaluation: { ...draft, status: 'Submitted' }, output: { ...output, result } };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const failed = draft
                ? await this.evaluations.fail(draft.id, message)
                : await this.evaluations.createDraft(this.draftInput(params, evaluator)).then(created => this.evaluations.fail(created.id, message));
            return { evaluation: { ...failed, status: 'Failed', errorMessage: message } };
        }
    }

    /**
     * Creates a Draft and a task for the assignee. Does not score.
     * The human fills the draft in and submits it later.
     */
    public async StartHumanEvaluation(input: {
        versionId: string;
        rubricId: string;
        rubricName: string;
        subjectEntityId: string;
        subjectRecordId: string;
        assigneeId: string;
        drafts: EvaluationDraftStore;
        tasks: RubricTaskStore;
    }): Promise<{ evaluationId: string; taskId: string }> {
        return new HumanRubricEvaluator(input.drafts, input.tasks).Start({
            versionId: input.versionId,
            rubricId: input.rubricId,
            rubricName: input.rubricName,
            subjectEntityId: input.subjectEntityId,
            subjectRecordId: input.subjectRecordId,
            assigneeId: input.assigneeId,
        });
    }

    private async resolveContent(params: EvaluateParams): Promise<RubricSubjectContent> {
        if (!params.loadRecord) return { text: '' };
        const record = await params.loadRecord(params.subject.entityName, params.subject.recordId);
        if (!record || Object.keys(record).length === 0) throw new Error('subject not found or not readable');
        const content = ShapeContent(params.subject.entityName, record, params.canRead);
        const data = content.data ?? {};
        const readable = Object.entries(data).filter(([, value]) => value !== undefined);
        if (!content.text && readable.length === 0 && (!content.files || content.files.length === 0)) {
            throw new Error('subject not found or not readable');
        }
        return content;
    }

    /**
     * Resolves the rubric name or id to its latest Published version, then calls
     * {@link evaluate}. This is not the Get Rubric action.
     */
    public async EvaluateRecord(input: EvaluateRecordInput): Promise<EvaluateRecordResult> {
        const choice = ResolveRubricEvaluatorSelection(input.evaluatorConfig);
        const evaluator = input.evaluator ?? choice.Name;
        const settings: RubricEvaluatorSettings = {
            ...choice.Settings,
            ...(input.promptMode ? { Mode: input.promptMode } : {}),
            ...(input.settings ?? {}),
        };
        const version = input.versionId
            ? await this.GetRubric({ versionId: input.versionId })
            : await this.latestPublished(input);
        if (!version) throw new Error(input.versionId ? 'That rubric version was not found.' : 'No published version of that rubric.');
        const scored = input.passThreshold === undefined || input.passThreshold === null
            ? version
            : { ...version, passThreshold: input.passThreshold };
        const subjectEntityId = await this.entityId(input.subjectEntityName);
        const context = input.contextEntityName && input.contextRecordId
            ? { entityId: await this.entityId(input.contextEntityName), recordId: input.contextRecordId, entityName: input.contextEntityName }
            : undefined;
        const done = await this.Evaluate({
            version: scored,
            subject: { entityName: input.subjectEntityName, recordId: input.subjectRecordId, entityId: subjectEntityId },
            context,
            passThreshold: input.passThreshold ?? null,
            evaluator,
            settings,
            services: input.agent ? { Agent: input.agent } : undefined,
            content: input.content,
            loadRecord: input.content ? undefined : async (entityName, recordId) => {
                const rows = await this.records.rows(entityName, `ID=${sqlLiteral(recordId)}`);
                if (!rows[0]) throw new Error('subject not found or not readable');
                return rows[0];
            },
        });
        if (done.evaluation.status === 'Failed') {
            throw new Error(done.evaluation.errorMessage || 'The evaluation failed.');
        }
        const result = done.output?.result;
        const answers = done.output?.answers ?? [];
        return {
            evaluationId: done.evaluation.id,
            score: result?.normalizedScore ?? null,
            outcome: result?.outcome ?? null,
            criteria: (result?.nodes ?? []).map(node => {
                const rationale = answers.find(answer => answer.criterionId === node.id)?.rationale;
                return rationale
                    ? { key: node.key, normalizedScore: node.normalizedScore, rationale }
                    : { key: node.key, normalizedScore: node.normalizedScore };
            }),
            displayScore: result?.normalizedScore == null ? null : version.scoreDisplayMin + result.normalizedScore * (version.scoreDisplayMax - version.scoreDisplayMin),
        };
    }

        /**
     * The version tree for a name, id, or a specific version. Does not score.
     * A version id returns that version. Otherwise this is the latest Published version.
     */
    public async GetRubric(input: { rubricId?: string; rubricName?: string; versionId?: string }): Promise<RubricVersionSnapshot | null> {
        if (input.versionId) {
            const rows = await this.records.rows('MJ: Rubric Versions', `ID=${sqlLiteral(input.versionId)}`);
            const row = rows[0];
            return row ? this.snapshot(row) : null;
        }
        return this.latestPublished(input);
    }

        /**
     * Loads the subject's Submitted scores and returns the consensus.
     * The caller does not pass the scores.
     */
    public async ConsensusForSubject(input: {
        rubricId?: string;
        rubricName?: string;
        subjectEntityName?: string;
        subjectEntityId?: string;
        subjectRecordId: string;
        contextEntityName?: string;
        contextEntityId?: string;
        contextRecordId?: string;
        /** When omitted, the latest Published major. Scores from other majors are left out. */
        major?: number;
        method?: ConsensusResult['Method'];
    }): Promise<ConsensusResult> {
        const rubric = await this.rubricRow(input);
        const versions = await this.records.rows('MJ: Rubric Versions', `RubricID=${sqlLiteral(text(rubric.ID))}`);
        const major = input.major ?? latestPublishedMajor(versions);
        const ids = versions
            .filter(row => major !== null && numberOrNull(row.MajorVersion) === major)
            .map(row => text(row.ID))
            .filter(id => id.length > 0);
        if (ids.length === 0) return this.Consensus([], input.method);
        const subjectEntityId = input.subjectEntityId ?? await this.entityId(input.subjectEntityName ?? '');
        let filter = `Status='Submitted' AND EvaluatorType<>'Self' AND SubjectEntityID=${sqlLiteral(subjectEntityId)} AND SubjectRecordID=${sqlLiteral(input.subjectRecordId)} AND RubricVersionID IN (${ids.map(sqlLiteral).join(', ')})`;
        if (input.contextRecordId !== undefined) {
            const contextEntityId = input.contextEntityId ?? await this.entityId(input.contextEntityName ?? '');
            filter += ` AND ContextEntityID=${sqlLiteral(contextEntityId)} AND ContextRecordID=${sqlLiteral(input.contextRecordId)}`;
        } else {
            filter += ` AND ContextEntityID IS NULL AND ContextRecordID IS NULL`;
        }
        const scores = await this.records.rows('MJ: Rubric Evaluations', filter);
        const values = scores.map(row => numberOrNull(row.NormalizedScore)).filter((value): value is number => value !== null);
        return this.Consensus(values, input.method);
    }

        /**
     * Stores the payload as a Draft version. Throws when the stored status is
     * anything else. Publishing stays a human action.
     */
    public async CreateDraft(input: { rubricId?: string; rubricName?: string; nodes: RubricNodeSnapshot[] }): Promise<{ id: string; status: 'Draft' }> {
        const draft = await this.records.createDraft(input);
        if (draft.status !== 'Draft') throw new Error('Create Rubric Draft never publishes.');
        return { id: draft.id, status: 'Draft' };
    }

    /** Mean, median, or trimmed mean of normalized scores, with spread. */
    public Consensus(scores: number[], method?: ConsensusResult['Method'], trim?: number): ConsensusResult {
        return GetConsensus(scores, method, trim);
    }

        /** Kappa and alpha, withheld below the sample floor. */
    public Agreement(ratings: number[][], minimumSample?: number): AgreementResult {
        return GetAgreement(ratings, minimumSample);
    }

        /** Item-analysis flags for a published major version's criteria. */
    public Diagnostics(criteria: { key: string; scores: (number | null)[]; notApplicable: number }[]): DiagnosticFlag[] {
        return GetDiagnostics(criteria);
    }

    /**
     * The draft row. EvaluatorType and EvaluatorName come from the evaluator, and the prompt or agent
     * run is the one that produced the evaluation, never the subject. Metadata keeps the settings
     * and whatever the evaluator reported about its run.
     */
    private draftInput(params: EvaluateParams, evaluator: BaseRubricEvaluator, run?: RubricEvaluatorRun): Parameters<RubricEvaluationStore['createDraft']>[0] {
        const evaluatorMetadata: Record<string, RubricJsonValue> = {
            Name: evaluator.EvaluatorName,
            Settings: settingsJson(params.settings ?? {}),
            ...(run?.metadata ?? {}),
        };
        return {
            versionId: params.version.id,
            rubricId: params.version.rubricId,
            subjectEntityId: params.subject.entityId,
            subjectRecordId: params.subject.recordId,
            contextEntityId: params.context?.entityId ?? null,
            contextRecordId: params.context?.recordId ?? null,
            passThreshold: params.passThreshold ?? null,
            evaluatorType: evaluator.EvaluatorType,
            aiAgentRunId: run?.aiAgentRunId ?? null,
            aiPromptRunId: run?.aiPromptRunId ?? null,
            evaluatorName: evaluator.EvaluatorName,
            metadata: { Evaluator: evaluatorMetadata },
        };
    }

    /** Highest Major.Minor.Patch among Published versions. Not a call to Get Rubric. */
    private async latestPublished(input: { rubricId?: string; rubricName?: string }): Promise<RubricVersionSnapshot | null> {
        const rubric = await this.rubricRow(input);
        const versions = await this.records.rows('MJ: Rubric Versions', `RubricID=${sqlLiteral(text(rubric.ID))} AND Status='Published'`);
        const latest = [...versions].sort((a, b) => versionRank(b) - versionRank(a))[0];
        return latest ? this.snapshot(latest) : null;
    }

    private async rubricRow(input: { rubricId?: string; rubricName?: string }): Promise<Record<string, unknown>> {
        if (!input.rubricId && !input.rubricName) throw new Error('A rubric id or name is required.');
        const filter = input.rubricId ? `ID=${sqlLiteral(input.rubricId)}` : `Name=${sqlLiteral(input.rubricName ?? '')}`;
        const rows = await this.records.rows('MJ: Rubrics', filter);
        const row = rows[0];
        if (!row) throw new Error('That rubric was not found.');
        return row;
    }

    private async entityId(entityName: string): Promise<string> {
        const rows = await this.records.rows('MJ: Entities', `Name=${sqlLiteral(entityName)}`);
        const id = text(rows[0]?.ID);
        if (!id) throw new Error(`No entity named ${entityName}.`);
        return id;
    }

    private async snapshot(version: Record<string, unknown>): Promise<RubricVersionSnapshot> {
        const versionId = text(version.ID);
        const criteria = await this.records.rows('MJ: Rubric Criteria', `RubricVersionID=${sqlLiteral(versionId)}`);
        const bands = await this.records.rows('MJ: Rubric Bands', `RubricVersionID=${sqlLiteral(versionId)}`);
        const scaleIds = [...new Set(criteria.map(row => text(row.ScaleID)).filter(id => id.length > 0))];
        const scales = scaleIds.length === 0 ? [] : await this.records.rows('MJ: Rubric Scales', `ID IN (${scaleIds.map(sqlLiteral).join(', ')})`);
        const levels = scaleIds.length === 0 ? [] : await this.records.rows('MJ: Rubric Scale Levels', `ScaleID IN (${scaleIds.map(sqlLiteral).join(', ')})`);
        const criterionIds = criteria.map(row => text(row.ID)).filter(id => id.length > 0);
        const anchors = criterionIds.length === 0 ? [] : await this.records.rows('MJ: Rubric Criterion Levels', `CriterionID IN (${criterionIds.map(sqlLiteral).join(', ')}) ORDER BY Sequence, ID`);
        return SnapshotFromRows({ version, rubricId: text(version.RubricID), criteria, anchors, bands, scales, levels });
    }

    /**
     * The content an evaluator may read for one subject record. Read-only.
     * Does not score and does not publish.
     */
    public async SubjectContent(input: { subjectEntityName: string; subjectRecordId: string }): Promise<RubricSubjectContent> {
        const rows = await this.records.rows(input.subjectEntityName, `ID=${sqlLiteral(input.subjectRecordId)}`);
        if (!rows[0]) throw new Error('subject not found or not readable');
        const record = { ...rows[0] };
        if (input.subjectEntityName === 'MJ: AI Agent Runs') {
            record.Steps = await this.records.rows('MJ: AI Agent Run Steps', `AgentRunID=${sqlLiteral(input.subjectRecordId)} ORDER BY StepNumber`);
        }
        if (input.subjectEntityName === 'MJ: Conversations') {
            record.Details = await this.records.rows('MJ: Conversation Details', `ConversationID=${sqlLiteral(input.subjectRecordId)} ORDER BY __mj_CreatedAt`);
        }
        return ShapeContent(input.subjectEntityName, record);
    }

    }

/** The services a call supplied, without its undefined entries, so they never mask the engine's own. */
function definedServices(services: RubricEvaluatorServices | undefined): RubricEvaluatorServices {
    const defined: RubricEvaluatorServices = {};
    if (services?.Prompts) defined.Prompts = services.Prompts;
    if (services?.Decisions) defined.Decisions = services.Decisions;
    if (services?.Agent) defined.Agent = services.Agent;
    return defined;
}

/** The settings as stored JSON, without undefined fields. */
function settingsJson(settings: RubricEvaluatorSettings): Record<string, RubricJsonValue> {
    const stored: Record<string, RubricJsonValue> = {};
    for (const [key, value] of Object.entries(settings) as [string, RubricJsonValue | undefined][]) {
        if (value !== undefined) stored[key] = value;
    }
    return stored;
}

function latestPublishedMajor(versions: Record<string, unknown>[]): number | null {
    const majors = versions
        .filter(row => text(row.Status) === 'Published')
        .map(row => numberOrNull(row.MajorVersion))
        .filter((value): value is number => value !== null);
    return majors.length === 0 ? null : Math.max(...majors);
}

function versionRank(row: Record<string, unknown>): number {
    return (numberOrNull(row.MajorVersion) ?? 0) * 1_000_000 + (numberOrNull(row.MinorVersion) ?? 0) * 1_000 + (numberOrNull(row.PatchVersion) ?? 0);
}

function sqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function text(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
}

function textOrNull(value: unknown): string | null {
    const written = text(value);
    return written.length === 0 ? null : written;
}

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function bit(value: unknown): boolean {
    return value === true || value === 1 || value === '1';
}

export { RubricEvaluator };
