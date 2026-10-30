import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
    configInfo: { SQLOutput: { enabled: false } },
    currentWorkingDirectory: '/tmp',
    MjCoreSchema: () => '__mj',
    DbPlatform: () => 'sqlserver',
}));
vi.mock('../Misc/status_logging', () => ({ logError: vi.fn(), logStatus: vi.fn() }));

import { SQLLogging } from '../Misc/sql_logging';

/**
 * The SQL log becomes a Flyway migration by swapping schema names for placeholders. `__mj` is
 * also the prefix of MJ's system columns and of Open App schema names, so the swap must touch only
 * a schema name that stands alone; otherwise a field name like `__mj_Latitude_BillToAddressID`
 * resolves correctly only on a host whose core schema is `__mj`.
 */
describe('SQLLogging.ApplySchemaPlaceholders', () => {
    const appMappings = [
        { schema: '__mj_BizAppsOrders', placeholder: '${flyway:defaultSchema}' },
        { schema: '__mj', placeholder: '${mjSchema}' },
    ];
    const coreOnly = [{ schema: '__mj', placeholder: '${mjSchema}' }];

    it('replaces bracketed and dotted schema references', () => {
        const sql = 'INSERT INTO [__mj].[EntityField] SELECT * FROM __mj.vwEntities';
        expect(SQLLogging.ApplySchemaPlaceholders(sql, coreOnly))
            .toBe('INSERT INTO [${mjSchema}].[EntityField] SELECT * FROM ${mjSchema}.vwEntities');
    });

    it('leaves __mj_-prefixed field names and view aliases literal', () => {
        const sql = "Name = '__mj_Latitude_BillToAddressID', __mj_emb_BillToAddressID.[Latitude] AS [__mj_Latitude], __mj_rgc.[Longitude]";
        expect(SQLLogging.ApplySchemaPlaceholders(sql, coreOnly)).toBe(sql);
    });

    it('leaves the __mj_ timestamp columns literal', () => {
        const sql = 'SET [__mj_UpdatedAt] = GETUTCDATE(), __mj_CreatedAt = GETUTCDATE()';
        expect(SQLLogging.ApplySchemaPlaceholders(sql, coreOnly)).toBe(sql);
    });

    it('leaves other Open App schema names literal', () => {
        const sql = 'SELECT * FROM [__mj_BizAppsCommon].[vwAddresses]';
        expect(SQLLogging.ApplySchemaPlaceholders(sql, appMappings)).toBe(sql);
    });

    it('replaces the core schema inside a comma-separated schema list without touching app schemas', () => {
        const sql = "@ExcludedSchemaNames='sys,staging,dbo,__mj,__mj_BizAppsCommon,__mj_BizAppsOrders'";
        expect(SQLLogging.ApplySchemaPlaceholders(sql, appMappings))
            .toBe("@ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon,${flyway:defaultSchema}'");
    });

    it("maps the app's own schema to its placeholder", () => {
        const sql = 'EXEC [__mj_BizAppsOrders].[spCreateOrderHeader]; EXEC [__mj].[spCreateEntityField]';
        expect(SQLLogging.ApplySchemaPlaceholders(sql, appMappings))
            .toBe('EXEC [${flyway:defaultSchema}].[spCreateOrderHeader]; EXEC [${mjSchema}].[spCreateEntityField]');
    });

    it('leaves a name that merely ends in the schema name literal', () => {
        const sql = 'CONSTRAINT [DF___mj] DEFAULT 0';
        expect(SQLLogging.ApplySchemaPlaceholders(sql, coreOnly)).toBe(sql);
    });
});
