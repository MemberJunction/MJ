import { describe, it, expect, beforeEach } from 'vitest';
import {
    shouldEmitCascadeForRelatedEntity,
    entityInCustomBaseViewRefreshScope,
} from '../Database/schema-filters';
import {
    buildHealSchemaRoutineParams,
    snapshotAuthoredExcludeSchemas,
    getAuthoredExcludeSchemas,
    resetAuthoredExcludeSnapshot,
} from '../Database/heal-schema-params';
import { applyIncludeSchemaScope } from '../Database/schema-scope';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';

describe('shouldEmitCascadeForRelatedEntity', () => {
    it('emits intra-schema cascade when the flag is off', () => {
        expect(shouldEmitCascadeForRelatedEntity('__mj_BizAppsCommon', '__mj_BizAppsCommon', false)).toBe(true);
    });

    it('does not emit inter-schema cascade when the flag is off', () => {
        expect(shouldEmitCascadeForRelatedEntity('__mj_BizAppsCommon', '__mj_BizAppsOrders', false)).toBe(false);
    });

    it('matches schema names case-insensitively', () => {
        expect(shouldEmitCascadeForRelatedEntity('__mj_BizAppsCommon', '__MJ_BIZAPPSCOMMON', false)).toBe(true);
    });

    it('emits inter-schema cascade only when the flag is on', () => {
        expect(shouldEmitCascadeForRelatedEntity('__mj_BizAppsCommon', '__mj_BizAppsOrders', true)).toBe(true);
    });
});

describe('entityInCustomBaseViewRefreshScope', () => {
    it('drops schemas in excludeSchemas even with no include list', () => {
        expect(entityInCustomBaseViewRefreshScope('sys', ['sys', 'staging'])).toBe(false);
        expect(entityInCustomBaseViewRefreshScope('__mj', ['sys', 'staging'])).toBe(true);
    });

    it('with includeSchemas set, keeps only that list (minus excludes)', () => {
        expect(entityInCustomBaseViewRefreshScope(
            '__mj_BizAppsCommon',
            ['sys', 'staging'],
            ['__mj_BizAppsCommon'],
        )).toBe(true);
        expect(entityInCustomBaseViewRefreshScope(
            '__mj_BizAppsOrders',
            ['sys', 'staging'],
            ['__mj_BizAppsCommon'],
        )).toBe(false);
    });

    it('still drops an included schema that is also excluded', () => {
        expect(entityInCustomBaseViewRefreshScope(
            '__mj_BizAppsCommon',
            ['__mj_BizAppsCommon'],
            ['__mj_BizAppsCommon'],
        )).toBe(false);
    });
});

describe('buildHealSchemaRoutineParams', () => {
    it('omits IncludedSchemaNames when includeSchemas is empty (classic MJ)', () => {
        const p = buildHealSchemaRoutineParams({
            authoredExclude: ['sys', 'staging'],
        });
        expect(p.names).toEqual(['ExcludedSchemaNames']);
        expect(p.values).toEqual([`'sys,staging'`]);
    });

    it('adds IncludedSchemaNames from includeSchemas and never a sibling snapshot', () => {
        const p = buildHealSchemaRoutineParams({
            authoredExclude: ['sys', 'staging'],
            includeSchemas: ['__mj_BizAppsCommon'],
        });
        expect(p.names).toEqual(['ExcludedSchemaNames', 'IncludedSchemaNames']);
        expect(p.values).toEqual([`'sys,staging'`, `'__mj_BizAppsCommon'`]);
        expect(p.values.join(',')).not.toContain('Orders');
        expect(p.values.join(',')).not.toContain('Accounting');
    });

    it('places EntityIDs before IncludedSchemaNames', () => {
        const p = buildHealSchemaRoutineParams({
            authoredExclude: ['sys'],
            includeSchemas: ['__mj_BizAppsCommon'],
            entityIDs: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
        });
        expect(p.names).toEqual(['ExcludedSchemaNames', 'EntityIDs', 'IncludedSchemaNames']);
    });

    it('SQL Server named EXEC with include does not list sibling Open Apps', () => {
        const p = buildHealSchemaRoutineParams({
            authoredExclude: ['sys', 'staging'],
            includeSchemas: ['__mj_BizAppsCommon'],
        });
        const sql = new SQLServerCodeGenProvider().callRoutineSQL(
            '__mj',
            'spUpdateExistingEntitiesFromSchema',
            p.values,
            p.names,
        );
        expect(sql).toBe(
            `EXEC [__mj].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='__mj_BizAppsCommon'`,
        );
        expect(sql).not.toMatch(/BizAppsOrders/);
    });
});

describe('authored exclude snapshot vs include compile', () => {
    beforeEach(() => {
        resetAuthoredExcludeSnapshot();
    });

    it('heal params keep sys,staging after includeSchemas compiles siblings into excludeSchemas', () => {
        const config = {
            includeSchemas: ['__mj_BizAppsCommon'],
            excludeSchemas: ['sys', 'staging'],
        };
        snapshotAuthoredExcludeSchemas(config.excludeSchemas);
        applyIncludeSchemaScope(
            ['__mj_BizAppsCommon', '__mj_BizAppsOrders', '__mj_BizAppsAccounting', 'sys', 'staging'],
            config,
        );
        expect(config.excludeSchemas).toContain('__mj_BizAppsOrders');
        expect(getAuthoredExcludeSchemas()).toEqual(['sys', 'staging']);

        const p = buildHealSchemaRoutineParams({
            authoredExclude: getAuthoredExcludeSchemas(),
            includeSchemas: config.includeSchemas,
        });
        expect(p.values[0]).toBe(`'sys,staging'`);
        expect(p.values.join(',')).not.toContain('Orders');
    });
});

describe('PostgreSQL metadata support objects include the new parameter', () => {
    it('declares p_IncludedSchemaNames on the heal functions', () => {
        const sql = new PostgreSQLCodeGenProvider().getMetadataSupportObjectsSQL('__mj');
        expect(sql).toBeTruthy();
        expect(sql!).toContain('p_IncludedSchemaNames');
        expect(sql!).toContain('spUpdateExistingEntitiesFromSchema');
        expect(sql!).toContain('spDeleteUnneededEntityFields');
    });
});
