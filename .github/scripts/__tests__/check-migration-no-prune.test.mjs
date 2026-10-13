import { describe, it, expect } from 'vitest';
import { scanContent, addedLinesFromDiff, SELF_TEST_FIXTURES } from '../check-migration-no-prune.mjs';

describe('check-migration-no-prune scanContent', () => {
    it.each(SELF_TEST_FIXTURES)('%s → %s', (_name, shouldFlag, sql) => {
        expect(scanContent(sql).length > 0).toBe(shouldFlag);
    });

    it('flags unmasked occurrences and correctly attributes line numbers', () => {
        const sql = `-- comment\nSELECT 1;\nEXEC [__mj].[spDeleteUnneededEntityFields];\nSELECT 2;`;
        const hits = scanContent(sql);
        expect(hits).toHaveLength(1);
        expect(hits[0].line).toBe(3);
    });
});

describe('check-migration-no-prune addedLinesFromDiff', () => {
    it('parses added line ranges from unified diff', () => {
        const diff = `@@ -5,2 +5,3 @@\n+foo\n+bar\n+baz\n@@ -20,1 +21,1 @@\n+qux\n`;
        const lines = addedLinesFromDiff(diff);
        expect(lines.has(5)).toBe(true);
        expect(lines.has(6)).toBe(true);
        expect(lines.has(7)).toBe(true);
        expect(lines.has(21)).toBe(true);
        expect(lines.has(22)).toBe(false);
    });
});
