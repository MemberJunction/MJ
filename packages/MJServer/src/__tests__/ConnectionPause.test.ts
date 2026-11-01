/**
 * everything.txt C6: pausing a connection must actually pause it — and resuming must put back
 * what pause took, not "everything".
 *
 * Each test below pins a way this went wrong or would go wrong. The two that matter most are
 * `DecidePauseWrite` (a second pause must not erase the first pause's record) and the two guards
 * in `DecideSchedulesToResume` (never resurrect a schedule the operator turned off themselves).
 */
import { describe, it, expect } from 'vitest';
import {
    DecideSchedulesToPause,
    DecidePauseWrite,
    DecideSchedulesToResume,
    ReadPausedSchedules,
    WritePausedSchedules,
    DescribeCancelScope,
    DescribeCancelOutcome,
    DescribePauseOutcome,
    PAUSED_SCHEDULES_KEY,
    type ScheduleJobState,
    type PausedScheduleRecord,
} from '../integration/ConnectionPause.js';

const job = (ID: string, Status: string | null, Kind: 'sync' | 'discovery' = 'sync'): ScheduleJobState =>
    ({ ID, Status, Kind });

describe('DecideSchedulesToPause', () => {
    it('moves only the Active jobs', () => {
        const out = DecideSchedulesToPause([job('a', 'Active'), job('b', 'Paused', 'discovery'), job('c', 'Active', 'discovery')]);
        expect(out.map(r => r.ID)).toEqual(['a', 'c']);
    });

    it('leaves an already-Paused job out of the record, so resume cannot turn it on', () => {
        // The whole point: 'b' was off before the pause. If it appeared here, resume would
        // silently start a schedule the operator had deliberately stopped.
        const out = DecideSchedulesToPause([job('b', 'Paused')]);
        expect(out).toEqual([]);
    });

    it('ignores statuses that are neither Active nor Paused', () => {
        expect(DecideSchedulesToPause([job('x', 'Disabled'), job('y', null)])).toEqual([]);
    });

    it('carries the kind through for the operator message', () => {
        expect(DecideSchedulesToPause([job('a', 'Active', 'discovery')])).toEqual([{ ID: 'a', Kind: 'discovery' }]);
    });
});

describe('DecidePauseWrite — the second pause must not erase the first', () => {
    it('writes the record on a first pause', () => {
        expect(DecidePauseWrite([], [{ ID: 'a', Kind: 'sync' }])).toEqual([{ ID: 'a', Kind: 'sync' }]);
    });

    it('REFUSES to overwrite a stored record with the empty set a re-pause produces', () => {
        // Deactivate an already-deactivated connection: every job is Paused, so nothing is
        // "moved" and newlyPaused is []. Writing that would lose the record and strand both
        // schedules off forever, with no error anywhere.
        const stored: PausedScheduleRecord[] = [{ ID: 'a', Kind: 'sync' }, { ID: 'b', Kind: 'discovery' }];
        expect(DecidePauseWrite(stored, [])).toBeNull();
    });

    it('refuses to overwrite a stored record even when the re-pause DID move something', () => {
        // A schedule created while paused, then moved by a second pause. The first record is
        // still the authority on what resume owes; adding to it would over-restore.
        const stored: PausedScheduleRecord[] = [{ ID: 'a', Kind: 'sync' }];
        expect(DecidePauseWrite(stored, [{ ID: 'c', Kind: 'discovery' }])).toBeNull();
    });

    it('writes nothing when there is neither a stored record nor anything moved', () => {
        expect(DecidePauseWrite([], [])).toBeNull();
    });
});

describe('DecideSchedulesToResume', () => {
    it('restores exactly the recorded jobs', () => {
        const stored: PausedScheduleRecord[] = [{ ID: 'a', Kind: 'sync' }];
        expect(DecideSchedulesToResume(stored, [job('a', 'Paused'), job('b', 'Paused')])).toEqual(['a']);
    });

    it('never touches a job that was NOT recorded, however it looks now', () => {
        // 'b' is Paused and looks identical to 'a'. Only the record distinguishes them.
        const out = DecideSchedulesToResume([{ ID: 'a', Kind: 'sync' }], [job('a', 'Paused'), job('b', 'Paused')]);
        expect(out).not.toContain('b');
    });

    it('does not resurrect a recorded job that has since been deleted', () => {
        expect(DecideSchedulesToResume([{ ID: 'gone', Kind: 'sync' }], [job('a', 'Paused')])).toEqual([]);
    });

    it('does not rewrite a recorded job someone already set back to Active', () => {
        expect(DecideSchedulesToResume([{ ID: 'a', Kind: 'sync' }], [job('a', 'Active')])).toEqual([]);
    });

    it('returns nothing when the record is empty', () => {
        expect(DecideSchedulesToResume([], [job('a', 'Paused')])).toEqual([]);
    });
});

describe('Configuration round-trip', () => {
    it('preserves unrelated keys when writing', () => {
        const cfg = JSON.stringify({ discoveryMaxRecords: 50, catalogSource: 'perConnection' });
        const out = JSON.parse(WritePausedSchedules(cfg, [{ ID: 'a', Kind: 'sync' }]));
        expect(out.discoveryMaxRecords).toBe(50);
        expect(out.catalogSource).toBe('perConnection');
        expect(out[PAUSED_SCHEDULES_KEY]).toEqual([{ ID: 'a', Kind: 'sync' }]);
    });

    it('removes the key entirely when the record is cleared, rather than leaving []', () => {
        const cfg = WritePausedSchedules(JSON.stringify({ a: 1 }), [{ ID: 'x', Kind: 'sync' }]);
        const cleared = JSON.parse(WritePausedSchedules(cfg, []));
        expect(PAUSED_SCHEDULES_KEY in cleared).toBe(false);
        expect(cleared.a).toBe(1);
    });

    it('round-trips', () => {
        const rec: PausedScheduleRecord[] = [{ ID: 'a', Kind: 'sync' }, { ID: 'b', Kind: 'discovery' }];
        expect(ReadPausedSchedules(WritePausedSchedules(null, rec))).toEqual(rec);
    });

    it('reads nothing from null, junk, an array, or a non-array value', () => {
        expect(ReadPausedSchedules(null)).toEqual([]);
        expect(ReadPausedSchedules('not json {')).toEqual([]);
        expect(ReadPausedSchedules('[1,2,3]')).toEqual([]);
        expect(ReadPausedSchedules(JSON.stringify({ [PAUSED_SCHEDULES_KEY]: 'nope' }))).toEqual([]);
    });

    it('drops malformed entries instead of yielding an id-less record', () => {
        // An entry with no ID would produce a restore target of undefined.
        const cfg = JSON.stringify({ [PAUSED_SCHEDULES_KEY]: [{ Kind: 'sync' }, null, 7, { ID: '', Kind: 'sync' }, { ID: 'ok' }] });
        expect(ReadPausedSchedules(cfg)).toEqual([{ ID: 'ok', Kind: 'sync' }]);
    });

    it('replaces, rather than refuses, when Configuration is unparseable', () => {
        const out = JSON.parse(WritePausedSchedules('{broken', [{ ID: 'a', Kind: 'sync' }]));
        expect(out[PAUSED_SCHEDULES_KEY]).toEqual([{ ID: 'a', Kind: 'sync' }]);
    });
});

describe('DescribeCancelScope — reports what is TRUE, not what is reassuring', () => {
    it('says none when nothing is live', () => {
        expect(DescribeCancelScope({ liveRunPresent: false, durableRequestRecorded: false, runningInThisProcess: true }))
            .toBe('none');
    });

    it('prefers durable when the request was recorded', () => {
        expect(DescribeCancelScope({ liveRunPresent: true, durableRequestRecorded: true, runningInThisProcess: false }))
            .toBe('durable');
    });

    it('falls back to this-process when only the in-process registry knows', () => {
        expect(DescribeCancelScope({ liveRunPresent: true, durableRequestRecorded: false, runningInThisProcess: true }))
            .toBe('this-process');
    });

    it('admits unknown when a run is live and neither signal reached it', () => {
        // The tenant has no CancelRequestedAt column and the owner is another process.
        expect(DescribeCancelScope({ liveRunPresent: true, durableRequestRecorded: false, runningInThisProcess: false }))
            .toBe('unknown');
    });

    it('never promises a stop it cannot deliver', () => {
        expect(DescribeCancelOutcome('unknown')).not.toMatch(/will stop/i);
        expect(DescribeCancelOutcome('unknown')).toMatch(/no new sync will start/i);
        expect(DescribeCancelOutcome('durable')).toMatch(/will stop after the current batch/i);
        expect(DescribeCancelOutcome('none')).toBe('');
    });
});

describe('DescribePauseOutcome', () => {
    it('names both schedules when both moved', () => {
        const msg = DescribePauseOutcome([{ ID: 'a', Kind: 'sync' }, { ID: 'b', Kind: 'discovery' }], false);
        expect(msg).toMatch(/data sync and schema refresh/);
        expect(msg).toMatch(/schedules\./);
    });

    it('is singular for one', () => {
        expect(DescribePauseOutcome([{ ID: 'a', Kind: 'discovery' }], false)).toBe('Paused the schema refresh schedule.');
    });

    it('distinguishes "already paused" from "nothing to pause"', () => {
        expect(DescribePauseOutcome([], true)).toMatch(/already paused/i);
        expect(DescribePauseOutcome([], false)).toMatch(/No active schedules/i);
    });
});
