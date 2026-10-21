import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import type { RubricNodeSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { RubricEngine, type EvaluateRecordInput, type EvaluateRecordResult } from './RubricEngine.js';
import { DraftTitle, NodesFromDescription, NodesFromMatrix } from './architect.js';
import type { RubricSubjectContent } from './content.js';
import { ProviderRubricEngine, SubmitHumanEvaluation, type HumanScoreAnswer } from './providerRecords.js';
import type { ConsensusResult } from './statistics.js';
import { ListRubricEvaluators, NormalizeRubricEvaluatorName } from './evaluatorRegistry.js';

/**
 * The engine for this run. A caller may pass one on the context. Otherwise the
 * action builds one from the provider. It does not construct another action.
 */
export function EngineForAction(params: RunActionParams): RubricEngine {
    const provided = (params.Context as { rubricEngine?: RubricEngine } | undefined)?.rubricEngine;
    if (provided) return provided;
    if (!params.Provider || !params.ContextUser) throw new Error('A rubric action needs a provider and a context user.');
    return ProviderRubricEngine(params.Provider, params.ContextUser);
}

function inputValue(params: RunActionParams, name: string): unknown {
    return params.Params?.find(item => item.Name.trim().toLowerCase() === name.toLowerCase())?.Value;
}

function numberInput(params: RunActionParams, name: string): number | undefined {
    const value = inputValue(params, name);
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function textValue(params: RunActionParams, name: string): string | undefined {
    const value = inputValue(params, name);
    return value === undefined || value === null || value === '' ? undefined : String(value);
}

function nodeInput(params: RunActionParams): RubricNodeSnapshot[] {
    const value = inputValue(params, 'Nodes');
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) return value as RubricNodeSnapshot[];
    if (typeof value !== 'string') throw new Error('Nodes must be a JSON array.');
    let parsed: unknown;
    try {
        parsed = JSON.parse(value) as unknown;
    } catch (error) {
        throw new Error(`Nodes is not valid JSON. ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!Array.isArray(parsed)) throw new Error('Nodes must be a JSON array.');
    return parsed as RubricNodeSnapshot[];
}

/**
 * The Evaluator input as a registered evaluator name. Any evaluator the engine can run is accepted,
 * including a custom one. Human is not, because a person completes it.
 */
function evaluatorInput(params: RunActionParams): string | undefined {
    const value = textValue(params, 'Evaluator');
    if (value === undefined) return undefined;
    const known = ListRubricEvaluators().find(item => item.Name.toLowerCase() === NormalizeRubricEvaluatorName(value).toLowerCase());
    if (!known || !known.IsAutomated) throw new Error(`Evaluator ${value} is not accepted.`);
    return known.Name;
}

function passThresholdInput(params: RunActionParams): number | null {
    const value = inputValue(params, 'PassThreshold');
    if (value === undefined || value === null || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error('PassThreshold must be between 0 and 1.');
    return parsed;
}

function output(params: RunActionParams, name: string, value: unknown): void {
    params.Params.push({ Name: name, Type: 'Output', Value: value });
}

function failed(error: unknown): ActionResultSimple {
    return { Success: false, ResultCode: 'FAILED', Message: error instanceof Error ? error.message : String(error) };
}

/**
 * Evaluate Record Against Rubric. Invoke calls {@link RubricEngine.evaluateRecord},
 * which resolves the latest Published version and then calls evaluate.
 */
@RegisterClass(BaseAction, 'Evaluate Record Against Rubric')
export class EvaluateRecordAgainstRubricAction extends BaseAction {
    public async Invoke(engine: RubricEngine, input: EvaluateRecordInput): Promise<EvaluateRecordResult> {
        return engine.EvaluateRecord(input);
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const result = await this.Invoke(EngineForAction(params), {
                rubricId: textValue(params, 'RubricID'),
                rubricName: textValue(params, 'RubricName'),
                subjectEntityName: textValue(params, 'SubjectEntityName') ?? '',
                subjectRecordId: textValue(params, 'SubjectRecordID') ?? '',
                contextEntityName: textValue(params, 'ContextEntityName'),
                contextRecordId: textValue(params, 'ContextRecordID'),
                evaluator: evaluatorInput(params),
                passThreshold: passThresholdInput(params),
            });
            output(params, 'EvaluationID', result.evaluationId);
            output(params, 'Score', result.score);
            output(params, 'Outcome', result.outcome);
            output(params, 'Criteria', result.criteria);
            return { Success: true, ResultCode: 'SUCCESS' };
        } catch (error) {
            return failed(error);
        }
    }
}

/**
 * Get Rubric Consensus. Invoke asks the engine to load the subject's Submitted
 * scores. The caller does not pass a scores array.
 */
@RegisterClass(BaseAction, 'Get Rubric Consensus')
export class GetRubricConsensusAction extends BaseAction {
    public async Invoke(engine: RubricEngine, input: {
        rubricId?: string;
        rubricName?: string;
        subjectEntityName?: string;
        subjectRecordId: string;
        contextEntityName?: string;
        contextRecordId?: string;
        major?: number;
        method?: ConsensusResult['Method'];
    }): Promise<ConsensusResult> {
        return engine.ConsensusForSubject(input);
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const result = await this.Invoke(EngineForAction(params), {
                rubricId: textValue(params, 'RubricID'),
                rubricName: textValue(params, 'RubricName'),
                subjectEntityName: textValue(params, 'SubjectEntityName'),
                subjectRecordId: textValue(params, 'SubjectRecordID') ?? '',
                contextEntityName: textValue(params, 'ContextEntityName'),
                contextRecordId: textValue(params, 'ContextRecordID'),
                major: numberInput(params, 'Major'),
                method: textValue(params, 'Method') as ConsensusResult['Method'],
            });
            output(params, 'ConsensusMethod', result.Method);
            output(params, 'Overall', result.Overall);
            output(params, 'StdDev', result.StdDev);
            output(params, 'Range', result.Range);
            output(params, 'SampleSize', result.SampleSize);
            return { Success: true, ResultCode: 'SUCCESS' };
        } catch (error) {
            return failed(error);
        }
    }
}

/** Get Rubric Subject. Loads the subject content. It does not score and it does not publish. */
@RegisterClass(BaseAction, 'Get Rubric Subject')
export class GetRubricSubjectAction extends BaseAction {
    public async Invoke(engine: RubricEngine, input: { subjectEntityName: string; subjectRecordId: string }): Promise<RubricSubjectContent> {
        return engine.SubjectContent(input);
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const content = await this.Invoke(EngineForAction(params), {
                subjectEntityName: textValue(params, 'SubjectEntityName') ?? '',
                subjectRecordId: textValue(params, 'SubjectRecordID') ?? '',
            });
            output(params, 'Content', content);
            return { Success: true, ResultCode: 'SUCCESS' };
        } catch (error) {
            return failed(error);
        }
    }
}

/** Get Rubric. Invoke returns the tree. It does not score and it does not call another action. */
@RegisterClass(BaseAction, 'Get Rubric')
export class GetRubricAction extends BaseAction {
    public async Invoke(engine: RubricEngine, input: { rubricId?: string; rubricName?: string; versionId?: string }): Promise<RubricVersionSnapshot | null> {
        return engine.GetRubric(input);
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const tree = await this.Invoke(EngineForAction(params), {
                rubricId: textValue(params, 'RubricID'),
                rubricName: textValue(params, 'RubricName'),
                versionId: textValue(params, 'VersionID'),
            });
            if (!tree) return { Success: false, ResultCode: 'NOT_FOUND', Message: 'That rubric version was not found.' };
            output(params, 'Tree', tree);
            return { Success: true, ResultCode: 'SUCCESS' };
        } catch (error) {
            return failed(error);
        }
    }
}

/**
 * Create Rubric Draft. Invoke calls the engine's draft create and returns
 * status Draft only. It never publishes.
 */
@RegisterClass(BaseAction, 'Create Rubric Draft')
export class CreateRubricDraftAction extends BaseAction {
    /** Writes the draft through the caller's provider, with the caller's permissions. */
    public static readonly AuthorizesCaller = true;

    public async Invoke(engine: RubricEngine, input: { rubricId?: string; rubricName?: string; nodes?: RubricNodeSnapshot[]; matrix?: string; description?: string }): Promise<{ id: string; status: 'Draft' }> {
        const nodes = input.matrix
            ? NodesFromMatrix(input.matrix)
            : input.description
                ? NodesFromDescription(input.description)
                : input.nodes ?? [];
        const rubricId = input.rubricId?.trim() || undefined;
        const rubricName = input.rubricName?.trim() || (!rubricId && input.description ? DraftTitle(input.description) : undefined);
        if (!rubricId && !rubricName) throw new Error('A rubric id or name is required.');
        return engine.CreateDraft({ rubricId, rubricName, nodes });
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const draft = await this.Invoke(EngineForAction(params), {
                rubricId: textValue(params, 'RubricID'),
                rubricName: textValue(params, 'RubricName'),
                nodes: nodeInput(params),
                matrix: textValue(params, 'Matrix'),
                description: textValue(params, 'Description'),
            });
            output(params, 'ID', draft.id);
            output(params, 'Status', draft.status);
            return { Success: true, ResultCode: 'SUCCESS' };
        } catch (error) {
            return failed(error);
        }
    }
}

/**
 * Submit Human Rubric. The evaluation, its scores, and the Submitted status
 * commit together. Evidence stays an evidence list.
 */
@RegisterClass(BaseAction, 'Submit Human Rubric')
export class SubmitHumanRubricAction extends BaseAction {
    /** Records the caller's own evaluation, with the caller's permissions. */
    public static readonly AuthorizesCaller = true;

    public async Invoke(provider: Parameters<typeof SubmitHumanEvaluation>[0], user: unknown, input: Parameters<typeof SubmitHumanEvaluation>[2]): Promise<{ id: string; status: 'Submitted' }> {
        return SubmitHumanEvaluation(provider, user, input);
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            if (!params.Provider || !params.ContextUser) throw new Error('A rubric action needs a provider and a context user.');
            const submitted = await this.Invoke(params.Provider as Parameters<typeof SubmitHumanEvaluation>[0], params.ContextUser, {
                rubricVersionId: textValue(params, 'RubricVersionID') ?? '',
                subjectEntityId: textValue(params, 'SubjectEntityID') ?? '',
                subjectRecordId: textValue(params, 'SubjectRecordID') ?? '',
                contextEntityId: textValue(params, 'ContextEntityID') ?? null,
                contextRecordId: textValue(params, 'ContextRecordID') ?? null,
                evaluatorUserId: params.ContextUser.ID,
                supersedesEvaluationId: textValue(params, 'SupersedesEvaluationID') ?? null,
                answers: answerInput(params),
            });
            output(params, 'EvaluationID', submitted.id);
            output(params, 'Status', submitted.status);
            return { Success: true, ResultCode: 'SUCCESS' };
        } catch (error) {
            return failed(error);
        }
    }
}

function answerInput(params: RunActionParams): HumanScoreAnswer[] {
    const value = inputValue(params, 'Answers');
    const parsed = typeof value === 'string' ? safeArray(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed as HumanScoreAnswer[];
}

function safeArray(value: string): unknown {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return [];
    }
}
