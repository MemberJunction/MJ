import type { RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import type { ConsensusResult } from './statistics.js';

/**
 * The engine surface the actions may call. An action takes this and nothing else.
 * Actions do not call each other.
 */
export interface RubricActionEngine {
    evaluate(input: {
        rubricId?: string;
        rubricName?: string;
        subjectEntityName: string;
        subjectRecordId: string;
        contextEntityName?: string;
        contextRecordId?: string;
        evaluator?: 'AI' | 'Deterministic' | 'LLM';
        passThreshold?: number | null;
    }): Promise<{ evaluationId: string; result: Pick<RubricScoreResult, 'normalizedScore' | 'outcome'> & { nodes?: { key: string; normalizedScore: number | null }[] } }>;
    consensus(input: { rubricId?: string; rubricName?: string; subjectRecordId: string; contextRecordId?: string; method?: ConsensusResult['method']; scores: number[] }): Promise<ConsensusResult>;
    getRubric(input: { rubricId?: string; rubricName?: string; versionId?: string }): Promise<RubricVersionSnapshot | null>;
    /** Creates a Draft version. Must not publish. */
    createDraft(payload: { rubricId: string; nodes: RubricVersionSnapshot['nodes'] }): Promise<{ id: string; status: 'Draft' }>;
}

export interface EvaluateRecordResult {
    evaluationId: string;
    score: number | null;
    outcome: RubricScoreResult['outcome'];
    criteria: { key: string; normalizedScore: number | null }[];
}

/**
 * Evaluate Record Against Rubric. Passes the rubric, subject, optional context,
 * evaluator, and threshold to the engine. Returns the evaluation id, score,
 * outcome, and per-criterion summary. Does not call another action.
 */
export async function evaluateRecordAgainstRubric(engine: RubricActionEngine, input: Parameters<RubricActionEngine['evaluate']>[0]): Promise<EvaluateRecordResult> {
    const done = await engine.evaluate(input);
    return {
        evaluationId: done.evaluationId,
        score: done.result.normalizedScore,
        outcome: done.result.outcome,
        criteria: done.result.nodes ?? [],
    };
}

/**
 * Get Rubric Consensus. Passes the subject, optional context, rubric, and method
 * to the engine and returns the statistics.
 */
export async function getRubricConsensus(engine: RubricActionEngine, input: Parameters<RubricActionEngine['consensus']>[0]): Promise<ConsensusResult> {
    return engine.consensus(input);
}

/**
 * Get Rubric. Returns the tree for a rubric name or id and an optional version,
 * so an agent can read the criteria. Does not score.
 */
export async function getRubric(engine: RubricActionEngine, input: Parameters<RubricActionEngine['getRubric']>[0]): Promise<RubricVersionSnapshot | null> {
    return engine.getRubric(input);
}

/**
 * Create Rubric Draft. Stores the payload as a Draft version. Never publishes.
 * Publishing stays a human action.
 */
export async function createRubricDraft(engine: RubricActionEngine, payload: Parameters<RubricActionEngine['createDraft']>[0]): Promise<{ id: string; status: 'Draft' }> {
    const draft = await engine.createDraft(payload);
    if (draft.status !== 'Draft') {
        throw new Error('Create Rubric Draft never publishes.');
    }
    return draft;
}
