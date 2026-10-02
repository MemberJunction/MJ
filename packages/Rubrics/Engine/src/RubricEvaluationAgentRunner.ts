import { RunView } from '@memberjunction/core';
import type { RubricSubjectContent } from './content.js';
import type { EvaluationAgentRunner } from './AgentRubricEvaluator.js';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';

export const RUBRIC_EVALUATION_AGENT = 'Rubric Evaluation Agent';

/**
 * Runs the Rubric Evaluation Agent and returns its payload. The sampling job
 * passes this into EvaluateRecord so an Agent config is not called without a runner.
 */
export class RubricEvaluationAgentRunner implements EvaluationAgentRunner {
    public constructor(private readonly provider: unknown, private readonly user: unknown) {}

    public async run(input: {
        version: RubricVersionSnapshot;
        content: RubricSubjectContent;
        subject?: { entityName: string; recordId: string };
    }): Promise<unknown> {
        const view = RunView.FromMetadataProvider(this.provider as never);
        const found = await view.RunView({
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Name='${RUBRIC_EVALUATION_AGENT.replace(/'/g, "''")}'`,
            ResultType: 'entity_object',
            MaxRows: 1,
        }, this.user as never);
        const agent = found.Results?.[0];
        if (!found.Success || !agent) throw new Error('The Rubric Evaluation Agent was not found.');
        const { AgentRunner } = await import('@memberjunction/ai-agents');
        const result = await new AgentRunner(this.provider as never).RunAgent({
            agent: agent as never,
            payload: { version: input.version, content: input.content, subject: input.subject },
            contextUser: this.user as never,
            conversationMessages: [],
        });
        if (!result.success) throw new Error(result.errorMessage || 'The Rubric Evaluation Agent failed.');
        return result.payload ?? {};
    }
}
