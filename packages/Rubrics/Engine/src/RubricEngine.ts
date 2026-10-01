import type { RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import type { RubricAnswer } from '@memberjunction/rubrics-base';
import { AIRubricEvaluator, type RubricAgent } from './AIRubricEvaluator.js';
import { LLMRubricEvaluator, type RubricPromptMode, type RubricPromptRunner } from './LLMRubricEvaluator.js';
import { shapeContent, type RubricSubjectContent } from './content.js';
import { DeterministicRubricEvaluator } from './DeterministicRubricEvaluator.js';
import { HumanRubricEvaluator, type EvaluationDraftStore, type RubricTaskStore } from './HumanRubricEvaluator.js';
import { RubricEvaluator, type RubricEvaluatorOutput } from './RubricEvaluator.js';
import { getAgreement, getConsensus, getDiagnostics, type AgreementResult, type ConsensusResult, type DiagnosticFlag } from './statistics.js';

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
    createDraft(input: { versionId: string; rubricId: string; subjectEntityId: string; subjectRecordId: string }): Promise<RubricEvaluationRecord>;
    submit(evaluationId: string, answers: RubricAnswer[]): Promise<RubricScoreResult>;
    fail(evaluationId: string, errorMessage: string): Promise<RubricEvaluationRecord>;
}

export interface EvaluateParams {
    version: RubricVersionSnapshot;
    subject: { entityName: string; recordId: string; entityId: string };
    content?: RubricSubjectContent;
    /** Used when content is omitted. Loads the subject record so the engine can shape it. */
    loadRecord?: (entityName: string, recordId: string) => Promise<Record<string, unknown>>;
    canRead?: (fieldName: string) => boolean;
    evaluator: 'AI' | 'Deterministic' | 'LLM';
    agent?: RubricAgent;
    promptRunner?: RubricPromptRunner;
    promptMode?: RubricPromptMode;
}

/**
 * Resolves a version the caller already loaded, runs an evaluator, saves a
 * Draft, and submits it through the evaluation store. A throw from the
 * evaluator becomes a Failed evaluation with ErrorMessage. It does not score
 * on its own: AI and deterministic evaluators call RubricScoring.
 */
export class RubricEngine {
    public constructor(private readonly evaluations: RubricEvaluationStore) {}

    /**
     * Runs the evaluator, saves the draft, and submits it. On failure the
     * returned record is Failed and carries the error message.
     */
    public async evaluate(params: EvaluateParams): Promise<{ evaluation: RubricEvaluationRecord; output?: RubricEvaluatorOutput }> {
        let draft: RubricEvaluationRecord | null = null;
        try {
            const content = params.content ?? await this.resolveContent(params);
            const output = await this.runEvaluator(params, content);
            draft = await this.evaluations.createDraft({
                versionId: params.version.id,
                rubricId: params.version.rubricId,
                subjectEntityId: params.subject.entityId,
                subjectRecordId: params.subject.recordId,
            });
            const result = await this.evaluations.submit(draft.id, output.answers);
            return { evaluation: { ...draft, status: 'Submitted' }, output: { ...output, result } };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const failed = draft
                ? await this.evaluations.fail(draft.id, message)
                : await this.evaluations.createDraft({
                    versionId: params.version.id,
                    rubricId: params.version.rubricId,
                    subjectEntityId: params.subject.entityId,
                    subjectRecordId: params.subject.recordId,
                }).then(created => this.evaluations.fail(created.id, message));
            return { evaluation: { ...failed, status: 'Failed', errorMessage: message } };
        }
    }

    /**
     * Creates a Draft and a task for the assignee. Does not score.
     * The human fills the draft in and submits it later.
     */
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
        return new HumanRubricEvaluator(input.drafts, input.tasks).start({
            versionId: input.versionId,
            rubricId: input.rubricId,
            rubricName: input.rubricName,
            subjectEntityId: input.subjectEntityId,
            subjectRecordId: input.subjectRecordId,
            assigneeId: input.assigneeId,
        });
    }

    private async runEvaluator(params: EvaluateParams, content: RubricSubjectContent): Promise<RubricEvaluatorOutput> {
        const subject = { entityName: params.subject.entityName, recordId: params.subject.recordId };
        if (params.evaluator === 'AI') {
            return new AIRubricEvaluator(requiredAgent(params.agent)).evaluateVersion({ version: params.version, subject, content });
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
        return shapeContent(params.subject.entityName, record, params.canRead);
    }

    /** Mean, median, or trimmed mean of normalized scores, with spread. */
    public consensus(scores: number[], method?: ConsensusResult['method'], trim?: number): ConsensusResult {
        return getConsensus(scores, method, trim);
    }

    /** Kappa and alpha, withheld below the sample floor. */
    public agreement(ratings: number[][], minimumSample?: number): AgreementResult {
        return getAgreement(ratings, minimumSample);
    }

    /** Item-analysis flags for a published major version's criteria. */
    public diagnostics(criteria: { key: string; scores: (number | null)[]; notApplicable: number }[]): DiagnosticFlag[] {
        return getDiagnostics(criteria);
    }
}

function requiredAgent(agent: RubricAgent | undefined): RubricAgent {
    if (!agent) throw new Error('An AI evaluation requires an agent.');
    return agent;
}

export { RubricEvaluator };
