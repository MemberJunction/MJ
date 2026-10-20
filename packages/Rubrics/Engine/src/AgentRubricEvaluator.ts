import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { RegisterClass } from '@memberjunction/global';
import type { RubricSubjectContent } from './content.js';
import { LLMRubricEvaluator, type LLMDecision, type LLMRubricResult } from './LLMRubricEvaluator.js';
import { BaseRubricEvaluator } from './RubricEvaluator.js';
import type { RubricEvaluatorContext, RubricEvaluatorRun, RubricEvaluatorType, RubricJsonValue } from './evaluatorServices.js';

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

/** The decisions an agent returned, wrapped, with the agent run that produced them when the runner knows it. */
export interface EvaluationAgentPayload {
    criteria?: EvaluationAgentDecision[];
    decisions?: EvaluationAgentDecision[];
    agentRunId?: string | null;
}

export type EvaluationAgentOutput = EvaluationAgentDecision | EvaluationAgentDecision[] | EvaluationAgentPayload;

export interface EvaluationAgentRunner {
    Run(input: {
        version: RubricVersionSnapshot;
        content: RubricSubjectContent;
        subject?: { entityName: string; recordId: string };
        /** The agent to run. The runner's default agent when omitted. */
        agentId?: string;
    }): Promise<EvaluationAgentOutput>;
}

function decisionsFrom(payload: EvaluationAgentOutput): LLMDecision[] {
    if (Array.isArray(payload)) return payload;
    if ('key' in payload || 'level' in payload || 'value' in payload) return [payload as EvaluationAgentDecision];
    const wrapped = payload as EvaluationAgentPayload;
    return wrapped.criteria ?? wrapped.decisions ?? [];
}

function agentRunIdFrom(payload: EvaluationAgentOutput): string | null {
    if (Array.isArray(payload) || !('agentRunId' in payload)) return null;
    return (payload as EvaluationAgentPayload).agentRunId ?? null;
}

/** Wraps an agent's payload with the run that produced it, so the evaluation records that run. */
export function WithAgentRun(payload: unknown, agentRunId: string | null | undefined): EvaluationAgentPayload {
    const decisions = payload && typeof payload === 'object' ? decisionsFrom(payload as EvaluationAgentOutput) : [];
    return { decisions, agentRunId: agentRunId ?? null };
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

    public get EvaluatorType(): RubricEvaluatorType {
        return 'Agent';
    }

    /** The class factory passes no runner. {@link EvaluateRubric} uses the engine's. */
    public constructor(private readonly agent?: EvaluationAgentRunner) {
        super();
    }

    /** Runs the engine's agent runner, or the settings' AgentID through it, and records the agent run. */
    public async EvaluateRubric(context: RubricEvaluatorContext): Promise<RubricEvaluatorRun> {
        const agent = context.Services.Agent ?? this.agent;
        if (!agent) throw new Error('An Agent evaluation requires an agent runner.');
        const payload = await agent.Run({
            version: context.Version,
            content: context.Content,
            subject: context.Subject,
            ...(context.Settings.AgentID ? { agentId: context.Settings.AgentID } : {}),
        });
        const result = await this.scorePayload(context.Version, context.Content, payload);
        const metadata: Record<string, RubricJsonValue> = {
            DroppedUnknownKeys: result.droppedUnknownKeys,
            DroppedQuotes: result.droppedQuotes,
        };
        if (context.Settings.AgentID) metadata.AgentID = context.Settings.AgentID;
        return { ...result, aiAgentRunId: agentRunIdFrom(payload), metadata };
    }

    public async EvaluateContent(
        version: RubricVersionSnapshot,
        content: RubricSubjectContent,
        subject?: { entityName: string; recordId: string },
    ): Promise<LLMRubricResult> {
        if (!this.agent) throw new Error('An Agent evaluation requires an agent runner.');
        return this.scorePayload(version, content, await this.agent.Run({ version, content, subject }));
    }

    private scorePayload(version: RubricVersionSnapshot, content: RubricSubjectContent, payload: EvaluationAgentOutput): Promise<LLMRubricResult> {
        const decisions = decisionsFrom(payload);
        return new LLMRubricEvaluator({
            async run() { return JSON.stringify({ decisions }); },
        }).EvaluateContent(version, content);
    }

    }
