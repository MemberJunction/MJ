import { RegisterClass } from '@memberjunction/global';
import { BaseRubricEvaluator } from './RubricEvaluator.js';

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
    private readonly evaluations: EvaluationDraftStore;
    private readonly tasks: RubricTaskStore;

    public constructor(evaluations: EvaluationDraftStore, tasks: RubricTaskStore) {
        super();
        this.evaluations = evaluations;
        this.tasks = tasks;
    }

    /**
     * Creates the draft, then the task. Returns both ids. The task title
     * names the rubric so the assignee can find it.
     */
    public async Start(input: DraftEvaluationInput & { rubricName: string }): Promise<{ evaluationId: string; taskId: string }> {
        const draft = await this.evaluations.createDraft(input);
        const task = await this.tasks.create({
            assigneeId: input.assigneeId,
            evaluationId: draft.id,
            title: `Score ${input.rubricName}`,
        });
        return { evaluationId: draft.id, taskId: task.id };
    }

    /** @deprecated Use {@link Start}. */
    public async start(input: DraftEvaluationInput & { rubricName: string }): Promise<{ evaluationId: string; taskId: string }> {
        return this.Start(input);
    }
}
