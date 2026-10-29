import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import {
    DescribeSQLBatchObject,
    NormalizeSQLServerRoutineDefinition,
    SplitSQLServerBatches,
    StripSQLServerComments,
} from '../Database/providers/sqlserver/sqlServerScriptText';

/**
 * #3343 / #5636 — CodeGen regenerates a CRUD routine whose live definition no longer matches the
 * body it generates, even when the entity is on neither the new nor the modified list.
 *
 * Both issues are drift that a migration or R__RefreshMetadata resolved in metadata before CodeGen
 * ran: a dropped cascade-target column (stale spDelete) and a changed column default or type (stale
 * spCreate/spUpdate). The comparison is a normalized text compare of the generated CREATE body
 * against the cached OBJECT_DEFINITION.
 */

const GENERATED_SP_CREATE = `
-----------------------------------------------------------------
-- SQL Code Generation
-- Item: spCreateAuditLog
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AuditLog
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spCreateAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spCreateAuditLog];
GO

CREATE PROCEDURE [__mj].[spCreateAuditLog]
    @Status nvarchar(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [__mj].[AuditLog] ([Status]) VALUES (ISNULL(@Status, 'Failed'))
    -- return the new record from the base view
    SELECT * FROM [__mj].[vwAuditLogs] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [__mj].[spCreateAuditLog] TO [cdp_Developer]
`;

/** What OBJECT_DEFINITION returns for the same procedure: just the CREATE batch, CRLF line endings. */
const LIVE_SAME = `CREATE PROCEDURE [__mj].[spCreateAuditLog]\r\n    @Status nvarchar(50) = NULL\r\nAS\r\nBEGIN\r\n    SET NOCOUNT ON;\r\n    INSERT INTO [__mj].[AuditLog] ([Status]) VALUES (ISNULL(@Status, 'Failed'))\r\n    -- return the new record from the base view\r\n    SELECT * FROM [__mj].[vwAuditLogs] WHERE [ID] = SCOPE_IDENTITY()\r\nEND\r\n`;
const LIVE_OLD_DEFAULT = LIVE_SAME.replace("'Failed'", "'Success'");
const LIVE_OLD_TYPE = LIVE_SAME.replace('nvarchar(50)', 'nchar(10)');

describe('NormalizeSQLServerRoutineDefinition', () => {
    it('normalizes a generated script and the live definition of the same procedure to the same text', () => {
        const generated = NormalizeSQLServerRoutineDefinition(GENERATED_SP_CREATE);
        expect(generated).not.toBeNull();
        expect(generated).toBe(NormalizeSQLServerRoutineDefinition(LIVE_SAME));
        expect(generated!.startsWith('CREATE PROCEDURE [__mj].[spCreateAuditLog]')).toBe(true);
        expect(generated).not.toContain('GRANT');
        expect(generated).not.toContain('DROP');
    });

    it('distinguishes a changed default and a changed parameter type', () => {
        const generated = NormalizeSQLServerRoutineDefinition(GENERATED_SP_CREATE);
        expect(NormalizeSQLServerRoutineDefinition(LIVE_OLD_DEFAULT)).not.toBe(generated);
        expect(NormalizeSQLServerRoutineDefinition(LIVE_OLD_TYPE)).not.toBe(generated);
    });

    it('treats CREATE OR ALTER PROC as CREATE PROCEDURE', () => {
        const alt = LIVE_SAME.replace('CREATE PROCEDURE', 'CREATE OR ALTER PROC');
        expect(NormalizeSQLServerRoutineDefinition(alt)).toBe(NormalizeSQLServerRoutineDefinition(LIVE_SAME));
    });

    it('returns null when there is no CREATE PROCEDURE', () => {
        expect(NormalizeSQLServerRoutineDefinition('GRANT EXECUTE ON [x].[y] TO [r]')).toBeNull();
        expect(NormalizeSQLServerRoutineDefinition('')).toBeNull();
    });
});

describe('StripSQLServerComments', () => {
    it('keeps -- and /* inside string literals and bracketed identifiers', () => {
        expect(StripSQLServerComments("SELECT '--x' AS [a--b] -- gone\n/* gone */ FROM t")).toBe("SELECT '--x' AS [a--b] \n  FROM t");
    });
});

describe('SplitSQLServerBatches / DescribeSQLBatchObject', () => {
    it('splits on GO lines and names the object each batch acts on', () => {
        const batches = SplitSQLServerBatches(GENERATED_SP_CREATE);
        expect(batches.map(DescribeSQLBatchObject)).toEqual([
            'DROP PROCEDURE [__mj].[spCreateAuditLog]',
            'CREATE PROCEDURE [__mj].[spCreateAuditLog]',
            'GRANT ON [__mj].[spCreateAuditLog]',
        ]);
    });

    it('names a view refresh and falls back to the batch text', () => {
        expect(DescribeSQLBatchObject("EXEC sp_refreshview 'app.vwOrders';")).toBe("EXEC sp_refreshview 'app.vwOrders'");
        expect(DescribeSQLBatchObject('UPDATE x SET y = 1')).toBe('UPDATE x SET y = 1');
    });
});

class TestableSQLCodeGen extends SQLCodeGenBase {
    public Seed(defs: Record<string, string> | null): void {
        this.existingRoutines = defs === null ? null : new Set(Object.keys(defs));
        this.existingRoutineDefinitions = defs === null ? null : new Map(Object.entries(defs));
    }
    public Force(entity: Partial<EntityInfo>, name: string, generated?: string): boolean {
        return this.forceLogForRoutine(entity as EntityInfo, name, false, generated);
    }
    public get Drifted(): string[] {
        return [...this.driftedRoutines];
    }
}

const auditLog: Partial<EntityInfo> = {
    SchemaName: '__mj',
    BaseTable: 'AuditLog',
    BaseTableCodeName: 'AuditLog',
    BaseView: 'vwAuditLogs',
    spCreate: 'spCreateAuditLog',
    spUpdate: 'spUpdateAuditLog',
    spDelete: 'spDeleteAuditLog',
    SaveReturnMode: 'full',
};

describe('forceLogForRoutine — live definition drift', () => {
    it('force-logs spCreate when the live default differs from the generated one (#5636)', () => {
        const gen = new TestableSQLCodeGen();
        gen.Seed({ '__mj.spcreateauditlog': LIVE_OLD_DEFAULT });
        expect(gen.Force(auditLog, 'spCreateAuditLog', GENERATED_SP_CREATE)).toBe(true);
        expect(gen.Drifted).toEqual(['__mj.spcreateauditlog']);
    });

    it('force-logs spCreate when a parameter type is stale', () => {
        const gen = new TestableSQLCodeGen();
        gen.Seed({ '__mj.spcreateauditlog': LIVE_OLD_TYPE });
        expect(gen.Force(auditLog, 'spCreateAuditLog', GENERATED_SP_CREATE)).toBe(true);
    });

    it('force-logs a stale spDelete whose cascade references a dropped column (#3343)', () => {
        const generated = `IF OBJECT_ID('[__mj].[spDeleteAuditLog]', 'P') IS NOT NULL DROP PROCEDURE [__mj].[spDeleteAuditLog];\nGO\nCREATE PROCEDURE [__mj].[spDeleteAuditLog] @ID uniqueidentifier AS BEGIN DELETE FROM [__mj].[AuditLog] WHERE [ID] = @ID END\nGO`;
        const live = `CREATE PROCEDURE [__mj].[spDeleteAuditLog] @ID uniqueidentifier AS BEGIN UPDATE [__mj].[Child] SET [AgentRunID] = NULL WHERE [AgentRunID] = @ID; DELETE FROM [__mj].[AuditLog] WHERE [ID] = @ID END`;
        const gen = new TestableSQLCodeGen();
        gen.Seed({ '__mj.spdeleteauditlog': live });
        expect(gen.Force(auditLog, 'spDeleteAuditLog', generated)).toBe(true);
    });

    it('does not force-log when only comments, header and whitespace differ', () => {
        const gen = new TestableSQLCodeGen();
        gen.Seed({ '__mj.spcreateauditlog': LIVE_SAME });
        expect(gen.Force(auditLog, 'spCreateAuditLog', GENERATED_SP_CREATE)).toBe(false);
        expect(gen.Drifted).toEqual([]);
    });

    it('does not compare when no generated body is passed, or definitions were not loaded (PostgreSQL)', () => {
        const gen = new TestableSQLCodeGen();
        gen.Seed({ '__mj.spcreateauditlog': LIVE_OLD_DEFAULT });
        expect(gen.Force(auditLog, 'spCreateAuditLog')).toBe(false);

        const pg = new TestableSQLCodeGen();
        pg.Seed(null);
        expect(pg.Force(auditLog, 'spCreateAuditLog', GENERATED_SP_CREATE)).toBe(false);
    });

    it('ignores routines that are not the entity CRUD routines', () => {
        const gen = new TestableSQLCodeGen();
        gen.Seed({ '__mj.spcustomthing': 'CREATE PROCEDURE [__mj].[spCustomThing] AS SELECT 1' });
        expect(gen.Force(auditLog, 'spCustomThing', 'CREATE PROCEDURE [__mj].[spCustomThing] AS SELECT 2')).toBe(false);
    });
});
