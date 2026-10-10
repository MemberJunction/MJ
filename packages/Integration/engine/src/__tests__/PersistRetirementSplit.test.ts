/**
 * Absent-object and absent-field retirement are separately gateable.
 *
 * A streaming discovery persists one object at a time and then, at the end, the complete set of
 * object NAMES. The two retirements need opposite moments:
 *
 *   per object  — that object's field list is complete, so its absent FIELDS may retire; but from
 *                 one object's vantage every other object looks absent, so OBJECTS must not.
 *   final pass  — the complete name set is known, so absent OBJECTS may retire; but name stubs carry
 *                 no fields, so FIELDS must not (they would retire every column of every object).
 *
 * `DeactivateAbsentObjects` / `DeactivateAbsentFields` each default to `DeactivateAbsent`, so a
 * caller that sets neither behaves exactly as before. The pure decider is untouched; only its OUTPUT
 * is filtered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CompositeKey, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { IntegrationSchemaSync, type PersistSchemaOptions } from '../IntegrationSchemaSync';
import type { SourceObjectInfo } from '../types';

type Row = { ID: string; Name: string; Status: string; IntegrationObjectID?: string; [k: string]: unknown };

/** A cached entity row: the overlay mutates it and calls Save(). */
const row = (r: Row) => ({ ...r, Save: vi.fn(async () => true) });

const INVOICE = row({ ID: 'o-inv', Name: 'Invoice', DisplayName: 'Invoice', Description: null, Status: 'Active' });
const GHOST = row({ ID: 'o-ghost', Name: 'Ghost', DisplayName: 'Ghost', Description: null, Status: 'Active' });
const fieldRow = (ID: string, Name: string) => row({
    ID, Name, IntegrationObjectID: 'o-inv', Status: 'Active', Type: 'nvarchar', Length: 100,
    AllowsNull: true, IsRequired: false, IsPrimaryKey: Name === 'id', IsUniqueKey: false, IsReadOnly: false,
    MetadataSource: 'Declared', DisplayName: Name, Description: null, RelatedIntegrationObjectID: null, Configuration: null,
});
const FIELDS = [fieldRow('f-id', 'id'), fieldRow('f-note', 'note'), fieldRow('f-gone', 'gone')];
const NAME_BY_ID: Record<string, string> = { 'o-inv': 'Invoice', 'o-ghost': 'Ghost', 'f-id': 'id', 'f-note': 'note', 'f-gone': 'gone' };

/** Records which rows the retirement pass disabled. */
function makeProvider(disabled: string[]): IMetadataProvider {
    return {
        GetEntityObject: async () => {
            const e: Record<string, unknown> = {
                Status: 'Active',
                InnerLoad: async (key: CompositeKey) => {
                    const id = String(key.KeyValuePairs[0].Value);
                    e.ID = id; e.Name = NAME_BY_ID[id]; e.IntegrationObjectID = 'o-inv';
                    return true;
                },
                Save: async () => { if (e.Status === 'Disabled') disabled.push(String(e.Name)); return true; },
            };
            return e;
        },
    } as unknown as IMetadataProvider;
}

const invoiceFromSource: SourceObjectInfo = {
    ExternalName: 'Invoice',
    ExternalLabel: 'Invoice',
    // `gone` is absent from the source; `Ghost` (the other object) is absent from this call.
    Fields: [
        { Name: 'id', Label: 'id', SourceType: 'nvarchar', IsRequired: false, AllowsNull: true, MaxLength: 100, IsPrimaryKey: true },
        { Name: 'note', Label: 'note', SourceType: 'nvarchar', IsRequired: false, AllowsNull: true, MaxLength: 100 },
    ],
    PrimaryKeyFields: ['id'],
    Relationships: [],
};

async function persist(over: Partial<PersistSchemaOptions>, disabled: string[]): Promise<void> {
    await IntegrationSchemaSync.PersistDiscoveredSchema({
        IntegrationID: 'INT-1',
        SourceSchema: { Objects: [invoiceFromSource], IsAuthoritative: true },
        ContextUser: {} as UserInfo,
        Provider: makeProvider(disabled),
        ...over,
    });
}

describe('PersistDiscoveredSchema — object and field retirement are separately gateable', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
            GetIntegrationObjectsByIntegrationID: () => [INVOICE, GHOST],
            GetActiveIntegrationObjects: () => [INVOICE, GHOST],
            GetIntegrationObjectFields: (id: string) => (id === 'o-inv' ? FIELDS : []),
            GetIntegrationObjectByID: (id: string) => (id === 'o-inv' ? INVOICE : GHOST),
        } as unknown as IntegrationEngineBase);
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('per-object form: retires absent FIELDS and leaves every other object alone', async () => {
        const disabled: string[] = [];
        await persist({ DeactivateAbsentObjects: false, DeactivateAbsentFields: true }, disabled);
        expect(disabled).toEqual(['gone']);
    });

    it('final-pass form: retires absent OBJECTS and no fields', async () => {
        const disabled: string[] = [];
        await persist({ DeactivateAbsentObjects: true, DeactivateAbsentFields: false }, disabled);
        expect(disabled).toEqual(['Ghost']);
    });

    it('both default to DeactivateAbsent, so an existing caller is unchanged', async () => {
        const disabled: string[] = [];
        await persist({ DeactivateAbsent: true }, disabled);
        expect(disabled.sort()).toEqual(['Ghost', 'gone']);
    });

    it('an explicit half overrides DeactivateAbsent', async () => {
        const disabled: string[] = [];
        await persist({ DeactivateAbsent: true, DeactivateAbsentObjects: false }, disabled);
        expect(disabled).toEqual(['gone']);
    });

    it('still retires nothing from a source that is not authoritative', async () => {
        const disabled: string[] = [];
        await persist({
            SourceSchema: { Objects: [invoiceFromSource], IsAuthoritative: false },
            DeactivateAbsentObjects: true,
            DeactivateAbsentFields: true,
        }, disabled);
        expect(disabled).toEqual([]);
    });
});
