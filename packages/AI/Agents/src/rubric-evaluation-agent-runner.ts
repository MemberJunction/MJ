import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { RegisterRubricAgentRunner, WithAgentRun, type EvaluationAgentRunner } from '@memberjunction/rubrics';

const RUBRIC_EVALUATION_AGENT = 'Rubric Evaluation Agent';

/**
 * Runs the Rubric Evaluation Agent, or the agent the evaluator settings name, and returns its
 * decisions with the agent run that produced them. Registered for ProviderRubricEngine so the
 * rubrics package does not depend on this package.
 */
class RubricEvaluationAgentRunner implements EvaluationAgentRunner {
    public constructor(private readonly provider: unknown, private readonly user: unknown) {}

    public async Run(input: Parameters<EvaluationAgentRunner['Run']>[0]): ReturnType<EvaluationAgentRunner['Run']> {
        const view = RunView.FromMetadataProvider(this.provider as never);
        const found = await view.RunView({
            EntityName: 'MJ: AI Agents',
            ExtraFilter: input.agentId ? `ID='${EscapeSQLString(input.agentId)}'` : `Name='${EscapeSQLString(RUBRIC_EVALUATION_AGENT)}'`,
            ResultType: 'entity_object',
            MaxRows: 1,
        }, this.user as never);
        const agent = found.Results?.[0];
        if (!found.Success) throw new Error(found.ErrorMessage || 'Could not read the rubric evaluation agent.');
        if (!agent) throw new Error(input.agentId ? `Agent ${input.agentId} was not found.` : 'The Rubric Evaluation Agent was not found.');
        const { AgentRunner } = await import('./AgentRunner.js');
        const result = await new AgentRunner(this.provider as never).RunAgent({
            agent: agent as never,
            payload: { version: input.version, content: input.content, subject: input.subject },
            contextUser: this.user as never,
            conversationMessages: [],
        });
        if (!result.success) throw new Error(result.errorMessage || 'The Rubric Evaluation Agent failed.');
        return WithAgentRun(result.payload, result.agentRun?.ID);
    }
}

RegisterRubricAgentRunner((provider, user) => new RubricEvaluationAgentRunner(provider, user));
