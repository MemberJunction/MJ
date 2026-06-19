/**
 * Integration tests for the action-result compression wiring in BaseAgent
 * (formatParamValueForResult / crushParamValue / resolveActionResultCrush).
 *
 * Following this package's established convention (see prompt-formatting.test.ts),
 * the wiring decision logic is mirrored here as standalone functions, but the REAL
 * @memberjunction/context-crush engine is exercised so compression behavior is genuine.
 *
 * token optimization via @memberjunction/context-crush (SmartCrusher-inspired)
 */
import { describe, it, expect } from 'vitest';
import { CrushJSON, DescribeCrush, type JsonValue } from '@memberjunction/context-crush';

const ACTION_RESULT_CRUSH_THRESHOLD = 600;

interface ActionResultCrushConfig {
    threshold: number;
    maxChars: number | undefined;
}

/** Mirror of BaseAgent.resolveActionResultCrush — default-on, opt-out via crushActionResults:false. */
function resolveActionResultCrush(agentTypePromptParams?: Record<string, unknown>): ActionResultCrushConfig | undefined {
    if (agentTypePromptParams?.crushActionResults === false) {
        return undefined;
    }
    return { threshold: ACTION_RESULT_CRUSH_THRESHOLD, maxChars: undefined };
}

/** Mirror of BaseAgent.crushParamValue. */
function crushParamValue(stringValue: string, config: ActionResultCrushConfig | undefined): string | null {
    if (!config || stringValue.length < config.threshold) {
        return null;
    }
    const json = JSON.parse(stringValue) as JsonValue;
    const result = CrushJSON(json, { MaxChars: config.maxChars });
    if (result.CrushedChars >= result.OriginalChars) {
        return null;
    }
    const legend = DescribeCrush(result);
    return legend ? `${result.Text}\n  ↳ ${legend}` : result.Text;
}

/** Mirror of BaseAgent.formatParamValueForResult with crush wiring. */
function formatParamValueForResult(value: unknown, config: ActionResultCrushConfig | undefined, maxLength = 0): string {
    if (value === null || value === undefined) {
        return '`null`';
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
        return `\`${String(value)}\``;
    }
    if (typeof value === 'string') {
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

    it('keeps scalars and strings untouched', () => {
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
});
