import { describe, it, expect } from 'vitest';
import { ConvertFile } from '../rules/BatchConverter.js';
import { GetTSQLToPostgresRules } from '../rules/TSQLToPostgresRules.js';
import { CollectTSQLBitColumns } from '../rules/BitColumnRegistry.js';
import type { TableColumnRegistry } from '../rules/BitColumnRegistry.js';
import { ConvertConvertFunction, ConvertHashBytes, AddNullsNotDistinct } from '../rules/ExpressionHelpers.js';
import { GetPGCatalogViewDefinition } from '../rules/CatalogViewRule.js';
import { ConvertMigration, ExtractCatalogViews } from '../MigrationConverter.js';
import type { TSQLToPGTranspiler } from '../MigrationConverter.js';
import { IncrementalBaker, BakeApplyError, SplitBakedFile, CaptureOnlyResumeCommand } from '../IncrementalBaker.js';
import type { BakerWorkingDB, CapturedEntitySQL } from '../IncrementalBaker.js';

const rules = GetTSQLToPostgresRules();

function convert(sql: string, tableColumns?: TableColumnRegistry): string {
  return ConvertFile({
    Source: sql,
    SourceIsFile: false,
    Rules: rules,
    IncludeHeader: false,
    EnablePostProcess: true,
    TableColumns: tableColumns,
  }).OutputSQL;
}

// ─── #5016: booleans follow the run ─────────────────────────────────────────────
describe('run-wide BIT registry (#5016)', () => {
  it('collects CREATE TABLE and ALTER TABLE ADD BIT columns, lower-cased', () => {
    const reg = CollectTSQLBitColumns(`
      CREATE TABLE [\${flyway:defaultSchema}].[RubricEvaluation] (
        [ID] UNIQUEIDENTIFIER NOT NULL,
        [Passed] [bit] NOT NULL DEFAULT (0),
        [Score] DECIMAL(5,2) NULL
      );
      GO
      ALTER TABLE [\${flyway:defaultSchema}].[RubricEvaluationScore] ADD [IsNotApplicable] BIT NOT NULL DEFAULT 0;
      -- ALTER TABLE x ADD Commented BIT
    `);
    expect(reg.get('rubricevaluation')?.get('passed')).toBe('BOOLEAN');
    expect(reg.get('rubricevaluation')?.has('score')).toBe(false);
    expect(reg.get('rubricevaluationscore')?.get('isnotapplicable')).toBe('BOOLEAN');
    expect(reg.has('x')).toBe(false);
  });

  it('a view in a later file compares an earlier file\'s boolean column with TRUE', () => {
    const registry: TableColumnRegistry = new Map();
    convert(`CREATE TABLE [\${flyway:defaultSchema}].[RubricEvaluation] ([ID] UNIQUEIDENTIFIER NOT NULL, [Passed] BIT NOT NULL);`, registry);
    const view = `CREATE VIEW [\${flyway:defaultSchema}].[vwPassed] AS SELECT e.ID FROM [\${flyway:defaultSchema}].[RubricEvaluation] e WHERE e.Passed = 1
GO`;
    expect(convert(view)).not.toMatch(/"Passed"\s*=\s*TRUE/);
    expect(convert(view, registry)).toMatch(/"Passed"\s*=\s*TRUE/);
  });

  it('a column the baseline declares seeds the registry', () => {
    const registry = CollectTSQLBitColumns('CREATE TABLE [__mj].[Contract] ([ID] INT, [HasModifications] BIT NULL)');
    const view = `CREATE VIEW [\${flyway:defaultSchema}].[vwMods] AS SELECT c.ID FROM [\${flyway:defaultSchema}].[Contract] c WHERE c.HasModifications = 1
GO`;
    expect(convert(view, registry)).toMatch(/"HasModifications"\s*=\s*TRUE/);
  });
});

// ─── #6538 item 3: HASHBYTES + CONVERT style ────────────────────────────────────
describe('HASHBYTES and binary CONVERT styles (#6538 item 3)', () => {
  it('CONVERT(VARCHAR(64), HASHBYTES(SHA2_256, x), 2) → upper hex of sha256', () => {
    expect(ConvertConvertFunction(`CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', "Body"), 2)`)).toBe(
      `CAST(upper(encode(sha256(convert_to("Body", 'UTF8')), 'hex')) AS VARCHAR(64))`,
    );
  });

  it('style 1 adds the 0x prefix', () => {
    expect(ConvertConvertFunction(`CONVERT(VARCHAR(130), HASHBYTES('SHA2_512', x), 1)`)).toContain(
      `'0x' || upper(encode(sha512(convert_to(x, 'UTF8')), 'hex'))`,
    );
  });

  it('a bare HASHBYTES MD5 becomes decode(md5(…), hex); unknown algorithms are left alone', () => {
    expect(ConvertHashBytes(`HASHBYTES('MD5', x)`)).toBe(`decode(md5(x), 'hex')`);
    expect(ConvertHashBytes(`HASHBYTES('SHA1', x)`)).toBe(`HASHBYTES('SHA1', x)`);
  });

  it('a CONVERT with a style on a non-binary value still becomes a plain CAST', () => {
    expect(ConvertConvertFunction('CONVERT(VARCHAR(20), d, 1)')).toBe('CAST(d AS VARCHAR(20))');
  });
});

// ─── #5194: unique indexes keep SQL Server NULL semantics ───────────────────────
describe('NULLS NOT DISTINCT on converted unique indexes and constraints (#5194)', () => {
  it('helper: index gets it after the column list, constraint after UNIQUE', () => {
    expect(AddNullsNotDistinct('CREATE UNIQUE INDEX "UQ_a" ON s."T" ("A", "B") WHERE "A" IS NOT NULL;')).toBe(
      'CREATE UNIQUE INDEX "UQ_a" ON s."T" ("A", "B") NULLS NOT DISTINCT WHERE "A" IS NOT NULL;',
    );
    expect(AddNullsNotDistinct('ALTER TABLE s."T" ADD CONSTRAINT "UQ_T" UNIQUE ("A");')).toBe(
      'ALTER TABLE s."T" ADD CONSTRAINT "UQ_T" UNIQUE NULLS NOT DISTINCT ("A");',
    );
    expect(AddNullsNotDistinct('CREATE INDEX "IX" ON s."T" ("A");')).toBe('CREATE INDEX "IX" ON s."T" ("A");');
  });

  it('legacy CreateIndexRule, CreateTableRule and ALTER ADD UNIQUE all emit it', () => {
    expect(convert('CREATE UNIQUE NONCLUSTERED INDEX [UQ_T_Code] ON [__mj].[T] ([Code]);')).toContain('NULLS NOT DISTINCT');
    expect(convert('CREATE TABLE [__mj].[T] ([ID] INT NOT NULL, [Code] NVARCHAR(20) NULL, CONSTRAINT [UQ_T] UNIQUE ([Code]));')).toContain(
      'UNIQUE NULLS NOT DISTINCT (',
    );
    expect(convert('ALTER TABLE [__mj].[T] ADD CONSTRAINT [UQ_T2] UNIQUE ([Code]);')).toContain('UNIQUE NULLS NOT DISTINCT (');
    expect(convert('CREATE NONCLUSTERED INDEX [IX_T_Code] ON [__mj].[T] ([Code]);')).not.toContain('NULLS NOT DISTINCT');
  });
});

// ─── #6538 item 4: catalog views on the split path ──────────────────────────────
describe('catalog views on the split path (#6538 item 4)', () => {
  it('looks up the hand-written PG text and swaps the core schema', () => {
    expect(GetPGCatalogViewDefinition('vwTableUniqueKeys')).toContain('CREATE OR REPLACE VIEW __mj."vwTableUniqueKeys"');
    expect(GetPGCatalogViewDefinition('vwTableUniqueKeys', 'mj_core')).toContain('CREATE OR REPLACE VIEW mj_core."vwTableUniqueKeys"');
    expect(GetPGCatalogViewDefinition('vwSomethingElse')).toBeUndefined();
  });

  it('pulls a catalog view out of the kept T-SQL and reports an unmapped sys.* view', () => {
    const tsql = [
      'ALTER TABLE [__mj].[Entity] ADD [Foo] INT NULL;',
      'GO',
      'CREATE OR ALTER VIEW [__mj].[vwTableUniqueKeys] AS SELECT t.name FROM sys.tables t',
      'GO',
      'CREATE VIEW [__mj].[vwMyCatalog] AS SELECT o.name FROM sys.objects o',
    ].join('\n');
    const r = ExtractCatalogViews(tsql);
    expect(r.pgViews).toHaveLength(1);
    expect(r.pgViews[0]).toContain('__mj."vwTableUniqueKeys"');
    expect(r.unhandled.map((u) => u.kind)).toEqual(['CATALOG-VIEW-UNMAPPED']);
    expect(r.tsql).toContain('ALTER TABLE');
    expect(r.tsql).not.toContain('sys.');
  });

  it('ConvertMigration emits the catalog view text instead of transpiling sys.tables', async () => {
    const seen: string[] = [];
    const transpiler: TSQLToPGTranspiler = {
      async transpile(tsql: string) {
        seen.push(tsql);
        return { sql: [tsql.trim() ? '-- transpiled' : ''].filter((s) => s), unhandled: [] };
      },
    };
    const sql = [
      'ALTER TABLE [${flyway:defaultSchema}].[Entity] ADD [Foo] INT NULL;',
      'GO',
      'CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwTableUniqueKeys] AS SELECT t.name FROM sys.tables t',
      'GO',
    ].join('\n');
    const r = await ConvertMigration(sql, 'V202611101200__v6.3.x__Unique_Keys.sql', { transpiler, includeHeader: false });
    expect(seen.join('\n')).not.toContain('sys.tables');
    expect(r.pgSQL).toContain('CREATE OR REPLACE VIEW __mj."vwTableUniqueKeys"');
  });
});

// ─── #3345 item 4, #6348, #6538 item 5: bake and rebake keep the hand region ────
const echoTranspiler: TSQLToPGTranspiler = {
  async transpile(tsql: string) {
    return { sql: [tsql], unhandled: [] };
  },
};
const gapTranspiler: TSQLToPGTranspiler = {
  async transpile() {
    return { sql: ['-- partial'], unhandled: [{ kind: 'CREATE FUNCTION', snippet: 'fnX' }] };
  },
};

class FakeDB implements BakerWorkingDB {
  calls: string[] = [];
  constructor(private readonly failCapture = false) {}
  async apply(): Promise<void> {
    this.calls.push('apply');
  }
  async refreshMetadata(): Promise<void> {
    this.calls.push('refresh');
  }
  async captureEntity(name: string): Promise<CapturedEntitySQL> {
    this.calls.push(`capture:${name}`);
    if (this.failCapture) throw new Error('column __mj_isa_p1.Type does not exist');
    return { sql: `CREATE OR REPLACE VIEW __mj."vwNew" AS SELECT 2; -- ${name}`, permissionsSQL: '' };
  }
  async listBakeableEntities(): Promise<string[]> {
    return [];
  }
}

const ssMigration = (hand: string, entity: string) =>
  [
    hand,
    '',
    `/* spCreate SQL for ${entity} */`,
    '-----------------------------------------------------------------',
    '-- SQL Code Generation',
    `-- Entity: ${entity}`,
    '-- Item: spCreateWidget',
    '-- This was generated by the MemberJunction CodeGen tool.',
    '-----------------------------------------------------------------',
    'CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateWidget] AS BEGIN SELECT 1; END;',
    'GO',
  ].join('\n');

describe('bake / rebake keep the hand region (#3345, #6348, #6538)', () => {
  const sql = ssMigration('ALTER TABLE [${flyway:defaultSchema}].[Widget] ADD Size INT NULL;', 'MJ: Widgets');

  async function bakedCommitted(): Promise<string> {
    const r = await new IncrementalBaker({ transpiler: echoTranspiler, db: new FakeDB() }).BakeMigration(sql, 'V1__Widget.sql');
    return r.pgSQL;
  }

  it('SplitBakedFile splits a baked file and refuses a legacy one', async () => {
    const regions = SplitBakedFile(await bakedCommitted());
    expect(regions?.handRegion).toContain('Size');
    expect(regions?.codeGenSection).toContain('CodeGen (native PG, baked)');
    expect(SplitBakedFile('-- legacy converted file\nCREATE TABLE x ();')).toBeNull();
  });

  it('re-bake keeps a hand-edited region byte for byte and replaces only the CodeGen section', async () => {
    const committed = (await bakedCommitted()).replace('Size', 'Size /* finished by hand */');
    const handRegion = SplitBakedFile(committed)!.handRegion;
    const r = await new IncrementalBaker({ transpiler: echoTranspiler, db: new FakeDB() }).BakeMigration(sql, 'V1__Widget.sql', committed);
    expect(r.mode).toBe('baked');
    expect(r.pgSQL.startsWith(handRegion)).toBe(true);
    expect(r.pgSQL).toContain('vwNew');
  });

  it('gaps in the fresh transpile no longer block the capture of a baked file', async () => {
    const committed = await bakedCommitted();
    const db = new FakeDB();
    const r = await new IncrementalBaker({ transpiler: gapTranspiler, db }).BakeMigration(sql, 'V1__Widget.sql', committed);
    expect(r.mode).toBe('baked');
    expect(db.calls).toContain('capture:MJ: Widgets');
  });

  it('capture-only skips the apply (forward and re-bake)', async () => {
    const forward = new FakeDB();
    await new IncrementalBaker({ transpiler: echoTranspiler, db: forward }).BakeMigration(sql, 'V1__Widget.sql', undefined, { CaptureOnly: true });
    expect(forward.calls).not.toContain('apply');
    expect(forward.calls).toContain('capture:MJ: Widgets');

    const rebake = new FakeDB();
    await new IncrementalBaker({ transpiler: echoTranspiler, db: rebake }).BakeMigration(sql, 'V1__Widget.sql', await bakedCommitted(), {
      CaptureOnly: true,
    });
    expect(rebake.calls).not.toContain('apply');
  });

  it('a capture failure after the apply names the file and the resume command', async () => {
    const err = await new IncrementalBaker({ transpiler: echoTranspiler, db: new FakeDB(true) })
      .BakeMigration(sql, 'V1__Widget.sql')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BakeApplyError);
    const e = err as BakeApplyError;
    expect(e.message).toContain('V1__Widget.sql was applied to the working DB');
    expect(e.message).toContain(CaptureOnlyResumeCommand('V1__Widget.sql'));
    expect(e.transpiledBody).toContain('Size');
  });
});
