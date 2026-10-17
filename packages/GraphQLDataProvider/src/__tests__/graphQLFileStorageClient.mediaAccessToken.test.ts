import { describe, it, expect, vi } from 'vitest';
import { GraphQLFileStorageClient } from '../graphQLFileStorageClient';
import type { GraphQLDataProvider } from '../graphQLDataProvider';

function createClientWithMockExecute(
    impl: (query: string, vars: Record<string, unknown>) => Promise<unknown>,
): { client: GraphQLFileStorageClient; executeGQL: ReturnType<typeof vi.fn> } {
    const executeGQL = vi.fn(impl);
    const fakeProvider = {
        ExecuteGQL: executeGQL,
    } as unknown as GraphQLDataProvider;
    return {
        client: new GraphQLFileStorageClient(fakeProvider),
        executeGQL,
    };
}

describe('GraphQLFileStorageClient.CreateMediaAccessToken', () => {
    it('sends mutation CreateMediaAccessToken($fileId: String!) with { fileId } and returns { Success: true, Url, MimeType }', async () => {
        const { client, executeGQL } = createClientWithMockExecute(async () => ({
            CreateMediaAccessToken: {
                Success: true,
                Url: '/media/file-123?token=abc',
                MimeType: 'image/png',
                ErrorMessage: null,
            },
        }));

        const res = await client.CreateMediaAccessToken('file-123');

        expect(executeGQL).toHaveBeenCalledTimes(1);
        const [mutation, variables] = executeGQL.mock.calls[0] as [string, Record<string, unknown>];
        expect(mutation).toContain('mutation CreateMediaAccessToken($fileId: String!)');
        expect(variables).toEqual({ fileId: 'file-123' });
        expect(res).toEqual({
            Success: true,
            Url: '/media/file-123?token=abc',
            MimeType: 'image/png',
        });
    });

    it('returns { Success: false, ErrorMessage } when server returns Success: false', async () => {
        const { client } = createClientWithMockExecute(async () => ({
            CreateMediaAccessToken: {
                Success: false,
                Url: null,
                MimeType: null,
                ErrorMessage: 'Permission denied',
            },
        }));

        const res = await client.CreateMediaAccessToken('file-456');
        expect(res).toEqual({
            Success: false,
            ErrorMessage: 'Permission denied',
        });
    });

    it('never throws on an empty response and normalizes into { Success: false, ErrorMessage }', async () => {
        const { client } = createClientWithMockExecute(async () => undefined);

        const res = await client.CreateMediaAccessToken('file-789');
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toBeTruthy();
    });

    it('never throws on a transport error and normalizes into { Success: false, ErrorMessage }', async () => {
        const { client } = createClientWithMockExecute(async () => {
            throw new Error('Socket closed');
        });

        const res = await client.CreateMediaAccessToken('file-999');
        expect(res).toEqual({
            Success: false,
            ErrorMessage: 'Socket closed',
        });
    });

    it('returns { Success: false, ErrorMessage } when fileId is empty without calling ExecuteGQL', async () => {
        const { client, executeGQL } = createClientWithMockExecute(async () => ({}));

        const res = await client.CreateMediaAccessToken('   ');
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toBeTruthy();
        expect(executeGQL).not.toHaveBeenCalled();
    });
});
