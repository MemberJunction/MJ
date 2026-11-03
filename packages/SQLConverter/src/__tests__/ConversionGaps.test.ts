import { describe, it, expect } from 'vitest';
import { ConvertFile } from '../rules/BatchConverter.js';
import { DeclareDmlBlockRule } from '../rules/DeclareDmlBlockRule.js';
import { GetRulesForDialects } from '../rules/TSQLToPostgresRules.js';
import { ClassifyBatch } from '../rules/StatementClassifier.js';
import { CreateConversionContext, CONVERSION_GAP_MARKERS, type IConversionRule } from '../rules/types.js';
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
