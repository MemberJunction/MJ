import { describe, it, expect } from 'vitest';
import { InlineScalarSelectVariables } from '../rules/ScalarVariableInliner.js';

describe('InlineScalarSelectVariables (issue #5364 item 4)', () => {
  const declare = "DECLARE @EntityID UNIQUEIDENTIFIER = (SELECT ID FROM __mj.Entity WHERE Name = 'Widgets');";

  it('replaces later references with the SELECT and removes the declaration', () => {
    const batch = ['EXEC __mj.spRefresh;', declare, "INSERT INTO __mj.EntityField (EntityID, Name) VALUES (@EntityID, 'Size');"].join('\n');
    const out = InlineScalarSelectVariables(batch);
    expect(out).not.toMatch(/DECLARE\s+@EntityID/);
    expect(out).toContain("VALUES ((SELECT ID FROM __mj.Entity WHERE Name = 'Widgets'), 'Size')");
  });

  it('rewrites IS NULL / IS NOT NULL guards as NOT EXISTS probes', () => {
    const batch = [
      'EXEC __mj.spRefresh;',
      declare,
      "IF @EntityID IS NULL RAISERROR('missing', 16, 1);",
      'IF @EntityID IS NOT NULL',
      'BEGIN',
      "  UPDATE __mj.EntityField SET Category = 'A' WHERE EntityID = @EntityID;",
      'END',
    ].join('\n');
    const out = InlineScalarSelectVariables(batch);
    expect(out).toContain("IF NOT EXISTS (SELECT 1 WHERE (SELECT ID FROM __mj.Entity WHERE Name = 'Widgets') IS NOT NULL)\nBEGIN\n    RAISERROR('missing', 16, 1);\nEND");
    expect(out).toContain("IF NOT EXISTS (SELECT 1 WHERE (SELECT ID FROM __mj.Entity WHERE Name = 'Widgets') IS NULL)\nBEGIN");
  });

  it('leaves string literals that mention the variable alone', () => {
    const batch = ['EXEC __mj.spRefresh;', declare, "PRINT 'set @EntityID first'; SELECT @EntityID;"].join('\n');
    expect(InlineScalarSelectVariables(batch)).toContain("'set @EntityID first'");
  });

  it('does not inline when a later statement writes the table the SELECT reads', () => {
    const batch = ['EXEC __mj.spRefresh;', declare, "DELETE FROM __mj.Entity WHERE Name = 'Widgets';", 'SELECT @EntityID;'].join('\n');
    expect(InlineScalarSelectVariables(batch)).toBe(batch);
  });

  it('inlines past an UPDATE of the read table that leaves the SELECT\'s columns alone', () => {
    const batch = ['EXEC __mj.spRefresh;', declare, "UPDATE __mj.Entity SET Description = 'x' WHERE ID = @EntityID;"].join('\n');
    expect(InlineScalarSelectVariables(batch)).toContain("WHERE ID = (SELECT ID FROM __mj.Entity WHERE Name = 'Widgets')");
  });

  it('does not inline a SELECT over a temp table', () => {
    const batch = ['EXEC __mj.spRefresh;', 'DECLARE @Groups INT = (SELECT COUNT(*) FROM #Merged);', 'IF @Groups > 0 PRINT 1;', 'DROP TABLE #Merged;'].join('\n');
    expect(InlineScalarSelectVariables(batch)).toBe(batch);
  });

  it('does not inline when a later statement drops the table the SELECT reads', () => {
    const batch = ['EXEC __mj.spRefresh;', 'DECLARE @N INT = (SELECT COUNT(*) FROM __mj.Staging);', 'DROP TABLE __mj.Staging;', 'SELECT @N;'].join('\n');
    expect(InlineScalarSelectVariables(batch)).toBe(batch);
  });

  it('does not inline a variable that is reassigned', () => {
    const batch = ['EXEC __mj.spRefresh;', declare, 'SET @EntityID = NULL;', 'SELECT @EntityID;'].join('\n');
    expect(InlineScalarSelectVariables(batch)).toBe(batch);
  });

  it('leaves a batch that starts with its DECLARE to the DECLARE-block rules', () => {
    const batch = [declare, "INSERT INTO __mj.EntityField (EntityID) VALUES (@EntityID);"].join('\n');
    expect(InlineScalarSelectVariables(batch)).toBe(batch);
  });
});
