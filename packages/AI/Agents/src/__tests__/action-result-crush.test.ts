/**
 * Integration tests for the action-result compression wiring in BaseAgent
 * (formatParamValueForResult / crushParamValue / crushCodeValue / resolveActionResultCrush).
 *
 * Following this package's established convention (see prompt-formatting.test.ts),
 * the wiring decision logic is mirrored here as standalone functions, but the REAL
 * @memberjunction/context-crush engine is exercised so compression behavior is genuine.
 *
 * token optimization via @memberjunction/context-crush (SmartCrusher-inspired)
 */
import { describe, it, expect } from 'vitest';
import { CrushJSON, DescribeCrush, type JsonValue } from '@memberjunction/context-crush';
import { CrushCode, type CodeLang } from '@memberjunction/context-crush/code';

const ACTION_RESULT_CRUSH_THRESHOLD = 600;

interface ActionResultCrushConfig {
    threshold: number;
    maxChars: number | undefined;
    codeLang: CodeLang | undefined;
}

/** Mirror of BaseAgent.resolveActionResultCrush — default-on, opt-out via crushActionResults:false. */
function resolveActionResultCrush(agentTypePromptParams?: Record<string, unknown>): ActionResultCrushConfig | undefined {
    if (agentTypePromptParams?.crushActionResults === false) {
        return undefined;
    }
    const requested = agentTypePromptParams?.crushCodeLang;
    const codeLang: CodeLang | undefined = requested === 'sql' || requested === 'typescript' ? requested : undefined;
    return { threshold: ACTION_RESULT_CRUSH_THRESHOLD, maxChars: undefined, codeLang };
}


/** Mirror of BaseAgent.crushParamValue — structural JSON compression (safe no-op on non-JSON). */
function crushParamValue(stringValue: string, config: ActionResultCrushConfig | undefined): string | null {
    if (!config || stringValue.length < config.threshold) {
        return null;
    }
    try {
        const json = JSON.parse(stringValue) as JsonValue;
        const result = CrushJSON(json, { MaxChars: config.maxChars });
        if (result.CrushedChars >= result.OriginalChars) {
            return null;
        }
        const legend = DescribeCrush(result);
        return legend ? `${result.Text}\n  ↳ ${legend}` : result.Text;
    } catch {
        return null;
    }
}

/** Mirror of BaseAgent.crushCodeValue — opt-in AST reduction of SQL/TS code strings. */
function crushCodeValue(stringValue: string, config: ActionResultCrushConfig | undefined): string | null {
    if (!config || !config.codeLang || stringValue.length < config.threshold) {
        return null;
    }
    try {
        const result = CrushCode(stringValue, config.codeLang);
        if (result.CrushedChars >= result.OriginalChars) {
            return null;
        }
        const legend = DescribeCrush(result);
        return legend ? `${result.Text}\n  ↳ ${legend}` : result.Text;
    } catch {
        return null;
    }
}

/**
 * Mirror of BaseAgent.formatParamValueForResult with crush wiring. For STRING values the
 * order is: structural JSON crush (covers actions that JSON.stringify their payload) →
 * opt-in code crush → verbatim. For object/array values: JSON.stringify → JSON crush.
 */
function formatParamValueForResult(value: unknown, config: ActionResultCrushConfig | undefined, maxLength = 0): string {
    if (value === null || value === undefined) {
        return '`null`';
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
        return `\`${String(value)}\``;
    }
    if (typeof value === 'string') {
        const crushedJson = crushParamValue(value, config);
        if (crushedJson !== null) {
            return crushedJson;
        }
        const crushedCode = crushCodeValue(value, config);
        if (crushedCode !== null) {
            return crushedCode;
        }
        return maxLength > 0 && value.length > maxLength ? `${value.substring(0, maxLength)}…` : value;
    }
    const stringValue = JSON.stringify(value);
    const crushed = crushParamValue(stringValue, config);
    if (crushed !== null) {
        return crushed;
    }
    if (maxLength > 0 && stringValue.length > maxLength) {
        return `${stringValue.substring(0, maxLength)}…`;
    }
    return stringValue;
}

/** A 200-row repetitive result set — the canonical action payload the feature targets. */
function buildLargeResultSet(): JsonValue {
    return Array.from({ length: 200 }, (_, i) => ({
        id: i,
        name: `Record ${i}`,
        status: i % 2 === 0 ? 'Active' : 'Inactive',
        category: 'StandardCategory',
    }));
}

/** A large SQL string with a long VALUES list — what a query agent moves through context. */
function buildLargeSql(): string {
    const rows = Array.from({ length: 40 }, (_, i) => `(${i}, 'name${i}', 'StandardCategory')`).join(', ');
    return `-- generated insert\nINSERT INTO Users (id, name, category) VALUES ${rows};`;
}

describe('action-result crush wiring', () => {
    it('crushes a 200-row repetitive result and measurably reduces size', () => {
        const config = resolveActionResultCrush();
        const data = buildLargeResultSet();
        const verbatim = JSON.stringify(data);

        const formatted = formatParamValueForResult(data, config);

        expect(formatted).toContain('$t'); // tabular form
        expect(formatted).toContain('context-crush'); // legend appended
        const crushedText = formatted.split('\n')[0];
        expect(crushedText.length).toBeLessThan(verbatim.length);
        // Report the measured saving for visibility in CI output.
        const saving = Math.round((1 - crushedText.length / verbatim.length) * 100);
        expect(saving).toBeGreaterThan(20);
    });

    it('restores verbatim behavior when the agent opts out (flag off)', () => {
        const config = resolveActionResultCrush({ crushActionResults: false });
        const data = buildLargeResultSet();

        const formatted = formatParamValueForResult(data, config);

        expect(formatted).toBe(JSON.stringify(data));
        expect(formatted).not.toContain('$t');
    });

    it('leaves small payloads verbatim (below threshold)', () => {
        const config = resolveActionResultCrush();
        const data: JsonValue = [{ id: 1, name: 'Small' }];

        const formatted = formatParamValueForResult(data, config);

        expect(formatted).toBe(JSON.stringify(data));
    });

    it('keeps scalars and small strings untouched', () => {
        const config = resolveActionResultCrush();
        expect(formatParamValueForResult(42, config)).toBe('`42`');
        expect(formatParamValueForResult(true, config)).toBe('`true`');
        expect(formatParamValueForResult(null, config)).toBe('`null`');
        expect(formatParamValueForResult('hello world', config)).toBe('hello world');
    });

    it('falls back to verbatim JSON when crushing would not save characters', () => {
        const config = resolveActionResultCrush();
        // A large but non-repetitive single object: padded so it clears the threshold yet
        // gains nothing from tabularization (no array-of-objects to collapse).
        const data: JsonValue = { blob: 'x'.repeat(800) };

        const formatted = formatParamValueForResult(data, config);

        expect(formatted).toBe(JSON.stringify(data));
        expect(formatted).not.toContain('context-crush');
    });

    it('produces byte-stable crushed output across runs (cache-safe)', () => {
        const config = resolveActionResultCrush();
        const data = buildLargeResultSet();
        expect(formatParamValueForResult(data, config)).toBe(formatParamValueForResult(data, config));
    });

    // --- JSON-STRING action results (regression for the P1 wiring gap) ---
    // Actions like run-adhoc-query set an output param to JSON.stringify(rows), so the
    // value arrives as a STRING. These previously bypassed crushJSON entirely.

    it('crushes a JSON-STRING result produced by actions that stringify their payload', () => {
        const config = resolveActionResultCrush(); // default agent, codeLang undefined
        const jsonString = JSON.stringify(buildLargeResultSet()); // e.g. Results = JSON.stringify(rows)

        const formatted = formatParamValueForResult(jsonString, config);

        expect(formatted).toContain('$t'); // crushed tabular form — the bug was that this never appeared
        expect(formatted).toContain('context-crush');
        const crushedText = formatted.split('\n')[0];
        expect(crushedText.length).toBeLessThan(jsonString.length);
    });

    it('routes a large SQL string to code crushing — the JSON attempt is a safe no-op', () => {
        const config = resolveActionResultCrush({ crushCodeLang: 'sql' }); // opt into SQL code crushing
        const sql = buildLargeSql();

        const formatted = formatParamValueForResult(sql, config);

        expect(formatted).toContain('value tuples elided'); // SQL crush signature
        expect(formatted).not.toContain('$t'); // NOT misinterpreted as JSON
        expect(formatted.split('\n  ↳ ')[0].length).toBeLessThan(sql.length);
    });

    it('leaves a large non-JSON, non-code plain string verbatim', () => {
        const config = resolveActionResultCrush(); // codeLang undefined
        const plain = 'lorem ipsum dolor sit amet '.repeat(40); // >600 chars, not JSON, not code

        const formatted = formatParamValueForResult(plain, config);

        expect(formatted).toBe(plain);
        expect(formatted).not.toContain('$t');
    });

    it('returns a JSON-STRING result verbatim when the agent opts out', () => {
        const config = resolveActionResultCrush({ crushActionResults: false });
        const jsonString = JSON.stringify(buildLargeResultSet());

        const formatted = formatParamValueForResult(jsonString, config);

        expect(formatted).toBe(jsonString);
        expect(formatted).not.toContain('$t');
    });
});
