/**
 * QueryEngine's definition signature and a query's result fields.
 *
 * A field row's facts (name, sequence, SQL type, source entity and field, computed flag) and the
 * set and order of field rows are part of the signature, so editing them retires cached results.
 * A field's descriptions are annotations: editing them must leave the signature alone.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { QueryEngine } from '../engines/QueryEngine';

const A = 'AAAAAAAA-0000-0000-0000-00000000000A';
const ENTITY_1 = 'E1E1E1E1-0000-0000-0000-0000000000E1';
const ENTITY_2 = 'E2E2E2E2-0000-0000-0000-0000000000E2';
const SINGLETON_KEY = '___SINGLETON__FieldSignatureTestEngine';

interface QueryRow {
    ID: string;
    Name: string;
    SQL: string;
    SQLDialectID: string | null;
    UsesTemplate: boolean;
    ExternalDataSourceID: string | null;
    IsMaterialized: boolean;
    CacheValidationSQL: string | null;
    __mj_UpdatedAt: Date;
    GetPlatformSQL(platform: string): string;
}

interface FieldRow {
    ID: string;
    QueryID: string;
    Name: string;
    Description: string | null;
    Sequence: number;
    SQLBaseType: string;
    SQLFullType: string;
    SourceEntityID: string | null;
    SourceFieldName: string | null;
    IsComputed: boolean;
    ComputationDescription: string | null;
    SummaryDescription: string | null;
    __mj_UpdatedAt: Date;
}

/** Exposes the protected change notification a load or an applied event raises. */
class FieldSignatureTestEngine extends QueryEngine {
    public static get TestInstance(): FieldSignatureTestEngine {
        return super.getInstance<FieldSignatureTestEngine>();
    }

    /** Announces that an engine property changed, which clears the signature memo. */
    public Changed(propertyName: string): void {
        this.emitPropertyChange(propertyName);
    }
}

function query(id: string): QueryRow {
    return {
        ID: id, Name: 'Orders', SQL: 'SELECT ID, Total FROM Orders', SQLDialectID: null, UsesTemplate: false,
        ExternalDataSourceID: null, IsMaterialized: false, CacheValidationSQL: null,
        __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'),
        GetPlatformSQL(): string {
            return this.SQL;
        },
    };
}

function field(id: string, name: string, sequence: number, overrides: Partial<FieldRow> = {}): FieldRow {
    return {
        ID: id, QueryID: A, Name: name, Description: `The ${name}`, Sequence: sequence, SQLBaseType: 'int',
        SQLFullType: 'int', SourceEntityID: ENTITY_1, SourceFieldName: name, IsComputed: false,
        ComputationDescription: null, SummaryDescription: null, __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'),
        ...overrides,
    };
}

let engine: FieldSignatureTestEngine;
let fields: FieldRow[];

/** Replaces the engine's cached field rows and announces the change, as a refresh would. */
function setFields(rows: FieldRow[]): void {
    fields = rows;
    Reflect.set(engine, '_fields', rows);
    engine.Changed('_fields');
}

function hash(): string | undefined {
    return engine.GetDefinitionSignature(A, 'sqlserver')?.Hash;
}

describe('QueryEngine.GetDefinitionSignature and query fields', () => {
    beforeEach(() => {
        delete GetGlobalObjectStore()[SINGLETON_KEY];
        engine = FieldSignatureTestEngine.TestInstance;
        for (const property of ['_parameters', '_dependencies', '_querySQLs', '_sqlDialects']) {
            Reflect.set(engine, property, []);
        }
        Reflect.set(engine, '_queries', [query(A)]);
        engine.Changed('_queries');
        setFields([field('F1', 'ID', 1), field('F2', 'Total', 2, { SQLBaseType: 'decimal', SQLFullType: 'decimal(18,2)' })]);
    });

    afterEach(() => {
        delete GetGlobalObjectStore()[SINGLETON_KEY];
    });

    const factEdits: Array<[string, Partial<FieldRow>]> = [
        ['Name', { Name: 'GrandTotal' }],
        ['Sequence', { Sequence: 7 }],
        ['SQLFullType', { SQLFullType: 'decimal(19,4)' }],
        ['SourceEntityID', { SourceEntityID: ENTITY_2 }],
        ['SourceFieldName', { SourceFieldName: 'Amount' }],
        ['IsComputed', { IsComputed: true }],
    ];
    it.each(factEdits)('changes when a field\'s %s changes', (_column, edit) => {
        const before = hash();
        setFields([fields[0], { ...fields[1], ...edit }]);
        expect(hash()).not.toBe(before);
    });

    it('hashes SQLBaseType when SQLFullType is empty', () => {
        setFields([fields[0], { ...fields[1], SQLFullType: '' }]);
        const empty = hash();
        setFields([fields[0], { ...fields[1], SQLBaseType: 'money' }]);
        expect(hash()).not.toBe(empty);
    });

    it('changes when a field is added or removed', () => {
        const before = hash();
        setFields([...fields, field('F3', 'Status', 3)]);
        const added = hash();
        setFields([fields[0]]);
        expect(new Set([before, added, hash()]).size).toBe(3);
    });

    it('changes when the field order changes, but not when only the load order does', () => {
        const [id, total] = fields;
        const before = hash();
        setFields([total, id]);
        expect(hash()).toBe(before);
        setFields([{ ...id, Sequence: 2 }, { ...total, Sequence: 1 }]);
        expect(hash()).not.toBe(before);
    });

    it('does not change when only a field\'s descriptions change, though the stamp moves', () => {
        const before = engine.GetDefinitionSignature(A, 'sqlserver');
        setFields([fields[0], {
            ...fields[1], Description: 'Reworded', ComputationDescription: 'Sum of lines', SummaryDescription: 'Totals',
            __mj_UpdatedAt: new Date('2026-03-01T00:00:00Z'),
        }]);
        const after = engine.GetDefinitionSignature(A, 'sqlserver');
        expect(after?.Hash).toBe(before?.Hash);
        expect(after?.Stamp).toBe('2026-03-01T00:00:00.000Z');
    });
});
