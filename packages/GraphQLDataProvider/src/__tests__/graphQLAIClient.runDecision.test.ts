import { describe, expect, it, vi, afterEach, type Mock } from 'vitest';
import { parse, type OperationDefinitionNode, type FieldNode } from 'graphql';
import type { DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
import { GraphQLAIClient, type RunDecisionParams } from '../graphQLAIClient';
import { GraphQLDataProvider } from '../graphQLDataProvider';

/**
 * `GraphQLAIClient.RunDecision`: typed questions and state out over the `RunDecision` mutation, typed
 * answers back. The method never throws, so every failure below must come back as a result.
 */

type ExecuteGQLMock = Mock<GraphQLDataProvider['ExecuteGQL']>;

const QUESTIONS: Record<string, DecisionQuestion> = {
    route: {
        Kind: 'Choice',
        Instructions: 'Which agent should answer this message?',
        Options: [
            { Value: 'sage', Description: 'General questions about the product' },
            { Value: 'analyst', Description: 'Questions about data and reports' },
        ],
    },
    duplicate: { Kind: 'Likelihood', Instructions: 'Does this message repeat an earlier one?' },
    urgency: { Kind: 'Score', Instructions: 'How urgent is this message?', Levels: ['Low', 'Medium', 'High'] },
};

const ANSWERS: Record<string, DecisionAnswer> = {
    route: { Kind: 'Choice', Value: 'analyst', Confidence: 0.9, Probabilities: { sage: 0.1, analyst: 0.9 } },
    duplicate: { Kind: 'Likelihood', Probability: 0.2 },
    urgency: { Kind: 'Score', Value: 1.4, Confidence: 0.7, Probabilities: { Low: 0.1, Medium: 0.4, High: 0.5 } },
};

/** A successful mutation response, as the server sends it. */
const serverSuccess = () => ({
    RunDecision: {
        success: true,
        errorMessage: null,
        answersJSON: JSON.stringify(ANSWERS),
        promptRunId: 'run-1',
        modelName: 'Jev',
        executionTimeMs: 182,
    },
});

function makeClient(response: unknown = serverSuccess()): { client: GraphQLAIClient; executeGQL: ExecuteGQLMock } {
    const executeGQL: ExecuteGQLMock = vi.fn<GraphQLDataProvider['ExecuteGQL']>().mockResolvedValue(response);
    const provider = { ExecuteGQL: executeGQL } satisfies Pick<GraphQLDataProvider, 'ExecuteGQL'>;
    return { client: new GraphQLAIClient(provider as unknown as GraphQLDataProvider), executeGQL };
}

const baseParams = (over: Partial<RunDecisionParams> = {}): RunDecisionParams => ({
    Questions: QUESTIONS,
    State: 'A customer asks why the invoice total changed this month.',
    ...over,
});

/** The document and variables of the one ExecuteGQL call. */
function sent(executeGQL: ExecuteGQLMock): { document: string; variables: Record<string, unknown> } {
    expect(executeGQL).toHaveBeenCalledOnce();
    const [document, variables] = executeGQL.mock.calls[0];
    return { document, variables };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('GraphQLAIClient.RunDecision: the request', () => {
    it('calls the RunDecision mutation with every argument and selects every result field', async () => {
        const { client, executeGQL } = makeClient();

        await client.RunDecision(baseParams());

        const operation = parse(sent(executeGQL).document).definitions[0] as OperationDefinitionNode;
        const field = operation.selectionSet.selections[0] as FieldNode;
        expect(operation.name?.value).toBe('RunDecision');
        expect(field.name.value).toBe('RunDecision');
        expect((field.arguments ?? []).map(a => a.name.value)).toEqual(['state', 'questions', 'promptId', 'promptName', 'timeoutMS']);
        expect((field.selectionSet?.selections ?? []).map(s => (s as FieldNode).name.value))
            .toEqual(['success', 'errorMessage', 'answersJSON', 'promptRunId', 'modelName', 'executionTimeMs']);
    });

    it('sends the questions as JSON and text state as-is, leaving unset options out', async () => {
        const { client, executeGQL } = makeClient();

        await client.RunDecision(baseParams());

        const { variables } = sent(executeGQL);
        expect(variables).toEqual({
            state: 'A customer asks why the invoice total changed this month.',
            questions: JSON.stringify(QUESTIONS),
        });
        expect(JSON.parse(String(variables.questions))).toEqual(QUESTIONS);
    });

    it('sends object state as JSON, and the prompt and timeout when set', async () => {
        const { client, executeGQL } = makeClient();
        const state = { message: "Show me last quarter's renewals", channel: 'chat' };

        await client.RunDecision(baseParams({ State: state, PromptID: 'prompt-1', PromptName: 'Route Message', TimeoutMS: 250 }));

        const { variables } = sent(executeGQL);
        expect(JSON.parse(String(variables.state))).toEqual(state);
        expect(variables.promptId).toBe('prompt-1');
        expect(variables.promptName).toBe('Route Message');
        expect(variables.timeoutMS).toBe(250);
    });
});

describe('GraphQLAIClient.RunDecision: the answers', () => {
    it('parses the answers and maps the run details', async () => {
        const { client } = makeClient();

        const result = await client.RunDecision(baseParams());

        expect(result).toEqual({
            Success: true,
            Answers: ANSWERS,
            PromptRunID: 'run-1',
            ModelName: 'Jev',
            ExecutionTimeMs: 182,
        });
        const route = result.Answers.route;
        expect(route?.Kind === 'Choice' ? route.Value : undefined).toBe('analyst');
    });

    it('turns null run details into undefined', async () => {
        const { client } = makeClient({
            RunDecision: { ...serverSuccess().RunDecision, promptRunId: null, modelName: null, executionTimeMs: null },
        });

        const result = await client.RunDecision(baseParams());

        expect(result.Success).toBe(true);
        expect(result.PromptRunID).toBeUndefined();
        expect(result.ModelName).toBeUndefined();
        expect(result.ExecutionTimeMs).toBeUndefined();
    });
});

describe('GraphQLAIClient.RunDecision: errors', () => {
    it('maps a server failure, keeping the run details and returning no answers', async () => {
        const { client } = makeClient({
            RunDecision: {
                success: false,
                errorMessage: "AI Prompt 'Summarize Text' is not a Decision prompt",
                answersJSON: null,
                promptRunId: 'run-2',
                modelName: null,
                executionTimeMs: 4,
            },
        });

        const result = await client.RunDecision(baseParams());

        expect(result).toEqual({
            Success: false,
            ErrorMessage: "AI Prompt 'Summarize Text' is not a Decision prompt",
            Answers: {},
            PromptRunID: 'run-2',
            ModelName: undefined,
            ExecutionTimeMs: 4,
        });
    });

    it('gives a server failure with no message a generic one', async () => {
        const { client } = makeClient({ RunDecision: { success: false, errorMessage: null } });

        const result = await client.RunDecision(baseParams());

        expect(result).toMatchObject({ Success: false, ErrorMessage: 'Decision execution failed', Answers: {} });
    });

    it('returns a transport error instead of throwing', async () => {
        const { client, executeGQL } = makeClient();
        executeGQL.mockRejectedValue(new Error('Network request failed'));

        const result = await client.RunDecision(baseParams());

        expect(result).toEqual({ Success: false, ErrorMessage: 'Network request failed', Answers: {} });
    });

    it('returns a response without a RunDecision field as a failure', async () => {
        const { client } = makeClient({});

        const result = await client.RunDecision(baseParams());

        expect(result).toEqual({ Success: false, ErrorMessage: 'Invalid response from server', Answers: {} });
    });

    it('fails, with no answers, when a success carries answers that are not valid JSON', async () => {
        const { client } = makeClient({ RunDecision: { ...serverSuccess().RunDecision, answersJSON: '{"route": ' } });

        const result = await client.RunDecision(baseParams());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/^The server returned answers that are not valid JSON: /);
        expect(result.Answers).toEqual({});
        expect(result.PromptRunID).toBe('run-1');
    });

    it('fails when a success carries no answers', async () => {
        const { client } = makeClient({ RunDecision: { ...serverSuccess().RunDecision, answersJSON: null } });

        const result = await client.RunDecision(baseParams());

        expect(result).toMatchObject({ Success: false, ErrorMessage: 'The server returned no answers', Answers: {} });
    });

    it('fails when an answer is not a Likelihood, Choice or Score answer', async () => {
        const answers = { ...ANSWERS, duplicate: { Kind: 'Likelihood', Probability: 'high' } };
        const { client } = makeClient({ RunDecision: { ...serverSuccess().RunDecision, answersJSON: JSON.stringify(answers) } });

        const result = await client.RunDecision(baseParams());

        expect(result).toMatchObject({
            Success: false,
            ErrorMessage: "The server returned an answer for 'duplicate' that is not a Likelihood, Choice or Score answer",
            Answers: {},
        });
    });

    it('fails when the answers are not an object', async () => {
        const { client } = makeClient({ RunDecision: { ...serverSuccess().RunDecision, answersJSON: '[1, 2]' } });

        const result = await client.RunDecision(baseParams());

        expect(result).toMatchObject({ Success: false, ErrorMessage: 'The server returned answers that are not an object' });
    });
});
