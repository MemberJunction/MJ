import { describe, it, expect, beforeEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { IMetadataProvider, RunViewResult } from '../generic/interfaces';

/**
 * BaseEngine.GetStateCensus: a read-only snapshot of the rows an engine holds
 * and the state it derived from them, comparable across processes.
 */

class CensusEngine extends BaseEngine<CensusEngine> {
    public _widgets: Array<Record<string, unknown>> = [];
    public _plain: Array<Record<string, unknown>> = [];
    public Groups = 0;

    public async Config(): Promise<void> {
        // configs are injected directly
    }

    public Bind(provider: IMetadataProvider): void {
        (this as unknown as { _provider: IMetadataProvider })._provider = provider;
    }

    public Hold(config: BaseEnginePropertyConfig, rows: unknown[]): void {
        this.HandleSingleViewResult(config, { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' } as RunViewResult);
    }

    protected override GetDerivedStateCensus(): Record<string, number> {
        return { Groups: this.Groups };
    }
}

const WIDGETS = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Widgets', PropertyName: '_widgets', ResultType: 'simple' });
const PLAIN = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Plain', PropertyName: '_plain', ResultType: 'simple' });

function provider(): IMetadataProvider {
    const withStamp = { PrimaryKeys: [{ Name: 'ID' }], Fields: [{ IsUpdatedAtField: true }] };
    const without = { PrimaryKeys: [{ Name: 'ID' }], Fields: [] };
    return { EntityByName: (name: string) => (name === 'Widgets' ? withStamp : without) } as unknown as IMetadataProvider;
}

function newEngine(): CensusEngine {
    delete (GetGlobalObjectStore() as Record<string, unknown>)['___SINGLETON__CensusEngine'];
    const engine = new CensusEngine();
    engine.Bind(provider());
    return engine;
}

describe('BaseEngine.GetStateCensus', () => {
    let engine: CensusEngine;

    beforeEach(() => {
        engine = newEngine();
    });

    it('reports count, newest timestamp and a row-version hash per property, plus derived counts', () => {
        engine.Hold(WIDGETS, [
            { ID: 'a', __mj_UpdatedAt: new Date('2026-01-01T00:00:00.000Z') },
            { ID: 'b', __mj_UpdatedAt: new Date('2026-03-01T00:00:00.000Z') },
        ]);
        engine.Groups = 7;

        const census = engine.GetStateCensus();

        expect(census.EngineClass).toBe('CensusEngine');
        expect(census.Derived).toEqual({ Groups: 7 });
        expect(census.Properties).toHaveLength(1);
        expect(census.Properties[0]).toMatchObject({
            PropertyName: '_widgets', EntityName: 'Widgets', RowCount: 2,
            MaxUpdatedAt: '2026-03-01T00:00:00.000Z', LoadedSuccessfully: true, PermissionDenied: false,
        });
        expect(census.Properties[0].IdentityHash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('gives the same hash for the same row versions regardless of order or date representation', () => {
        engine.Hold(WIDGETS, [
            { ID: 'a', __mj_UpdatedAt: new Date('2026-01-01T00:00:00.000Z') },
            { ID: 'b', __mj_UpdatedAt: new Date('2026-03-01T00:00:00.000Z') },
        ]);
        const other = newEngine();
        other.Hold(WIDGETS, [
            { ID: 'B', __mj_UpdatedAt: '2026-03-01T00:00:00.000Z' },
            { ID: 'A', __mj_UpdatedAt: '2026-01-01T00:00:00.000Z' },
        ]);
        expect(other.GetStateCensus().Properties[0].IdentityHash)
            .toBe(engine.GetStateCensus().Properties[0].IdentityHash);
    });

    it('changes the hash when one row version changes', () => {
        engine.Hold(WIDGETS, [{ ID: 'a', __mj_UpdatedAt: '2026-01-01T00:00:00.000Z' }]);
        const before = engine.GetStateCensus().Properties[0].IdentityHash;
        engine.Hold(WIDGETS, [{ ID: 'a', __mj_UpdatedAt: '2026-01-01T00:00:00.001Z' }]);
        expect(engine.GetStateCensus().Properties[0].IdentityHash).not.toBe(before);
    });

    it('reports a null hash and timestamp for an entity without __mj_UpdatedAt', () => {
        engine.Hold(PLAIN, [{ ID: 'x' }]);
        expect(engine.GetStateCensus().Properties[0]).toMatchObject({ RowCount: 1, IdentityHash: null, MaxUpdatedAt: null });
    });

    it('returns an empty derived map by default', () => {
        class Bare extends BaseEngine<Bare> {
            public async Config(): Promise<void> { /* none */ }
        }
        delete (GetGlobalObjectStore() as Record<string, unknown>)['___SINGLETON__Bare'];
        expect(new Bare().GetStateCensus()).toMatchObject({ Properties: [], Derived: {}, Loaded: false });
    });
});
