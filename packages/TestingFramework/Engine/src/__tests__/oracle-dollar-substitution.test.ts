/**
 * Oracle value substitution — `$` in substituted values (issue #3171).
 *
 * Both oracles splice runtime data into a string they then act on:
 *   - The LLM judge puts the subject and the criteria into the judge prompt.
 *     These are arbitrary text, and `$` is ordinary in currency, regexes and
 *     template text. The subject now travels as its own user message
 *     (`BuildSubjectMessage`) and the criteria as template data
 *     (`BuildCriteriaPromptData`), so neither passes through a string replace.
 *   - `SQLValidatorOracle.replaceParameters` puts a `'`-escaped value into SQL
 *     that is then executed.
 *
 * As *string* replacements, `$$`, `$&`, `` $` `` and `$'` in that data were
 * expanded rather than inserted — so the judge scored a prompt that differed
 * from the data under test, and the validator ran SQL whose literal had the
 * surrounding query spliced into it. These tests pin that both carry `$` verbatim.
 */
import { describe, it, expect } from 'vitest';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { BuildCriteriaPromptData, BuildSubjectMessage } from '@memberjunction/rubrics';
import { SQLValidatorOracle } from '../oracles/SQLValidatorOracle';

/** `$` before an ordinary character is NOT special — that case must keep working. */
const HOSTILE = ['a$$b', 'a$&b', 'a$`b', "a$'b", 'a$1b', 'a$b', "x$&$`$'$$y"];

function version(name: string): RubricVersionSnapshot {
    return {
        id: 'version',
        rubricId: 'rubric',
        notApplicablePolicy: 'NotAllowed',
        scoreDisplayMin: 0,
        scoreDisplayMax: 1,
        nodes: [{
            id: 'criterion',
            key: 'clarity',
            name,
            nodeType: 'Criterion',
            weight: 1,
            isAdvisory: false,
            isGate: false,
            evidenceRequired: false,
            rationaleRequired: false,
            sequence: 0,
        }],
        scales: [],
        bands: [],
    };
}

describe('LLM judge prompt inputs — $ in the subject and criteria (#3171)', () => {
    for (const value of HOSTILE) {
        it(`carries ${JSON.stringify(value)} into the subject message verbatim`, () => {
            expect(BuildSubjectMessage({ text: value })).toContain(value);
        });

        it(`carries ${JSON.stringify(value)} into the criterion template data verbatim`, () => {
            expect(BuildCriteriaPromptData(version(value))[0].Name).toBe(value);
        });
    }
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
