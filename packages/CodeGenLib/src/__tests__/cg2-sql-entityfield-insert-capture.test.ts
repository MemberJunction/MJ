import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * #3158: the late-phase view regeneration (STEP 3.5) re-runs manageEntityFields to create the
 * virtual EntityField rows for columns the regenerated view gained, such as `__mj_Latitude` /
 * `__mj_Longitude`. Those INSERTs must reach the CodeGen_Run capture, or the capture replayed on
 * another database creates the view without its metadata. New fields go through
 * createNewEntityFieldsFromSchema, which logs every INSERT as a non-recurring unit (recurring units
 * may be omitted from the capture; the orphan prune is one of those, by design).
 */

import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLLogging } from '../Misc/sql_logging';
import { SQLServerDialect, type SQLDialect } from '@memberjunction/sql-dialect';
import type { CodeGenConnection, CodeGenQueryResult, CodeGenTransaction } from '../Database/codeGenDatabaseProvider';

const ENTITY_ID = '5D3B1F0A-8C7E-4E44-9A61-2B2F7B0C4D11';

function pendingGeoField(name: string, ordinal: number): Record<string, unknown> {
    return {
        EntityID: ENTITY_ID, EntityName: 'Venues', FieldName: name, SourceOrdinal: ordinal, Sequence: 100000 + ordinal,
        Description: null, Type: 'decimal', Length: 9, Precision: 18, Scale: 8, AllowsNull: true, DefaultValue: null,
        AutoIncrement: false, AllowUpdateAPI: false, IsVirtual: true, IsComputed: false,
        RelatedEntityID: null, RelatedEntityFieldName: null, IsNameField: false,
    };
}

class PendingGeoFields extends ManageMetadataBase {
    protected override async runQuery(): Promise<CodeGenQueryResult> {
        return { recordset: [pendingGeoField('__mj_Latitude', 30), pendingGeoField('__mj_Longitude', 31)] };
    }
    public async Run(pool: CodeGenConnection): Promise<boolean> {
        return this.createNewEntityFieldsFromSchema(pool, [ENTITY_ID]);
    }
}

class StubConnection implements CodeGenConnection {
    public get Dialect(): SQLDialect {
        return new SQLServerDialect();
    }
    public async query(): Promise<CodeGenQueryResult> {
        return { recordset: [] };
    }
    public async queryWithParams(): Promise<CodeGenQueryResult> {
        return { recordset: [] };
    }
    public async executeStoredProcedure(): Promise<CodeGenQueryResult> {
        return { recordset: [] };
    }
    public async beginTransaction(): Promise<CodeGenTransaction> {
        return {
            query: async (): Promise<CodeGenQueryResult> => ({ recordset: [] }),
            commit: async (): Promise<void> => undefined,
            rollback: async (): Promise<void> => undefined,
        };
    }
}

describe('#3158 virtual EntityField INSERTs reach the CodeGen_Run capture', () => {
    let dir: string;
    let logFile: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg2-sql-capture-'));
        logFile = path.join(dir, 'CodeGen_Run.sql');
        fs.writeFileSync(logFile, '');
        SQLLogging.SetFilePathForTesting(logFile);
    });

    afterEach(() => {
        SQLLogging.ResetForTests();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('logs one guarded INSERT per new virtual field, in schema order', async () => {
        expect(await new PendingGeoFields().Run(new StubConnection())).toBe(true);

        const log = fs.readFileSync(logFile, 'utf-8');
        expect(log.match(/INSERT INTO \[__mj\]\.\[EntityField\]/g)).toHaveLength(2);
        expect(log.indexOf("'__mj_Latitude'")).toBeGreaterThan(-1);
        expect(log.indexOf("'__mj_Latitude'")).toBeLessThan(log.indexOf("'__mj_Longitude'"));
        // Each INSERT is guarded so a replay on a database that already has the row is a no-op.
        expect(log).toMatch(/IF NOT EXISTS/i);
    });

    it('is captured even when recurring scripts are omitted from the log', async () => {
        expect(SQLLogging.OmitRecurringScriptsFromLog).toBe(true);
        await new PendingGeoFields().Run(new StubConnection());
        expect(fs.readFileSync(logFile, 'utf-8')).toContain('__mj_Longitude');
    });
});
