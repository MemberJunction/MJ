/**
 * Oracle value substitution — `$` in substituted values (issue #3171).
 *
 * Both oracles splice runtime data into a string they then act on:
 *   - `LLMJudgeOracle.buildPrompt` puts the test input, the expected output and
 *     the actual output into the judge prompt. These are arbitrary JSON, and `$`
 *     is ordinary in currency, regexes and template text.
 *   - `SQLValidatorOracle.replaceParameters` puts a `'`-escaped value into SQL
 *     that is then executed.
 *
 * As *string* replacements, `$$`, `$&`, `` $` `` and `$'` in that data were
 * expanded rather than inserted — so the judge scored a prompt that differed
 * from the data under test, and the validator ran SQL whose literal had the
 * surrounding query spliced into it. Both now use replacement functions; neither
 * path had a test before.
 */
import { describe, it, expect } from 'vitest';
import { LLMJudgeOracle } from '../oracles/LLMJudgeOracle';
import { SQLValidatorOracle } from '../oracles/SQLValidatorOracle';
import type { OracleInput } from '../types';

/** `$` before an ordinary character is NOT special — that case must keep working. */
const HOSTILE = ['a$$b', 'a$&b', 'a$`b', "a$'b", 'a$1b', 'a$b', "x$&$`$'$$y"];

describe('LLMJudgeOracle.buildPrompt — $ in test data (#3171)', () => {
    const oracle = new LLMJudgeOracle();

    const build = (input: OracleInput, criteria: string[], template?: string): string =>
        (oracle as unknown as Record<string, (...a: unknown[]) => string>)
            .buildPrompt(input, criteria, template);

    const inputWith = (actual: unknown, expected: unknown = 'ok'): OracleInput =>
        ({
            test: { InputDefinition: { q: 'ping' } },
            expectedOutput: expected,
            actualOutput: actual,
        } as unknown as OracleInput);

    for (const value of HOSTILE) {
        it(`carries an actual output containing ${JSON.stringify(value)} into the prompt verbatim`, () => {
            const prompt = build(inputWith(value), ['is it right?'], 'ACTUAL[{{actual}}]');
            // JSON.stringify wraps it in quotes; the `$` run must survive untouched.
            expect(prompt).toBe(`ACTUAL[${JSON.stringify(value)}]`);
        });

        it(`carries an expected output containing ${JSON.stringify(value)} into the prompt verbatim`, () => {
            const prompt = build(inputWith('ok', value), ['is it right?'], 'EXPECTED[{{expected}}]');
            expect(prompt).toBe(`EXPECTED[${JSON.stringify(value)}]`);
        });
    }

    it('carries a criterion containing $ verbatim', () => {
        const prompt = build(inputWith('ok'), ['price must be $$5 not $& more'], 'C[{{criteria}}]');
        expect(prompt).toBe('C[1. price must be $$5 not $& more]');
    });

    it('maps every placeholder to its own value', () => {
        const prompt = build(
            inputWith('A', 'E'),
            ['C1'],
            'e={{expected}} a={{actual}} c={{criteria}}',
        );
        expect(prompt).toBe('e="E" a="A" c=1. C1');
    });
});

describe('SQLValidatorOracle.replaceParameters — $ in values (#3171)', () => {
    const oracle = new SQLValidatorOracle();

    const substitute = (sql: string, actualOutput: unknown): string =>
        (oracle as unknown as Record<string, (...a: unknown[]) => string>)
            .replaceParameters(sql, actualOutput);

    for (const value of HOSTILE) {
        it(`substitutes a value containing ${JSON.stringify(value)} verbatim`, () => {
            const sql = substitute('SELECT * FROM T WHERE Name = @Name', { Name: value });
            // `'` is SQL-escaped by doubling; `$` must pass through untouched.
            expect(sql).toBe(`SELECT * FROM T WHERE Name = '${value.replace(/'/g, "''")}'`);
        });
    }

    it('still leaves SQL without matching parameters alone', () => {
        expect(substitute('SELECT 1', { Name: 'x' })).toBe('SELECT 1');
    });

    it('still substitutes a plain value', () => {
        expect(substitute('WHERE Id = @Id', { Id: 42 })).toBe('WHERE Id = 42');
    });
});
