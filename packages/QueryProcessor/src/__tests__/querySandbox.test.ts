/**
 * The query template environment is built sandboxed by this package itself. Nothing here loads
 * `@memberjunction/templates`: the guard must not depend on that package having been imported.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RunQuerySQLFilterManager } from '@memberjunction/core';
import { QueryParameterProcessor } from '../queryParameterProcessor.js';

declare global {
    // Set only by template code that managed to run JavaScript.
    // eslint-disable-next-line no-var
    var __mjQueryProcessorEscape: string | undefined;
}

const CODE = `globalThis.__mjQueryProcessorEscape = 'ran'; return 6*707`;

describe('QueryParameterProcessor: sandboxed environment', () => {
    beforeEach(() => {
        RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
        globalThis.__mjQueryProcessorEscape = undefined;
    });

    it.each([
        `SELECT {{ ''.constructor.constructor("${CODE}")() }}`,
        `SELECT {{ range.constructor("${CODE}")() }}`,
        `{% set f = [].join.constructor %}SELECT {{ f("${CODE}")() }}`,
    ])('refuses a constructor escape in the SQL template: %s', (sql) => {
        const result = QueryParameterProcessor.ProcessQueryTemplate({ SQL: sql, UsesTemplate: true, Parameters: [] }, undefined);
        expect(globalThis.__mjQueryProcessorEscape).toBeUndefined();
        expect(result.success).toBe(false);
        expect(result.processedSQL).not.toContain('4242');
    });

    it('refuses the escape for every dialect environment it builds', () => {
        for (const DialectKey of ['sqlserver', 'postgresql']) {
            const result = QueryParameterProcessor.ProcessQueryTemplate(
                { SQL: `SELECT {{ ''.constructor.constructor("${CODE}")() }}`, UsesTemplate: true, Parameters: [] }, undefined, undefined, false, undefined, { DialectKey });
            expect(result.success).toBe(false);
        }
        expect(globalThis.__mjQueryProcessorEscape).toBeUndefined();
    });
});
