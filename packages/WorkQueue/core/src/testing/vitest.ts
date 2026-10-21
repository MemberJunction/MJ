import { describe, it } from 'vitest';
import type { ConformanceHarness } from './ConformanceHarness';
import { CONFORMANCE_CASES } from './conformanceCases';
import { EnvironmentSkipReason } from './RunConformanceChecks';

/** Registers every conformance case as a vitest test (skipped cases show their reason). */
export function RunTransportConformanceSuite(name: string, harness: ConformanceHarness): void {
    describe(`${name} — work-queue transport conformance`, () => {
        for (const conformanceCase of CONFORMANCE_CASES) {
            const title = `${conformanceCase.Id} ${conformanceCase.Title}`;
            const skipReason = EnvironmentSkipReason(harness, conformanceCase.Id) ?? conformanceCase.Gate(harness);
            if (skipReason === null) {
                it(title, () => conformanceCase.Run(harness));
            } else {
                it.skip(`${title} (skipped: ${skipReason})`, () => conformanceCase.Run(harness));
            }
        }
    });
}
