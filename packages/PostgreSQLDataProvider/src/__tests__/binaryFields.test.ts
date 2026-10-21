/**
 * Binary (bytea) fields on the PostgreSQL provider.
 *
 * A binary field's value in a BaseEntity is a base64 string. Bound as text to a bytea parameter,
 * PostgreSQL would store the ASCII of the base64 itself, so:
 *  - the positional save binding binds the DECODED bytes (a Buffer);
 *  - the JSON-arg save binding carries canonical base64 of the bytes (the sproc decodes it);
 *  - invalid base64 fails the save rather than storing garbage;
 *  - PGQueryParameterProcessor binds any Uint8Array as a Buffer (bytea), never "1,2,3";
 *  - the transaction group post-processes returned rows through the provider (Buffer → base64),
 *    on both the sequential and the batched path, and the batched path inlines a bytea literal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('pg', () => {
    const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
    };
    const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn().mockResolvedValue(undefined),
    };
    return { default: { Pool: vi.fn(() => mockPool) } };
});

import { BaseEntity, EntityFieldInfo, EntityInfo, Metadata } from '@memberjunction/core';
import type { IMetadataProvider, TransactionItem } from '@memberjunction/core';
import type { SaveCallBinding } from '@memberjunction/generic-database-provider';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import { PostgreSQLTransactionGroup } from '../PostgreSQLTransactionGroup.js';
import { PGQueryParameterProcessor } from '../queryParameterProcessor.js';

type Row = Record<string, unknown>;

const DOC_ENTITY_ID = 'C1000000-0000-0000-0000-000000000001';

/** Exposes the protected save-binding hook; lets a test choose the JSON-arg vs positional shape. */
class BinaryPGProvider extends PostgreSQLDataProvider {
    public ForceJsonArg = false;

    public override UseJsonArgShape(): boolean {
        return this.ForceJsonArg;
    }
    public RenderBindingForTest(entity: BaseEntity, values: Map<EntityFieldInfo, unknown>, isUpdate = false): SaveCallBinding {
        return this.RenderSaveCallBinding(entity, values, isUpdate, 'spCreateDocument');
    }
}

function makeDocumentEntityInfo(): EntityInfo {
    const base = { EntityID: DOC_ENTITY_ID, AllowsNull: true, IsVirtual: false, IsPrimaryKey: false, AllowUpdateAPI: true, Status: 'Active' };
    return new EntityInfo({
        ID: DOC_ENTITY_ID,
        Name: 'Documents',
        Status: 'Active',
        SchemaName: 'docs',
        BaseTable: 'Document',
        BaseTableCodeName: 'Document',
        BaseView: 'vwDocuments',
        EntityFields: [
            { ...base, ID: 'FD000000-0000-0000-0000-000000000001', Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
            { ...base, ID: 'FD000000-0000-0000-0000-000000000002', Sequence: 2, Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false },
            // PG metadata normally reports bytea as varbinary; bytea itself is also recognised.
            { ...base, ID: 'FD000000-0000-0000-0000-000000000003', Sequence: 3, Name: 'Content', Type: 'varbinary', Length: -1 },
            { ...base, ID: 'FD000000-0000-0000-0000-000000000004', Sequence: 4, Name: 'Raw', Type: 'bytea', Length: -1 },
        ],
        EntityPermissions: [],
    });
}

function fieldOf(entityInfo: EntityInfo, name: string): EntityFieldInfo {
    const f = entityInfo.Fields.find(x => x.Name === name);
    if (!f) throw new Error(`fixture field ${name} missing`);
    return f;
}

/** RenderSaveCallBinding only reads EntityInfo (and PrimaryKey on update). */
function fakeEntity(entityInfo: EntityInfo): BaseEntity {
    return { EntityInfo: entityInfo, PrimaryKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'doc-1' }] } } as unknown as BaseEntity;
}

// ═══════════════════════════════════════════════════════════════════════════
// PGQueryParameterProcessor
// ═══════════════════════════════════════════════════════════════════════════
describe('PGQueryParameterProcessor — byte arrays', () => {
    it('binds a plain Uint8Array as a Buffer with the same bytes', () => {
        const result = PGQueryParameterProcessor.ProcessParameterValue(new Uint8Array([1, 2, 255]));
        expect(Buffer.isBuffer(result)).toBe(true);
        expect([...(result as Buffer)]).toEqual([1, 2, 255]);
    });

    it('binds only the viewed range of a Uint8Array view', () => {
        const backing = new Uint8Array([9, 1, 2, 9]);
        const result = PGQueryParameterProcessor.ProcessParameterValue(backing.subarray(1, 3)) as Buffer;
        expect([...result]).toEqual([1, 2]);
    });

    it('binds an empty Uint8Array as an empty Buffer (not "")', () => {
        const result = PGQueryParameterProcessor.ProcessParameterValue(new Uint8Array(0));
        expect(Buffer.isBuffer(result)).toBe(true);
        expect((result as Buffer).length).toBe(0);
    });

    it('still passes a Buffer through by identity', () => {
        const buf = Buffer.from([4, 5]);
        expect(PGQueryParameterProcessor.ProcessParameterValue(buf)).toBe(buf);
    });

    it('applies to every element of ProcessParameters', () => {
        const result = PGQueryParameterProcessor.ProcessParameters(['x', new Uint8Array([7]), null]);
        expect(result[0]).toBe('x');
        expect(Buffer.isBuffer(result[1])).toBe(true);
        expect(result[2]).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// RenderSaveCallBinding — positional shape
// ═══════════════════════════════════════════════════════════════════════════
describe('PostgreSQLDataProvider.RenderSaveCallBinding — positional binary values', () => {
    let entityInfo: EntityInfo;
    let provider: BinaryPGProvider;

    beforeEach(() => {
        entityInfo = makeDocumentEntityInfo();
        provider = new BinaryPGProvider();
        provider.ForceJsonArg = false;
    });

    function render(values: Array<[string, unknown]>): Extract<SaveCallBinding, { kind: 'pg-positional' }> {
        const map = new Map<EntityFieldInfo, unknown>(values.map(([n, v]) => [fieldOf(entityInfo, n), v]));
        const b = provider.RenderBindingForTest(fakeEntity(entityInfo), map);
        if (b.kind !== 'pg-positional') throw new Error(`unexpected binding ${b.kind}`);
        return b;
    }

    it('binds the decoded bytes of a base64 value as a Buffer', () => {
        const b = render([['Name', 'Doc'], ['Content', 'AQL/']]);
        expect(b.values[0]).toBe('Doc');
        expect(Buffer.isBuffer(b.values[1])).toBe(true);
        expect([...(b.values[1] as Buffer)]).toEqual([1, 2, 255]);
        expect(b.callArgsSQL).toContain('p_content => $2');
    });

    it('treats a bytea-typed field the same way', () => {
        const b = render([['Raw', Buffer.from('hi').toString('base64')]]);
        expect((b.values[0] as Buffer).toString('utf8')).toBe('hi');
    });

    it('accepts a byte array value (Buffer or Uint8Array)', () => {
        const fromBuffer = render([['Content', Buffer.from([3, 4])]]);
        expect([...(fromBuffer.values[0] as Buffer)]).toEqual([3, 4]);
        const fromView = render([['Content', new Uint8Array([9, 5, 6, 9]).subarray(1, 3)]]);
        expect(Buffer.isBuffer(fromView.values[0])).toBe(true);
        expect([...(fromView.values[0] as Buffer)]).toEqual([5, 6]);
    });

    it('binds empty base64 as zero bytes', () => {
        const b = render([['Content', '']]);
        expect(Buffer.isBuffer(b.values[0])).toBe(true);
        expect((b.values[0] as Buffer).length).toBe(0);
    });

    it('binds null as null', () => {
        const b = render([['Name', 'Doc'], ['Content', null]]);
        expect(b.values[1]).toBeNull();
    });

    it('throws, naming the field, for a value that is not valid base64', () => {
        expect(() => render([['Content', 'not base64!']])).toThrow(/Field "Content" is binary \(varbinary\).*not valid base64/);
        expect(() => render([['Content', 'A']])).toThrow(/not valid base64/);
    });

    it('throws for a non-string, non-byte-array value', () => {
        expect(() => render([['Content', 123]])).toThrow(/Field "Content" is binary/);
    });

    it('does not decode base64-looking strings on NON-binary fields', () => {
        const b = render([['Name', 'AQID']]);
        expect(b.values[0]).toBe('AQID');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// RenderSaveCallBinding — JSON-arg shape
// ═══════════════════════════════════════════════════════════════════════════
describe('PostgreSQLDataProvider.RenderSaveCallBinding — JSON-arg binary values', () => {
    let entityInfo: EntityInfo;
    let provider: BinaryPGProvider;

    beforeEach(() => {
        entityInfo = makeDocumentEntityInfo();
        provider = new BinaryPGProvider();
        provider.ForceJsonArg = true;
    });

    function payload(values: Array<[string, unknown]>): Row {
        const map = new Map<EntityFieldInfo, unknown>(values.map(([n, v]) => [fieldOf(entityInfo, n), v]));
        const b = provider.RenderBindingForTest(fakeEntity(entityInfo), map);
        if (b.kind !== 'pg-json-arg') throw new Error(`unexpected binding ${b.kind}`);
        expect(b.callArgsSQL).toBe('p_data => $1::jsonb');
        return JSON.parse(b.values[0] as string) as Row;
    }

    it('carries a base64 value as base64 of its bytes', () => {
        expect(payload([['Content', 'AQL/']]).Content).toBe('AQL/');
    });

    it('canonicalises unpadded base64 to padded', () => {
        expect(payload([['Content', 'AQ']]).Content).toBe('AQ==');
    });

    it('encodes a byte array value as base64', () => {
        expect(payload([['Content', new Uint8Array([1, 2, 255])]]).Content).toBe('AQL/');
    });

    it('keeps null as null and empty as empty', () => {
        const p = payload([['Content', null], ['Raw', '']]);
        expect(p.Content).toBeNull();
        expect(p.Raw).toBe('');
    });

    it('throws for invalid base64', () => {
        expect(() => payload([['Content', '@@@@']])).toThrow(/Field "Content" is binary/);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// PostgreSQLTransactionGroup — returned rows are post-processed; bytea literal
// ═══════════════════════════════════════════════════════════════════════════
type QueryCall = { text: string; params?: unknown[] };

function makeClient(answer: (text: string) => unknown) {
    const calls: QueryCall[] = [];
    const client = {
        query: async (text: string, params?: unknown[]) => {
            calls.push({ text, params });
            return answer(text);
        },
        release: () => undefined,
        escapeLiteral: (v: string) => `'${v.replace(/'/g, "''")}'`,
    };
    return { client, calls };
}

function makeItem(entityInfo: EntityInfo, params: unknown[], operation: 'Create' | 'Update' | 'Delete' = 'Create'): TransactionItem {
    return {
        BaseEntity: { EntityInfo: entityInfo, ContextCurrentUser: undefined },
        Instruction: 'SELECT * FROM docs.spcreate_document($1, $2)',
        Vars: params,
        OperationType: operation,
        ExtraData: { dataSource: {}, entityName: entityInfo.Name, parameters: params },
    } as unknown as TransactionItem;
}

type GroupInternals = {
    executeBatched: (items: TransactionItem[], client: unknown, provider: unknown, results: unknown[]) => Promise<void>;
    executeWithoutVariables: (items: TransactionItem[], client: unknown, provider: unknown, results: unknown[]) => Promise<void>;
};

function makeGroup(batched: boolean): GroupInternals {
    const g = new PostgreSQLTransactionGroup();
    g.BatchedSubmit = batched;
    return g as unknown as GroupInternals;
}

describe('PostgreSQLTransactionGroup — binary values', () => {
    let previousProvider: IMetadataProvider;
    let entityInfo: EntityInfo;

    beforeEach(() => {
        previousProvider = Metadata.Provider;
        Metadata.Provider = new BinaryPGProvider();
        entityInfo = makeDocumentEntityInfo();
    });
    afterEach(() => {
        Metadata.Provider = previousProvider;
    });

    it('sequential path: converts a returned bytea Buffer to base64 and binds bytes as a parameter', async () => {
        const { client, calls } = makeClient(() => ({ rows: [{ ID: 'd1', Content: Buffer.from([1, 2, 255]), Raw: null }] }));
        const results: Array<{ Success: boolean; Result: Row }> = [];
        await makeGroup(false).executeWithoutVariables([makeItem(entityInfo, ['Doc', Buffer.from([1, 2, 255])])], client, Metadata.Provider, results);

        expect(calls).toHaveLength(1);
        expect(Buffer.isBuffer(calls[0].params?.[1])).toBe(true);
        expect(results[0].Success).toBe(true);
        expect(results[0].Result.Content).toBe('AQL/');
        expect(results[0].Result.Raw).toBeNull();
    });

    it('sequential path: leaves Delete results alone (no entity row to process)', async () => {
        const raw = Buffer.from([1]);
        const { client } = makeClient(() => ({ rows: [{ ID: 'd1', Content: raw }] }));
        const results: Array<{ Success: boolean; Result: Row }> = [];
        await makeGroup(false).executeWithoutVariables([makeItem(entityInfo, ['d1'], 'Delete')], client, Metadata.Provider, results);
        expect(results[0].Result.Content).toBe(raw);
    });

    it('batched path: inlines a byte-array parameter as a hex bytea literal', async () => {
        const { client, calls } = makeClient(() => [
            { rows: [{ __mj_batch_item: 0 }] },
            { rows: [{ ID: 'd1', Content: Buffer.from([0xab, 0x01]) }] },
        ]);
        const results: Array<{ Success: boolean; Result: Row }> = [];
        await makeGroup(true).executeBatched([makeItem(entityInfo, ['Doc', new Uint8Array([0xab, 0x01])])], client, Metadata.Provider, results);

        expect(calls).toHaveLength(1);
        expect(calls[0].params).toBeUndefined();
        expect(calls[0].text).toContain("'\\xab01'::bytea");
        expect(calls[0].text).toContain("'Doc'");
    });

    it('batched path: an empty byte array inlines as an empty bytea literal', async () => {
        const { client, calls } = makeClient(() => [{ rows: [{ __mj_batch_item: 0 }] }, { rows: [{ ID: 'd1' }] }]);
        await makeGroup(true).executeBatched([makeItem(entityInfo, ['Doc', new Uint8Array(0)])], client, Metadata.Provider, []);
        expect(calls[0].text).toContain("'\\x'::bytea");
    });

    it('batched path: converts each item\'s returned Buffer to base64', async () => {
        const { client } = makeClient(() => [
            { rows: [{ __mj_batch_item: 0 }] },
            { rows: [{ ID: 'd1', Content: Buffer.from([1]) }] },
            { rows: [{ __mj_batch_item: 1 }] },
            { rows: [{ ID: 'd2', Content: Buffer.from([2]) }] },
        ]);
        const results: Array<{ Success: boolean; Result: Row }> = [];
        await makeGroup(true).executeBatched(
            [makeItem(entityInfo, ['A', 'AQ==']), makeItem(entityInfo, ['B', 'Ag=='])],
            client,
            Metadata.Provider,
            results,
        );
        expect(results.map(r => r.Success)).toEqual([true, true]);
        expect(results[0].Result.Content).toBe('AQ==');
        expect(results[1].Result.Content).toBe('Ag==');
    });

    it('batched path: an item that returned no rows is reported unsuccessful and not processed', async () => {
        const { client } = makeClient(() => [
            { rows: [{ __mj_batch_item: 0 }] },
            { rows: [] },
        ]);
        const results: Array<{ Success: boolean; Result: unknown }> = [];
        await makeGroup(true).executeBatched([makeItem(entityInfo, ['A', null])], client, Metadata.Provider, results);
        expect(results[0].Success).toBe(false);
    });
});
