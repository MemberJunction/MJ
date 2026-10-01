import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import type { RubricNodeSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { RubricEngine, type EvaluateRecordInput, type EvaluateRecordResult } from './RubricEngine.js';
import { providerRubricEngine } from './providerRecords.js';
import type { ConsensusResult } from './statistics.js';

/**
 * The engine for this run. A caller may pass one on the context. Otherwise the
 * action builds one from the provider. It does not construct another action.
 */
export function engineForAction(params: RunActionParams): RubricEngine {
    const provided = (params.Context as { rubricEngine?: RubricEngine } | undefined)?.rubricEngine;
    if (provided) return provided;
    if (!params.Provider || !params.ContextUser) throw new Error('A rubric action needs a provider and a context user.');
    return providerRubricEngine(params.Provider, params.ContextUser);
}

function inputValue(params: RunActionParams, name: string): unknown {
    return params.Params?.find(item => item.Name.trim().toLowerCase() === name.toLowerCase())?.Value;
}

function textValue(params: RunActionParams, name: string): string | undefined {
    const value = inputValue(params, name);
    return value === undefined || value === null || value === '' ? undefined : String(value);
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
        return engine.evaluateRecord(input);
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const result = await this.Invoke(engineForAction(params), {
                rubricId: textValue(params, 'RubricID'),
                rubricName: textValue(params, 'RubricName'),
                subjectEntityName: textValue(params, 'SubjectEntityName') ?? '',
                subjectRecordId: textValue(params, 'SubjectRecordID') ?? '',
                contextEntityName: textValue(params, 'ContextEntityName'),
                contextRecordId: textValue(params, 'ContextRecordID'),
                evaluator: textValue(params, 'Evaluator') as EvaluateRecordInput['evaluator'],
                passThreshold: inputValue(params, 'PassThreshold') === undefined || inputValue(params, 'PassThreshold') === null
                    ? null
                    : Number(inputValue(params, 'PassThreshold')),
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
        subjectRecordId: string;
        contextRecordId?: string;
        method?: ConsensusResult['method'];
    }): Promise<ConsensusResult> {
        return engine.consensusForSubject(input);
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const result = await this.Invoke(engineForAction(params), {
                rubricId: textValue(params, 'RubricID'),
                rubricName: textValue(params, 'RubricName'),
                subjectRecordId: textValue(params, 'SubjectRecordID') ?? '',
                contextRecordId: textValue(params, 'ContextRecordID'),
                method: textValue(params, 'Method') as ConsensusResult['method'],
            });
            output(params, 'ConsensusMethod', result.method);
            output(params, 'Overall', result.overall);
            output(params, 'StdDev', result.stdDev);
            output(params, 'Range', result.range);
            output(params, 'SampleSize', result.sampleSize);
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
        return engine.getRubric(input);
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const tree = await this.Invoke(engineForAction(params), {
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
    public async Invoke(engine: RubricEngine, input: { rubricId: string; nodes: RubricNodeSnapshot[] }): Promise<{ id: string; status: 'Draft' }> {
        return engine.createDraft(input);
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const nodes = inputValue(params, 'Nodes');
            const draft = await this.Invoke(engineForAction(params), {
                rubricId: textValue(params, 'RubricID') ?? '',
                nodes: Array.isArray(nodes) ? nodes as RubricNodeSnapshot[] : [],
            });
            output(params, 'ID', draft.id);
            output(params, 'Status', draft.status);
            return { Success: true, ResultCode: 'SUCCESS' };
        } catch (error) {
            return failed(error);
        }
    }
}
