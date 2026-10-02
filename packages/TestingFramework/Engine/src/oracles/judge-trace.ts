/**
 * @fileoverview The trace and criteria the judge oracles evaluate
 * @module @memberjunction/testing-engine
 *
 * `LLMJudgeOracle` and `DecisionJudgeOracle` judge the same trace against the same criteria, so a
 * test can run both side by side. Both read them, and their model-call timeout, through these
 * helpers, so both accept, and reject, exactly the same criteria and settings.
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
 * One criterion a judge scores against. A test states it as a string, or as
 * `{ "criterion": "...", "weight": 2 }`.
 */
export interface JudgeCriterion {
    /** What the output must satisfy, as the test states it. */
    Criterion: string;
    /** The criterion's weight in a weighted score: a finite number of 0 or more, 1 when the test sets none. */
    Weight: number;
}

/** A value read from the test or the oracle config, or the reason it cannot be used. */
export type JudgeReadResult<T> =
    | { Success: true; Value: T }
    | { Success: false; ErrorMessage: string };

/**
 * How long a judge waits for each model call when the oracle config sets no `timeoutMS`: two minutes.
 * A judge call is one prompt over one test's trace, so this is generous; it is there so a hung call
 * fails the oracle instead of hanging the test run.
 */
export const DEFAULT_JUDGE_TIMEOUT_MS = 120_000;

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
 * is set, otherwise the oracle config's `criteria`. Each entry is a non-empty string (weight 1), or
 * an object with a non-empty `criterion` and an optional `weight` that is a finite number of 0 or more.
 * At least one criterion must weigh more than 0.
 *
 * @param input - The oracle input
 * @param config - The oracle config
 * @returns The criteria, in the order the test lists them, or the reason they cannot be read: there
 *   are none, the value is not an array, an entry is malformed, or every weight is 0
 */
export function ReadJudgeCriteria(input: OracleInput, config: OracleConfig): JudgeReadResult<JudgeCriterion[]> {
    const raw = readExpectedCriteria(input.expectedOutput) || config.criteria;
    if (!raw || (Array.isArray(raw) && raw.length === 0)) {
        return { Success: false, ErrorMessage: 'No validation criteria provided' };
    }
    if (!Array.isArray(raw)) {
        return { Success: false, ErrorMessage: `Validation criteria must be an array of criteria, not a ${typeof raw}` };
    }
    return readCriteriaEntries(raw);
}

/**
 * Reads how long a judge waits for each model call from the oracle config's `timeoutMS`. The runner
 * applies it to each model call as `AIPromptParams.timeoutMS`, so a failover to another model gets a
 * fresh budget, and a call that runs over fails.
 *
 * @param config - The oracle config
 * @returns The timeout in milliseconds, {@link DEFAULT_JUDGE_TIMEOUT_MS} when the config sets none, or
 *   the reason the config's value is not a positive, finite number
 */
export function ReadJudgeTimeoutMS(config: OracleConfig): JudgeReadResult<number> {
    const timeoutMS = config.timeoutMS ?? DEFAULT_JUDGE_TIMEOUT_MS;
    if (typeof timeoutMS !== 'number' || !Number.isFinite(timeoutMS) || timeoutMS <= 0) {
        const shown = typeof timeoutMS === 'number' ? String(timeoutMS) : JSON.stringify(timeoutMS);
        return { Success: false, ErrorMessage: `timeoutMS must be a positive number of milliseconds, not ${shown}` };
    }
    return { Success: true, Value: timeoutMS };
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

/**
 * Every entry as a criterion, or the reason they cannot be read: the first malformed entry, or every
 * weight being 0, which leaves a weighted score with nothing to weigh.
 */
function readCriteriaEntries(entries: unknown[]): JudgeReadResult<JudgeCriterion[]> {
    const criteria: JudgeCriterion[] = [];
    for (const [index, entry] of entries.entries()) {
        const criterion = readCriterion(entry);
        if (!criterion) {
            return {
                Success: false,
                ErrorMessage: `Criterion ${index + 1} must be a non-empty string, or an object with a non-empty "criterion" ` +
                    'and an optional "weight" that is a number of 0 or more',
            };
        }
        criteria.push(criterion);
    }
    if (criteria.every(c => c.Weight === 0)) {
        return {
            Success: false,
            ErrorMessage: 'Every criterion has weight 0, so none counts toward the score: give at least one a weight above 0',
        };
    }
    return { Success: true, Value: criteria };
}

/** One criterion: a string (weight 1), or `{ criterion, weight? }`. Undefined when it is neither. */
function readCriterion(entry: unknown): JudgeCriterion | undefined {
    if (typeof entry === 'string') {
        return entry.trim() ? { Criterion: entry, Weight: 1 } : undefined;
    }
    if (typeof entry !== 'object' || entry === null || !('criterion' in entry)) {
        return undefined;
    }
    const text = entry.criterion;
    const weight = 'weight' in entry && entry.weight != null ? entry.weight : 1;
    if (typeof text !== 'string' || !text.trim()) {
        return undefined;
    }
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
        return undefined;
    }
    return { Criterion: text, Weight: weight };
}
