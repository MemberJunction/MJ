/**
 * QueryEngine's query definition signatures, and the deletion of cached results after an edit.
 *
 * The signature is what RunQuery cache slots are checked against: a hash of everything that can
 * change a query's results (its SQL for the platform, the columns that change how that SQL runs,
 * its parameter definitions, and the signatures of the queries it composes), plus a stamp saying
 * how new that definition is. Descriptive columns must not change it, or a description edit would
 * throw away every cached result of the query.
 *
 * Deleting the slots is housekeeping on the server where the edit was saved: one delete per query
 * and per dependent query, after the edit's burst of saves settles, and only for result-affecting
 * saves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseEntity, BaseEntityEvent, LocalCacheManager } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { QueryEngine } from '../engines/QueryEngine';
import { MJQueryEntityExtended } from '../custom/MJQueryEntityExtended';

const A = 'AAAAAAAA-0000-0000-0000-00000000000A';
const B = 'BBBBBBBB-0000-0000-0000-00000000000B';
const C = 'CCCCCCCC-0000-0000-0000-00000000000C';
const PG_DIALECT = 'DDDDDDDD-0000-0000-0000-0000000000D1';

interface QueryRow {
    ID: string;
    Name: string;
    SQL: string;
    Description: string | null;
    SQLDialectID: string | null;
    UsesTemplate: boolean;
    ExternalDataSourceID: string | null;
    IsMaterialized: boolean;
    CacheValidationSQL: string | null;
    CacheEnabled: boolean;
    __mj_UpdatedAt: Date;
    GetPlatformSQL(platform: string): string;
}

interface ParameterRow { ID: string; QueryID: string; Name: string; Type: string; IsRequired: boolean; DefaultValue: string | null; ValidationFilters: string | null; Description: string | null; SampleValue: string | null; __mj_UpdatedAt: Date }
interface DependencyRow { ID: string; QueryID: string; DependsOnQueryID: string; __mj_UpdatedAt: Date }
interface QuerySQLRow { ID: string; QueryID: string; SQLDialectID: string; SQL: string; __mj_UpdatedAt: Date }

function query(id: string, overrides: Partial<QueryRow> = {}): QueryRow {
    return {
        ID: id,
        Name: `Query ${id.slice(0, 1)}`,
        SQL: `SELECT '${id}' AS Marker`,
        Description: 'A query',
        SQLDialectID: null,
        UsesTemplate: false,
        ExternalDataSourceID: null,
        IsMaterialized: false,
        CacheValidationSQL: null,
        CacheEnabled: false,
        __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'),
        // The real resolution (a dialect row for the platform, else the base SQL), against the engine.
        GetPlatformSQL(platform: string): string {
            return MJQueryEntityExtended.prototype.GetPlatformSQL.call(this as unknown as MJQueryEntityExtended, platform as 'sqlserver');
        },
        ...overrides,
    };
}

function parameter(queryID: string, overrides: Partial<ParameterRow> = {}): ParameterRow {
    return {
        ID: `${queryID}-p`, QueryID: queryID, Name: 'region', Type: 'string', IsRequired: false, DefaultValue: null,
        ValidationFilters: null, Description: 'Region', SampleValue: 'West', __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'), ...overrides,
    };
}

function dependency(queryID: string, dependsOn: string): DependencyRow {
    return { ID: `${queryID}->${dependsOn}`, QueryID: queryID, DependsOnQueryID: dependsOn, __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z') };
}

/** The engine's private arrays, set the way a load would set them. */
interface EngineData {
    _queries: QueryRow[];
    _parameters: ParameterRow[];
    _dependencies: DependencyRow[];
    _querySQLs: QuerySQLRow[];
    _sqlDialects: Array<{ ID: string; PlatformKey: string }>;
}

/** The protected members the tests drive. */
interface EngineInternals {
    emitPropertyChange(propertyName: string): void;
    HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean>;
}

let engine: QueryEngine;
let data: EngineData;

function resetEngine(): void {
    delete GetGlobalObjectStore()['___SINGLETON__QueryEngine'];
    engine = QueryEngine.Instance;
    data = engine as unknown as EngineData;
    data._queries = [query(A), query(B), query(C)];
    data._parameters = [parameter(A)];
    data._dependencies = [];
    data._querySQLs = [];
    data._sqlDialects = [{ ID: PG_DIALECT, PlatformKey: 'postgresql' }];
}

/** Announces that an engine property changed, as a load or an applied event does. */
function changed(propertyName: keyof EngineData): void {
    (engine as unknown as EngineInternals).emitPropertyChange(propertyName);
}

function hashOf(id: string, platform: 'sqlserver' | 'postgresql' = 'sqlserver'): string | undefined {
    return engine.GetDefinitionSignature(id, platform)?.Hash;
}

describe('QueryEngine.GetDefinitionSignature', () => {
    beforeEach(resetEngine);
    afterEach(() => {
        delete GetGlobalObjectStore()['___SINGLETON__QueryEngine'];
    });

    it('is stable for an unchanged definition, and undefined for an unknown query', () => {
        const first = engine.GetDefinitionSignature(A, 'sqlserver');
        changed('_queries');
        expect(engine.GetDefinitionSignature(A, 'sqlserver')).toEqual(first);
        expect(engine.GetDefinitionSignature('EEEEEEEE-0000-0000-0000-00000000000E', 'sqlserver')).toBeUndefined();
    });

    const resultAffectingQueryEdits: Array<[string, Partial<QueryRow>]> = [
        ['SQL', { SQL: "SELECT 'edited' AS Marker" }],
        ['SQLDialectID', { SQLDialectID: PG_DIALECT }],
        ['UsesTemplate', { UsesTemplate: true }],
        ['ExternalDataSourceID', { ExternalDataSourceID: 'FFFFFFFF-0000-0000-0000-00000000000F' }],
        ['IsMaterialized', { IsMaterialized: true }],
        ['CacheValidationSQL', { CacheValidationSQL: 'SELECT COUNT(*) AS RowCount FROM x' }],
    ];
    it.each(resultAffectingQueryEdits)('changes when the query\'s %s changes', (_column, edit) => {
        const before = hashOf(A);
        Object.assign(data._queries[0], edit);
        changed('_queries');
        expect(hashOf(A)).not.toBe(before);
    });

    it('does not change for descriptive or cache-policy edits', () => {
        const before = engine.GetDefinitionSignature(A, 'sqlserver');
        Object.assign(data._queries[0], { Description: 'Reworded', Name: 'Renamed', CacheEnabled: true, __mj_UpdatedAt: new Date('2026-03-01T00:00:00Z') });
        // DefaultValue is informational: QueryParameterProcessor never applies it.
        Object.assign(data._parameters[0], { Description: 'Reworded', SampleValue: 'East', DefaultValue: 'West' });
        changed('_queries');
        changed('_parameters');
        const after = engine.GetDefinitionSignature(A, 'sqlserver');
        expect(after?.Hash).toBe(before?.Hash);
        // The stamp still moves, so a peer can tell which definition is newer.
        expect(after?.Stamp).toBe('2026-03-01T00:00:00.000Z');
    });

    const resultAffectingParameterEdits: Array<[string, Partial<ParameterRow>]> = [
        ['Name', { Name: 'territory' }],
        ['Type', { Type: 'number' }],
        ['IsRequired', { IsRequired: true }],
        ['ValidationFilters', { ValidationFilters: '[{"Type":"Length"}]' }],
    ];
    it.each(resultAffectingParameterEdits)('changes when a parameter\'s %s changes', (_column, edit) => {
        const before = hashOf(A);
        Object.assign(data._parameters[0], edit);
        changed('_parameters');
        expect(hashOf(A)).not.toBe(before);
    });

    it('changes when a parameter is added or removed', () => {
        const before = hashOf(A);
        data._parameters.push(parameter(A, { ID: 'p2', Name: 'year' }));
        changed('_parameters');
        const added = hashOf(A);
        data._parameters = [];
        changed('_parameters');
        expect(new Set([before, added, hashOf(A)]).size).toBe(3);
    });

    it('uses the dialect row for the platform, and only that platform', () => {
        const sqlServerBefore = hashOf(A, 'sqlserver');
        const postgresBefore = hashOf(A, 'postgresql');
        data._querySQLs = [{ ID: 's1', QueryID: A, SQLDialectID: PG_DIALECT, SQL: 'SELECT 1 AS "Marker"', __mj_UpdatedAt: new Date('2026-01-02T00:00:00Z') }];
        changed('_querySQLs');
        expect(hashOf(A, 'postgresql')).not.toBe(postgresBefore);
        expect(hashOf(A, 'sqlserver')).toBe(sqlServerBefore);
    });

    it('propagates a composed query\'s edit to every query that composes it, transitively', () => {
        data._dependencies = [dependency(A, B), dependency(B, C)];
        changed('_dependencies');
        const [a, b] = [hashOf(A), hashOf(B)];

        data._queries[2].SQL = "SELECT 'edited' AS Marker";
        changed('_queries');

        expect(hashOf(B)).not.toBe(b);
        expect(hashOf(A)).not.toBe(a);
    });

    it('changes when a dependency is added', () => {
        const before = hashOf(A);
        data._dependencies = [dependency(A, B)];
        changed('_dependencies');
        expect(hashOf(A)).not.toBe(before);
    });

    it('terminates on a composition cycle and gives each query the same hash whichever is computed first', () => {
        data._dependencies = [dependency(A, B), dependency(B, A)];
        changed('_dependencies');
        // A first: B is computed inside A's walk. B is then asked for without clearing anything.
        const aFirst = [hashOf(A), hashOf(B)];
        changed('_dependencies');
        // B first, from nothing.
        const b = hashOf(B);
        const a = hashOf(A);
        expect(aFirst[0]).toBeDefined();
        expect([a, b]).toEqual(aFirst);
    });
});

/** A save or delete event as BaseEntity raises it, for a record with the given dirty columns. */
function entityEvent(type: BaseEntityEvent['type'], entityName: string, values: Record<string, unknown>, dirty: string[] = [], isSaved = true): BaseEntityEvent {
    const record = {
        EntityInfo: { Name: entityName },
        IsSaved: isSaved,
        GetFieldByName: (name: string) => (name in values || dirty.includes(name)) ? { Value: values[name], Dirty: dirty.includes(name) } : undefined,
    };
    const event = new BaseEntityEvent();
    event.type = type;
    event.baseEntity = record as unknown as BaseEntity;
    event.payload = type === 'delete' ? { OldValues: values } : null;
    return event;
}

/** Raises save_started then save for one record, the way a successful Save() does. */
async function save(entityName: string, values: Record<string, unknown>, dirty: string[], isSaved = true): Promise<void> {
    const internals = engine as unknown as EngineInternals;
    const started = entityEvent('save_started', entityName, values, dirty, isSaved);
    await internals.HandleIndividualBaseEntityEvent(started);
    const finished = entityEvent('save', entityName, values, [], true);
    finished.baseEntity = started.baseEntity;
    await internals.HandleIndividualBaseEntityEvent(finished);
}

describe('QueryEngine deletes cached results after a local edit', () => {
    let invalidate: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        resetEngine();
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);
        invalidate = vi.spyOn(LocalCacheManager.Instance, 'InvalidateRunQueryResultsForQuery').mockResolvedValue(1);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        delete GetGlobalObjectStore()['___SINGLETON__QueryEngine'];
    });

    function invalidated(): string[] {
        return invalidate.mock.calls.map(([id]) => String(id)).sort();
    }

    it('deletes once, after the burst of saves settles', async () => {
        await save('MJ: Queries', { ID: A }, ['SQL']);
        await vi.advanceTimersByTimeAsync(1000);
        await save('MJ: Query Parameters', { QueryID: A }, [], false);
        await save('MJ: Queries', { ID: A }, ['UsesTemplate']);
        expect(invalidate).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(3000);
        expect(invalidated()).toEqual([A]);
    });

    it('also deletes the slots of every query that composes the edited one', async () => {
        data._dependencies = [dependency(A, B), dependency(B, C)];
        changed('_dependencies');

        await save('MJ: Queries', { ID: C }, ['SQL']);
        await vi.advanceTimersByTimeAsync(3000);

        expect(invalidated()).toEqual([A, B, C].sort());
    });

    it('ignores a description-only edit', async () => {
        await save('MJ: Queries', { ID: A }, ['Description', 'UserQuestion']);
        await save('MJ: Query Parameters', { QueryID: A }, ['Description', 'SampleValue', 'DefaultValue']);
        await vi.advanceTimersByTimeAsync(5000);

        expect(invalidate).not.toHaveBeenCalled();
    });

    it('counts a result-affecting parameter edit, a dialect row and a deleted dependency', async () => {
        await save('MJ: Query Parameters', { QueryID: A }, ['ValidationFilters']);
        await save('MJ: Query SQLs', { QueryID: B }, ['SQL']);
        await (engine as unknown as EngineInternals).HandleIndividualBaseEntityEvent(entityEvent('delete', 'MJ: Query Dependencies', { QueryID: C }));
        await vi.advanceTimersByTimeAsync(3000);

        expect(invalidated()).toEqual([A, B, C].sort());
    });

    it('does nothing for a save that never finished', async () => {
        await (engine as unknown as EngineInternals).HandleIndividualBaseEntityEvent(entityEvent('save_started', 'MJ: Queries', { ID: A }, ['SQL']));
        await vi.advanceTimersByTimeAsync(5000);

        expect(invalidate).not.toHaveBeenCalled();
    });
});
