import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────
// Hoisted mock for RunView so each test can program the rows it returns.
// ─────────────────────────────────────────────

const { mockRunViewFn } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
}));

// ─────────────────────────────────────────────
// Mock @memberjunction/core. The engine only uses RunView, Metadata.Provider (we pass
// a provider explicitly so it's never reached), CompositeKey (via duck-typed fixtures),
// EntityInfo/EntityFieldInfo (type-only), and LogError.
// ─────────────────────────────────────────────

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        // RunView(params, contextUser)
        RunView = mockRunViewFn;
    }
    return {
        RunView: MockRunView,
        Metadata: { Provider: undefined },
        LogError: vi.fn(),
        // Type-only imports — referenced as values nowhere in the engine at runtime.
        CompositeKey: class {},
        EntityInfo: class {},
        EntityFieldInfo: class {},
        UserInfo: class {},
    };
});

import { RecordComparisonEngine, RecordComparisonInput } from '../engines/RecordComparisonEngine';

// ─────────────────────────────────────────────
// Fixtures — minimal duck-typed EntityInfo / EntityFieldInfo / CompositeKey shapes
// matching exactly the members the engine touches.
// ─────────────────────────────────────────────

interface FakeField {
    Name: string;
    DisplayNameOrName: string;
    IsPrimaryKey: boolean;
    IsNameField: boolean;
    DefaultInView: boolean;
    Sequence: number;
    Category: string | null;
}

function field(name: string, opts: Partial<FakeField> = {}): FakeField {
    return {
        Name: name,
        DisplayNameOrName: opts.DisplayNameOrName ?? name,
        IsPrimaryKey: opts.IsPrimaryKey ?? false,
        IsNameField: opts.IsNameField ?? false,
        DefaultInView: opts.DefaultInView ?? false,
        Sequence: opts.Sequence ?? 0,
        Category: opts.Category ?? null,
    };
}

/** Build a fake EntityInfo whose Fields/PrimaryKeys are the engine's only contact points. */
function entity(fields: FakeField[]) {
    return {
        Name: 'Accounts',
        Fields: fields,
        PrimaryKeys: fields.filter(f => f.IsPrimaryKey),
    };
}

/** A duck-typed CompositeKey: single-column ID key. */
function key(id: string | null) {
    return {
        HasValue: id !== null,
        ToWhereClause: () => `ID='${id}'`,
        GetValueByFieldName: (fieldName: string) => (fieldName === 'ID' ? id : null),
        Values: () => (id === null ? '' : `ID|${id}`),
    };
}

/** Cast a fixture to the engine's expected types without polluting with `any`. */
function asInput(EntityName: string, keys: ReturnType<typeof key>[], IncludeFields?: string[]): RecordComparisonInput {
    return { EntityName, Keys: keys, IncludeFields } as unknown as RecordComparisonInput;
}

const STANDARD_FIELDS: FakeField[] = [
    field('ID', { IsPrimaryKey: true }),
    field('Name', { IsNameField: true, DefaultInView: true, Sequence: 1 }),
    field('Email', { DefaultInView: true, Sequence: 2 }),
    field('Phone', { Sequence: 3 }),
    field('__mj_CreatedAt', { Sequence: 99 }),
];

/** A provider whose only job is to resolve EntityByName to our fixture. */
function providerFor(ent: ReturnType<typeof entity>) {
    return {
        EntityByName: (name: string) => (name === ent.Name ? ent : undefined),
    };
}

const CONTEXT_USER = { ID: 'user-1' };

function runOk(rows: Record<string, unknown>[]) {
    mockRunViewFn.mockResolvedValue({ Success: true, Results: rows });
}

describe('RecordComparisonEngine', () => {
    let engine: RecordComparisonEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = new RecordComparisonEngine();
    });

    describe('input validation', () => {
        it('returns Success:false when the entity is unknown', async () => {
            const result = await engine.CompareRecords(
                asInput('Nope', [key('a')]),
                CONTEXT_USER as never,
                providerFor(entity(STANDARD_FIELDS)) as never
            );
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('not found');
            expect(result.Records).toEqual([]);
            expect(result.Fields).toEqual([]);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('returns Success:false when no keys are supplied', async () => {
            const result = await engine.CompareRecords(
                asInput('Accounts', []),
                CONTEXT_USER as never,
                providerFor(entity(STANDARD_FIELDS)) as never
            );
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('No keys');
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('returns Success:false when RunView reports failure (never throws)', async () => {
            mockRunViewFn.mockResolvedValue({ Success: false, ErrorMessage: 'db down' });
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a')]),
                CONTEXT_USER as never,
                providerFor(entity(STANDARD_FIELDS)) as never
            );
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Failed to load');
        });
    });

    describe('field selection', () => {
        it('excludes primary-key and __mj_* system fields by default', async () => {
            runOk([{ ID: 'a', Name: 'Acme', Email: 'a@x.com', Phone: '111' }]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a')]),
                CONTEXT_USER as never,
                providerFor(entity(STANDARD_FIELDS)) as never
            );
            const names = result.Fields.map(f => f.FieldName);
            expect(names).not.toContain('ID');
            expect(names).not.toContain('__mj_CreatedAt');
            expect(names).toEqual(expect.arrayContaining(['Name', 'Email', 'Phone']));
        });

        it('honors an explicit, case-insensitive IncludeFields list', async () => {
            runOk([{ ID: 'a', Name: 'Acme', Email: 'a@x.com', Phone: '111' }]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a')], ['email', 'PHONE']),
                CONTEXT_USER as never,
                providerFor(entity(STANDARD_FIELDS)) as never
            );
            const names = result.Fields.map(f => f.FieldName).sort();
            expect(names).toEqual(['Email', 'Phone']);
        });

        it('orders the name field first', async () => {
            runOk([{ ID: 'a', Name: 'Acme', Email: 'a@x.com', Phone: '111' }]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a')]),
                CONTEXT_USER as never,
                providerFor(entity(STANDARD_FIELDS)) as never
            );
            expect(result.Fields[0].FieldName).toBe('Name');
        });
    });

    describe('delta computation: equality and Differs', () => {
        const ent = entity(STANDARD_FIELDS);

        it('marks a field that is identical across all records as not differing', async () => {
            runOk([
                { ID: 'a', Name: 'Acme', Email: 'same@x.com' },
                { ID: 'b', Name: 'Acme Inc', Email: 'same@x.com' },
            ]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a'), key('b')]),
                CONTEXT_USER as never,
                providerFor(ent) as never
            );
            const email = result.Fields.find(f => f.FieldName === 'Email')!;
            expect(email.Differs).toBe(false);
            expect(email.Cells.every(c => c.EqualsReference)).toBe(true);
        });

        it('marks a field that differs from the reference (column 0) as differing', async () => {
            runOk([
                { ID: 'a', Name: 'Acme', Email: 'a@x.com' },
                { ID: 'b', Name: 'Acme', Email: 'b@x.com' },
            ]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a'), key('b')]),
                CONTEXT_USER as never,
                providerFor(ent) as never
            );
            const email = result.Fields.find(f => f.FieldName === 'Email')!;
            expect(email.Differs).toBe(true);
            expect(email.Cells[0].EqualsReference).toBe(true);  // column 0 is always the reference
            expect(email.Cells[1].EqualsReference).toBe(false);
        });

        it('treats equality case-insensitively and trimmed', async () => {
            runOk([
                { ID: 'a', Name: 'Acme', Email: 'HELLO@x.com' },
                { ID: 'b', Name: 'Acme', Email: '  hello@x.com  ' },
            ]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a'), key('b')]),
                CONTEXT_USER as never,
                providerFor(ent) as never
            );
            const email = result.Fields.find(f => f.FieldName === 'Email')!;
            expect(email.Differs).toBe(false);
            expect(email.Cells[1].EqualsReference).toBe(true);
        });

        it('treats a null reference and a null cell as equal, but null vs value as differing', async () => {
            runOk([
                { ID: 'a', Name: 'Acme', Phone: null },
                { ID: 'b', Name: 'Acme', Phone: null },
                { ID: 'c', Name: 'Acme', Phone: '555' },
            ]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a'), key('b'), key('c')]),
                CONTEXT_USER as never,
                providerFor(ent) as never
            );
            const phone = result.Fields.find(f => f.FieldName === 'Phone')!;
            expect(phone.Cells[0].EqualsReference).toBe(true);   // null reference
            expect(phone.Cells[1].EqualsReference).toBe(true);   // null == null
            expect(phone.Cells[2].EqualsReference).toBe(false);  // '555' != null
            expect(phone.Differs).toBe(true);
        });

        it('drops a field that is empty across every record', async () => {
            runOk([
                { ID: 'a', Name: 'Acme', Phone: '' },
                { ID: 'b', Name: 'Acme', Phone: null },
            ]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a'), key('b')]),
                CONTEXT_USER as never,
                providerFor(ent) as never
            );
            expect(result.Fields.map(f => f.FieldName)).not.toContain('Phone');
        });

        it('preserves input column order in cells (ColumnIndex aligned to Keys)', async () => {
            runOk([
                { ID: 'b', Name: 'Beta', Email: 'b@x.com' },   // returned in arbitrary db order
                { ID: 'a', Name: 'Alpha', Email: 'a@x.com' },
            ]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a'), key('b')]),  // input order: a, b
                CONTEXT_USER as never,
                providerFor(ent) as never
            );
            expect(result.Records.map(r => r.ColumnIndex)).toEqual([0, 1]);
            expect(result.Records[0].Label).toBe('Alpha');  // column 0 must be key 'a'
            expect(result.Records[1].Label).toBe('Beta');
        });
    });

    describe('missing rows and labels', () => {
        const ent = entity(STANDARD_FIELDS);

        it('yields an all-null record with a key-string label when a key has no row', async () => {
            runOk([{ ID: 'a', Name: 'Acme', Email: 'a@x.com' }]);  // 'b' not returned
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a'), key('b')]),
                CONTEXT_USER as never,
                providerFor(ent) as never
            );
            const missing = result.Records[1];
            expect(missing.Label).toBe('ID|b');
            expect(missing.Values['Email']).toBeNull();
            expect(missing.Values['Name']).toBeNull();
        });

        it('matches rows to keys case-insensitively (uppercase vs lowercase UUIDs)', async () => {
            // DB returned uppercase id; the key is lowercase — must still correlate.
            runOk([{ ID: 'ABC', Name: 'Acme', Email: 'a@x.com' }]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('abc')]),
                CONTEXT_USER as never,
                providerFor(ent) as never
            );
            expect(result.Records[0].Label).toBe('Acme');
            expect(result.Records[0].Values['Email']).toBe('a@x.com');
        });

        it('uses the name-field value as the label when present', async () => {
            runOk([{ ID: 'a', Name: 'Globex', Email: 'g@x.com' }]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a')]),
                CONTEXT_USER as never,
                providerFor(ent) as never
            );
            expect(result.Records[0].Label).toBe('Globex');
        });
    });

    describe('result shape', () => {
        it('carries the entity name and a record per input key', async () => {
            runOk([
                { ID: 'a', Name: 'Acme', Email: 'a@x.com' },
                { ID: 'b', Name: 'Beta', Email: 'b@x.com' },
            ]);
            const result = await engine.CompareRecords(
                asInput('Accounts', [key('a'), key('b')]),
                CONTEXT_USER as never,
                providerFor(entity(STANDARD_FIELDS)) as never
            );
            expect(result.Success).toBe(true);
            expect(result.EntityName).toBe('Accounts');
            expect(result.Records).toHaveLength(2);
        });

        it('limits the RunView load to the number of keys and selects PK + compared fields', async () => {
            runOk([{ ID: 'a', Name: 'Acme', Email: 'a@x.com' }]);
            await engine.CompareRecords(
                asInput('Accounts', [key('a')], ['Email']),
                CONTEXT_USER as never,
                providerFor(entity(STANDARD_FIELDS)) as never
            );
            const callParams = mockRunViewFn.mock.calls[0][0];
            expect(callParams.ResultType).toBe('simple');
            expect(callParams.MaxRows).toBe(1);
            expect(callParams.Fields).toEqual(expect.arrayContaining(['ID', 'Email']));
        });
    });
});
