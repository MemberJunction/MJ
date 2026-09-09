import { describe, it, expect, vi } from 'vitest';
import type { CompositeKey } from '@memberjunction/core';

// Scripted per test: the rows LoadAllMJRecords reads from the MJ entity.
const runViewResult = vi.hoisted(() => ({ current: { Success: true, Results: [] as Array<Record<string, unknown>> } }));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            async RunView() { return runViewResult.current; }
        },
    };
});

const { IntegrationEngine } = await import('../IntegrationEngine.js');

type PkField = { Name: string };
type ChangeRow = { RecordID: string; Type: string; ChangedAt: string; Fields: Record<string, unknown> };
type RecordMapRows = { Rows: Array<{ ID: string; EntityRecordID: string; ExternalSystemRecordID: string }>; Complete: boolean };
type KeyHost = {
    ComposeEntityRecordID: (row: Record<string, unknown>, pkFields: PkField[]) => string;
    BuildEntityPrimaryKey: (recordID: string, pkFields: PkField[]) => CompositeKey;
    LoadAllMJRecords: (entityMap: unknown, companyIntegration: unknown, contextUser: unknown) => Promise<ChangeRow[]>;
    LoadAllRecordMaps: (companyIntegrationID: string, entityID: string, contextUser: unknown) => Promise<RecordMapRows>;
};

/**
 * A prototype-backed host so the REAL private helpers run against metadata whose key is NOT a
 * single `ID` column — the case MJ core entities never exercise.
 */
function makeHost(pkFields: PkField[], existingMaps: Array<{ EntityRecordID: string }> = []): KeyHost {
    const host = Object.create(IntegrationEngine.prototype) as unknown as KeyHost & Record<string, unknown>;
    Object.defineProperty(host, 'ProviderToUse', {
        value: { EntityByName: () => ({ PrimaryKeys: pkFields }) },
        configurable: true,
    });
    host.LoadAllRecordMaps = async () => ({
        Complete: true,
        Rows: existingMaps.map((m, i) => ({ ID: `map-${i}`, EntityRecordID: m.EntityRecordID, ExternalSystemRecordID: `ext-${i}` })),
    });
    return host;
}

const COMPOSITE: PkField[] = [{ Name: 'OrderID' }, { Name: 'LineNo' }];
const CUSTOMER_KEY: PkField[] = [{ Name: 'individual_id' }];

describe('ComposeEntityRecordID / BuildEntityPrimaryKey — the record-map identity round-trips for any key shape', () => {
    it('a single-column key with a non-ID name is just its value, and loads against THAT column', () => {
        const host = makeHost(CUSTOMER_KEY);
        const id = host.ComposeEntityRecordID({ individual_id: 4711, Name: 'Ada' }, CUSTOMER_KEY);
        expect(id).toBe('4711');
        const key = host.BuildEntityPrimaryKey(id, CUSTOMER_KEY);
        expect(key.KeyValuePairs).toEqual([{ FieldName: 'individual_id', Value: '4711' }]);
    });

    it('a composite key joins EVERY column in PK order and parses back onto each column', () => {
        const host = makeHost(COMPOSITE);
        const id = host.ComposeEntityRecordID({ LineNo: 3, OrderID: '11055', Qty: 2 }, COMPOSITE);
        expect(id).toBe('11055|3');
        const key = host.BuildEntityPrimaryKey(id, COMPOSITE);
        expect(key.KeyValuePairs).toEqual([
            { FieldName: 'OrderID', Value: '11055' },
            { FieldName: 'LineNo', Value: '3' },
        ]);
    });

    it('refuses to invent an `ID` column when the entity has no primary key fields', () => {
        const host = makeHost([]);
        expect(() => host.BuildEntityPrimaryKey('x', [])).toThrow(/no primary key fields/);
    });
});

describe('LoadAllMJRecords — Create vs Update is decided on the WHOLE key', () => {
    const entityMap = { Entity: 'Order Lines', EntityID: 'ent-1' };
    const companyIntegration = { ID: 'ci-1' };

    it('a composite-key row already in the record map is an Update, not a duplicate Create', async () => {
        runViewResult.current = {
            Success: true,
            Results: [
                { OrderID: '11055', LineNo: 3 },   // mapped -> Update
                { OrderID: '11055', LineNo: 4 },   // same first column, different line -> Create
            ],
        };
        // The pre-fix code keyed the row by its FIRST column only ('11055'), so neither row matched
        // '11055|3' and both were re-CREATED externally.
        const host = makeHost(COMPOSITE, [{ EntityRecordID: '11055|3' }]);
        const out = await host.LoadAllMJRecords(entityMap, companyIntegration, {});
        expect(out.map(r => [r.RecordID, r.Type])).toEqual([
            ['11055|3', 'Update'],
            ['11055|4', 'Create'],
        ]);
    });

    it('a single non-ID key column is read by its real name', async () => {
        runViewResult.current = { Success: true, Results: [{ individual_id: 9, ID: 'not-the-key' }] };
        const host = makeHost(CUSTOMER_KEY, [{ EntityRecordID: '9' }]);
        const out = await host.LoadAllMJRecords(entityMap, companyIntegration, {});
        expect(out).toHaveLength(1);
        expect(out[0].RecordID).toBe('9');
        expect(out[0].Type).toBe('Update');
    });

    it('fails loudly when the entity is unknown instead of guessing an ID column', async () => {
        runViewResult.current = { Success: true, Results: [{ ID: '1' }] };
        const host = makeHost(CUSTOMER_KEY);
        Object.defineProperty(host, 'ProviderToUse', { value: { EntityByName: () => null }, configurable: true });
        await expect(host.LoadAllMJRecords(entityMap, companyIntegration, {})).rejects.toThrow(/not found in metadata/);
    });
});
