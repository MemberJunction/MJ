/**
 * `NormalizeSimpleRowTypes` — unconditional typing of `'simple'` rows.
 *
 * WHY THIS PASS EXISTS. Before it, the value a simple read returned for a `DATETIME` column
 * depended on where the code ran: a fresh server-side query yields real `Date`s (driver-parsed),
 * a server-side Redis cache hit yields ISO strings (`JSON.parse`, no reviver), and a browser
 * client over GraphQL yields ISO strings (`JSON.stringify` on the wire). Same call, three shapes —
 * while the generated entity types declare exactly one. MJ's contract is a unified programming
 * interface on both sides of the wire, so the pipeline enforces the declared shape everywhere.
 *
 * The two tests that matter most are at the bottom: rows already in the right shape keep their
 * IDENTITY (the server fast path costs nothing), and rows that convert are COPIES (cache-hit rows
 * can be the cache's own objects; writing Dates into them would corrupt the entry).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { EntityInfo, EntityFieldTSType } from '../generic/entityInfo';
import type { RunViewParams, RunViewResult } from '../views/runView';

const ENTITY = 'MJ: Test Orders';

/** EntityInfo stub carrying just the field Names/CodeNames/TSTypes normalization reads. */
function makeEntityInfo(): EntityInfo {
    const info = Object.create(EntityInfo.prototype);
    info.ID = 'e1';
    info.Name = ENTITY;
    const fields = [
        { Name: 'ID', CodeName: 'ID', TSType: EntityFieldTSType.String },
        { Name: 'OrderDate', CodeName: 'OrderDate', TSType: EntityFieldTSType.Date },
        { Name: 'DueDate', CodeName: 'DueDate', TSType: EntityFieldTSType.Date },
        // A field whose Name is not identifier-safe: the batch transport keys rows by Name,
        // the singular transport adds the CodeName key — normalization must handle both.
        { Name: 'Ship Date', CodeName: 'ShipDate', TSType: EntityFieldTSType.Date },
        { Name: 'Balance', CodeName: 'Balance', TSType: EntityFieldTSType.Number },
        { Name: 'ExternalRef', CodeName: 'ExternalRef', TSType: EntityFieldTSType.Number },
        { Name: 'Status', CodeName: 'Status', TSType: EntityFieldTSType.String },
    ];
    Object.defineProperty(info, 'Fields', { get: () => fields, configurable: true });
    return info as EntityInfo;
}

/** The narrowest possible ProviderBase: normalization reads entities only via EntityByName. */
class TestProvider extends ProviderBase {
    public override EntityByName(name: string): EntityInfo | undefined {
        return this.Entities.find(e => e.Name.trim().toLowerCase() === name.trim().toLowerCase());
    }
    /** `NormalizeSimpleRowTypes` is protected; this is the seam under test. */
    public Normalize(param: RunViewParams, result: RunViewResult): void {
        this.NormalizeSimpleRowTypes(param, result);
    }
}

let provider: TestProvider;

beforeEach(() => {
    provider = Object.create(TestProvider.prototype) as TestProvider;
    Object.defineProperty(provider, 'Entities', { get: () => [makeEntityInfo()], configurable: true });
});

function resultOf(rows: Array<Record<string, unknown>>): RunViewResult {
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length } as RunViewResult;
}

describe('NormalizeSimpleRowTypes — on for every simple read', () => {
    it('turns date columns into real Dates when ResultType is simple', () => {
        const result = resultOf([{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z', DueDate: '2026-09-01T00:00:00.000Z' }]);
        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);

        expect(result.Results[0].OrderDate).toBeInstanceOf(Date);
        expect((result.Results[0].OrderDate as Date).getUTCFullYear()).toBe(2026);
        expect(result.Results[0].DueDate).toBeInstanceOf(Date);
    });

    it('is also on when ResultType is omitted, which means simple', () => {
        // The unified-interface point: nobody has to ask for the shape the types declare.
        const result = resultOf([{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z' }]);
        provider.Normalize({ EntityName: ENTITY }, result);
        expect(result.Results[0].OrderDate).toBeInstanceOf(Date);
    });

    it('turns an epoch-milliseconds number cell into a Date', () => {
        // The singular GraphQL transport serializes Date via GraphQLTimestamp — epoch ms.
        const epoch = Date.UTC(2026, 7, 1);
        const result = resultOf([{ ID: 'a', OrderDate: epoch }]);
        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);
        expect(result.Results[0].OrderDate).toBeInstanceOf(Date);
        expect((result.Results[0].OrderDate as Date).getTime()).toBe(epoch);
    });

    it('normalizes a field under its Name key, including names that are not identifiers', () => {
        // The batch transport keys rows by field NAME — the server does no CodeName aliasing.
        const result = resultOf([{ ID: 'a', 'Ship Date': '2026-08-01T00:00:00.000Z' }]);
        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);
        expect(result.Results[0]['Ship Date']).toBeInstanceOf(Date);
    });

    it('normalizes BOTH keys when a row carries Name and CodeName variants', () => {
        // The singular transport aliases CodeName onto the row alongside Name; converting only
        // one would leave the key callers actually read as a raw string.
        const result = resultOf([{ ID: 'a', 'Ship Date': '2026-08-01T00:00:00.000Z', ShipDate: '2026-08-01T00:00:00.000Z' }]);
        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);
        expect(result.Results[0]['Ship Date']).toBeInstanceOf(Date);
        expect(result.Results[0].ShipDate).toBeInstanceOf(Date);
    });
});

describe('NormalizeSimpleRowTypes — numeric columns', () => {
    it('turns numeric strings into numbers', () => {
        const result = resultOf([{ ID: 'a', Balance: '12.50' }]);
        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);
        expect(result.Results[0].Balance).toBe(12.5);
    });

    it('leaves an integer string beyond the safe range as a string', () => {
        // The PostgreSQL provider deliberately returns unsafe-range BIGINTs as strings to avoid
        // precision loss; Number('9007199254740993') "succeeds" while corrupting the value.
        const unsafe = '9007199254740993';
        const result = resultOf([{ ID: 'a', ExternalRef: unsafe, Balance: '123456789' }]);
        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);

        expect(result.Results[0].ExternalRef).toBe(unsafe);
        expect(result.Results[0].Balance).toBe(123456789); // safe-range integers do convert
    });
});

describe('NormalizeSimpleRowTypes — what it leaves alone', () => {
    it('leaves NULL and undefined alone rather than inventing an epoch date', () => {
        // `new Date(null)` is 1970-01-01, which would read as a real date somebody entered.
        const result = resultOf([{ ID: 'a', OrderDate: null, DueDate: undefined, Balance: null }]);
        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);

        expect(result.Results[0].OrderDate).toBeNull();
        expect(result.Results[0].DueDate).toBeUndefined();
        expect(result.Results[0].Balance).toBeNull();
    });

    it('leaves an UNPARSEABLE value as-is rather than writing Invalid Date', () => {
        // `Invalid Date` renders as the string "Invalid Date" and destroys the original, so the
        // person debugging it can no longer see what the database actually held.
        const result = resultOf([{ ID: 'a', OrderDate: 'not a date', Balance: 'not a number' }]);
        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);

        expect(result.Results[0].OrderDate).toBe('not a date');
        expect(result.Results[0].Balance).toBe('not a number');
    });

    it('does not touch a column whose TSType is not Date or Number', () => {
        // Normalization follows the SCHEMA, never the value — guessing from content is how a
        // product code becomes a Date.
        const result = resultOf([{ ID: 'a', Status: '2026-08-01' }]);
        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);
        expect(result.Results[0].Status).toBe('2026-08-01');
    });

    it('skips entity_object results, which get real types from BaseEntity Get/Set', () => {
        const rows = [{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z' }];
        const result = resultOf(rows);
        provider.Normalize({ EntityName: ENTITY, ResultType: 'entity_object' }, result);

        expect(result.Results[0].OrderDate).toBe('2026-08-01T00:00:00.000Z');
        expect(result.Results[0]).toBe(rows[0]); // same object — nothing was rebuilt
    });

    it('skips count_only results', () => {
        const result = { Success: true, Results: [], RowCount: 0, TotalRowCount: 42 } as unknown as RunViewResult;
        provider.Normalize({ EntityName: ENTITY, ResultType: 'count_only' }, result);
        expect(result.Results).toEqual([]);
    });

    it('skips a view-only run, where no entity is synchronously resolvable', () => {
        const result = resultOf([{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z' }]);
        provider.Normalize({ ViewID: 'v1', ResultType: 'simple' }, result);
        expect(typeof result.Results[0].OrderDate).toBe('string');
    });

    it('does nothing for an entity name that resolves to nothing', () => {
        const result = resultOf([{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z' }]);
        provider.Normalize({ EntityName: 'MJ: No Such Entity', ResultType: 'simple' }, result);
        expect(typeof result.Results[0].OrderDate).toBe('string');
    });

    it('does nothing to a failed result', () => {
        const result = { Success: false, Results: [{ ID: 'a', OrderDate: '2026-08-01' }] } as unknown as RunViewResult;
        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);
        expect(typeof (result.Results[0] as Record<string, unknown>).OrderDate).toBe('string');
    });
});

describe('NormalizeSimpleRowTypes — identity and cache safety', () => {
    it('keeps ARRAY AND ROW IDENTITY when every cell is already the right shape', () => {
        // The server fast path: the mssql/pg drivers already return Dates and numbers, so the
        // pass must detect there is nothing to do and hand back the untouched original array —
        // zero copies, zero allocations, and idempotency for results that flow through twice.
        const rows = [{ ID: 'a', OrderDate: new Date('2026-08-01T00:00:00.000Z'), Balance: 12.5 }];
        const result = resultOf(rows);

        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);

        expect(result.Results).toBe(rows);
        expect(result.Results[0]).toBe(rows[0]);
        expect(result.Results[0].OrderDate).toBe(rows[0].OrderDate); // same Date instance
    });

    it('COPIES rows instead of mutating when a cell converts', () => {
        // On a cache hit the rows handed back can be the cache's OWN objects — the in-memory
        // server store holds them by reference, and `ProjectRowsToFields` deliberately returns
        // the original array when projection is a no-op. Converting in place would write Dates
        // into the cache entry itself, corrupting it for serialization and later readers.
        const cached = [{ ID: 'a', OrderDate: '2026-08-01T00:00:00.000Z', Balance: '12.50' }];
        const result = resultOf(cached);

        provider.Normalize({ EntityName: ENTITY, ResultType: 'simple' }, result);

        // The caller got Dates and numbers...
        expect(result.Results[0].OrderDate).toBeInstanceOf(Date);
        expect(result.Results[0].Balance).toBe(12.5);
        expect(result.Results[0]).not.toBe(cached[0]);

        // ...and the cache's own object is untouched.
        expect(cached[0].OrderDate).toBe('2026-08-01T00:00:00.000Z');
        expect(cached[0].Balance).toBe('12.50');
    });
});
