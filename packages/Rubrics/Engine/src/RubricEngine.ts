import type { RubricAnswer, RubricNodeSnapshot, RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { AgentRubricEvaluator, type EvaluationAgentRunner } from './AgentRubricEvaluator.js';
import { LLMRubricEvaluator, type RubricPromptMode, type RubricPromptRunner } from './LLMRubricEvaluator.js';
import { ShapeContent, type RubricSubjectContent } from './content.js';
import { DeterministicRubricEvaluator } from './DeterministicRubricEvaluator.js';
import { HumanRubricEvaluator, type EvaluationDraftStore, type RubricTaskStore } from './HumanRubricEvaluator.js';
import { RubricEvaluator, type RubricEvaluatorOutput } from './RubricEvaluator.js';
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
        evaluator?: EvaluateParams['evaluator'];
        aiAgentRunId?: string | null;
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
    createDraft(input: { rubricId: string; nodes: RubricNodeSnapshot[] }): Promise<{ id: string; status: string }>;
}

/** Runs a named prompt. The engine builds the Rubric Evaluator runner from this. */
export interface RubricPromptRun {
    Run(promptName: string, rendered: string): Promise<string>;
}

const RUBRIC_EVALUATOR_PROMPT = 'Rubric Evaluator';

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
    evaluator: 'AI' | 'Deterministic' | 'LLM';
    agent?: EvaluationAgentRunner;
    promptRunner?: RubricPromptRunner;
    promptMode?: RubricPromptMode;
}

export interface EvaluateRecordInput {
    rubricId?: string;
    rubricName?: string;
    subjectEntityName: string;
    subjectRecordId: string;
    contextEntityName?: string;
    contextRecordId?: string;
    evaluator?: EvaluateParams['evaluator'];
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

export class RubricEngine {
    public constructor(
        private readonly evaluations: RubricEvaluationStore,
        private readonly records: RubricRecords = emptyRecords,
        private readonly promptRun?: RubricPromptRun,
    ) {}

    /**
     * Runs the evaluator, saves the draft, and submits it. On failure the
     * returned record is Failed and carries the error message.
     */
    public async Evaluate(params: EvaluateParams): Promise<{ evaluation: RubricEvaluationRecord; output?: RubricEvaluatorOutput }> {
        let draft: RubricEvaluationRecord | null = null;
        try {
            const content = params.content ?? await this.resolveContent(params);
            const output = await this.runEvaluator(params, content);
            draft = await this.evaluations.createDraft(this.draftInput(params));
            const result = await this.evaluations.submit(draft.id, output.answers);
            return { evaluation: { ...draft, status: 'Submitted' }, output: { ...output, result } };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const failed = draft
                ? await this.evaluations.fail(draft.id, message)
                : await this.evaluations.createDraft(this.draftInput(params)).then(created => this.evaluations.fail(created.id, message));
            return { evaluation: { ...failed, status: 'Failed', errorMessage: message } };
        }
    }

    /** @deprecated Use {@link Evaluate}. */
    public async evaluate(params: EvaluateParams): Promise<{ evaluation: RubricEvaluationRecord; output?: RubricEvaluatorOutput }> {
        return this.Evaluate(params);
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
        return new HumanRubricEvaluator(input.drafts, input.tasks).start({
            versionId: input.versionId,
            rubricId: input.rubricId,
            rubricName: input.rubricName,
            subjectEntityId: input.subjectEntityId,
            subjectRecordId: input.subjectRecordId,
            assigneeId: input.assigneeId,
        });
    }

    /** @deprecated Use {@link StartHumanEvaluation}. */
    public async startHumanEvaluation(input: {
        versionId: string;
        rubricId: string;
        rubricName: string;
        subjectEntityId: string;
        subjectRecordId: string;
        assigneeId: string;
        drafts: EvaluationDraftStore;
        tasks: RubricTaskStore;
    }): Promise<{ evaluationId: string; taskId: string }> {
        return this.StartHumanEvaluation(input);
    }

    private async runEvaluator(params: EvaluateParams, content: RubricSubjectContent): Promise<RubricEvaluatorOutput> {
        const subject = { entityName: params.subject.entityName, recordId: params.subject.recordId };
        if (params.evaluator === 'AI') {
            if (!params.agent) throw new Error('An AI evaluation requires an agent.');
            return new AgentRubricEvaluator(params.agent).evaluateContent(params.version, content, subject);
        }
        if (params.evaluator === 'LLM') {
            if (!params.promptRunner) throw new Error('An LLM evaluation requires a prompt runner.');
            return new LLMRubricEvaluator(params.promptRunner, params.promptMode ?? 'SinglePass').evaluateContent(params.version, content);
        }
        return new DeterministicRubricEvaluator().evaluateData(params.version, content);
    }

    private async resolveContent(params: EvaluateParams): Promise<RubricSubjectContent> {
        if (!params.loadRecord) return { text: '' };
        const record = await params.loadRecord(params.subject.entityName, params.subject.recordId);
        return ShapeContent(params.subject.entityName, record, params.canRead);
    }

    /**
     * Resolves the rubric name or id to its latest Published version, then calls
     * {@link evaluate}. This is not the Get Rubric action.
     */
    public async EvaluateRecord(input: EvaluateRecordInput): Promise<EvaluateRecordResult> {
        if (input.evaluator === 'AI') throw new Error('Evaluator AI is not accepted.');
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
            evaluator: input.evaluator ?? 'Deterministic',
            promptRunner: input.evaluator === 'LLM' ? this.rubricEvaluatorRunner() : undefined,
            content: input.content,
            loadRecord: input.content ? undefined : async (entityName, recordId) => {
                const rows = await this.records.rows(entityName, `ID=${sqlLiteral(recordId)}`);
                return rows[0] ?? {};
            },
        });
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

    /** @deprecated Use {@link EvaluateRecord}. */
    public async evaluateRecord(input: EvaluateRecordInput): Promise<EvaluateRecordResult> {
        return this.EvaluateRecord(input);
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

    /** @deprecated Use {@link GetRubric}. */
    public async getRubric(input: { rubricId?: string; rubricName?: string; versionId?: string }): Promise<RubricVersionSnapshot | null> {
        return this.GetRubric(input);
    }

    /**
     * Loads the subject's Submitted scores and returns the consensus.
     * The caller does not pass the scores.
     */
    public async ConsensusForSubject(input: {
        rubricId?: string;
        rubricName?: string;
        subjectRecordId: string;
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
        let filter = `Status='Submitted' AND SubjectRecordID=${sqlLiteral(input.subjectRecordId)} AND RubricVersionID IN (${ids.map(sqlLiteral).join(', ')})`;
        if (input.contextRecordId !== undefined) filter += ` AND ContextRecordID=${sqlLiteral(input.contextRecordId)}`;
        const scores = await this.records.rows('MJ: Rubric Evaluations', filter);
        const values = scores.map(row => numberOrNull(row.NormalizedScore)).filter((value): value is number => value !== null);
        return this.Consensus(values, input.method);
    }

    /** @deprecated Use {@link ConsensusForSubject}. */
    public async consensusForSubject(input: {
        rubricId?: string;
        rubricName?: string;
        subjectRecordId: string;
        contextRecordId?: string;
        /** When omitted, the latest Published major. Scores from other majors are left out. */
        major?: number;
        method?: ConsensusResult['Method'];
    }): Promise<ConsensusResult> {
        return this.ConsensusForSubject(input);
    }

    /**
     * Stores the payload as a Draft version. Throws when the stored status is
     * anything else. Publishing stays a human action.
     */
    public async CreateDraft(input: { rubricId: string; nodes: RubricNodeSnapshot[] }): Promise<{ id: string; status: 'Draft' }> {
        const draft = await this.records.createDraft(input);
        if (draft.status !== 'Draft') throw new Error('Create Rubric Draft never publishes.');
        return { id: draft.id, status: 'Draft' };
    }

    /** @deprecated Use {@link CreateDraft}. */
    public async createDraft(input: { rubricId: string; nodes: RubricNodeSnapshot[] }): Promise<{ id: string; status: 'Draft' }> {
        return this.CreateDraft(input);
    }

    /** Mean, median, or trimmed mean of normalized scores, with spread. */
    public Consensus(scores: number[], method?: ConsensusResult['Method'], trim?: number): ConsensusResult {
        return GetConsensus(scores, method, trim);
    }

    /** @deprecated Use {@link Consensus}. */
    public consensus(scores: number[], method?: ConsensusResult['Method'], trim?: number): ConsensusResult {
        return this.Consensus(scores, method, trim);
    }

    /** Kappa and alpha, withheld below the sample floor. */
    public Agreement(ratings: number[][], minimumSample?: number): AgreementResult {
        return GetAgreement(ratings, minimumSample);
    }

    /** @deprecated Use {@link Agreement}. */
    public agreement(ratings: number[][], minimumSample?: number): AgreementResult {
        return this.Agreement(ratings, minimumSample);
    }

    /** Item-analysis flags for a published major version's criteria. */
    public Diagnostics(criteria: { key: string; scores: (number | null)[]; notApplicable: number }[]): DiagnosticFlag[] {
        return GetDiagnostics(criteria);
    }

    /** @deprecated Use {@link Diagnostics}. */
    public diagnostics(criteria: { key: string; scores: (number | null)[]; notApplicable: number }[]): DiagnosticFlag[] {
        return this.Diagnostics(criteria);
    }

    /** The catalog does not pass a runner. This one executes the Rubric Evaluator prompt. */
    private rubricEvaluatorRunner(): RubricPromptRunner {
        const prompts = this.promptRun;
        return {
            run(rendered: string) {
                if (!prompts) throw new Error('The Rubric Evaluator prompt is not configured.');
                return prompts.Run(RUBRIC_EVALUATOR_PROMPT, rendered);
            },
        };
    }

    private draftInput(params: EvaluateParams) {
        return {
            versionId: params.version.id,
            rubricId: params.version.rubricId,
            subjectEntityId: params.subject.entityId,
            subjectRecordId: params.subject.recordId,
            contextEntityId: params.context?.entityId ?? null,
            contextRecordId: params.context?.recordId ?? null,
            passThreshold: params.passThreshold ?? null,
            evaluator: params.evaluator,
            aiAgentRunId: params.subject.entityName === 'MJ: AI Agent Runs' ? params.subject.recordId : null,
            aiPromptRunId: params.subject.entityName === 'MJ: AI Prompt Runs' ? params.subject.recordId : null,
            evaluatorName: params.evaluator ?? 'Deterministic',
            metadata: { Evaluator: { Name: params.evaluator ?? 'Deterministic' } },
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
        const anchors = criterionIds.length === 0 ? [] : await this.records.rows('MJ: Rubric Criterion Levels', `CriterionID IN (${criterionIds.map(sqlLiteral).join(', ')})`);
        return {
            id: versionId,
            rubricId: text(version.RubricID),
            majorVersion: numberOrNull(version.MajorVersion),
            minorVersion: numberOrNull(version.MinorVersion),
            patchVersion: numberOrNull(version.PatchVersion),
            instructions: textOrNull(version.Instructions),
            passThreshold: numberOrNull(version.PassThreshold),
            minimumCompleteness: numberOrNull(version.MinimumCompleteness),
            notApplicablePolicy: (text(version.NotApplicablePolicy) || 'ExcludeAndRedistribute') as RubricVersionSnapshot['notApplicablePolicy'],
            scoreDisplayMin: numberOrNull(version.ScoreDisplayMin) ?? 0,
            scoreDisplayMax: numberOrNull(version.ScoreDisplayMax) ?? 100,
            nodes: criteria.map(row => ({
                id: text(row.ID),
                key: text(row.Key),
                parentId: textOrNull(row.ParentID),
                name: text(row.Name),
                description: textOrNull(row.Description),
                guidance: textOrNull(row.Guidance),
                nodeType: (text(row.NodeType) || 'Criterion') as RubricNodeSnapshot['nodeType'],
                scaleId: textOrNull(row.ScaleID),
                weight: numberOrNull(row.Weight) ?? 1,
                isAdvisory: bit(row.IsAdvisory),
                isGate: bit(row.IsGate),
                gateMinimumScore: numberOrNull(row.GateMinimumScore),
                notApplicablePolicy: (textOrNull(row.NotApplicablePolicy) as RubricNodeSnapshot['notApplicablePolicy']) ?? null,
                rollupMethod: (textOrNull(row.RollupMethod) as RubricNodeSnapshot['rollupMethod']) ?? null,
                evidenceRequired: bit(row.EvidenceRequired),
                rationaleRequired: bit(row.RationaleRequired),
                sequence: numberOrNull(row.Sequence) ?? 0,
                evaluatorConfig: parseConfig(row.EvaluatorConfig),
                anchors: anchors.filter(anchor => text(anchor.CriterionID) === text(row.ID)).map(anchor => ({
                    scaleLevelId: textOrNull(anchor.ScaleLevelID),
                    anchorValue: numberOrNull(anchor.AnchorValue),
                    descriptor: text(anchor.Descriptor),
                })),
            })),
            scales: scales.map(row => ({
                id: text(row.ID),
                scaleType: (text(row.ScaleType) || 'Levels') as 'Levels' | 'Numeric',
                minValue: numberOrNull(row.MinValue),
                maxValue: numberOrNull(row.MaxValue),
                step: numberOrNull(row.Step),
                higherIsBetter: bit(row.HigherIsBetter),
                levels: levels.filter(level => text(level.ScaleID) === text(row.ID)).map(level => ({
                    id: text(level.ID),
                    label: text(level.Label),
                    value: numberOrNull(level.Value) ?? 0,
                    normalizedValue: numberOrNull(level.NormalizedValue) ?? 0,
                    description: textOrNull(level.Description),
                    sequence: numberOrNull(level.Sequence) ?? 0,
                })),
            })),
            bands: bands.map(row => ({
                id: text(row.ID),
                label: text(row.Label),
                description: textOrNull(row.Description),
                minScore: numberOrNull(row.MinScore) ?? 0,
                maxScore: numberOrNull(row.MaxScore) ?? 0,
                displayTone: text(row.DisplayTone) || 'Neutral',
                sequence: numberOrNull(row.Sequence) ?? 0,
            })),
        };
    }

    /**
     * The content an evaluator may read for one subject record. Read-only.
     * Does not score and does not publish.
     */
    public async SubjectContent(input: { subjectEntityName: string; subjectRecordId: string }): Promise<RubricSubjectContent> {
        const rows = await this.records.rows(input.subjectEntityName, `ID=${sqlLiteral(input.subjectRecordId)}`);
        return ShapeContent(input.subjectEntityName, rows[0] ?? {});
    }

    /** @deprecated Use {@link SubjectContent}. */
    public async subjectContent(input: { subjectEntityName: string; subjectRecordId: string }): Promise<RubricSubjectContent> {
        return this.SubjectContent(input);
    }
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

function parseConfig(value: unknown): unknown {
    if (typeof value !== 'string' || value.trim() === '') return value ?? undefined;
    try { return JSON.parse(value); } catch { return value; }
}

export { RubricEvaluator };
