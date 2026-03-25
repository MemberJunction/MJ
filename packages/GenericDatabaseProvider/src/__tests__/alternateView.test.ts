import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Standalone helper that mirrors GenericDatabaseProvider.QuoteSchemaAndView()
 * for SQL Server bracket-quoting. No actual provider import needed.
 */
function quoteSchemaAndView(schema: string, obj: string): string {
    return `[${schema}].[${obj}]`;
}

/**
 * Tests that GenericDatabaseProvider.InternalRunView() correctly resolves
 * alternate view names to the effective view/schema for SQL construction.
 *
 * Since InternalRunView is protected and calls ExecuteSQL (which needs a DB),
 * we test the resolution logic that it uses by mirroring the exact code path:
 *   1. entityInfo.GetAdditionalBaseView(params.AlternateViewName)
 *   2. Resolve effectiveViewName / effectiveSchemaName
 *   3. QuoteSchemaAndView(effectiveSchemaName, effectiveViewName) for SQL
 */
describe('GenericDatabaseProvider AlternateViewName resolution', () => {

    /**
     * Simulates the exact logic from InternalRunView() lines 796-805:
     *
     *   let effectiveViewName = entityInfo.BaseView;
     *   let effectiveSchemaName = entityInfo.SchemaName;
     *   if (params.AlternateViewName && params.AlternateViewName.trim().length > 0) {
     *       const altView = entityInfo.GetAdditionalBaseView(params.AlternateViewName);
     *       if (altView) {
     *           effectiveViewName = altView.Name;
     *           effectiveSchemaName = altView.SchemaName || entityInfo.SchemaName;
     *       }
     *   }
     */
    function resolveEffectiveView(
        entityInfo: { BaseView: string; SchemaName: string; GetAdditionalBaseView: (name: string) => { Name: string; SchemaName?: string | null } | null },
        alternateViewName?: string
    ): { viewName: string; schemaName: string } {
        let effectiveViewName = entityInfo.BaseView;
        let effectiveSchemaName = entityInfo.SchemaName;
        if (alternateViewName && alternateViewName.trim().length > 0) {
            const altView = entityInfo.GetAdditionalBaseView(alternateViewName);
            if (altView) {
                effectiveViewName = altView.Name;
                effectiveSchemaName = altView.SchemaName || entityInfo.SchemaName;
            }
        }
        return { viewName: effectiveViewName, schemaName: effectiveSchemaName };
    }

    function createMockEntityInfo(options: {
        baseView: string;
        schemaName: string;
        additionalViews?: { Name: string; SchemaName?: string | null }[];
    }) {
        const views = options.additionalViews || [];
        return {
            BaseView: options.baseView,
            SchemaName: options.schemaName,
            GetAdditionalBaseView: (name: string) =>
                views.find(v => v.Name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null,
        };
    }

    describe('View resolution logic (mirrors InternalRunView lines 796-805)', () => {
        it('should use default BaseView when AlternateViewName is undefined', () => {
            const entity = createMockEntityInfo({
                baseView: 'vwEntities',
                schemaName: '__mj',
                additionalViews: [{ Name: 'vwEntities_ActiveOnly', SchemaName: '__mj' }],
            });

            const result = resolveEffectiveView(entity, undefined);
            expect(result.viewName).toBe('vwEntities');
            expect(result.schemaName).toBe('__mj');
        });

        it('should use default BaseView when AlternateViewName is empty string', () => {
            const entity = createMockEntityInfo({
                baseView: 'vwEntities',
                schemaName: '__mj',
                additionalViews: [{ Name: 'vwEntities_ActiveOnly', SchemaName: '__mj' }],
            });

            const result = resolveEffectiveView(entity, '');
            expect(result.viewName).toBe('vwEntities');
            expect(result.schemaName).toBe('__mj');
        });

        it('should use default BaseView when AlternateViewName is whitespace', () => {
            const entity = createMockEntityInfo({
                baseView: 'vwEntities',
                schemaName: '__mj',
                additionalViews: [{ Name: 'vwEntities_ActiveOnly', SchemaName: '__mj' }],
            });

            const result = resolveEffectiveView(entity, '   ');
            expect(result.viewName).toBe('vwEntities');
            expect(result.schemaName).toBe('__mj');
        });

        it('should resolve a valid AlternateViewName to the alternate view', () => {
            const entity = createMockEntityInfo({
                baseView: 'vwEntities',
                schemaName: '__mj',
                additionalViews: [{ Name: 'vwEntities_ActiveOnly', SchemaName: '__mj' }],
            });

            const result = resolveEffectiveView(entity, 'vwEntities_ActiveOnly');
            expect(result.viewName).toBe('vwEntities_ActiveOnly');
            expect(result.schemaName).toBe('__mj');
        });

        it('should resolve AlternateViewName case-insensitively', () => {
            const entity = createMockEntityInfo({
                baseView: 'vwEntities',
                schemaName: '__mj',
                additionalViews: [{ Name: 'vwEntities_ActiveOnly', SchemaName: '__mj' }],
            });

            const result = resolveEffectiveView(entity, 'VWENTITIES_ACTIVEONLY');
            expect(result.viewName).toBe('vwEntities_ActiveOnly');
            expect(result.schemaName).toBe('__mj');
        });

        it('should use alternate view SchemaName when provided', () => {
            const entity = createMockEntityInfo({
                baseView: 'vwEntities',
                schemaName: '__mj',
                additionalViews: [{ Name: 'vwEntitiesCustom', SchemaName: 'custom_schema' }],
            });

            const result = resolveEffectiveView(entity, 'vwEntitiesCustom');
            expect(result.viewName).toBe('vwEntitiesCustom');
            expect(result.schemaName).toBe('custom_schema');
        });

        it('should fall back to entity SchemaName when alternate view SchemaName is null', () => {
            const entity = createMockEntityInfo({
                baseView: 'vwEntities',
                schemaName: '__mj',
                additionalViews: [{ Name: 'vwEntitiesCustom', SchemaName: null }],
            });

            const result = resolveEffectiveView(entity, 'vwEntitiesCustom');
            expect(result.viewName).toBe('vwEntitiesCustom');
            expect(result.schemaName).toBe('__mj');
        });

        it('should fall back to entity SchemaName when alternate view SchemaName is undefined', () => {
            const entity = createMockEntityInfo({
                baseView: 'vwEntities',
                schemaName: '__mj',
                additionalViews: [{ Name: 'vwEntitiesCustom' }],
            });

            const result = resolveEffectiveView(entity, 'vwEntitiesCustom');
            expect(result.viewName).toBe('vwEntitiesCustom');
            expect(result.schemaName).toBe('__mj');
        });

        it('should fall back to entity SchemaName when alternate view SchemaName is empty string', () => {
            // Empty string is falsy in JS, so `|| entityInfo.SchemaName` kicks in
            const entity = createMockEntityInfo({
                baseView: 'vwEntities',
                schemaName: '__mj',
                additionalViews: [{ Name: 'vwEntitiesCustom', SchemaName: '' }],
            });

            const result = resolveEffectiveView(entity, 'vwEntitiesCustom');
            expect(result.viewName).toBe('vwEntitiesCustom');
            expect(result.schemaName).toBe('__mj');
        });

        it('should keep default view when AlternateViewName is not found in additional views', () => {
            const entity = createMockEntityInfo({
                baseView: 'vwEntities',
                schemaName: '__mj',
                additionalViews: [{ Name: 'vwEntities_ActiveOnly', SchemaName: '__mj' }],
            });

            // Note: In real code, ProviderBase.PreRunView() would have already
            // rejected this with an error. But InternalRunView silently falls
            // back to the default view if GetAdditionalBaseView returns null.
            const result = resolveEffectiveView(entity, 'vwDoesNotExist');
            expect(result.viewName).toBe('vwEntities');
            expect(result.schemaName).toBe('__mj');
        });

        it('should keep default view when entity has no additional views', () => {
            const entity = createMockEntityInfo({
                baseView: 'vwEntities',
                schemaName: '__mj',
                additionalViews: [],
            });

            const result = resolveEffectiveView(entity, 'vwAnything');
            expect(result.viewName).toBe('vwEntities');
            expect(result.schemaName).toBe('__mj');
        });
    });

    describe('SQL construction with resolved view', () => {
        it('should produce correct SQL for default view', () => {
            const { viewName, schemaName } = resolveEffectiveView(
                createMockEntityInfo({ baseView: 'vwEntities', schemaName: '__mj' }),
                undefined
            );

            const selectSQL = `SELECT * FROM ${quoteSchemaAndView(schemaName, viewName)}`;
            const countSQL = `SELECT COUNT(*) AS TotalRowCount FROM ${quoteSchemaAndView(schemaName, viewName)}`;

            expect(selectSQL).toBe('SELECT * FROM [__mj].[vwEntities]');
            expect(countSQL).toBe('SELECT COUNT(*) AS TotalRowCount FROM [__mj].[vwEntities]');
        });

        it('should produce correct SQL for alternate view', () => {
            const { viewName, schemaName } = resolveEffectiveView(
                createMockEntityInfo({
                    baseView: 'vwEntities',
                    schemaName: '__mj',
                    additionalViews: [{ Name: 'vwEntities_ActiveOnly', SchemaName: '__mj' }],
                }),
                'vwEntities_ActiveOnly'
            );

            const selectSQL = `SELECT * FROM ${quoteSchemaAndView(schemaName, viewName)}`;
            const countSQL = `SELECT COUNT(*) AS TotalRowCount FROM ${quoteSchemaAndView(schemaName, viewName)}`;

            expect(selectSQL).toBe('SELECT * FROM [__mj].[vwEntities_ActiveOnly]');
            expect(countSQL).toBe('SELECT COUNT(*) AS TotalRowCount FROM [__mj].[vwEntities_ActiveOnly]');
        });

        it('should produce correct SQL for alternate view with custom schema', () => {
            const { viewName, schemaName } = resolveEffectiveView(
                createMockEntityInfo({
                    baseView: 'vwEntities',
                    schemaName: '__mj',
                    additionalViews: [{ Name: 'vwEntitiesExtended', SchemaName: 'reporting' }],
                }),
                'vwEntitiesExtended'
            );

            const selectSQL = `SELECT * FROM ${quoteSchemaAndView(schemaName, viewName)}`;
            expect(selectSQL).toBe('SELECT * FROM [reporting].[vwEntitiesExtended]');
        });

        it('should produce SQL with WHERE clause against alternate view', () => {
            const { viewName, schemaName } = resolveEffectiveView(
                createMockEntityInfo({
                    baseView: 'vwEntities',
                    schemaName: '__mj',
                    additionalViews: [{ Name: 'vwEntities_ActiveOnly', SchemaName: '__mj' }],
                }),
                'vwEntities_ActiveOnly'
            );

            const extraFilter = "SchemaName = '__mj'";
            const fullSQL = `SELECT * FROM ${quoteSchemaAndView(schemaName, viewName)} WHERE (${extraFilter})`;

            expect(fullSQL).toBe("SELECT * FROM [__mj].[vwEntities_ActiveOnly] WHERE (SchemaName = '__mj')");
        });
    });

    describe('Multiple alternate views', () => {
        const entity = createMockEntityInfo({
            baseView: 'vwEntities',
            schemaName: '__mj',
            additionalViews: [
                { Name: 'vwEntities_ActiveOnly', SchemaName: '__mj' },
                { Name: 'vwEntities_WithPermissions', SchemaName: '__mj' },
                { Name: 'vwEntitiesReporting', SchemaName: 'reporting' },
            ],
        });

        it('should resolve each alternate view independently', () => {
            const r1 = resolveEffectiveView(entity, 'vwEntities_ActiveOnly');
            const r2 = resolveEffectiveView(entity, 'vwEntities_WithPermissions');
            const r3 = resolveEffectiveView(entity, 'vwEntitiesReporting');

            expect(r1.viewName).toBe('vwEntities_ActiveOnly');
            expect(r1.schemaName).toBe('__mj');

            expect(r2.viewName).toBe('vwEntities_WithPermissions');
            expect(r2.schemaName).toBe('__mj');

            expect(r3.viewName).toBe('vwEntitiesReporting');
            expect(r3.schemaName).toBe('reporting');
        });

        it('should still fall back to default for unknown views', () => {
            const result = resolveEffectiveView(entity, 'vwNonexistent');
            expect(result.viewName).toBe('vwEntities');
            expect(result.schemaName).toBe('__mj');
        });
    });
});
