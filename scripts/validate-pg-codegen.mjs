/**
 * B1 Validation: PostgreSQLCodeGenProvider Integration Test
 *
 * Generates SQL from the provider using mock entities, then attempts to
 * apply the SQL to a fresh PostgreSQL database to verify it parses and
 * executes correctly. This catches PG-specific syntax issues that unit
 * tests (which only check string contents) miss.
 *
 * Prerequisites:
 *   - PG database `mj_pg_codegen_test` exists with the MJ schema applied
 *     (migrations 1-36 of the v5 set)
 *   - PG roles `cdp_Developer`, `cdp_Integration`, `cdp_UI` exist
 */

import pg from 'pg';
import { PostgreSQLCodeGenProvider } from '../packages/CodeGenLib/dist/Database/providers/postgresql/PostgreSQLCodeGenProvider.js';
import { CRUDType } from '../packages/CodeGenLib/dist/Database/codeGenDatabaseProvider.js';
import { EntityInfo } from '../packages/MJCore/dist/index.js';

const DB_CONFIG = {
  host: process.env.PG_HOST ?? 'localhost',
  port: parseInt(process.env.PG_PORT ?? '5432', 10),
  database: process.env.PG_DATABASE ?? 'mj_pg_codegen_test',
  user: process.env.PG_USERNAME ?? 'postgres',
  password: process.env.PG_PASSWORD ?? '',
};

// ─── Mock entity matching the unit-test pattern ──────────────────────────

function createMockEntity(overrides = {}, fieldOverrides = null, permissions = []) {
  const defaultFields = fieldOverrides || [
    {
      ID: 'pk-field-1', Name: 'ID', Type: 'uniqueidentifier', Length: 16,
      IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true,
      IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()',
    },
    {
      ID: 'name-field-1', Name: 'Name', Type: 'nvarchar', Length: 510,
      IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true,
      IsVirtual: false, AutoIncrement: false, DefaultValue: '',
    },
    {
      ID: 'email-field-1', Name: 'Email', Type: 'nvarchar', Length: 1000,
      IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true,
      IsVirtual: false, AutoIncrement: false, DefaultValue: '',
    },
  ];

  return new EntityInfo({
    ID: 'entity-1',
    Name: 'Test Entity',
    SchemaName: 'public', // use public so we don't need __mj schema for this test
    BaseTable: 'TestEntity',
    BaseTableCodeName: 'TestEntity',
    BaseView: 'vwTestEntities',
    IncludeInAPI: true,
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: true,
    CascadeDeletes: false,
    DeleteType: 'Hard',
    spCreate: '',
    spUpdate: '',
    spDelete: '',
    EntityFields: defaultFields,
    EntityPermissions: permissions,
    ...overrides,
  });
}

// ─── Test runner ─────────────────────────────────────────────────────────

async function main() {
  console.log('=== B1 Validation: PostgreSQLCodeGenProvider PG syntax check ===\n');

  const provider = new PostgreSQLCodeGenProvider();
  const pool = new pg.Pool({ ...DB_CONFIG, max: 1 });

  try {
    // Create the test table the provider will reference
    await pool.query(`
      DROP TABLE IF EXISTS public."TestEntity" CASCADE;
      CREATE TABLE public."TestEntity" (
        "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "Name" VARCHAR(255) NOT NULL,
        "Email" VARCHAR(500),
        "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('Setup: created public.TestEntity table\n');

    const uuidEntity = createMockEntity();
    const intPKEntity = createMockEntity({ Name: 'IntPK Entity', BaseTable: 'IntPKEntity', BaseTableCodeName: 'IntPKEntity', BaseView: 'vwIntPKEntities' }, [
      { ID: 'pk', Name: 'ID', Type: 'int', Length: 4, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: true, DefaultValue: '' },
      { ID: 'name', Name: 'Name', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
    ]);
    const richEntity = createMockEntity({ Name: 'Rich Entity', BaseTable: 'RichEntity', BaseTableCodeName: 'RichEntity', BaseView: 'vwRichEntities' }, [
      { ID: 'pk', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
      { ID: 'name', Name: 'Name', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
      { ID: 'desc', Name: 'Description', Type: 'nvarchar(max)', Length: -1, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
      { ID: 'price', Name: 'Price', Type: 'money', Length: 8, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
      { ID: 'active', Name: 'IsActive', Type: 'bit', Length: 1, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '0' },
      { ID: 'created', Name: 'CreatedDate', Type: 'datetimeoffset', Length: 10, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'getutcdate()' },
    ]);

    // Set up tables for all entities first
    await pool.query(`
      DROP TABLE IF EXISTS public."IntPKEntity" CASCADE;
      CREATE TABLE public."IntPKEntity" (
        "ID" SERIAL PRIMARY KEY,
        "Name" VARCHAR(255) NOT NULL,
        "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      DROP TABLE IF EXISTS public."RichEntity" CASCADE;
      CREATE TABLE public."RichEntity" (
        "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "Name" VARCHAR(255) NOT NULL,
        "Description" TEXT,
        "Price" NUMERIC(19,4),
        "IsActive" BOOLEAN NOT NULL DEFAULT FALSE,
        "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ─── Additional entity variants ────────────────────────────────────
    const softDeleteEntity = createMockEntity(
      { Name: 'Soft Delete Entity', BaseTable: 'SoftDelEntity', BaseTableCodeName: 'SoftDelEntity', BaseView: 'vwSoftDelEntities', DeleteType: 'Soft' },
      [
        { ID: 'pk', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
        { ID: 'name', Name: 'Name', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
        { ID: 'deleted', Name: '__mj_DeletedAt', Type: 'datetimeoffset', Length: 10, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
      ]
    );

    const boolDefaultTrue = createMockEntity(
      { Name: 'BoolTrue Entity', BaseTable: 'BoolTrueEntity', BaseTableCodeName: 'BoolTrueEntity', BaseView: 'vwBoolTrueEntities' },
      [
        { ID: 'pk', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
        { ID: 'name', Name: 'Name', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
        { ID: 'enabled', Name: 'Enabled', Type: 'bit', Length: 1, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '1' },
      ]
    );

    await pool.query(`
      DROP TABLE IF EXISTS public."SoftDelEntity" CASCADE;
      CREATE TABLE public."SoftDelEntity" (
        "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "Name" VARCHAR(255) NOT NULL,
        "__mj_DeletedAt" TIMESTAMPTZ,
        "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      DROP TABLE IF EXISTS public."BoolTrueEntity" CASCADE;
      CREATE TABLE public."BoolTrueEntity" (
        "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "Name" VARCHAR(255) NOT NULL,
        "Enabled" BOOLEAN NOT NULL DEFAULT TRUE,
        "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const tests = [
      { name: 'generateDropGuard (VIEW)', sql: provider.generateDropGuard('VIEW', 'public', 'vwTestEntities') },
      { name: 'generateDropGuard (FUNCTION)', sql: provider.generateDropGuard('FUNCTION', 'public', 'fn_create_test_entity') },
      { name: 'generateDropGuard (PROCEDURE)', sql: provider.generateDropGuard('PROCEDURE', 'public', 'some_proc') },

      // UUID PK entity (most common MJ pattern)
      { name: 'UUID-PK: generateBaseView', sql: provider.generateBaseView({ entity: uuidEntity, parentEntity: null, relatedFields: [], rootFields: [] }) },
      { name: 'UUID-PK: generateCRUDCreate', sql: provider.generateCRUDCreate(uuidEntity) },
      { name: 'UUID-PK: generateCRUDUpdate', sql: provider.generateCRUDUpdate(uuidEntity) },
      { name: 'UUID-PK: generateCRUDDelete', sql: provider.generateCRUDDelete(uuidEntity, '') },
      { name: 'UUID-PK: generateTimestampTrigger', sql: provider.generateTimestampTrigger(uuidEntity) },

      // INT PK entity (auto-increment)
      { name: 'INT-PK: generateBaseView', sql: provider.generateBaseView({ entity: intPKEntity, parentEntity: null, relatedFields: [], rootFields: [] }) },
      { name: 'INT-PK: generateCRUDCreate', sql: provider.generateCRUDCreate(intPKEntity) },
      { name: 'INT-PK: generateCRUDUpdate', sql: provider.generateCRUDUpdate(intPKEntity) },
      { name: 'INT-PK: generateCRUDDelete', sql: provider.generateCRUDDelete(intPKEntity, '') },
      { name: 'INT-PK: generateTimestampTrigger', sql: provider.generateTimestampTrigger(intPKEntity) },

      // Rich entity with multiple types (TEXT, BOOLEAN, NUMERIC, TIMESTAMP)
      { name: 'RICH: generateBaseView', sql: provider.generateBaseView({ entity: richEntity, parentEntity: null, relatedFields: [], rootFields: [] }) },
      { name: 'RICH: generateCRUDCreate', sql: provider.generateCRUDCreate(richEntity) },
      { name: 'RICH: generateCRUDUpdate', sql: provider.generateCRUDUpdate(richEntity) },
      { name: 'RICH: generateCRUDDelete', sql: provider.generateCRUDDelete(richEntity, '') },
      { name: 'RICH: generateTimestampTrigger', sql: provider.generateTimestampTrigger(richEntity) },

      // Soft delete (DeleteType='Soft' with __mj_DeletedAt column)
      { name: 'SOFT: generateBaseView', sql: provider.generateBaseView({ entity: softDeleteEntity, parentEntity: null, relatedFields: [], rootFields: [] }) },
      { name: 'SOFT: generateCRUDDelete', sql: provider.generateCRUDDelete(softDeleteEntity, '') },

      // Boolean DEFAULT 1 (catches the FALSE/TRUE conversion bug we fixed)
      { name: 'BOOL-TRUE: generateBaseView', sql: provider.generateBaseView({ entity: boolDefaultTrue, parentEntity: null, relatedFields: [], rootFields: [] }) },
      { name: 'BOOL-TRUE: generateCRUDCreate', sql: provider.generateCRUDCreate(boolDefaultTrue) },
      { name: 'BOOL-TRUE: generateCRUDUpdate', sql: provider.generateCRUDUpdate(boolDefaultTrue) },

      // Foreign key indexes (string[] output — join and test as one batch)
      {
        name: 'UUID-PK: generateForeignKeyIndexes',
        sql: (provider.generateForeignKeyIndexes(uuidEntity) || []).join('\n') || '-- no FK indexes',
      },

      // View permissions
      { name: 'UUID-PK: generateViewPermissions', sql: provider.generateViewPermissions(uuidEntity) },

      // Timestamp columns (ALTER TABLE ADD)
      {
        name: 'UUID-PK: generateTimestampColumns',
        sql: (() => {
          const sql = provider.generateTimestampColumns('public', 'FreshTable');
          // Prepare: drop+create the fresh table so ADD columns can apply
          return `DROP TABLE IF EXISTS public."FreshTable"; CREATE TABLE public."FreshTable" ("ID" UUID PRIMARY KEY);\n${sql}`;
        })(),
      },
    ];

    let passed = 0;
    let failed = 0;
    const failures = [];

    for (const test of tests) {
      process.stdout.write(`Testing: ${test.name} ... `);
      try {
        // First: just verify PG parses the SQL (validate, don't necessarily execute)
        await pool.query(test.sql);
        console.log('OK');
        passed++;
      } catch (err) {
        console.log(`FAIL — ${err.message}`);
        failures.push({ test: test.name, err: err.message, sql: test.sql.substring(0, 500) });
        failed++;
      }
    }

    console.log(`\n=== Generation: ${passed} passed, ${failed} failed ===`);

    // ─── Execute the generated CRUD functions to verify they actually work ─
    if (failed === 0) {
      console.log('\n=== Executing generated CRUD functions ===');
      let execPassed = 0, execFailed = 0;

      // Test the rich entity's CREATE function
      try {
        const result = await pool.query(`
          SELECT * FROM public.fn_create_rich_entity(
            NULL, 'Test Item', 'A test description', 19.99, true, '2025-01-01'::timestamptz
          )
        `);
        if (result.rows.length === 1) {
          console.log(`  RICH fn_create_rich_entity: OK (returned ${result.rows.length} row, ID=${result.rows[0].ID})`);
          execPassed++;

          const newId = result.rows[0].ID;
          // Test UPDATE
          const updResult = await pool.query(`
            SELECT * FROM public.fn_update_rich_entity(
              $1, 'Updated Name', 'Updated desc', 29.99, false, '2025-02-01'::timestamptz
            )
          `, [newId]);
          if (updResult.rows.length === 1 && updResult.rows[0].Name === 'Updated Name') {
            console.log('  RICH fn_update_rich_entity: OK');
            execPassed++;
          } else {
            console.log('  RICH fn_update_rich_entity: FAIL (unexpected result)');
            execFailed++;
          }

          // Test DELETE
          const delResult = await pool.query(`SELECT public.fn_delete_rich_entity($1)`, [newId]);
          console.log(`  RICH fn_delete_rich_entity: OK (returned ${JSON.stringify(delResult.rows[0])})`);
          execPassed++;
        } else {
          console.log(`  RICH fn_create_rich_entity: FAIL (expected 1 row, got ${result.rows.length})`);
          execFailed++;
        }
      } catch (err) {
        console.log(`  RICH CRUD execution: FAIL — ${err.message}`);
        execFailed++;
      }

      console.log(`\n=== Execution: ${execPassed} passed, ${execFailed} failed ===`);
      if (execFailed > 0) process.exit(1);
    }

    if (failures.length > 0) {
      console.log('\n=== Failures ===');
      for (const f of failures) {
        console.log(`\n--- ${f.test} ---`);
        console.log(`Error: ${f.err}`);
        console.log(`SQL (first 500 chars):\n${f.sql}`);
      }
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
