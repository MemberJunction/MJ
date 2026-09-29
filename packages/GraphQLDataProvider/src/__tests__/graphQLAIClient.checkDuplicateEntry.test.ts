import { describe, expect, it, vi, afterEach } from 'vitest';
import { parse, Kind, type OperationDefinitionNode, type FieldNode, type SelectionNode } from 'graphql';
import { GraphQLAIClient } from '../graphQLAIClient';
import { GraphQLDataProvider } from '../graphQLDataProvider';

/**
 * `GraphQLAIClient.CheckDuplicateEntry`: an entity and its entered values out over the
 * `CheckDuplicateEntry` mutation, the flagged candidates back. The method never throws, so every
 * failure below must come back as a result.
 */

/** A successful mutation response, as the server sends it. */
const serverChecked = () => ({
    CheckDuplicateEntry: {
        Status: 'Checked',
        ErrorMessage: null,
        ElapsedMs: 212,
        Candidates: [
            { RecordID: 'acct-7', DisplayName: 'Acme Corp', VectorScore: 0.93, Probability: 0.81 },
            { RecordID: 'acct-9', DisplayName: 'Acme Inc', VectorScore: 0.88, Probability: null },
        ],
    },
});

/** A client over a real provider whose one network call, ExecuteGQL, is replaced. */
function makeClient(response: object | null | Error = serverChecked()) {
    const provider = new GraphQLDataProvider();
    const executeGQL = vi.spyOn(provider, 'ExecuteGQL');
    if (response instanceof Error) {
        executeGQL.mockRejectedValue(response);
    } else {
        executeGQL.mockResolvedValue(response);
    }
    return { client: new GraphQLAIClient(provider), executeGQL };
}

const PARAMS = { EntityName: 'Accounts', Values: { Name: 'Acme', City: 'Boston', Founded: 1999 } };

/** The document's one operation. */
function operationOf(document: string): OperationDefinitionNode {
    const definition = parse(document).definitions[0];
    if (definition?.kind !== Kind.OPERATION_DEFINITION) {
        throw new Error('The document has no operation');
    }
    return definition;
}

/** A selection that must be a field. */
function fieldOf(selection: SelectionNode | undefined): FieldNode {
    if (selection?.kind !== Kind.FIELD) {
        throw new Error('The selection is not a field');
    }
    return selection;
}

/** The names of a field's selected sub-fields. */
const selectedNames = (field: FieldNode): string[] => (field.selectionSet?.selections ?? []).map(s => fieldOf(s).name.value);

afterEach(() => {
    vi.restoreAllMocks();
});

describe('GraphQLAIClient.CheckDuplicateEntry: the request', () => {
    it('calls the CheckDuplicateEntry mutation with both arguments and selects every result field', async () => {
        const { client, executeGQL } = makeClient();

        await client.CheckDuplicateEntry(PARAMS);

        expect(executeGQL).toHaveBeenCalledOnce();
        const operation = operationOf(executeGQL.mock.calls[0][0]);
        const field = fieldOf(operation.selectionSet.selections[0]);
        expect(operation.operation).toBe('mutation');
        expect(field.name.value).toBe('CheckDuplicateEntry');
        expect((field.arguments ?? []).map(a => a.name.value)).toEqual(['entityName', 'valuesJSON']);
        expect(selectedNames(field)).toEqual(['Status', 'ErrorMessage', 'ElapsedMs', 'Candidates']);
        const candidates = fieldOf(field.selectionSet?.selections.find(s => fieldOf(s).name.value === 'Candidates'));
        expect(selectedNames(candidates)).toEqual(['RecordID', 'DisplayName', 'VectorScore', 'Probability']);
    });

    it('sends the entity name and the values as JSON', async () => {
        const { client, executeGQL } = makeClient();

        await client.CheckDuplicateEntry(PARAMS);

        const variables = executeGQL.mock.calls[0][1];
        expect(variables).toEqual({ entityName: 'Accounts', valuesJSON: JSON.stringify(PARAMS.Values) });
        expect(JSON.parse(String(variables.valuesJSON))).toEqual(PARAMS.Values);
    });
});

describe('GraphQLAIClient.CheckDuplicateEntry: the result', () => {
    it('parses the candidates, keeping a null probability', async () => {
        const { client } = makeClient();

        const result = await client.CheckDuplicateEntry(PARAMS);

        expect(result).toEqual({
            Status: 'Checked',
            ElapsedMs: 212,
            Candidates: [
                { RecordID: 'acct-7', DisplayName: 'Acme Corp', VectorScore: 0.93, Probability: 0.81 },
                { RecordID: 'acct-9', DisplayName: 'Acme Inc', VectorScore: 0.88, Probability: null },
            ],
        });
    });

    it('passes NotConfigured through', async () => {
        const { client } = makeClient({ CheckDuplicateEntry: { Status: 'NotConfigured', ErrorMessage: null, ElapsedMs: 4, Candidates: [] } });

        const result = await client.CheckDuplicateEntry(PARAMS);

        expect(result).toEqual({ Status: 'NotConfigured', ElapsedMs: 4, Candidates: [] });
    });

    it('passes a server failure through with its reason', async () => {
        const { client } = makeClient({
            CheckDuplicateEntry: { Status: 'Failed', ErrorMessage: 'Decision failed: overloaded', ElapsedMs: 900, Candidates: [] },
        });

        const result = await client.CheckDuplicateEntry(PARAMS);

        expect(result).toEqual({ Status: 'Failed', ErrorMessage: 'Decision failed: overloaded', ElapsedMs: 900, Candidates: [] });
    });

    it('treats a status it does not know as a failure', async () => {
        const { client } = makeClient({ CheckDuplicateEntry: { Status: 'Maybe', ElapsedMs: 5, Candidates: [] } });

        const result = await client.CheckDuplicateEntry(PARAMS);

        expect(result).toMatchObject({ Status: 'Failed', ErrorMessage: "The server returned an unknown status 'Maybe'", Candidates: [] });
    });

    it('returns Failed, not a throw, on a transport error', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { client } = makeClient(new Error('socket hang up'));

        const result = await client.CheckDuplicateEntry(PARAMS);

        expect(result).toEqual({ Status: 'Failed', ErrorMessage: 'socket hang up', Candidates: [] });
    });

    it('returns Failed on an empty response', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { client } = makeClient(null);

        const result = await client.CheckDuplicateEntry(PARAMS);

        expect(result).toEqual({ Status: 'Failed', ErrorMessage: 'Invalid response from server', Candidates: [] });
    });
});
