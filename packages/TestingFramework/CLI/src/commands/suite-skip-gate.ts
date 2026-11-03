/**
 * @fileoverview Applies the integration skip gate to a finished suite run.
 * @module @memberjunction/testing-cli
 */
import { NormalizeUUID } from '@memberjunction/global';
import { EvaluateSkipGate, ExpectedCheckIds } from '@memberjunction/testing-integration';
import type { ExpectedChecksByTest, SkipGateReport } from '@memberjunction/testing-integration';
import type { TestSuiteRunResult } from '@memberjunction/testing-engine';

/** The fields of a Test the gate reads. */
export interface SkipGateTest {
    ID: string;
    Configuration: string | null;
}

/**
 * Judge a suite run's integration skips. Each test's expected check Ids come from the bundles its
 * Configuration selects, so a registered check that never reported is caught as well.
 *
 * @param result the suite result from `TestEngine.RunSuite`
 * @param tests the engine's loaded Tests, used to read each result's Configuration
 */
export function EvaluateSuiteSkipGate(result: TestSuiteRunResult, tests: readonly SkipGateTest[]): SkipGateReport {
    const configByTestId = new Map(tests.map(t => [NormalizeUUID(t.ID), t.Configuration] as const));
    const expected: ExpectedChecksByTest = new Map(
        result.testResults.map(r => [r.testId, ExpectedCheckIds(configByTestId.get(NormalizeUUID(r.testId)))] as const)
    );
    return EvaluateSkipGate(result.testResults, expected);
}
