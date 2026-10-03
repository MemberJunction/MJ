import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { RegisterRubricAgentRunner, type EvaluationAgentRunner } from '@memberjunction/rubrics';

const RUBRIC_EVALUATION_AGENT = 'Rubric Evaluation Agent';

/**
 * Runs the Rubric Evaluation Agent. Registered for ProviderRubricEngine so the
 * rubrics package does not depend on this package.
 */
class RubricEvaluationAgentRunner implements EvaluationAgentRunner {
    public constructor(private readonly provider: unknown, private readonly user: unknown) {}

    public async Run(input: Parameters<EvaluationAgentRunner['Run']>[0]): ReturnType<EvaluationAgentRunner['Run']> {
        const view = RunView.FromMetadataProvider(this.provider as never);
        const found = await view.RunView({
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Name='${EscapeSQLString(RUBRIC_EVALUATION_AGENT)}'`,
            ResultType: 'entity_object',
            MaxRows: 1,
        }, this.user as never);
        const agent = found.Results?.[0];
        if (!found.Success || !agent) throw new Error('The Rubric Evaluation Agent was not found.');
        const { AgentRunner } = await import('./AgentRunner.js');
        const result = await new AgentRunner(this.provider as never).RunAgent({
            agent: agent as never,
            payload: { version: input.version, content: input.content, subject: input.subject },
            contextUser: this.user as never,
            conversationMessages: [],
        });
        if (!result.success) throw new Error(result.errorMessage || 'The Rubric Evaluation Agent failed.');
        return (result.payload ?? {}) as Awaited<ReturnType<EvaluationAgentRunner['Run']>>;
    }
}

RegisterRubricAgentRunner((provider, user) => new RubricEvaluationAgentRunner(provider, user));
