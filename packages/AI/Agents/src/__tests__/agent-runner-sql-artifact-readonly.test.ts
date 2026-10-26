/**
 * Unit tests for AgentRunner re-running the SQL a data artifact stores.
 *
 * A data artifact may hold its SQL but not its rows; before an agent reads it, AgentRunner runs
 * that SQL as ad-hoc SQL for the run's user. It runs on the host's read-only database login when
 * one is registered with the action engine, and on the default provider otherwise. What the SQL
 * may read is the provider's ad-hoc check, covered in GenericDatabaseProvider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const runQueryCalls: Array<{ provider: object | undefined; sql: string | undefined }> = [];
let readOnlyProvider: object | null = null;

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunQuery: class {
            constructor(private readonly provider?: object) {}
            async RunQuery(params: { SQL?: string }) {
                runQueryCalls.push({ provider: this.provider, sql: params.SQL });
                return { Success: true, Results: [{ n: 1 }], RowCount: 1, ExecutionTime: 2 };
            }
        },
    };
});

vi.mock('@memberjunction/actions', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/actions')>();
    return {
        ...actual,
        ActionEngineServer: { get Instance() { return { GetReadOnlyProvider: async () => readOnlyProvider }; } },
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { get Instance() { return { Config: vi.fn(async () => undefined), AgentTypes: [] }; } },
}));

import { AgentRunner } from '../AgentRunner';

/** The private seam, reached through an explicit shape. */
interface SqlHydrationBridge {
    hydrateSqlBackedContent(content: string, contextUser: UserInfo): Promise<string>;
}

const USER = { ID: 'user-1', Email: 'it@example.com' } as unknown as UserInfo;
const CONTENT = JSON.stringify({ metadata: { sql: 'SELECT 1 AS n' }, rows: [] });

function bridge(): SqlHydrationBridge {
    return new AgentRunner({} as unknown as IMetadataProvider) as unknown as SqlHydrationBridge;
}

describe('AgentRunner — stored artifact SQL', () => {
    beforeEach(() => {
        runQueryCalls.length = 0;
        readOnlyProvider = null;
    });

    it('runs on the read-only provider when the host registered one', async () => {
        readOnlyProvider = { name: 'read-only' };
        const out = JSON.parse(await bridge().hydrateSqlBackedContent(CONTENT, USER));
        expect(runQueryCalls).toEqual([{ provider: readOnlyProvider, sql: 'SELECT 1 AS n' }]);
        expect(out.rows).toEqual([{ n: 1 }]);
    });

    it('falls back to the default provider when there is no read-only provider', async () => {
        await bridge().hydrateSqlBackedContent(CONTENT, USER);
        expect(runQueryCalls).toEqual([{ provider: undefined, sql: 'SELECT 1 AS n' }]);
    });

    it('opens no provider for content whose rows are already present', async () => {
        readOnlyProvider = { name: 'read-only' };
        const content = JSON.stringify({ metadata: { sql: 'SELECT 1 AS n' }, rows: [{ n: 5 }] });
        expect(await bridge().hydrateSqlBackedContent(content, USER)).toBe(content);
        expect(runQueryCalls).toEqual([]);
    });
});
