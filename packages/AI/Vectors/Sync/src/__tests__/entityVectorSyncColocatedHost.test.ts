/**
 * #4910 — `new EntityVectorSyncer()` with no provider must still be able to wire a colocated
 * vector database (SQLServerVectorDatabase, PgVectorColocatedDatabase).
 *
 * The syncer hands `this.Provider` to `VectorDBBase.TryWireColocatedHost`, which only wires a host
 * that passes `IsColocatedVectorHost`. With no provider, `Provider` used to return the `Metadata`
 * wrapper, which fails that check, so every upsert threw "requires a host connection". It must
 * return the global provider itself.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Metadata, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import {
    VectorDBBase,
    type BaseResponse,
    type IColocatedVectorHost,
    type IndexList,
    type ListVectorIDsResult,
} from '@memberjunction/ai-vectordb';
import { EntityVectorSyncer } from '../models/entityVectorSync';

/** A concrete colocated VectorDBBase: only the colocated surface matters here. */
class StubColocatedVectorDB extends VectorDBBase {
    constructor() { super('colocated'); }
    public override get SupportsColocatedQuery(): boolean { return true; }
    /** The host `TryWireColocatedHost` stored, surfaced for assertions. */
    public get WiredHost(): IColocatedVectorHost | undefined { return this.ColocatedHost; }
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

/** Stands in for the SQL Server data provider, which is both the metadata provider and the colocated host. */
function colocatedHostProvider(): IMetadataProvider & IColocatedVectorHost {
    return {
        ColocatedDialect: 'sqlserver',
        ColocatedSchema: '__mj',
        RunColocatedSQL: async <T = Record<string, unknown>>() => [] as T[],
        CurrentUser: new UserInfo(),
        Entities: [],
    } as IMetadataProvider & IColocatedVectorHost;
}

describe('EntityVectorSyncer colocated host wiring (#4910)', () => {
    let savedGlobalProvider: IMetadataProvider;

    beforeEach(() => {
        savedGlobalProvider = Metadata.Provider;
    });

    afterEach(() => {
        Metadata.Provider = savedGlobalProvider;
    });

    it('wires a colocated vector DB when constructed with no provider', () => {
        const globalHost = colocatedHostProvider();
        Metadata.Provider = globalHost;

        const syncer = new EntityVectorSyncer();
        const vectorDB = new StubColocatedVectorDB();

        expect(syncer.Provider).toBe(globalHost);
        expect(vectorDB.TryWireColocatedHost(syncer.Provider)).toBe(true);
        expect(vectorDB.WiredHost).toBe(globalHost);
    });

    it('does not wire the Metadata wrapper, which is what the syncer used to hand over', () => {
        Metadata.Provider = colocatedHostProvider();
        const vectorDB = new StubColocatedVectorDB();

        expect(vectorDB.TryWireColocatedHost(new Metadata())).toBe(false);
        expect(vectorDB.WiredHost).toBeUndefined();
    });

    it('wires the explicit provider, not the global one, when one is passed', () => {
        Metadata.Provider = colocatedHostProvider();
        const requestHost = colocatedHostProvider();

        const syncer = new EntityVectorSyncer(requestHost);
        const vectorDB = new StubColocatedVectorDB();

        expect(syncer.Provider).toBe(requestHost);
        expect(vectorDB.TryWireColocatedHost(syncer.Provider)).toBe(true);
        expect(vectorDB.WiredHost).toBe(requestHost);
    });
});
