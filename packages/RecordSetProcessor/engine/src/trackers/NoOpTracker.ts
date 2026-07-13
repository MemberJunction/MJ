/**
 * @fileoverview A tracker that persists nothing — for fire-and-forget single-record work where a
 * full run record would be overkill.
 * @module @memberjunction/record-set-processor
 */

import {
    IProcessRunTracker,
    ProcessCursor,
    RunHandle,
} from '@memberjunction/record-set-processor-base';

/** An {@link IProcessRunTracker} that discards all run/detail tracking. */
export class NoOpTracker implements IProcessRunTracker {
    public async BeginRun(): Promise<RunHandle> {
        return {};
    }
    public async RecordResult(): Promise<void> {
        // intentionally empty
    }
    public async Checkpoint(): Promise<boolean> {
        return true;
    }
    public async CompleteRun(): Promise<void> {
        // intentionally empty
    }
    public async LoadResumeCursor(): Promise<ProcessCursor | undefined> {
        return undefined;
    }
}
