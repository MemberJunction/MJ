/**
 * `RunViewParams.CoerceTypes` — typing RAW rows, opt-in.
 *
 * WHY THIS OPTION EXISTS. `'simple'` returns the transport's own shape, so a `DATETIME` column
 * arrives as an ISO string while the generated entity type says `Date`. `RunView<T>` takes a
 * caller-supplied `T` with no relationship to `ResultType`, so declaring the entity type on a simple
 * read compiles perfectly and is wrong at runtime — and wrong in the quiet way: a date compared with
 * `<` against a string, or sorted with `localeCompare`, produces an ORDER rather than an error.
 *
 * WHY IT IS OFF BY DEFAULT. The inverse is equally silent. Code reading these values as strings is
 * correct today, and defaulting this on would hand it `Date`s with no compiler involvement.
 *
 * The test that matters most is the last one: coercion must not write into rows the CACHE owns.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { EntityInfo, EntityFieldTSType } from '../generic/entityInfo';
import type { RunViewParams, RunViewResult } from '../views/runView';

const ENTITY = 'MJ: Test Orders';

/** EntityInfo stub carrying just the field TSTypes coercion reads. */
function makeEntityInfo(): EntityInfo {
    const info = Object.create(EntityInfo.prototype);
    info.ID = 'e1';
    info.Name = ENTITY;
    const fields = [
        { Name: 'ID', CodeName: 'ID', TSType: EntityFieldTSType.String },
        { Name: 'OrderDate', CodeName: 'OrderDate', TSType: EntityFieldTSType.Date },
        { Name: 'DueDate', CodeName: 'DueDate', TSType: EntityFieldTSType.Date },
        { Name: 'Balance', CodeName: 'Balance', TSType: EntityFieldTSType.Number },
        { Name: 'Status', CodeName: 'Status', TSType: EntityFieldTSType.String },
    ];
    Object.defineProperty(info, 'Fields', { get: () => fields, configurable: true });
    return info as EntityInfo;
}

/** The narrowest possible ProviderBase: coercion only reads `Entities`. */
class TestProvider extends ProviderBase {
    private readonly entities: EntityInfo[] = [makeEntityInfo()];
    public override get Entities(): EntityInfo[] {
        return this.entities;
    }
    /** `CoerceSimpleRowTypes` is protected; this is the seam under test. */
    public Coerce(param: RunViewParams, result: RunViewResult): void {
        this.CoerceSimpleRowTypes(param, result);
    }
}

let provider: TestProvider;

beforeEach(() => {
    provider = Object.create(TestProvider.prototype) as TestProvider;
    Object.defineProperty(provider, 'entities', { value: [makeEntityInfo()], writable: false });
    Object.defineProperty(provider, 'Entities', { get: () => [makeEntityInfo()], configurable: true });
});

function resultOf(rows: Array<Record<string, unknown>>): RunViewResult {
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length } as RunViewResult;
}

describe('CoerceTypes — off by default', () => {
    it('leaves rows exactly as the transport delivered them', () => {
        const result = resultOf([{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z', Balance: '12.50' }]);
        provider.Coerce({ EntityName: ENTITY, ResultType: 'simple' }, result);

        // The whole point of the default: code written against strings keeps working.
        expect(typeof result.Results[0].OrderDate).toBe('string');
        expect(typeof result.Results[0].Balance).toBe('string');
    });

    it('is also off when ResultType is omitted, which means simple', () => {
        const result = resultOf([{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z' }]);
        provider.Coerce({ EntityName: ENTITY }, result);
        expect(typeof result.Results[0].OrderDate).toBe('string');
    });
});

describe('CoerceTypes — on', () => {
    it('turns date columns into real Dates', () => {
        const result = resultOf([{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z', DueDate: '2026-09-01T00:00:00.000Z' }]);
        provider.Coerce({ EntityName: ENTITY, ResultType: 'simple', CoerceTypes: true }, result);

        expect(result.Results[0].OrderDate).toBeInstanceOf(Date);
        expect((result.Results[0].OrderDate as Date).getUTCFullYear()).toBe(2026);
        expect(result.Results[0].DueDate).toBeInstanceOf(Date);
    });

    it('turns numeric columns into numbers', () => {
        const result = resultOf([{ ID: 'a', Balance: '12.50' }]);
        provider.Coerce({ EntityName: ENTITY, ResultType: 'simple', CoerceTypes: true }, result);
        expect(result.Results[0].Balance).toBe(12.5);
    });

    it('leaves a NULL alone rather than inventing an epoch date', () => {
        // `new Date(null)` is 1970-01-01, which would read as a real date somebody entered.
        const result = resultOf([{ ID: 'a', OrderDate: null, DueDate: undefined, Balance: null }]);
        provider.Coerce({ EntityName: ENTITY, ResultType: 'simple', CoerceTypes: true }, result);

        expect(result.Results[0].OrderDate).toBeNull();
        expect(result.Results[0].DueDate).toBeUndefined();
        expect(result.Results[0].Balance).toBeNull();
    });

    it('leaves an UNPARSEABLE value as-is rather than writing Invalid Date', () => {
        // `Invalid Date` renders as the string "Invalid Date" and destroys the original, so the
        // person debugging it can no longer see what the database actually held.
        const result = resultOf([{ ID: 'a', OrderDate: 'not a date', Balance: 'not a number' }]);
        provider.Coerce({ EntityName: ENTITY, ResultType: 'simple', CoerceTypes: true }, result);

        expect(result.Results[0].OrderDate).toBe('not a date');
        expect(result.Results[0].Balance).toBe('not a number');
    });

    it('does not touch a column whose TSType is not Date or Number', () => {
        const result = resultOf([{ ID: 'a', Status: '2026-08-01' }]);
        provider.Coerce({ EntityName: ENTITY, ResultType: 'simple', CoerceTypes: true }, result);

        // A string column that happens to hold a date-shaped string stays a string. Coercion follows
        // the SCHEMA, never the value — guessing from content is how a product code becomes a Date.
        expect(result.Results[0].Status).toBe('2026-08-01');
    });

    it('is ignored for entity_object, which already converts on Get/Set', () => {
        const rows = [{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z' }];
        const result = resultOf(rows);
        provider.Coerce({ EntityName: ENTITY, ResultType: 'entity_object', CoerceTypes: true }, result);

        expect(result.Results[0].OrderDate).toBe('2026-08-01T00:00:00.000Z');
        expect(result.Results[0]).toBe(rows[0]); // same object — nothing was rebuilt
    });

    it('does nothing for an entity name that resolves to nothing', () => {
        const result = resultOf([{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z' }]);
        provider.Coerce({ EntityName: 'MJ: No Such Entity', ResultType: 'simple', CoerceTypes: true }, result);
        expect(typeof result.Results[0].OrderDate).toBe('string');
    });

    it('does nothing to a failed result', () => {
        const result = { Success: false, Results: [{ ID: 'a', OrderDate: '2026-08-01' }] } as unknown as RunViewResult;
        provider.Coerce({ EntityName: ENTITY, ResultType: 'simple', CoerceTypes: true }, result);
        expect(typeof (result.Results[0] as Record<string, unknown>).OrderDate).toBe('string');
    });
});

describe('CoerceTypes — must not poison the cache', () => {
    it('COPIES rows instead of mutating them', () => {
        // THE ONE THAT MATTERS. On a cache hit the rows handed back can be the cache's own objects:
        // `ProjectRowsToFields` deliberately returns the original array when the projection would be
        // a no-op, which is the common case. Mutating in place would write Dates into the cache
        // entry, so the NEXT reader of the same fingerprint — one that never asked for coercion —
        // would silently receive Dates where the contract promises strings.
        const cached = [{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z', Balance: '12.50' }];
        const result = resultOf(cached);

        provider.Coerce({ EntityName: ENTITY, ResultType: 'simple', CoerceTypes: true }, result);

        // The caller got Dates...
        expect(result.Results[0].OrderDate).toBeInstanceOf(Date);
        expect(result.Results[0]).not.toBe(cached[0]);

        // ...and the cache's own object is untouched.
        expect(cached[0].OrderDate).toBe('2026-08-01T00:00:00.000Z');
        expect(cached[0].Balance).toBe('12.50');
    });
});
