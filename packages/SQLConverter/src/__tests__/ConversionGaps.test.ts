import { describe, it, expect } from 'vitest';
import { convertFile } from '../rules/BatchConverter.js';
import { DeclareDmlBlockRule } from '../rules/DeclareDmlBlockRule.js';
import { getRulesForDialects } from '../rules/TSQLToPostgresRules.js';
import { classifyBatch } from '../rules/StatementClassifier.js';
import { createConversionContext, CONVERSION_GAP_MARKERS } from '../rules/types.js';

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
  return convertFile({
    Source: sql,
    SourceIsFile: false,
    Rules: getRulesForDialects('tsql', 'postgres'),
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
    expect(classifyBatch(UNPARSEABLE_DECLARE_BLOCK)).toBe('DECLARE_DML_BLOCK');
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
    const context = createConversionContext('tsql', 'postgres');
    const emitted = rule.PostProcess!(UNPARSEABLE_DECLARE_BLOCK, UNPARSEABLE_DECLARE_BLOCK, context);
    expect(emitted).toContain(CONVERSION_GAP_MARKERS[0]);
    expect(CONVERSION_GAP_MARKERS[0]).toBe('-- Could not parse');
    expect(CONVERSION_GAP_MARKERS[1]).toBe('-- ERROR converting batch');
  });
});
