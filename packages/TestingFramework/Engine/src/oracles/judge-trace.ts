/**
 * @fileoverview The trace and criteria the judge oracles evaluate
 * @module @memberjunction/testing-engine
 *
 * `LLMJudgeOracle` and `DecisionJudgeOracle` judge the same trace against the same criteria, so a
 * test can run both side by side. Both read them through these helpers.
 */

import { OracleInput, OracleConfig } from '../types';

/**
 * The trace a judge evaluates, as pretty-printed JSON. Each part is `JSON.stringify`'s output, so it
 * is `undefined` when the value it renders is `undefined`.
 */
export interface JudgeTrace {
    /** The test's input definition, parsed first when it is stored as a JSON string; `{}` when it has none. */
    Input: string | undefined;
    /** The test's expected output. */
    Expected: string | undefined;
    /** The output the test produced. */
    Actual: string | undefined;
}

/**
 * Builds the trace a judge evaluates from the oracle input.
 *
 * @param input - The oracle input
 * @returns The input definition, the expected output and the actual output, as JSON
 * @throws SyntaxError when the test's input definition is a string that is not valid JSON
 */
export function BuildJudgeTrace(input: OracleInput): JudgeTrace {
    return {
        Input: JSON.stringify(readInputDefinition(input), null, 2),
        Expected: JSON.stringify(input.expectedOutput, null, 2),
        Actual: JSON.stringify(input.actualOutput, null, 2),
    };
}

/**
 * Reads the criteria a judge scores against: the expected output's `judgeValidationCriteria` when it
 * is set, otherwise the oracle config's `criteria`. The value is returned as found; each oracle
 * narrows it to the entries it accepts.
 *
 * @param input - The oracle input
 * @param config - The oracle config
 * @returns The raw criteria, or a falsy value when neither source sets them
 */
export function ReadJudgeCriteria(input: OracleInput, config: OracleConfig): unknown {
    return readExpectedCriteria(input.expectedOutput) || config.criteria;
}

/** The test's input definition, parsed when it is a JSON string, or `{}` when it has none. */
function readInputDefinition(input: OracleInput): unknown {
    const definition = input.test.InputDefinition;
    if (!definition) {
        return {};
    }
    return typeof definition === 'string' ? JSON.parse(definition) : definition;
}

/** The expected output's `judgeValidationCriteria`, when the expected output is an object. */
function readExpectedCriteria(expectedOutput: unknown): unknown {
    if (typeof expectedOutput !== 'object' || expectedOutput === null || !('judgeValidationCriteria' in expectedOutput)) {
        return undefined;
    }
    return expectedOutput.judgeValidationCriteria;
}
