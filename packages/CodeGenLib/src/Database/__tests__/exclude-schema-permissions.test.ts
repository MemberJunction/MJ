import { describe, expect, it } from 'vitest';
import { entitiesNotInExcludedSchemas } from '../sql_codegen';

describe('excludeSchemas permission scope', () => {
    const entities = [
        { Name: 'MJ_BizApps_Orders: Products', SchemaName: '__mj_BizAppsOrders' },
        { Name: 'MJ_BizApps_Common: Contact Methods', SchemaName: '__mj_BizAppsCommon' },
        { Name: 'MJ: Users', SchemaName: '__mj' },
        { Name: 'MJ_BizApps_Orders: Product Types', SchemaName: '__mj_BizAppsOrders' },
    ];
    const excludeSchemas = [
        'sys',
        'staging',
        'dbo',
        '__mj',
        '__mj_UDT',
        '__mj_BizAppsCommon',
        '__mj_BizAppsAccounting',
        '__mj_BizAppsTasks',
    ];

    it('keeps only this app schema when sibling and core schemas are excluded', () => {
        const included = entitiesNotInExcludedSchemas(entities, excludeSchemas);
        expect(included.map((e) => e.Name)).toEqual([
            'MJ_BizApps_Orders: Products',
            'MJ_BizApps_Orders: Product Types',
        ]);
    });

    it('is case-insensitive on schema names', () => {
        const included = entitiesNotInExcludedSchemas(
            [{ Name: 'X', SchemaName: '__MJ_BizAppsOrders' }],
            ['__mj_bizappsorders'],
        );
        expect(included).toEqual([]);
    });
});
