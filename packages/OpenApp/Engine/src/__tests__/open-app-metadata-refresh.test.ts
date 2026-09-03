import { describe, it, expect } from 'vitest';
import {
    buildFieldProcExcludedSchemaNames,
    buildOpenAppRefreshMetadataSQL,
    isOpenAppSchema,
} from '../install/open-app-metadata-refresh';

describe('isOpenAppSchema', () => {
    it('is false for the core schema', () => {
        expect(isOpenAppSchema('__mj', '__mj')).toBe(false);
        expect(isOpenAppSchema('__MJ', '__mj')).toBe(false);
    });

    it('is true for any other schema', () => {
        expect(isOpenAppSchema('__mj_BizAppsCommon', '__mj')).toBe(true);
    });
});

describe('buildFieldProcExcludedSchemaNames', () => {
    it('always excludes sys and staging and never excludes the app schema', () => {
        expect(
            buildFieldProcExcludedSchemaNames('__mj_BizAppsCommon', ['__mj', '__mj_BizAppsCommon', '__mj_BizAppsOrders']),
        ).toBe('sys,staging,__mj,__mj_BizAppsOrders');
    });
});

describe('buildOpenAppRefreshMetadataSQL', () => {
    it('SQL Server includes the app schema on view refresh and excludes siblings on field procs', () => {
        const sql = buildOpenAppRefreshMetadataSQL('sqlserver', '__mj', '__mj_BizAppsCommon', ['__mj', '__mj_BizAppsOrders']);
        expect(sql).toContain("@IncludedSchemaNames=N'__mj_BizAppsCommon'");
        expect(sql).toContain('spRecompileAllViews');
        expect(sql).toContain('spUpdateExistingEntityFieldsFromSchema');
        expect(sql).not.toContain('spRecompileAllProceduresInDependencyOrder');
        expect(sql).not.toMatch(/spRecompileAllViews[^\n]*__mj_BizAppsOrders/);
    });

    it('PostgreSQL restars layered outers then heals AllowsNull and field catalog', () => {
        const sql = buildOpenAppRefreshMetadataSQL('postgresql', '__mj', '__mj_BizAppsCommon', ['__mj']);
        expect(sql).toContain('spRebindLayeredOuterViewsInSchema');
        expect(sql.indexOf('spRebindLayeredOuterViewsInSchema')).toBeLessThan(sql.indexOf('"AllowsNull"'));
        expect(sql).toContain('"AllowsNull"');
        expect(sql).toContain('spDeleteUnneededEntityFields');
        expect(sql).toContain('spUpdateExistingEntityFieldsFromSchema');
        expect(sql).not.toContain('spRecompileAllViews');
        expect(sql).toContain(`e."SchemaName" = '__mj_bizappscommon'`);
    });
});
