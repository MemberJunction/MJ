/**
 * U3 regression pin — the live sync-progress snapshot is a HIGH-WATER MARK.
 *
 * With syncConcurrency > 1, per-map progress events arrive out of order (map 3 can emit
 * after map 7). Raw assignment made EntityMapsCompleted / RecordsProcessed go BACKWARDS —
 * a progress bar that rewinds. RatchetProgressSnapshot only ever ratchets upward.
 */
import { describe, it, expect } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine';
import type { SyncProgress, SyncProgressSnapshot } from '../types';

function snapshot(): SyncProgressSnapshot {
    return {
        StartedAt: new Date(0),
        CurrentEntity: '',
        EntityMapsTotal: 0,
        EntityMapsCompleted: 0,
        RecordsProcessed: 0,
        RecordsCreated: 0,
        RecordsUpdated: 0,
        RecordsErrored: 0,
        TriggerType: 'Manual',
    };
}

function progress(mapIndex: number, records: number, total = 10): SyncProgress {
    return {
        EntityMapIndex: mapIndex,
        TotalEntityMaps: total,
        RecordsProcessedInCurrentMap: records,
        TotalRecordsInCurrentMap: records,
        PercentComplete: 0,
    };
}

describe('IntegrationEngine.RatchetProgressSnapshot (U3 — monotonic progress)', () => {
    it('advances on in-order events', () => {
        const entry = snapshot();
        IntegrationEngine.RatchetProgressSnapshot(entry, progress(3, 100));
        expect(entry.EntityMapsCompleted).toBe(3);
        expect(entry.RecordsProcessed).toBe(100);
        expect(entry.EntityMapsTotal).toBe(10);
    });

    it('NEVER goes backwards on an out-of-order event (the concurrency bug)', () => {
        const entry = snapshot();
        IntegrationEngine.RatchetProgressSnapshot(entry, progress(7, 500));
        IntegrationEngine.RatchetProgressSnapshot(entry, progress(3, 120)); // late event from an earlier map
        expect(entry.EntityMapsCompleted).toBe(7);
        expect(entry.RecordsProcessed).toBe(500);
    });

    it('totals are authoritative per event (assigned, not ratcheted)', () => {
        const entry = snapshot();
        IntegrationEngine.RatchetProgressSnapshot(entry, progress(1, 10, 12));
        IntegrationEngine.RatchetProgressSnapshot(entry, progress(2, 20, 11)); // e.g. a map was skipped
        expect(entry.EntityMapsTotal).toBe(11);
    });
});
