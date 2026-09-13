/**
 * One root cause must not produce ninety warnings.
 *
 * A sync warning is raised per object, per batch or per map, so a single cause — a credential that
 * stopped working, a layer whose parents were never fetched, a connector that ignores the batch size —
 * reaches dozens of them. Live that produced a 90-warning cascade, which is not ninety findings: it is
 * one finding, ninety times, on top of every OTHER warning the run raised.
 *
 * So the logger tallies by CODE: the first few occurrences go out verbatim (that is where an operator
 * learns WHICH objects are affected), the rest are counted, and the run's end emits one rollup line
 * carrying the count and the objects. Nothing is dropped without being counted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncLogger } from '../SyncLogger.js';

type Emitted = { event: string; data: Record<string, unknown> };

function loggerWithCapture(): { logger: SyncLogger; emitted: Emitted[] } {
    const logger = new SyncLogger({ ciId: 'ci-1', integration: 'PheedLoop', runId: 'run-1' });
    const emitted: Emitted[] = [];
    // Spied at `emit` — the single exit both a verbatim warning and a rollup go through, and the
    // shape (event + structured data) that reaches the console line and the durable artifact.
    vi.spyOn(logger, 'emit').mockImplementation((event, data = {}) => { emitted.push({ event, data }); });
    return { logger, emitted };
}

const warnings = (emitted: Emitted[]) => emitted.filter(e => e.event === 'sync.warning');

describe('SyncLogger — repeated warnings are rolled up by code', () => {
    let logger: SyncLogger;
    let emitted: Emitted[];

    beforeEach(() => {
        ({ logger, emitted } = loggerWithCapture());
    });

    it('emits the first five occurrences verbatim, numbered', () => {
        for (let i = 1; i <= 5; i++) {
            logger.warning(`Object${i}`, 'NO_CREDENTIAL', `object ${i} had no credential`);
        }
        const out = warnings(emitted);
        expect(out).toHaveLength(5);
        expect(out.map(w => w.data.occurrence)).toEqual([1, 2, 3, 4, 5]);
        expect(out[0].data.stage).toBe('Object1');
        expect(out[4].data.message).toBe('object 5 had no credential');
    });

    it('suppresses the sixth onward — 90 occurrences produce 5 lines, not 90', () => {
        for (let i = 1; i <= 90; i++) {
            logger.warning(`Object${i}`, 'NO_CREDENTIAL', `object ${i} had no credential`);
        }
        expect(warnings(emitted)).toHaveLength(5);
    });

    it('the run-end rollup accounts for every suppressed occurrence and names the objects', () => {
        for (let i = 1; i <= 90; i++) {
            logger.warning(`Object${i}`, 'NO_CREDENTIAL', `object ${i} had no credential`);
        }
        emitted.length = 0;

        expect(logger.flushWarningRollups()).toBe(1);

        const [rollup, ...rest] = warnings(emitted);
        expect(rest).toEqual([]);
        expect(rollup.data.code).toBe('NO_CREDENTIAL');
        const payload = rollup.data.warningData as Record<string, unknown>;
        expect(payload.rollup).toBe(true);
        expect(payload.occurrences).toBe(90);
        expect(payload.rolledUp).toBe(85);                // 90 − the 5 reported verbatim
        expect((payload.stages as string[])).toHaveLength(90);
        expect(rollup.data.message).toContain('fired 90 time(s)');
        expect(rollup.data.message).toContain('across 90 object(s)');
        expect(rollup.data.message).toContain('Object1');  // a sample is named, not just a count
    });

    it('says nothing at the end when no code exceeded the limit', () => {
        logger.warning('Contacts', 'ORPHANS_DETECTED', 'three orphans');
        logger.warning('Invoices', 'ORPHANS_DETECTED', 'one orphan');
        emitted.length = 0;

        expect(logger.flushWarningRollups()).toBe(0);
        expect(warnings(emitted)).toEqual([]);            // both were already reported in full
    });

    it('tallies each code independently — a cascade of one cannot silence another', () => {
        for (let i = 0; i < 40; i++) logger.warning(`Object${i}`, 'NO_CREDENTIAL', 'no credential');
        logger.warning('Contacts', 'ORPHANS_DETECTED', 'three orphans');

        const codes = warnings(emitted).map(w => w.data.code);
        expect(codes.filter(c => c === 'NO_CREDENTIAL')).toHaveLength(5);
        expect(codes.filter(c => c === 'ORPHANS_DETECTED')).toHaveLength(1);

        emitted.length = 0;
        expect(logger.flushWarningRollups()).toBe(1);      // only the cascading code rolls up
        expect(warnings(emitted)[0].data.code).toBe('NO_CREDENTIAL');
    });

    it('clears its tallies, so a second flush repeats nothing', () => {
        for (let i = 0; i < 10; i++) logger.warning('Contacts', 'NO_CREDENTIAL', 'no credential');
        expect(logger.flushWarningRollups()).toBe(1);
        emitted.length = 0;
        expect(logger.flushWarningRollups()).toBe(0);
        expect(warnings(emitted)).toEqual([]);
    });

    it('counts repeats of one object separately from repeats across objects', () => {
        // Same stage 20 times: the rollup must not claim 20 objects were affected.
        for (let i = 0; i < 20; i++) logger.warning('Contacts', 'CONNECTOR_IGNORED_BATCH_SIZE', 'over-size batch');
        emitted.length = 0;
        logger.flushWarningRollups();
        const rollup = warnings(emitted)[0];
        const payload = rollup.data.warningData as Record<string, unknown>;
        expect(payload.occurrences).toBe(20);
        expect(payload.stages).toEqual(['Contacts']);
        expect(rollup.data.message).toContain('across 1 object(s)');
    });
});
