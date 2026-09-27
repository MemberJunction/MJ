import { describe, expect, it, vi, afterEach } from 'vitest';
import { parse, Kind, type OperationDefinitionNode, type FieldNode } from 'graphql';
import { GraphQLAIClient } from '../graphQLAIClient';
import { GraphQLDataProvider } from '../graphQLDataProvider';

/**
 * `agentHistoryFrom` on RunAIAgentFromConversationDetail: the agent's history floor.
 *
 * The argument is new, and GraphQL validates every argument a document names — so a client that
 * always declared it would break every request to an MJAPI that predates it. The client therefore
 * names it only when the caller sets a floor. These tests pin both halves: left out of the
 * document and the variables when unset, declared, passed and ISO-encoded when set.
 */

type ExecuteGQLMock = ReturnType<typeof vi.fn>;

/** A headless provider (no PushStatusUpdates), so the mutation runs synchronously and returns inline. */
function makeProvider(): { provider: GraphQLDataProvider; executeGQL: ExecuteGQLMock } {
    const executeGQL = vi.fn().mockResolvedValue({
        RunAIAgentFromConversationDetail: { success: true, result: JSON.stringify({ success: true }) },
    });
    const provider = { sessionId: 'sess-1', ExecuteGQL: executeGQL } as unknown as GraphQLDataProvider;
    return { provider, executeGQL };
}

type RunParams = Parameters<GraphQLAIClient['RunAIAgentFromConversationDetail']>[0];

async function run(agentHistoryFrom?: Date | null): Promise<{ document: string; variables: Record<string, unknown> }> {
    vi.spyOn(console, 'log').mockImplementation(() => undefined); // the synchronous path's status lines
    const { provider, executeGQL } = makeProvider();
    const client = new GraphQLAIClient(provider);
    await client.RunAIAgentFromConversationDetail({
        conversationDetailId: 'cd-1',
        agentId: 'agent-1',
        ...(agentHistoryFrom !== undefined ? { agentHistoryFrom } : {}),
    } as RunParams);
    expect(executeGQL).toHaveBeenCalledOnce();
    const [document, variables] = executeGQL.mock.calls[0] as [string, Record<string, unknown>];
    return { document, variables };
}

/** The mutation's declared variable names and the arguments its one field passes, from a real parse. */
function shape(document: string): { variables: string[]; args: string[] } {
    const operation = parse(document).definitions[0] as OperationDefinitionNode;
    const field = operation.selectionSet.selections[0] as FieldNode;
    return {
        variables: (operation.variableDefinitions ?? []).map((v) => v.variable.name.value),
        args: (field.arguments ?? []).map((a) => a.name.value),
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('GraphQLAIClient.RunAIAgentFromConversationDetail — agentHistoryFrom', () => {
    it('leaves the argument out of the document and the variables when no floor is set', async () => {
        const { document, variables } = await run();

        const { variables: declared, args } = shape(document);
        expect(declared).not.toContain('agentHistoryFrom');
        expect(args).not.toContain('agentHistoryFrom');
        expect(variables).not.toHaveProperty('agentHistoryFrom');
        // The rest of the document is unchanged — every argument an older server knows is still sent.
        expect(args).toContain('conversationDetailId');
        expect(args).toContain('fireAndForget');
    });

    it('treats a null floor as unset', async () => {
        const { document, variables } = await run(null);

        expect(shape(document).args).not.toContain('agentHistoryFrom');
        expect(variables).not.toHaveProperty('agentHistoryFrom');
    });

    it('declares and passes the argument, ISO-encoded, when a floor is set', async () => {
        const floor = new Date('2026-09-01T12:00:00.000Z');
        const { document, variables } = await run(floor);

        const operation = parse(document).definitions[0] as OperationDefinitionNode;
        const declaration = operation.variableDefinitions?.find((v) => v.variable.name.value === 'agentHistoryFrom');
        expect(declaration?.type.kind).toBe(Kind.NAMED_TYPE); // nullable String
        expect(shape(document).args).toContain('agentHistoryFrom');
        expect(variables.agentHistoryFrom).toBe('2026-09-01T12:00:00.000Z');
    });
});
