import { RegisterClass } from '@memberjunction/global';
import { BaseRubricEvaluator } from './RubricEvaluator.js';
import type { RubricEvaluatorRun, RubricEvaluatorType } from './evaluatorServices.js';

export interface DraftEvaluationInput {
    versionId: string;
    rubricId: string;
    subjectEntityId: string;
    subjectRecordId: string;
    assigneeId: string;
}

export interface EvaluationDraftStore {
    /** Creates a Draft evaluation pinned to the version. Does not submit it. */
    createDraft(input: DraftEvaluationInput): Promise<{ id: string }>;
}

export interface RubricTaskStore {
    /** Creates a task for the person who will fill the draft in. */
    create(input: { assigneeId: string; evaluationId: string; title: string }): Promise<{ id: string }>;
}

/**
 * Opens a human review. It creates a Draft evaluation and a task for the
 * assignee. It does not score and it does not call an agent. The person
 * answers in the form, and submit runs RubricScoring later.
 */
@RegisterClass(BaseRubricEvaluator, 'Human')
export class HumanRubricEvaluator extends BaseRubricEvaluator {
    public get EvaluatorName(): string {
        return 'Human';
    }

    public get EvaluatorType(): RubricEvaluatorType {
        return 'Human';
    }

    /** A person completes this evaluation, so the engine never runs it. */
    public override get IsAutomated(): boolean {
        return false;
    }

    /** Always throws. Use {@link Start}, or submit the answers with Submit Human Rubric. */
    public async EvaluateRubric(): Promise<RubricEvaluatorRun> {
        throw new Error('A human evaluation is started and then submitted by a person. The engine does not run it.');
    }

    /** The class factory passes no stores. {@link Start} needs both. */
    public constructor(private readonly evaluations?: EvaluationDraftStore, private readonly tasks?: RubricTaskStore) {
        super();
    }

    /**
     * Creates the draft, then the task. Returns both ids. The task title
     * names the rubric so the assignee can find it.
     */
    public async Start(input: DraftEvaluationInput & { rubricName: string }): Promise<{ evaluationId: string; taskId: string }> {
        if (!this.evaluations || !this.tasks) throw new Error('Starting a human evaluation requires a draft store and a task store.');
        const draft = await this.evaluations.createDraft(input);
        const task = await this.tasks.create({
            assigneeId: input.assigneeId,
            evaluationId: draft.id,
            title: `Score ${input.rubricName}`,
        });
        return { evaluationId: draft.id, taskId: task.id };
    }

}
