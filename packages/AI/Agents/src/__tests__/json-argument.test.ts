import { describe, it, expect } from 'vitest';
import { DecodeJSONArgument, RepairLayoutEscapesOutsideStrings } from '../native-tools/json-argument';

/**
 * The defect as Gemini 3.8 Flash produced it on a forced final `complete_task` (2026-10-15):
 * real newlines up to the end of the SQL value, then the rest of the layout written as escapes.
 */
const LAYOUT_ESCAPED_AFTER_SQL =
    '{\n  "updateElements": {\n    "query": {\n      "name": "Chapter Quarterly Engagement Matrix",\n' +
    '      "sql": "SELECT c.Name\\nFROM [AssociationDemo].[vwChapters] c\\nWHERE c.Region = \\"West\\"\\nORDER BY c.Name ASC"' +
    '\\n    }\\n  }\\n}';

describe('DecodeJSONArgument', () => {
    it('parses valid JSON without repairing it', () => {
        expect(DecodeJSONArgument('{"a": 1}')).toEqual({ Success: true, Value: { a: 1 }, Repaired: false });
    });

    it('repairs layout written as escapes after a long string value', () => {
        const result = DecodeJSONArgument(LAYOUT_ESCAPED_AFTER_SQL);
        expect(result).toMatchObject({ Success: true, Repaired: true });
        const value = (result as { Value: { updateElements: { query: { name: string; sql: string } } } }).Value;
        expect(value.updateElements.query.name).toBe('Chapter Quarterly Engagement Matrix');
        // Escapes inside the string decode as JSON escapes, exactly as they would have unrepaired.
        expect(value.updateElements.query.sql).toBe(
            'SELECT c.Name\nFROM [AssociationDemo].[vwChapters] c\nWHERE c.Region = "West"\nORDER BY c.Name ASC');
    });

    it('repairs a document written entirely with escaped layout', () => {
        expect(DecodeJSONArgument('{\\n\\t"a": [1,\\r\\n 2]\\n}')).toEqual({ Success: true, Value: { a: [1, 2] }, Repaired: true });
    });

    it("reports the parser's error for the model's own text when the repair does not help", () => {
        const result = DecodeJSONArgument('{"a": 1,\\n "b": }');
        expect(result.Success).toBe(false);
        expect((result as { Error: string }).Error).toMatch(/JSON/);
    });

    it('reports an error for text that is not JSON at all', () => {
        expect(DecodeJSONArgument('not json').Success).toBe(false);
    });
});

describe('RepairLayoutEscapesOutsideStrings', () => {
    it('leaves every escape inside a string alone', () => {
        const text = '{"sql": "a\\nb\\tc\\\\n \\"quoted\\\\\\" d"}';
        expect(RepairLayoutEscapesOutsideStrings(text)).toBe(text);
    });

    it('tracks the end of a string that ends in an escaped backslash', () => {
        // "a\\" is a complete string holding one backslash; the \n after it is layout.
        expect(RepairLayoutEscapesOutsideStrings('{"p": "a\\\\"\\n}')).toBe('{"p": "a\\\\"\n}');
    });

    it('leaves other backslashes outside strings for the parser to reject', () => {
        expect(RepairLayoutEscapesOutsideStrings('{\\u0041}')).toBe('{\\u0041}');
    });

    it('returns valid JSON unchanged', () => {
        const text = '{\n  "a": "x\\ny",\n  "b": [1, 2]\n}';
        expect(RepairLayoutEscapesOutsideStrings(text)).toBe(text);
    });
});
