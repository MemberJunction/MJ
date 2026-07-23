/**
 * run-with-compliance.test.ts — WI3 regression guard for issue #3251.
 *
 * runWithCompliance used to treat "no run landed" (scenario() → undefined) as a compliance miss:
 * it retried 3× and then threw `model-noncompliance:`, laundering a hard EXECUTION failure into
 * accepted model variance (exactly how the contextUser defect hid behind IT56/IT57). These tests
 * pin the corrected three-way outcome: a no-run fails immediately as `agent-run-failed:` (no
 * retries), a landed-but-noncompliant run still retries then throws `model-noncompliance:`, and a
 * compliant run returns its id.
 */
import { describe, it, expect, vi } from 'vitest';
import { runWithCompliance } from '../checks/_it-live-agent-harness';

describe('runWithCompliance — execution failure vs model variance (WI3, #3251)', () => {
    it('a run that never lands fails immediately as agent-run-failed (no retries, not model variance)', async () => {
        const scenario = vi.fn(async (): Promise<string | undefined> => undefined);
        const isCompliant = vi.fn(async () => true);
        await expect(runWithCompliance(scenario, isCompliant, 'NoRun')).rejects.toThrow(/agent-run-failed:/);
        expect(scenario).toHaveBeenCalledTimes(1);
        expect(isCompliant).not.toHaveBeenCalled();
    });

    it('a landed-but-noncompliant run retries up to 3× then throws model-noncompliance', async () => {
        const scenario = vi.fn(async (): Promise<string | undefined> => 'run-1');
        const isCompliant = vi.fn(async () => false);
        await expect(runWithCompliance(scenario, isCompliant, 'NonCompliant')).rejects.toThrow(/model-noncompliance:/);
        expect(scenario).toHaveBeenCalledTimes(3);
    });

    it('returns the run id on the first compliant attempt', async () => {
        const scenario = vi.fn(async (): Promise<string | undefined> => 'run-42');
        const isCompliant = vi.fn(async () => true);
        await expect(runWithCompliance(scenario, isCompliant, 'Happy')).resolves.toBe('run-42');
        expect(scenario).toHaveBeenCalledTimes(1);
    });
});
