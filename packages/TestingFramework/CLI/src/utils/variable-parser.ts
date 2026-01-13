/**
 * @fileoverview Variable parsing utilities for CLI
 * @module @memberjunction/testing-cli
 */

import { TestEngine, VariableResolver } from '@memberjunction/testing-engine';
import { TestVariableValue } from '@memberjunction/testing-engine-base';

/**
 * Parse --var flags into a variables object.
 *
 * @param varFlags - Array of var flags in "name=value" format
 * @param testTypeVariablesSchema - Optional type schema for type conversion
 * @returns Parsed variables object
 */
export function parseVariableFlags(
    varFlags: string[] | undefined,
    testTypeVariablesSchema?: string | null
): Record<string, TestVariableValue> | undefined {
    if (!varFlags || varFlags.length === 0) {
        return undefined;
    }

    const resolver = new VariableResolver();
    return resolver.parseCliVariables(varFlags, testTypeVariablesSchema);
}

/**
 * Get the variables schema for a test (from its test type).
 *
 * @param engine - TestEngine instance
 * @param testId - Test ID
 * @returns Variables schema JSON string or null
 */
export function getTestVariablesSchema(
    engine: TestEngine,
    testId: string
): string | null {
    const test = engine.GetTestByID(testId);
    if (!test) {
        return null;
    }

    const testType = engine.GetTestTypeByID(test.TypeID);
    if (!testType) {
        return null;
    }

    return testType.VariablesSchema;
}
