/**
 * Tier-2a — dual-dialect schema-Apply test (NO external credentials).
 *
 * Proves the framework's schema-creation path is correct and identical-in-intent on BOTH
 * SQL Server and PostgreSQL, end-to-end against the LIVE workbench databases, using a
 * HubSpot-shaped fixture (no HubSpot key needed — the objects are hand-built to mirror what
 * DiscoverObjects returns: contacts, companies, deals, and an assoc_contacts_companies
 * junction with a COMPOSITE primary key).
 *
 * What it exercises (all REAL framework code, no mocks):
 *   1. EnrichSchemaConstraints.InferForeignKeys (C8) — must infer 3 FKs:
 *        deals.company_id → companies, assoc.contact_id → contacts, assoc.company_id → companies.
 *      The two composite-PK association parts are the bug this fixes: without FK edges the
 *      junction never DAG-orders after its parents and "some tables don't fill in".
 *   2. SchemaBuilder.BuildSchema — emits CREATE SCHEMA + CREATE TABLE DDL per platform,
 *      injecting the 5 __mj_integration_* system columns (incl. ContentHash) + soft-FK config.
 *   3. Executes the emitted DDL against the live workbench DBs and verifies via
 *      information_schema that every table + every system column + the composite PK landed.
 *
 * Run (no creds; both halves are workbench DBs):
 *   # inspect generated DDL only, no DB writes:
 *   node packages/Integration/connectors/test/schema-apply-dual-dialect.mjs --dry
 *   # full apply+verify against both live DBs (defaults target the workbench):
 *   SMOKE_MSSQL_PASS=Claude2Sql99 SMOKE_PG_PASS=Claude2Pg99 \
 *     node packages/Integration/connectors/test/schema-apply-dual-dialect.mjs
 */
import { EnrichSchemaConstraints } from '@memberjunction/integration-engine';
import { SchemaBuilder } from '@memberjunction/integration-schema-builder';
import sql from 'mssql';
import pg from 'pg';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_SCHEMA = 'hubspot_t2a';                       // droppable test schema (won't clobber a real `hubspot`)
const SYS_COLS = [
    '__mj_integration_SyncStatus', '__mj_integration_LastSyncedAt',
    '__mj_integration_LastSyncedSnapshot', '__mj_integration_SyncMessage',
    '__mj_integration_ContentHash',
    // Per-record sync ledger (plan §2.5)
    '__mj_integration_ExternalVersion', '__mj_integration_LastSeenModifiedValue',
    '__mj_integration_LastReconciledAt', '__mj_integration_LastWriterDirection',
    '__mj_integration_IsTombstoned', '__mj_integration_DeletedDetectedAt',
];

// ─── Fixture: HubSpot-shaped source schema ──────────────────────────────────
const f = (Name, SourceType, extra = {}) => ({
    Name, Label: Name, SourceType, IsRequired: false, MaxLength: null,
    Precision: null, Scale: null, DefaultValue: null, IsPrimaryKey: false,
    IsForeignKey: false, ForeignKeyTarget: null, ...extra,
});
const obj = (ExternalName, PrimaryKeyFields, Fields) => ({
    ExternalName, ExternalLabel: ExternalName, Fields, PrimaryKeyFields, Relationships: [],
});

function buildFixture() {
    return [
        obj('contacts', ['hs_object_id'], [
            f('hs_object_id', 'string', { IsPrimaryKey: true, MaxLength: 50 }),
            f('email', 'string', { MaxLength: 255 }),
            f('firstname', 'string', { MaxLength: 255 }),
            f('lastname', 'string', { MaxLength: 255 }),
            f('createdate', 'datetime'),
            f('lastmodifieddate', 'datetime'),
        ]),
        obj('companies', ['hs_object_id'], [
            f('hs_object_id', 'string', { IsPrimaryKey: true, MaxLength: 50 }),
            f('name', 'string', { MaxLength: 255 }),
            f('domain', 'string', { MaxLength: 255 }),
            f('createdate', 'datetime'),
            f('lastmodifieddate', 'datetime'),
        ]),
        obj('deals', ['hs_object_id'], [
            f('hs_object_id', 'string', { IsPrimaryKey: true, MaxLength: 50 }),
            f('dealname', 'string', { MaxLength: 255 }),
            f('amount', 'decimal', { Precision: 18, Scale: 2 }),
            f('company_id', 'string', { MaxLength: 50 }),          // ← C8 should infer FK → companies
            f('createdate', 'datetime'),
            f('lastmodifieddate', 'datetime'),
        ]),
        // Junction with a COMPOSITE PK — both parts should be inferred as FKs (the fix).
        obj('assoc_contacts_companies', ['contact_id', 'company_id'], [
            f('contact_id', 'string', { IsPrimaryKey: true, MaxLength: 50 }),  // ← FK → contacts
            f('company_id', 'string', { IsPrimaryKey: true, MaxLength: 50 }),  // ← FK → companies
        ]),
    ];
}

// ─── Map a source field → a platform SQL type (hand-built; exercises BuildSchema verbatim) ──
function sqlType(field, platform) {
    const isSql = platform === 'sqlserver';
    switch (field.SourceType) {
        case 'datetime': return isSql ? 'DATETIMEOFFSET' : 'TIMESTAMPTZ';
        case 'integer': return isSql ? 'INT' : 'INTEGER';
        case 'decimal': return `${isSql ? 'DECIMAL' : 'NUMERIC'}(${field.Precision ?? 18},${field.Scale ?? 2})`;
        case 'boolean': return isSql ? 'BIT' : 'BOOLEAN';
        default: return `${isSql ? 'NVARCHAR' : 'VARCHAR'}(${field.MaxLength ?? 255})`;
    }
}

function buildTargetConfigs(objects, platform) {
    return objects.map(o => ({
        SourceObjectName: o.ExternalName,
        SchemaName: TEST_SCHEMA,
        TableName: o.ExternalName,
        EntityName: `HubSpotT2A ${o.ExternalName}`,
        Description: `Tier-2a fixture table for ${o.ExternalName}`,
        PrimaryKeyFields: o.PrimaryKeyFields,
        Columns: o.Fields.map(fld => ({
            SourceFieldName: fld.Name, TargetColumnName: fld.Name,
            TargetSqlType: sqlType(fld, platform), IsNullable: !fld.IsPrimaryKey,
            MaxLength: fld.MaxLength, Precision: fld.Precision, Scale: fld.Scale,
            DefaultValue: null, Description: `Column ${fld.Name}`,
        })),
        // Soft FKs built from the relationships C8 just inferred.
        SoftForeignKeys: o.Relationships.map(r => ({
            SchemaName: TEST_SCHEMA, TableName: o.ExternalName, FieldName: r.FieldName,
            TargetSchemaName: TEST_SCHEMA, TargetTableName: r.TargetObject, TargetFieldName: 'ID',
        })),
    }));
}

function buildInput(objects, platform) {
    return {
        SourceSchema: { Objects: objects },
        TargetConfigs: buildTargetConfigs(objects, platform),
        Platform: platform,
        MJVersion: '2.x',
        SourceType: 'HubSpotT2A',
        AdditionalSchemaInfoPath: join(tmpdir(), `t2a-asi-${platform}.json`),
        MigrationsDir: join(tmpdir(), 't2a-migrations'),
        MetadataDir: join(tmpdir(), 't2a-metadata'),
        ExistingTables: [],
        EntitySettingsForTargets: {},
    };
}

function extractDDL(output) {
    if (output.Errors.length) throw new Error('BuildSchema errors: ' + output.Errors.join('; '));
    const sqlText = output.MigrationFiles.map(mf => mf.Content).join('\n');
    // Our tables live in the test schema, not the core schema, but strip the placeholder
    // defensively in case the migration header references it.
    return sqlText.replace(/\$\{flyway:defaultSchema\}/g, '__mj');
}

// ─── DB executors + verifiers ───────────────────────────────────────────────
async function applyMSSQL(ddl, dry) {
    const pass = process.env.SMOKE_MSSQL_PASS;
    if (dry || !pass) return { skipped: dry ? 'dry-run' : 'no SMOKE_MSSQL_PASS' };
    const pool = await new sql.ConnectionPool({
        server: process.env.SMOKE_MSSQL_HOST ?? 'localhost',
        port: parseInt(process.env.SMOKE_MSSQL_PORT ?? '1444', 10),
        database: process.env.SMOKE_MSSQL_NAME ?? 'MJTest',
        user: process.env.SMOKE_MSSQL_USER ?? 'sa', password: pass,
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    }).connect();
    try {
        // Clean slate so column verification is unambiguous.
        await pool.request().batch(`
            IF EXISTS (SELECT 1 FROM sys.schemas WHERE name='${TEST_SCHEMA}')
            BEGIN
                DECLARE @sql NVARCHAR(MAX) = N'';
                SELECT @sql += 'DROP TABLE [${TEST_SCHEMA}].[' + name + '];' FROM sys.tables WHERE schema_id = SCHEMA_ID('${TEST_SCHEMA}');
                EXEC sp_executesql @sql;
                EXEC('DROP SCHEMA [${TEST_SCHEMA}]');
            END`);
        // GenerateCreateSchema (sqlserver) wraps CREATE SCHEMA in its own EXEC batch already;
        // split on GO just in case the generator emits batch separators.
        for (const batch of ddl.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean)) {
            await pool.request().batch(batch);
        }
        const tables = (await pool.request().query(
            `SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('${TEST_SCHEMA}') ORDER BY name`
        )).recordset.map(r => r.name);
        const cols = (await pool.request().query(
            `SELECT t.name AS tbl, c.name AS col FROM sys.columns c JOIN sys.tables t ON c.object_id=t.object_id
             WHERE t.schema_id = SCHEMA_ID('${TEST_SCHEMA}')`
        )).recordset;
        // Integration tables emit the composite key as a UNIQUE constraint (the soft-PK
        // pattern — CodeGen establishes the MJ entity PK later), so check is_unique.
        const assocPK = (await pool.request().query(
            `SELECT c.name FROM sys.indexes i
             JOIN sys.index_columns ic ON i.object_id=ic.object_id AND i.index_id=ic.index_id
             JOIN sys.columns c ON ic.object_id=c.object_id AND ic.column_id=c.column_id
             JOIN sys.tables t ON i.object_id=t.object_id
             WHERE i.is_unique=1 AND t.name='assoc_contacts_companies' AND t.schema_id=SCHEMA_ID('${TEST_SCHEMA}')`
        )).recordset.map(r => r.name);
        return verify({ tables, cols, assocPK });
    } finally {
        await pool.request().batch(`
            IF EXISTS (SELECT 1 FROM sys.schemas WHERE name='${TEST_SCHEMA}')
            BEGIN
                DECLARE @sql NVARCHAR(MAX) = N'';
                SELECT @sql += 'DROP TABLE [${TEST_SCHEMA}].[' + name + '];' FROM sys.tables WHERE schema_id = SCHEMA_ID('${TEST_SCHEMA}');
                EXEC sp_executesql @sql;
                EXEC('DROP SCHEMA [${TEST_SCHEMA}]');
            END`).catch(() => {});
        await pool.close();
    }
}

async function applyPG(ddl, dry) {
    const pass = process.env.SMOKE_PG_PASS;
    if (dry || !pass) return { skipped: dry ? 'dry-run' : 'no SMOKE_PG_PASS' };
    const client = new pg.Client({
        host: process.env.SMOKE_PG_HOST ?? 'localhost',
        port: parseInt(process.env.SMOKE_PG_PORT ?? '5433', 10),
        database: process.env.SMOKE_PG_NAME ?? 'MJ_Workbench_PG',
        user: process.env.SMOKE_PG_USER ?? 'mj_admin', password: pass,
    });
    await client.connect();
    try {
        await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
        await client.query(ddl);
        const tables = (await client.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema=$1 ORDER BY table_name`, [TEST_SCHEMA]
        )).rows.map(r => r.table_name);
        const cols = (await client.query(
            `SELECT table_name AS tbl, column_name AS col FROM information_schema.columns WHERE table_schema=$1`, [TEST_SCHEMA]
        )).rows;
        // Soft-PK = UNIQUE constraint on the composite key (CodeGen adds the real PK later).
        const assocPK = (await client.query(
            `SELECT kcu.column_name AS name FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
             WHERE tc.table_schema=$1 AND tc.table_name='assoc_contacts_companies' AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE')`, [TEST_SCHEMA]
        )).rows.map(r => r.name);
        return verify({ tables, cols, assocPK });
    } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`).catch(() => {});
        await client.end();
    }
}

function verify({ tables, cols, assocPK }) {
    const expectTables = ['assoc_contacts_companies', 'companies', 'contacts', 'deals'];
    const byTable = {};
    for (const { tbl, col } of cols) (byTable[tbl] ??= []).push(col);
    const missingSysCols = {};
    for (const t of expectTables) {
        const have = new Set(byTable[t] ?? []);
        const missing = SYS_COLS.filter(c => !have.has(c));
        if (missing.length) missingSysCols[t] = missing;
    }
    const tablesOk = expectTables.every(t => tables.includes(t));
    const sysColsOk = Object.keys(missingSysCols).length === 0;
    const assocPKOk = ['contact_id', 'company_id'].every(c => assocPK.includes(c)) && assocPK.length === 2;
    return {
        ok: tablesOk && sysColsOk && assocPKOk,
        tables, tablesOk, sysColsOk, missingSysCols, assocPK, assocPKOk,
        contentHashPresent: expectTables.every(t => (byTable[t] ?? []).includes('__mj_integration_ContentHash')),
    };
}

// ─── Main ───────────────────────────────────────────────────────────────────
const dry = process.argv.includes('--dry');
const result = { ok: false, inference: null, sqlserver: null, postgresql: null };

// 1) C8 inference (shared — mutates the fixture in place)
const objects = buildFixture();
const inferredCount = EnrichSchemaConstraints.InferForeignKeys(objects);
const inferredFKs = objects.flatMap(o => o.Fields.filter(fl => fl.IsForeignKey).map(fl => `${o.ExternalName}.${fl.Name}→${fl.ForeignKeyTarget}`));
const inferOk = inferredCount === 3
    && inferredFKs.includes('deals.company_id→companies')
    && inferredFKs.includes('assoc_contacts_companies.contact_id→contacts')
    && inferredFKs.includes('assoc_contacts_companies.company_id→companies');
result.inference = { count: inferredCount, fks: inferredFKs, ok: inferOk };

// 2) BuildSchema per platform (fixture already enriched)
const sb = new SchemaBuilder();
const ddlSql = extractDDL(sb.BuildSchema(buildInput(objects, 'sqlserver')));
const ddlPg = extractDDL(sb.BuildSchema(buildInput(objects, 'postgresql')));

if (dry) {
    console.log('=== C8 inference ===', JSON.stringify(result.inference, null, 2));
    console.log('\n=== SQL SERVER DDL ===\n' + ddlSql);
    console.log('\n=== POSTGRESQL DDL ===\n' + ddlPg);
    process.exit(inferOk ? 0 : 1);
}

// 3) Apply + verify against both live DBs
result.sqlserver = await applyMSSQL(ddlSql, false);
result.postgresql = await applyPG(ddlPg, false);
result.ok = inferOk
    && (result.sqlserver.ok || result.sqlserver.skipped)
    && (result.postgresql.ok || result.postgresql.skipped);

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
