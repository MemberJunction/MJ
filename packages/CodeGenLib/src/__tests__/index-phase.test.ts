import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import type { CodeGenConnection } from '../Database/codeGenDatabaseProvider';

/**
 * PostgreSQL CodeGen builds the foreign-key and soft-PK index SQL and writes it to the entity's
 * index file, but the phased executor had no index phase, so on PostgreSQL the indexes were never
 * created (#5217). These tests pin the phase: where it runs, one statement per call, a failing
 * index not stopping permissions, and invalid indexes being reported.
 */

const warnings = vi.hoisted(() => ({ messages: [] as string[] }));
vi.mock('../Misc/status_logging', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../Misc/status_logging')>();
    return { ...actual, LogWarning: (msg: string) => { warnings.messages.push(msg); } };
});

function makeEntity(): EntityInfo {
    return new EntityInfo({
        ID: 'entity-1',
        Name: 'Orders',
        SchemaName: 'sales',
        BaseTable: 'Order',
        BaseTableCodeName: 'Order',
        BaseView: 'vwOrders',
        IncludeInAPI: true,
        AllowCreateAPI: false,
        AllowUpdateAPI: false,
        AllowDeleteAPI: false,
        EntityFields: [
            { ID: 'f-1', Name: 'ID', Type: 'uuid', Length: 16, IsPrimaryKey: true, AllowsNull: false, IsVirtual: false },
            { ID: 'f-2', Name: 'CustomerID', Type: 'uuid', Length: 16, IsPrimaryKey: false, AllowsNull: false, IsVirtual: false, RelatedEntityID: 'entity-2' },
        ],
        EntityPermissions: [],
    });
}

type QueryResult = { rows: Record<string, unknown>[] };
type RecordingClient = { query: (sql: string) => Promise<QueryResult>; release: () => void };

function useClient(provider: PostgreSQLCodeGenProvider, client: RecordingClient): void {
    vi.spyOn(
        provider as unknown as { acquireCodeGenClient: () => Promise<RecordingClient> },
        'acquireCodeGenClient'
    ).mockResolvedValue(client);
}

function recordingClient(log: string[], opts: { failOn?: string; invalidIndexes?: string[] } = {}): RecordingClient {
    return {
        query: async (sql: string) => {
            log.push(sql);
            if (opts.failOn && sql.includes(opts.failOn)) {
                throw new Error(`42P01: failed on ${opts.failOn}`);
            }
            if (sql.includes('indisvalid')) {
                return { rows: (opts.invalidIndexes ?? []).map(name => ({ IndexName: name })) };
            }
            return { rows: [] };
        },
        release: () => undefined,
    };
}

const BASE = {
    tvfSQL: '',
    viewSQL: '-- VIEW MARKER',
    crudCreateSQL: '',
    crudUpdateSQL: '',
    crudDeleteSQL: '',
    ftsSQL: '-- FTS MARKER',
    viewPermSQL: '-- PERM MARKER',
};

describe('PostgreSQL index phase', () => {
    let provider: PostgreSQLCodeGenProvider;

    beforeEach(() => {
        vi.restoreAllMocks();
        warnings.messages.length = 0;
        provider = new PostgreSQLCodeGenProvider();
    });

    it('runs after full-text and before permissions, one statement per call', async () => {
        const log: string[] = [];
        useClient(provider, recordingClient(log));

        const result = await provider.executeEntityPhased!({
            ...BASE,
            entity: makeEntity(),
            indexStatements: ['CREATE INDEX IF NOT EXISTS IDX_A ON t (a)', 'CREATE INDEX IF NOT EXISTS IDX_B ON t (b)'],
        });

        expect(result).toEqual({ success: true, phase: null });
        const at = (marker: string): number => log.findIndex(sql => sql.includes(marker));
        expect(at('IDX_A')).toBeGreaterThan(at('FTS MARKER'));
        expect(at('IDX_B')).toBeGreaterThan(at('IDX_A'));
        expect(at('PERM MARKER')).toBeGreaterThan(at('IDX_B'));
        expect(log.filter(sql => sql.includes('CREATE INDEX'))).toEqual([
            'CREATE INDEX IF NOT EXISTS IDX_A ON t (a)',
            'CREATE INDEX IF NOT EXISTS IDX_B ON t (b)',
        ]);
    });

    it('reports a failed index as phase "indexes" but still runs the other indexes and the permissions', async () => {
        const log: string[] = [];
        useClient(provider, recordingClient(log, { failOn: 'IDX_A' }));

        const result = await provider.executeEntityPhased!({
            ...BASE,
            entity: makeEntity(),
            indexStatements: ['CREATE INDEX IF NOT EXISTS IDX_A ON t (a)', 'CREATE INDEX IF NOT EXISTS IDX_B ON t (b)'],
        });

        expect(result.success).toBe(false);
        expect(result.phase).toBe('indexes');
        expect(result.error?.message).toMatch(/1 of 2 index statement\(s\) failed on sales\.Order/);
        expect(log.some(sql => sql.includes('IDX_B'))).toBe(true);
        expect(log.some(sql => sql.includes('PERM MARKER'))).toBe(true);
    });

    it('reports an invalid index left on the table', async () => {
        const log: string[] = [];
        useClient(provider, recordingClient(log, { invalidIndexes: ['IDX_Order_CustomerID'] }));

        const result = await provider.executeEntityPhased!({
            ...BASE,
            entity: makeEntity(),
            indexStatements: ['CREATE INDEX IF NOT EXISTS IDX_A ON t (a)'],
        });

        expect(result.success).toBe(true);
        expect(warnings.messages.some(m => m.includes('IDX_Order_CustomerID') && m.includes('REINDEX'))).toBe(true);
    });

    it('skips the phase when there is nothing to index', async () => {
        const log: string[] = [];
        useClient(provider, recordingClient(log));

        await provider.executeEntityPhased!({ ...BASE, entity: makeEntity(), indexStatements: [] });

        expect(log).toEqual(['-- VIEW MARKER', '-- FTS MARKER', '-- PERM MARKER']);
    });
});

describe('ExecuteEntityInPhases hands the index statements to the provider', () => {
    it('passes the same statements the index file is built from', async () => {
        const provider = new PostgreSQLCodeGenProvider();
        const codeGen = new SQLCodeGenBase();
        codeGen.DBProvider = provider;
        vi.spyOn(codeGen, 'BuildEntityIndexStatements').mockReturnValue(['CREATE INDEX IF NOT EXISTS IDX_FK ON t (fk)', '', 'CREATE INDEX IF NOT EXISTS IDX_SOFT ON t (a, b)']);
        vi.spyOn(codeGen as unknown as { GenerateBaseViewPieces: () => Promise<{ viewSQL: string; viewPermSQL: string }> }, 'GenerateBaseViewPieces')
            .mockResolvedValue({ viewSQL: '', viewPermSQL: '' });
        const phased = vi.spyOn(provider, 'executeEntityPhased').mockResolvedValue({ success: true, phase: null });

        await codeGen.ExecuteEntityInPhases({} as unknown as CodeGenConnection, makeEntity(), undefined);

        expect(phased.mock.calls[0][0].indexStatements).toEqual([
            'CREATE INDEX IF NOT EXISTS IDX_FK ON t (fk)',
            'CREATE INDEX IF NOT EXISTS IDX_SOFT ON t (a, b)',
        ]);
    });
});
