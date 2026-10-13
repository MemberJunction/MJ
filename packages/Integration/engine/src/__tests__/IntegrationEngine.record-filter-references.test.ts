/**
 * Engine wiring for the entity map's record filter and reference resolution: a malformed declaration
 * fails the map before anything is fetched, filtered records count as skipped, and a reference is
 * resolved through this connection's record maps for the field's related entity — with a miss
 * reported as an error on that record and the record left unwritten.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import type { ICompanyIntegrationEntityMap } from '../entity-types.js';
import type { ExternalRecord, MappedRecord, SyncResult } from '../types.js';
import type { RecordFilterCondition } from '../RecordFilter.js';
import type { ReferenceField } from '../ReferenceResolver.js';
import { IntegrationEngine } from '../IntegrationEngine.js';

const recordMapReads: Array<{ ExtraFilter: string }> = [];
let recordMapRows: Array<{ ExternalSystemRecordID: string; EntityRecordID: string }> = [];

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockRunView {
        async RunView(params: { EntityName: string; ExtraFilter: string }) {
            recordMapReads.push({ ExtraFilter: params.ExtraFilter });
            return { Success: true, Results: recordMapRows };
        }
    }
    return { ...actual, RunView: MockRunView };
});

const DIMENSIONS_ID = 'D1D1D1D1-0000-4000-8000-000000000001';
const DIMENSION_VALUES_ENTITY = {
    ID: 'D2D2D2D2-0000-4000-8000-000000000002',
    Name: 'Dimension Values',
    Fields: [
        { Name: 'ID', RelatedEntityID: null },
        { Name: 'DimensionID', RelatedEntityID: DIMENSIONS_ID },
        { Name: 'Code', RelatedEntityID: null },
    ],
};

/** A provider that passes the engine's `instanceof DatabaseProviderBase` check for dialect quoting. */
function fakeProvider(): DatabaseProviderBase {
    const p = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;
    Object.defineProperty(p, 'Dialect', {
        value: { QuoteIdentifier: (n: string) => `[${n}]`, QuoteStringLiteral: (v: string) => `'${v.replace(/'/g, "''")}'`, PlatformKey: 'sqlserver' },
    });
    Object.defineProperty(p, 'Entities', { value: [{ ID: DIMENSIONS_ID, Name: 'Dimensions' }, DIMENSION_VALUES_ENTITY] });
    Object.defineProperty(p, 'EntityByName', { value: (n: string) => (n === 'Dimension Values' ? DIMENSION_VALUES_ENTITY : undefined) });
    return p;
}

/** The private surface this file drives. */
interface EngineInternals {
    resolveRecordFilter(m: ICompanyIntegrationEntityMap): RecordFilterCondition[];
    resolveReferenceFields(m: ICompanyIntegrationEntityMap): ReferenceField[];
    applyRecordFilter(r: ExternalRecord[], c: RecordFilterCondition[], m: ICompanyIntegrationEntityMap, res: SyncResult): ExternalRecord[];
    resolveReferences(
        mapped: MappedRecord[], refs: ReferenceField[], config: { companyIntegration: { ID: string } },
        m: ICompanyIntegrationEntityMap, res: SyncResult, user: UserInfo,
    ): Promise<MappedRecord[]>;
}

const engine = IntegrationEngine.Instance as unknown as EngineInternals;
const user = { ID: 'u' } as UserInfo;

function entityMap(configuration: Record<string, unknown> | null, entity = 'Dimension Values'): ICompanyIntegrationEntityMap {
    return {
        ID: 'EM-1', ExternalObjectName: 'dimensionValues', Entity: entity,
        Configuration: configuration ? JSON.stringify(configuration) : null,
    } as ICompanyIntegrationEntityMap;
}

function emptyResult(): SyncResult {
    return { Success: true, RecordsProcessed: 0, RecordsCreated: 0, RecordsUpdated: 0, RecordsDeleted: 0, RecordsErrored: 0, RecordsSkipped: 0, Errors: [] };
}

function mapped(id: string, dimensionID: string): MappedRecord {
    return {
        ExternalRecord: { ExternalID: id, ObjectType: 'dimensionValues', Fields: {} },
        MJEntityName: 'Dimension Values',
        MappedFields: { DimensionID: dimensionID, Code: `C${id}` },
        ChangeType: 'Create',
    };
}

beforeEach(() => {
    recordMapReads.length = 0;
    recordMapRows = [];
    Object.defineProperty(engine, 'ProviderToUse', { get: fakeProvider, configurable: true });
});

afterEach(() => {
    delete (engine as unknown as { ProviderToUse?: unknown }).ProviderToUse;
});

describe('record filter wiring', () => {
    it('fails the map on a malformed filter', () => {
        expect(() => engine.resolveRecordFilter(entityMap({ recordFilter: [{ field: 'accountType' }] }))).toThrow(/exactly one of/);
    });

    it('counts each excluded record as skipped', () => {
        const conditions = engine.resolveRecordFilter(entityMap({ recordFilter: [{ field: 'accountType', notIn: ['Heading'] }] }));
        const result = emptyResult();
        const kept = engine.applyRecordFilter([
            { ExternalID: '1', ObjectType: 'accounts', Fields: { accountType: 'Posting' } },
            { ExternalID: '2', ObjectType: 'accounts', Fields: { accountType: 'Heading' } },
        ], conditions, entityMap(null), result);
        expect(kept.map(r => r.ExternalID)).toEqual(['1']);
        expect(result.RecordsSkipped).toBe(1);
        expect(result.RecordsErrored).toBe(0);
    });
});

describe('reference resolution wiring', () => {
    it('takes the parent entity from the field metadata', () => {
        expect(engine.resolveReferenceFields(entityMap({ resolveReferences: ['dimensionid'] })))
            .toEqual([{ Field: 'DimensionID', RelatedEntityID: DIMENSIONS_ID }]);
    });

    it('fails the map when the field is not a foreign key', () => {
        expect(() => engine.resolveReferenceFields(entityMap({ resolveReferences: ['Code'] }))).toThrow(/not a foreign key/);
    });

    it('resolves through this connection\'s record maps and errors the misses', async () => {
        recordMapRows = [{ ExternalSystemRecordID: 'bc-dept', EntityRecordID: 'mj-dept' }];
        const refs = engine.resolveReferenceFields(entityMap({ resolveReferences: ['DimensionID'] }));
        const result = emptyResult();
        const out = await engine.resolveReferences(
            [mapped('1', 'BC-DEPT'), mapped('2', 'bc-missing')], refs,
            { companyIntegration: { ID: 'CI-1' } }, entityMap(null), result, user,
        );

        expect(out.map(r => r.MappedFields.DimensionID)).toEqual(['mj-dept']);
        expect(result.RecordsErrored).toBe(1);
        expect(result.Errors[0]).toMatchObject({ ExternalID: '2', ErrorCode: 'MATCH_RESOLUTION_ERROR' });
        expect(result.Errors[0].ErrorMessage).toContain('Dimensions');
        expect(recordMapReads).toHaveLength(1);
        expect(recordMapReads[0].ExtraFilter).toContain(`[CompanyIntegrationID]='CI-1'`);
        expect(recordMapReads[0].ExtraFilter).toContain(`[EntityID]='${DIMENSIONS_ID}'`);
        expect(recordMapReads[0].ExtraFilter).toContain(`IN (N'BC-DEPT',N'bc-missing')`);
    });

    it('reads nothing when the map declares no references', async () => {
        const out = await engine.resolveReferences([mapped('1', 'x')], [], { companyIntegration: { ID: 'CI-1' } }, entityMap(null), emptyResult(), user);
        expect(out).toHaveLength(1);
        expect(recordMapReads).toHaveLength(0);
    });
});
