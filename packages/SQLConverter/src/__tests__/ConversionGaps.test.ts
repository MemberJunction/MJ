import { describe, it, expect } from 'vitest';
import { ConvertFile } from '../rules/BatchConverter.js';
import { DeclareDmlBlockRule } from '../rules/DeclareDmlBlockRule.js';
import { GetRulesForDialects } from '../rules/TSQLToPostgresRules.js';
import { ClassifyBatch } from '../rules/StatementClassifier.js';
import {
  CreateConversionContext, CONVERSION_GAP_MARKERS, GAP_MARKER_SKIPPED_EXEC_BLOCK, GAP_MARKER_MISSING_SAVES,
} from '../rules/types.js';

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
    expect(result.OutputSQL).toContain(GAP_MARKER_SKIPPED_EXEC_BLOCK);
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

