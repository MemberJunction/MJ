import { describe, it, expect } from 'vitest';
import { VectorDBBase } from '../generic/VectorDBBase';
import { IsColocatedVectorHost, IColocatedVectorHost, ValidateSqlIdentifier } from '../generic/colocated.types';
import { BaseResponse, IndexList, ListVectorIDsResult } from '../generic/record';

/** Minimal concrete VectorDBBase for exercising the base-class colocated surface. */
class StubVectorDB extends VectorDBBase {
    constructor() { super('stub'); }
    private ok(): BaseResponse { return { success: true, message: '', data: null }; }
    ListIndexes(): IndexList { return { indexes: [] }; }
    GetIndex(): BaseResponse { return this.ok(); }
    CreateIndex(): BaseResponse { return this.ok(); }
    DeleteIndex(): BaseResponse { return this.ok(); }
    EditIndex(): BaseResponse { return this.ok(); }
    QueryIndex(): BaseResponse { return this.ok(); }
    CreateRecord(): BaseResponse { return this.ok(); }
    CreateRecords(): BaseResponse { return this.ok(); }
    GetRecord(): BaseResponse { return this.ok(); }
    GetRecords(): BaseResponse { return this.ok(); }
    UpdateRecord(): BaseResponse { return this.ok(); }
    UpdateRecords(): BaseResponse { return this.ok(); }
    DeleteRecord(): BaseResponse { return this.ok(); }
    DeleteRecords(): BaseResponse { return this.ok(); }
    DeleteAllRecords(): BaseResponse { return this.ok(); }
    async ListVectorIDs(): Promise<ListVectorIDsResult> { return { IDs: [] }; }
}

const fakeHost: IColocatedVectorHost = {
    ColocatedDialect: 'postgresql',
    ColocatedSchema: '__mj',
    RunColocatedSQL: async <T = Record<string, unknown>>() => [] as T[],
};

describe('IsColocatedVectorHost', () => {
    it('accepts a well-formed host', () => {
        expect(IsColocatedVectorHost(fakeHost)).toBe(true);
        expect(IsColocatedVectorHost({ ...fakeHost, ColocatedDialect: 'sqlserver' })).toBe(true);
    });
    it('rejects malformed / non-host values', () => {
        expect(IsColocatedVectorHost(null)).toBe(false);
        expect(IsColocatedVectorHost({})).toBe(false);
        // structural guard: dialect must be a string, schema a string, RunColocatedSQL a function
        expect(IsColocatedVectorHost({ ColocatedDialect: 123, ColocatedSchema: 'x', RunColocatedSQL: () => [] })).toBe(false);
        expect(IsColocatedVectorHost({ ColocatedSchema: 'x', RunColocatedSQL: () => [] })).toBe(false);
        expect(IsColocatedVectorHost({ ColocatedDialect: 'postgresql', ColocatedSchema: 'x' })).toBe(false);
    });
});

describe('ValidateSqlIdentifier', () => {
    it('accepts valid identifiers', () => {
        for (const ok of ['ID', '__mj', 'Embedding', 'content_vec', '_mj_vector_indexes', 'Title']) {
            expect(ValidateSqlIdentifier(ok)).toBe(ok);
        }
    });
    it('throws on injection / invalid identifiers', () => {
        for (const bad of ['x; DROP TABLE y', 'a]) OR 1=1 --', "a' OR '1", 'has space', '1leading', 'a.b', '']) {
            expect(() => ValidateSqlIdentifier(bad)).toThrow(/Invalid SQL/);
        }
    });
});

describe('VectorDBBase colocated defaults', () => {
    it('does not support colocated queries by default', () => {
        expect(new StubVectorDB().SupportsColocatedQuery).toBe(false);
    });
    it('ColocatedQuery throws on a non-colocated provider', async () => {
        await expect(new StubVectorDB().ColocatedQuery({ indexName: 'i', topK: 5 })).rejects.toThrow(/not supported/i);
    });
    it('TryWireColocatedHost is a no-op when SupportsColocatedQuery is false', () => {
        expect(new StubVectorDB().TryWireColocatedHost(fakeHost)).toBe(false);
    });
    it('requires an API key by default (external cloud providers)', () => {
        expect(new StubVectorDB().RequiresAPIKey).toBe(true);
    });
});
