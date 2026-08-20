import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import path from 'path';
import { EntityInfo } from '@memberjunction/core';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import { SQLUtilityBase } from '../Database/sql';
import { SQLExecutionDiagnostics } from '../Database/sql-execution-diagnostics';

/**
 * MJ#3975 §1 + §2 — what STEP 4 (`applyPermissions`) tells the operator when a GRANT fails.
 *
 * Two distinct defects meet in this one method:
 *
 * §2 (scope): `applyPermissions` is handed `baselineEntities` — INCLUDING the entities that
 *   `excludeSchemas` removed from generation — and STEP 2(c) deliberately writes permissions
 *   files for them. In a single-app database that is harmless. In a multi-app database those
 *   entities belong to OTHER apps whose `spCreate*`/`spUpdate*` may not exist yet, so
 *   whichever app runs CodeGen first fails its whole run on a sibling app's missing object.
 *   No consumer configuration can avoid it: the behaviour acts on precisely the entities the
 *   exclusion just removed.
 *
 * §1 (attribution): when an IN-SCOPE object failed to be created earlier in the run, its GRANT
 *   is the loudest thing in the output while the compilation error that actually caused it is
 *   one line among hundreds. A missing target object is a CONSEQUENCE, and the report must say
 *   so and name the first real failure.
 *
 * These are written from the expected behaviour, not from the implementation.
 */

const OUT_OF_SCOPE_SCHEMA = '__mj_BizAppsCommon';
const IN_SCOPE_SCHEMA = '__mj_BizAppsContracts';

function makeEntity(schema: string, name: string, baseTable: string, baseView: string): EntityInfo {
    return new EntityInfo({
        ID: `id-${schema}-${name}`,
        Name: name,
        SchemaName: schema,
        BaseTable: baseTable,
        BaseTableCodeName: baseTable,
        BaseView: baseView,
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: false,
        AllowDeleteAPI: false,
        EntityFields: [
            { ID: 'f-0', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
        ],
        EntityPermissions: [],
    });
}

/** A pool that fails a GRANT for any object named in `missingObjects`. */
function mockPool(missingObjects: string[]) {
    const executed: string[] = [];
    return {
        executed,
        query: async (sql: string) => {
            executed.push(sql);
            const missing = missingObjects.find((o) => sql.includes(o));
            if (missing) {
                // Verbatim SQL Server Msg 15151 shape.
                throw new Error(`Cannot find the object '${missing}', because it does not exist or you do not have permission.`);
            }
            return { recordset: [] };
        },
    };
}

/** Writes the permissions files STEP 2(c)/2(b) would have written, and returns the directory. */
function writePermissionFiles(entities: EntityInfo[], gen: SQLCodeGenBase): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj3975-perms-'));
    for (const e of entities) {
        for (const f of gen.getEntityPermissionFileNames(e)) {
            const full = path.join(dir, f);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            // The object the GRANT targets is encoded in the file name; put it in the body too.
            fs.writeFileSync(full, `GRANT SELECT ON [${path.basename(f).split('.')[0]}] TO [cdp_Developer]`);
        }
    }
    return dir;
}

/** Real `applyPermissions` on a constructor-free instance (the provider resolution is not needed). */
function newCodeGen(): SQLCodeGenBase {
    const gen = Object.create(SQLCodeGenBase.prototype) as SQLCodeGenBase;
    (gen as unknown as { _sqlUtilityObject: SQLUtilityBase })._sqlUtilityObject = Object.create(SQLUtilityBase.prototype) as SQLUtilityBase;
    (gen as unknown as { _dbProvider: unknown })._dbProvider = {
        getCRUDRoutineName: (e: EntityInfo, type: string) => `sp${type}${e.BaseTable}`,
    };
    return gen;
}

describe('MJ#3975 — applyPermissions diagnostics', () => {
    let logged: string[];

    beforeEach(() => {
        logged = [];
        SQLExecutionDiagnostics.Reset();
        vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logged.push(a.join(' ')); });
        vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { logged.push(a.join(' ')); });
        vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logged.push(a.join(' ')); });
    });

    it('§2 — a missing object in an OUT-OF-SCOPE schema does not fail the run', async () => {
        const gen = newCodeGen();
        const outOfScope = makeEntity(OUT_OF_SCOPE_SCHEMA, 'MJ_BizApps_Common: Organizations', 'Organizations', 'vwOrganizations');
        const inScope = makeEntity(IN_SCOPE_SCHEMA, 'MJ_BizApps_Contracts: Contracts', 'Contracts', 'vwContracts');
        const dir = writePermissionFiles([outOfScope, inScope], gen);

        // spCreateOrganization does not exist yet — bizapps-common has not generated.
        const pool = mockPool(['spCreateOrganization']);

        const ok = await gen.applyPermissions(pool as never, dir, [outOfScope, inScope], 5, new Set([outOfScope.ID]));

        expect(ok).toBe(true);
        // and it must SAY it skipped, naming the schema — a silent skip is its own defect.
        expect(logged.join('\n')).toMatch(new RegExp(`skip.*${OUT_OF_SCOPE_SCHEMA}|${OUT_OF_SCOPE_SCHEMA}.*skip`, 'is'));
    });

    it('§2 — a NON-missing-object error out of scope still fails the run', async () => {
        const gen = newCodeGen();
        const outOfScope = makeEntity(OUT_OF_SCOPE_SCHEMA, 'MJ_BizApps_Common: Organizations', 'Organizations', 'vwOrganizations');
        const dir = writePermissionFiles([outOfScope], gen);
        const pool = {
            query: async () => { throw new Error('Login failed for user \'cdp_Developer\'.'); },
        };

        const ok = await gen.applyPermissions(pool as never, dir, [outOfScope], 5, new Set([outOfScope.ID]));
        expect(ok).toBe(false);
    });

    it('§1 — an IN-SCOPE missing object is reported as a consequence, naming the first real failure', async () => {
        const gen = newCodeGen();
        const inScope = makeEntity(IN_SCOPE_SCHEMA, 'MJ_BizApps_Contracts: Contracts', 'Contracts', 'vwContracts');
        const dir = writePermissionFiles([inScope], gen);

        // The run's REAL failure, recorded when the entity SQL was executed in STEP 2(e).
        SQLExecutionDiagnostics.Record({
            file: `${IN_SCOPE_SCHEMA}/_temp_batch_execution_1.sql`,
            batchNumber: 10,
            totalBatches: 253,
            objectName: 'spCreateContracts',
            message: `View or function '${IN_SCOPE_SCHEMA}.vwContracts' has more column names specified than columns defined.`,
        });

        const pool = mockPool(['spCreateContracts']);
        const ok = await gen.applyPermissions(pool as never, dir, [inScope], 5, new Set());

        expect(ok).toBe(false);
        const out = logged.join('\n');
        // The reported CAUSE must be the view-compilation error, not the GRANT.
        expect(out).toMatch(/has more column names specified than columns defined/);
        // and the GRANT failure must be labelled as downstream of it.
        expect(out).toMatch(/consequence|caused by|downstream/i);
    });

    it('§1 — the summary names the FIRST failure, not just the batch index', async () => {
        const gen = newCodeGen();
        const a = makeEntity(IN_SCOPE_SCHEMA, 'A', 'As', 'vwAs');
        const b = makeEntity(IN_SCOPE_SCHEMA, 'B', 'Bs', 'vwBs');
        const dir = writePermissionFiles([a, b], gen);
        const pool = {
            query: async (sql: string) => {
                if (sql.includes('vwAs')) throw new Error('FIRST-FAILURE: permission denied on vwAs');
                if (sql.includes('vwBs')) throw new Error('SECOND-FAILURE: permission denied on vwBs');
                return { recordset: [] };
            },
        };

        const ok = await gen.applyPermissions(pool as never, dir, [a, b], 5, new Set());
        expect(ok).toBe(false);
        const out = logged.join('\n');
        expect(out).toMatch(/first failure/i);
        expect(out).toMatch(/FIRST-FAILURE: permission denied on vwAs/);
    });
});
