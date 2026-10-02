import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { RegisterClass } from '@memberjunction/global';
import type { RubricSubjectContent } from './content.js';
import { LLMRubricEvaluator, type LLMDecision, type LLMRubricResult } from './LLMRubricEvaluator.js';
import { BaseRubricEvaluator } from './RubricEvaluator.js';

/** One criterion from the Rubric Evaluation Agent. Same shape as the LLM payload. */
export interface EvaluationAgentDecision {
    key?: string;
    level?: string;
    value?: number;
    notApplicable?: boolean;
    rationale?: string;
    evidence?: { quote?: string }[];
    confidence?: number;
}

export interface EvaluationAgentRunner {
    Run(input: {
        version: RubricVersionSnapshot;
        content: RubricSubjectContent;
        subject?: { entityName: string; recordId: string };
    }): Promise<EvaluationAgentDecision | EvaluationAgentDecision[] | { criteria?: EvaluationAgentDecision[]; decisions?: EvaluationAgentDecision[] }>;
}

function decisionsFrom(payload: EvaluationAgentDecision | EvaluationAgentDecision[] | { criteria?: EvaluationAgentDecision[]; decisions?: EvaluationAgentDecision[] }): LLMDecision[] {
    if (Array.isArray(payload)) return payload;
    if ('key' in payload || 'level' in payload || 'value' in payload) return [payload];
    const wrapped = payload as { criteria?: EvaluationAgentDecision[]; decisions?: EvaluationAgentDecision[] };
    return wrapped.criteria ?? wrapped.decisions ?? [];
}

/**
 * Runs the Rubric Evaluation Agent once and scores the payload with RubricScoring.
 * Unknown keys are dropped. Levels map by label. A value outside the scale throws.
 * A quote that is not in the subject text is dropped.
 */
@RegisterClass(BaseRubricEvaluator, 'Agent')
export class AgentRubricEvaluator extends BaseRubricEvaluator {
    public get EvaluatorName(): string {
        return 'Agent';
    }
    private readonly agent: EvaluationAgentRunner;

    public constructor(agent: EvaluationAgentRunner) {
        super();
        this.agent = agent;
    }

    public async EvaluateContent(
        version: RubricVersionSnapshot,
        content: RubricSubjectContent,
        subject?: { entityName: string; recordId: string },
    ): Promise<LLMRubricResult> {
        const payload = await this.agent.Run({ version, content, subject });
        const decisions = decisionsFrom(payload);
        return new LLMRubricEvaluator({
            async run() { return JSON.stringify({ decisions }); },
        }).EvaluateContent(version, content);
    }

    }
