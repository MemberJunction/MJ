/**
 * Startup order in index.ts: the boot sweep must exempt restart-killed RSU runs on a replica that
 * runs background workers (processRSUPendingWork is their continuation), and whichever of those
 * nothing re-attached to must be swept once the resuming pass is over. The behaviour of each half
 * is tested in RSUPostRestartProgress.test.ts; this pins the wiring between them, which lives in
 * a bootstrap function no unit test can run.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '..', 'index.ts'), 'utf-8');

describe('RSU startup sweep wiring', () => {
    it('the boot sweep exempts restart-killed RSU runs only where background workers will resume them', () => {
        expect(src).toMatch(
            /const bootSweep = await SweepInterruptedRuns\(\s*undefined,\s*msg => console\.warn\(msg\),\s*runBackgroundWorkers \? RSUPostRestartProgressSession\.WasKilledAtRestart : undefined\s*\);/
        );
    });

    it('the leftover sweep runs after the resuming pass, over exactly the runs the boot sweep left in flight', () => {
        const pending = src.indexOf('processRSUPendingWork().catch(');
        const leftover = src.indexOf('RSUPostRestartProgressSession.SweepUnattached(bootSweep.Skipped');
        const boot = src.indexOf('const bootSweep = await SweepInterruptedRuns(');
        expect(boot).toBeGreaterThan(-1);
        expect(pending).toBeGreaterThan(boot);
        expect(leftover).toBeGreaterThan(pending);
        expect(src.slice(pending, leftover)).toMatch(/\.finally\(/);
    });
});
