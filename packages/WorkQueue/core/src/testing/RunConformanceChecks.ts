import { ConformanceAssertionError } from './assertions';
import type { ConformanceCheckResult, ConformanceHarness } from './ConformanceHarness';
import { CONFORMANCE_CASES } from './conformanceCases';

/**
 * Runs every conformance case sequentially and reports each outcome. Never throws: a gated case is
 * Skipped with its reason, and any error (assertion or otherwise) makes the case Failed. Each case
 * disposes its own driver (see WithScenario). Usable outside vitest, e.g. from an integration runner.
 */
export async function RunConformanceChecks(harness: ConformanceHarness): Promise<ConformanceCheckResult[]> {
    const results: ConformanceCheckResult[] = [];
    for (const conformanceCase of CONFORMANCE_CASES) {
        const base = { Id: conformanceCase.Id, Title: conformanceCase.Title };
        const skipReason = gateSafely(conformanceCase.Gate.bind(conformanceCase), harness);
        if (skipReason !== null) {
            results.push({ ...base, Status: 'Skipped', Detail: skipReason, DurationMs: 0 });
            continue;
        }
        const startedAt = Date.now();
        try {
            await conformanceCase.Run(harness);
            results.push({ ...base, Status: 'Passed', Detail: null, DurationMs: Date.now() - startedAt });
        } catch (error) {
            results.push({ ...base, Status: 'Failed', Detail: describeFailure(error), DurationMs: Date.now() - startedAt });
        }
    }
    return results;
}

function gateSafely(gate: (harness: ConformanceHarness) => string | null, harness: ConformanceHarness): string | null {
    try {
        return gate(harness);
    } catch (error) {
        return `Gate failed: ${describeFailure(error)}`;
    }
}

function describeFailure(error: unknown): string {
    if (error instanceof ConformanceAssertionError) {
        return error.message;
    }
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}
