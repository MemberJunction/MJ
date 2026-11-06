/**
 * `SweepInterruptedRuns` closes out run artifacts a dead process left open. It is only sound
 * BEFORE anything in this process can start a run: a run started first is still in flight when
 * the sweep looks, so the sweep marks a live run "killed" and the wizard and active-operations
 * panel report a failure for work that is still going.
 *
 * Booting the server is far too heavy for a unit test, so this pins the order in the source:
 * the sweep is awaited before the scheduler, the integration sync worker (whose Start() polls
 * immediately), the HTTP listener, and pending RSU work.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

function at(needle: string): number {
    const i = source.indexOf(needle);
    expect(i, `not found in index.ts: ${needle}`).toBeGreaterThan(-1);
    return i;
}

describe('startup: the interrupted-run sweep runs before anything can start a run', () => {
    const sweep = () => at('await SweepInterruptedRuns(');

    it.each([
        ['the scheduled jobs service', 'scheduledJobsService.Start()'],
        ['the integration sync worker', 'integrationSyncWorker.Start()'],
        ['the HTTP listener', 'httpServer.listen('],
        ['pending RSU work', 'processRSUPendingWork().catch('],
    ])('precedes %s', (_label, needle) => {
        expect(sweep()).toBeLessThan(at(needle));
    });

    it('is called exactly once', () => {
        expect(source.split('await SweepInterruptedRuns(').length - 1).toBe(1);
    });
});
