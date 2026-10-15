/**
 * Base-view GRANTs for a LAYERED entity on PostgreSQL.
 *
 * The application owns the outer `BaseView`, which may not exist during the bootstrap pass, so the
 * GRANTs are wrapped in `DO $if_view_exists$ ... $if_view_exists$`. The per-entity generator used to
 * hand an already-guarded body to `generateCustomBaseViewRefreshAndPermissions`, which guards again.
 * On SQL Server the doubled wrapper is only an escaped string inside sp_executesql; on PostgreSQL the
 * inner block reuses the outer dollar-quote tag, so the generated script does not parse
 * (`syntax error at or near "BEGIN"`) and a capture executing it creates none of the entity's views.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { PostgreSQLCodeGenProvider } from '../PostgreSQLCodeGenProvider';
import { SQLCodeGenBase } from '../../../sql_codegen';
import type { CodeGenConnection } from '../../../codeGenDatabaseProvider';

const emptyConnection: CodeGenConnection = {
    get Dialect(): never { throw new Error('emptyConnection: Dialect must not be read in this test'); },
    query: async () => ({ recordset: [], rows: [] }),
    queryWithParams: async () => ({ recordset: [], rows: [] }),
    executeStoredProcedure: async () => ({ recordset: [], rows: [] }),
    beginTransaction: () => { throw new Error('emptyConnection: beginTransaction() must not be called'); },
} as unknown as CodeGenConnection;

function layeredEntity(): EntityInfo {
    return new EntityInfo({
        ID: 'entity-1',
        Name: 'Rubric Evaluations',
        SchemaName: '__mj',
        BaseTable: 'RubricEvaluation',
        BaseTableCodeName: 'RubricEvaluation',
        BaseView: 'vwRubricEvaluations',
        BaseViewGenerated: false,
        GeneratedBaseViewName: 'vwRubricEvaluationsGenerated',
        IncludeInAPI: true,
        AllowCreateAPI: false,
        AllowUpdateAPI: false,
        AllowDeleteAPI: false,
        VirtualEntity: false,
        DeleteType: 'Hard',
        EntityPermissions: [{ RoleSQLName: 'cdp_UI' }],
        EntityFields: [
            { ID: 'pk-1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false,
              AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false },
        ],
    });
}

class Probe extends SQLCodeGenBase {
    public bodies: string[] = [];
    protected override generateCustomBaseViewRefreshAndPermissions(entity: EntityInfo, header: string, body: string): string {
        this.bodies.push(body);
        return super.generateCustomBaseViewRefreshAndPermissions(entity, header, body);
    }
}

describe('PostgreSQL base-view permissions for a layered entity', () => {
    it('wraps the GRANT in the view-exists guard exactly once', async () => {
        const probe = new Probe();
        probe.DBProvider = new PostgreSQLCodeGenProvider();
        const r = await probe.generateSingleEntitySQLToSeparateFiles({
            pool: emptyConnection, entity: layeredEntity(), directory: '/tmp',
            onlyPermissions: false, writeFiles: false, skipExecution: true,
        });

        // The body handed to the guarding method must not already be guarded.
        expect(probe.bodies.length).toBe(1);
        expect(probe.bodies[0]).not.toContain('$if_view_exists$');

        const executed = r.sql;
        expect(executed).toContain('GRANT SELECT ON "__mj"."vwRubricEvaluations" TO "cdp_UI"');
        // A nested guard escapes the inner regclass literal: to_regclass(''...'').
        expect(executed).not.toContain("to_regclass(''");
    });
});
