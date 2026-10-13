/**
 * Tests for ScheduledGeocodingAction's orphan-cleanup key probe. RecordGeoCode.RecordID stores the
 * source record's key as the bare value for a single-column key and as the values joined with '||'
 * for a composite key, so the `NOT EXISTS` probe that decides a geocode row is orphaned must rebuild
 * exactly that string from the source row. Probing only the first key column matches nothing for a
 * composite-keyed entity and would delete every geocode row it owns.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    MJGlobal: { Instance: {} },
    MJEventType: {},
}));
vi.mock('@memberjunction/actions-base', () => ({}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/core', () => ({
    RunView: class {},
    Metadata: class {},
    LogStatus: vi.fn(),
    LogError: vi.fn(),
    CompositeKey: class {},
    BaseEntity: class {},
    IsKeysetPaginationOrderableType: () => true,
}));
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/geo-core', () => ({ GeoCodeSyncService: class {} }));

import { EntityInfo } from '@memberjunction/core';
import { GetDialect, SQLDialect } from '@memberjunction/sql-dialect';
import { ScheduledGeocodingAction } from '../custom/geo/scheduled-geocoding.action';

/** Exposes the protected SQL builder without touching the rest of the action. */
class ProbeAction extends ScheduledGeocodingAction {
    public Expression(entityInfo: EntityInfo, alias: string, dialect: SQLDialect): string {
        return this.BuildRecordIdExpression(entityInfo, alias, dialect);
    }
}

const entityWithKeys = (...names: string[]): EntityInfo =>
    ({ PrimaryKeys: names.map(Name => ({ Name })) } as unknown as EntityInfo);

describe('ScheduledGeocodingAction.BuildRecordIdExpression', () => {
    const action = new ProbeAction();

    it('casts a single-column key (any column name) to a bounded string on SQL Server', () => {
        const sql = action.Expression(entityWithKeys('individual_id'), 'src', GetDialect('sqlserver'));
        expect(sql).toBe('CAST(src.[individual_id] AS NVARCHAR(450))');
    });

    it('joins a composite key with the || delimiter RecordID uses, on SQL Server', () => {
        const sql = action.Expression(entityWithKeys('OrderID', 'LineNo'), 'src', GetDialect('sqlserver'));
        expect(sql).toBe("CAST(src.[OrderID] AS NVARCHAR(450)) + '||' + CAST(src.[LineNo] AS NVARCHAR(450))");
    });

    it('uses the PostgreSQL concat operator and identifier quoting for a composite key', () => {
        const sql = action.Expression(entityWithKeys('OrderID', 'LineNo'), 'src', GetDialect('postgresql'));
        expect(sql).toBe('CAST(src."OrderID" AS VARCHAR(450)) || \'||\' || CAST(src."LineNo" AS VARCHAR(450))');
    });
});
