import { describe, it, expect } from 'vitest';
import { ConvertFile } from '../rules/BatchConverter.js';
import { DeclareDmlBlockRule } from '../rules/DeclareDmlBlockRule.js';
import { GetRulesForDialects } from '../rules/TSQLToPostgresRules.js';
import { ClassifyBatch } from '../rules/StatementClassifier.js';
import {
  CreateConversionContext, CONVERSION_GAP_MARKERS, GAP_MARKER_EXEC_SKIPPED, GAP_MARKER_MISSING_SAVES, type IConversionRule,
} from '../rules/types.js';
import { FindBracketIdentifiersInDollarBlocks } from '../rules/ExpressionHelpers.js';

/**
 * Regression cover for MJ issue #3857: `mj migrate convert` (legacy path) wrote output
 * containing `-- Could not parse: @RoleID …` and still reported `1 OK, 0 errors`, exit 0.
 * The comment was RETURNED by the rule, not thrown, so nothing counted it — the file only
 * failed once it reached a real PostgreSQL server, by then inside a migration history.
 */

/**
 * A DECLARE item the rule genuinely cannot read: the type is schema-qualified, so it fails
 * `^@(\w+)\s+([\w\s(),]+)$` (no `.` in the class). The INSERT is what makes the classifier
 * route the batch to DECLARE_DML_BLOCK in the first place.
 */
const UNPARSEABLE_DECLARE_BLOCK = `DECLARE @RoleID dbo.RoleIdType;
INSERT INTO __mj.UserRole (RoleID) VALUES (@RoleID);`;

const CLEAN_BLOCK = `CREATE TABLE __mj.Widget (
  ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  Name NVARCHAR(255) NOT NULL
);`;

function convertSQL(sql: string) {
  return ConvertFile({
    Source: sql,
    SourceIsFile: false,
    Rules: GetRulesForDialects('tsql', 'postgres'),
    Schema: '__mj',
    SourceDialect: 'tsql',
    TargetDialect: 'postgres',
    IncludeHeader: false,
    EnablePostProcess: true,
  });
}

describe('conversion gaps (issue #3857)', () => {
  it('classifies the unparseable-declare fixture as a DECLARE_DML_BLOCK', () => {
    // Guards the fixture itself: if the classifier stops routing this here, the gap test
    // below would pass vacuously (no rule, no marker, no gap).
    expect(ClassifyBatch(UNPARSEABLE_DECLARE_BLOCK)).toBe('DECLARE_DML_BLOCK');
  });

  it('counts a DECLARE the rule could not parse as a gap, not a clean conversion', () => {
    const result = convertSQL(UNPARSEABLE_DECLARE_BLOCK);

    // The marker is still emitted (other tooling and PG_MANUAL_FIXES_CATALOG.md reference it)…
    expect(result.OutputSQL).toContain('-- Could not parse');
    // …but it is no longer invisible: this reported 0 before the fix.
    expect(result.Stats.Gaps).toBeGreaterThan(0);
    expect(result.Stats.GapBatches.join('\n')).toContain('-- Could not parse');
    // A gap is NOT an error — the rule returned normally, nothing threw. Both fail the run,
    // but conflating them would hide that the batch was counted as converted.
    expect(result.Stats.Errors).toBe(0);
  });

  it('reports zero gaps for a conversion with nothing unhandled', () => {
    const result = convertSQL(CLEAN_BLOCK);
    expect(result.Stats.Gaps).toBe(0);
    expect(result.Stats.GapBatches).toEqual([]);
    expect(result.OutputSQL).not.toContain('-- Could not parse');
  });

  it('scans the assembled output, so a gap from any rule is counted', () => {
    // Two unparseable declares in one file → both counted, not just the first. The scan is
    // marker-driven over the finished text, so a future rule's gap counts with no wiring.
    const result = convertSQL(
      `${UNPARSEABLE_DECLARE_BLOCK}\nGO\nDECLARE @OtherID dbo.OtherType;\nINSERT INTO __mj.Thing (ID) VALUES (@OtherID);`,
    );
    expect(result.Stats.Gaps).toBe(2);
  });

  it('the marker constant is exactly what the rule emits (drift guard)', () => {
    // If the rule's text and CONVERSION_GAP_MARKERS ever diverge, the scan goes blind again
    // and #3857 returns silently. Assert against the rule's real output, not a copy of it.
    const rule = new DeclareDmlBlockRule();
    const context = CreateConversionContext('tsql', 'postgres');
    const emitted = rule.PostProcess!(UNPARSEABLE_DECLARE_BLOCK, UNPARSEABLE_DECLARE_BLOCK, context);
    expect(emitted).toContain(CONVERSION_GAP_MARKERS[0]);
    expect(CONVERSION_GAP_MARKERS[0]).toBe('-- Could not parse');
    expect(CONVERSION_GAP_MARKERS[1]).toBe('-- ERROR converting batch');
  });
});

// Issue #6097: saves an mj-sync log announces must all be accounted for. A skipped save and a
// save that vanished with no marker of its own both count as gaps, so the run fails.
describe('Metadata_Sync save accounting (issue #6097)', () => {
  const save = (suffix: string) => [
    '-- Save MJ: AI Vendors (core SP call only)',
    `DECLARE @ID_${suffix} UNIQUEIDENTIFIER`,
    'SET',
    `  @ID_${suffix} = '11111111-1111-1111-1111-111111111111'`,
    `EXEC [__mj].spUpdateAIVendor @ID = @ID_${suffix}`,
    '',
  ].join('\n');

  it('counts a skipped EXEC block as a gap', () => {
    // The EXEC references a variable the block never declared, so the rule skips it.
    const sql = [
      '-- Save MJ: AI Vendors (core SP call only)',
      'DECLARE @ID_e5 UNIQUEIDENTIFIER',
      'SET',
      "  @ID_e5 = '11111111-1111-1111-1111-111111111111'",
      'EXEC [__mj].spUpdateAIVendor @ID = @ID_e5, @Name = @Undeclared_e5',
    ].join('\n');
    const result = convertSQL(sql);
    expect(result.OutputSQL).toContain(GAP_MARKER_EXEC_SKIPPED);
    expect(result.Stats.Gaps).toBe(1);
    expect(result.OutputSQL).not.toContain(GAP_MARKER_MISSING_SAVES);
  });

  it('counts saves missing from the output as a gap', () => {
    // A `-- Save` marker over a block the classifier does not route to the EXEC rule: the save
    // is dropped with no marker of its own.
    const sql = `${save('a1')}\n-- Save MJ: AI Vendors (core SP call only)\nPRINT 'not a save'\n`;
    const result = convertSQL(sql);
    expect(result.OutputSQL).toContain(`${GAP_MARKER_MISSING_SAVES}: the source announces 2 save(s), the output holds 1`);
    expect(result.Stats.Gaps).toBe(1);
  });

  it('counts a ${mjSchema} save the legacy path skips as missing (part of issue #5543)', () => {
    // The legacy classifier does not read `[${mjSchema}].sp…` as a schema-qualified EXEC and
    // skips the batch; the save count makes that visible instead of silent.
    const sql = save('a1').replace('[__mj]', '[${mjSchema}]');
    const result = convertSQL(sql);
    expect(result.OutputSQL).toContain(`${GAP_MARKER_MISSING_SAVES}: the source announces 1 save(s), the output holds 0`);
    expect(result.Stats.Gaps).toBe(1);
  });

  it('does not expect output for a save with no field changes', () => {
    const noOp = '-- Save MJ: AI Prompts (core SP call only)\n-- MJ: AI Prompts (ID=1): saved with no field changes; nothing to replay;\n';
    const result = convertSQL(`${save('a1')}\nGO\n${noOp}\nGO\n${save('b2')}`);
    expect(result.OutputSQL.match(/^DO \$mj\$/gm)).toHaveLength(2);
    expect(result.Stats.Gaps).toBe(0);
  });
});


describe('issue #5799 — recursive CTE, TRY_CONVERT and PRINT in a data migration', () => {
  const repro = `WITH Tree AS (
    SELECT e.ID FROM ${'${mjSchema}'}.Entity e WHERE e.Name = 'Root'
    UNION ALL
    SELECT c.ID FROM ${'${mjSchema}'}.Entity c INNER JOIN Tree t ON c.ParentID = t.ID
)
UPDATE ta
SET RecordID = CONVERT(NVARCHAR(450), u.ID)
FROM dbo.Assignment ta
INNER JOIN dbo.Users u ON u.ID = TRY_CONVERT(UNIQUEIDENTIFIER, ta.RecordID)
INNER JOIN ${'${mjSchema}'}.Entity pe ON pe.Name = 'People'
WHERE ta.EntityID IN (SELECT ID FROM Tree);

PRINT CONCAT('Rows: ', @@ROWCOUNT);
GO
`;

  it('converts to valid PostgreSQL: WITH RECURSIVE, SET kept, guarded uuid cast, no PRINT', () => {
    const result = convertSQL(repro);
    const out = result.OutputSQL ?? '';
    expect(out).toContain('WITH RECURSIVE "Tree" AS (');
    expect(out).toContain('UPDATE dbo."Assignment" AS ta\nSET "RecordID" = CAST(u."ID" AS VARCHAR(450))');
    // The ${mjSchema}-qualified join no longer stops the UPDATE-alias rewrite.
    expect(out).toMatch(/FROM\n\tdbo\."Users" u,\n\t\$\{mjSchema\}\."Entity" pe\nWHERE/);
    expect(out).toContain(
      `u."ID" = CASE WHEN (ta."RecordID")::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (ta."RecordID")::uuid END`,
    );
    expect(out).not.toMatch(/PRINT|TRY_CONVERT|ROWCOUNT/i);
    expect(result.Stats.Gaps).toBe(0);
  });

  it('reports TRY_CONVERT to an unsupported type as a gap instead of passing it through', () => {
    const result = convertSQL(`UPDATE dbo.T SET D = TRY_CONVERT(DATETIME, S);\nGO\n`);
    expect(result.OutputSQL).toContain('NEEDS HAND AUTHORING: TRY_CONVERT');
    expect(result.Stats.Gaps).toBe(1);
  });
});

describe('issue #5567 — guarded grants are converted or counted, never dropped', () => {
  it('converts a guarded grant and counts one it cannot read', () => {
    const result = convertSQL(`IF OBJECT_ID('[__mj].[vwFoo]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'GRANT SELECT ON [__mj].[vwFoo] TO [cdp_UI]';
END;
GO
IF EXISTS (SELECT 1 FROM sys.objects WHERE name = 'x')
    EXEC sp_executesql N'GRANT SELECT ON [__mj].[x] TO [cdp_UI]'
GO
`);
    expect(result.OutputSQL).toContain(`IF to_regclass('__mj."vwFoo"') IS NOT NULL THEN`);
    expect(result.Stats.Gaps).toBe(1);
  });
});

describe('one batch: CTE delete, guarded index drops and a guarded create (v5.48 ListDetail shape)', () => {
  it('converts every statement instead of leaving T-SQL or a silent skip', () => {
    const result = convertSQL(`;WITH NumberedDupes AS (
    SELECT ID, ROW_NUMBER() OVER (PARTITION BY ListID, RecordID ORDER BY ID) AS RowNum
    FROM __mj.ListDetail
)
DELETE FROM NumberedDupes WHERE RowNum > 1;

-- 2a. Drop the redundant index
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_ListDetail_ListID' AND object_id = OBJECT_ID('__mj.ListDetail')
)
BEGIN
    DROP INDEX IX_ListDetail_ListID ON __mj.ListDetail;
END

-- 3. Enforce uniqueness
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_ListDetail_ListID_RecordID' AND object_id = OBJECT_ID('__mj.ListDetail')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UQ_ListDetail_ListID_RecordID
        ON __mj.ListDetail (ListID, RecordID);
END
GO
`);
    const out = result.OutputSQL ?? '';
    expect(out).toContain('DELETE FROM __mj."ListDetail" WHERE ctid IN (SELECT mj_ctid FROM "NumberedDupes" WHERE "RowNum" > 1);');
    expect(out).toContain('DROP INDEX IF EXISTS __mj."IX_ListDetail_ListID";');
    expect(out).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ListDetail_ListID_RecordID" ON __mj."ListDetail" ("ListID", "RecordID");');
    expect(out).not.toMatch(/sys\.indexes|SKIPPED/);
    expect(result.Stats.Gaps).toBe(0);
  });
});

describe('issue #5649 — sp_refreshview is a warning on the legacy path', () => {
  it('records a named warning and a comment, with no gap', () => {
    const result = convertSQL(`ALTER TABLE __mj.Entity ADD Foo BIT NULL;\nGO\nEXEC sp_refreshview '__mj.vwEntities';\nGO\n`);
    expect(result.Stats.Gaps).toBe(0);
    expect(result.Stats.Warnings).toEqual([
      "sp_refreshview '__mj.vwEntities' has no PostgreSQL equivalent; rebuild the view with CREATE OR REPLACE VIEW so it carries the new columns",
    ]);
    expect(result.OutputSQL).toContain("-- WARNING: sp_refreshview '__mj.vwEntities'");
  });
});

/**
 * #6074: a T-SQL bracket identifier left inside a dollar-quoted block has no gap marker, and the
 * PostProcessor's bracket pass skips those blocks, so the file reported 0 gaps and failed on apply.
 */
describe('bracket identifiers left in a dollar-quoted block', () => {
  it('finds a bracket identifier in code inside the block, and only there', () => {
    const sql = [
      'SELECT [Outside] FROM x;',
      'DO $mj$',
      'BEGIN',
      "  p_ID := (SELECT [ID] FROM [__mj].[Entity] WHERE \"Name\" = '[not code]');",
      '  -- [a comment]',
      "  IF p.proargtypes[0] = 'jsonb'::regtype AND v = ANY(ARRAY['a']) AND (f(x))[1] = 1 THEN NULL; END IF;",
      'END $mj$;',
    ].join('\n');

    expect(FindBracketIdentifiersInDollarBlocks(sql)).toEqual([`p_ID := (SELECT [ID] FROM [__mj].[Entity] WHERE "Name" = '[not code]');`]);
  });

  it('does not take a $ in string data or a comment for the start of a block', () => {
    const sql = [
      "INSERT INTO t (a, b) VALUES ('pay $USD$ [categories] now', 'then $USD$ again');",
      '-- a $tag$ in a comment',
      "INSERT INTO t (a) VALUES ('[title] $tag$');",
    ].join('\n');

    expect(FindBracketIdentifiersInDollarBlocks(sql)).toEqual([]);
  });

  it('counts each such line as a gap of the converted file, whichever rule left it', () => {
    // A rule that emits a bracket inside its DO block, as ExecBlockRule did before #6074
    const leaky: IConversionRule = {
      Name: 'LeakyRule',
      SourceDialect: 'tsql',
      TargetDialect: 'postgres',
      AppliesTo: [ClassifyBatch(CLEAN_BLOCK)],
      Priority: 0,
      BypassSqlglot: true,
      PostProcess: () => 'DO $mj$\nBEGIN\n  PERFORM (SELECT [ID] FROM [__mj].[Widget]);\nEND $mj$;',
    };
    const result = ConvertFile({
      Source: CLEAN_BLOCK,
      SourceIsFile: false,
      Rules: [leaky],
      Schema: '__mj',
      SourceDialect: 'tsql',
      TargetDialect: 'postgres',
      IncludeHeader: false,
      EnablePostProcess: true,
    });

    expect(result.Stats.Gaps).toBe(1);
    expect(result.Stats.GapBatches[0]).toContain('T-SQL bracket identifier left in a dollar-quoted block:');
  });

  it('converts a metadata-sync SET subquery cleanly, with no brackets and no gaps', () => {
    const result = convertSQL([
      'DECLARE @ID_ab12 UNIQUEIDENTIFIER,',
      '  @Name_ab12 NVARCHAR(MAX)',
      'SET',
      "  @ID_ab12 = (SELECT [ID] FROM [${flyway:defaultSchema}].[Widget] WHERE LOWER([Name]) = LOWER(N'Widgets'))",
      'SET',
      "  @Name_ab12 = N'x' EXEC [${flyway:defaultSchema}].spUpdateWidget @ID = @ID_ab12,",
      '  @Name = @Name_ab12',
    ].join('\n'));

    expect(result.Stats.Gaps).toBe(0);
    expect(result.OutputSQL).toContain(`p_ID_ab12 := (SELECT "ID" FROM __mj."Widget" WHERE LOWER("Name") = LOWER('Widgets'));`);
  });
});

/**
 * #6337: a Metadata_Sync whose last save was followed by the session footer converted to almost
 * nothing and reported 0 errors and 0 gaps. Two sessions, as DEPLOYMENT.md Step 3 produces, each
 * ending with the logger's footer in the same GO batch as its last save.
 */
describe('Metadata_Sync session footers (#6337)', () => {
  const save = (suffix: string, guard = `[ID] = @ID_${suffix}`): string => [
    `DECLARE @ID_${suffix} UNIQUEIDENTIFIER,`,
    `@Name_${suffix} NVARCHAR(50)`,
    'SET',
    `  @ID_${suffix} = '5F935B01-EC5F-4409-AADC-8063A94936D6'`,
    'SET',
    `  @Name_${suffix} = N'Widget' IF NOT EXISTS (`,
    `    SELECT 1 FROM [\${flyway:defaultSchema}].[Widget] WHERE ${guard}`,
    '  )',
    'BEGIN',
    `EXEC [\${flyway:defaultSchema}].spCreateWidget @ID = @ID_${suffix},`,
    `  @Name = @Name_${suffix}`,
    'END ELSE',
    'BEGIN',
    `EXEC [\${flyway:defaultSchema}].spUpdateWidget @ID = @ID_${suffix},`,
    `  @Name = @Name_${suffix}`,
    'END;',
  ].join('\n');
  const footer = '\n\n-- End of SQL Logging Session\n-- Session ID: abc\n-- Total Statements: 2\n';
  const performs = (sql: string): number => (sql.match(/\bPERFORM\b/g) ?? []).length;

  it('keeps every save of a two-session file', () => {
    const result = convertSQL([save('a1'), save('a2') + footer, save('b1'), save('b2') + footer].join('\n\n'));
    // Each save calls the create or the update, each through its JSONB and typed forms.
    expect(performs(result.OutputSQL)).toBe(16);
    expect(result.Stats.Gaps).toBe(0);
    expect(result.OutputSQL).not.toContain('SKIPPED');
  });

  it('keeps every save of a single session ending in a create-or-update', () => {
    const result = convertSQL(save('a1') + '\n\n' + save('a2') + footer);
    expect(performs(result.OutputSQL)).toBe(8);
    expect(result.Stats.Gaps).toBe(0);
  });

  it('does not count a block comment between saves as a gap', () => {
    const result = convertSQL(`/*****\n* BEGIN METADATA SYNC\n*****/\n\n${save('a1')}\n\n${save('a2')}`);
    expect(result.Stats.Gaps).toBe(0);
    expect(performs(result.OutputSQL)).toBe(8);
  });

  it('counts a save it could not convert as a gap and keeps the saves around it', () => {
    const unconvertible = save('a2', '[ID] = @ID_a2 OR [Name] = @Name_a2');
    const result = convertSQL([save('a1'), unconvertible, save('a3')].join('\n\n'));
    expect(result.Stats.Gaps).toBe(1);
    expect(result.Stats.GapBatches.join('\n')).toContain('-- SKIPPED: EXEC block');
    expect(performs(result.OutputSQL)).toBe(8);
  });
});
