/**
 * TransactionFrameTracker — which transaction a captured token belongs to, and what its fate was.
 *
 * These are the resolution rules on their own, without a provider: the provider tests cover how
 * `RunAfterCommit` acts on them.
 */
import { describe, it, expect } from 'vitest';
import { TransactionFrameTracker } from '../TransactionFrameTracker';

describe('TransactionFrameTracker', () => {
    describe('Capture', () => {
        it('names the open frames, outermost first', () => {
            const t = new TransactionFrameTracker();
            t.PushFrame();
            const outer = t.Capture();
            t.PushFrame();
            const inner = t.Capture();

            expect(outer.FrameIds).toHaveLength(1);
            expect(inner.Epoch).toBe(outer.Epoch);
            expect(inner.FrameIds.slice(0, 1)).toEqual(outer.FrameIds);
        });

        it('reports "no transaction was open" as a null epoch, not as nothing', () => {
            // The difference matters on the late-registration path: a null epoch means the work is
            // already durable, where an absent token means "attach me to whatever is open".
            const t = new TransactionFrameTracker();
            expect(t.Capture()).toEqual({ Epoch: null, FrameIds: [] });
            expect(t.Resolve(t.Capture(), false)).toEqual({ Kind: 'run' });
        });
    });

    describe('Resolve', () => {
        it('queues at the deepest captured frame still open', () => {
            const t = new TransactionFrameTracker();
            t.PushFrame();
            t.PushFrame();
            const token = t.Capture();

            expect(t.Resolve(token, false)).toEqual({ Kind: 'queue', Depth: 2 });
            t.ReleaseFrame(); // savepoint released — its work belongs to the enclosing frame
            expect(t.Resolve(token, false)).toEqual({ Kind: 'queue', Depth: 1 });
        });

        it('runs a token whose transaction committed', () => {
            const t = new TransactionFrameTracker();
            t.PushFrame();
            const token = t.Capture();
            t.ReleaseFrame();
            t.EndEpoch('committed');

            expect(t.Resolve(token, false).Kind).toBe('run');
        });

        it('drops a token whose transaction rolled back', () => {
            const t = new TransactionFrameTracker();
            t.PushFrame();
            const token = t.Capture();
            t.RollBackFrame();
            t.EndEpoch('rolledBack');

            expect(t.Resolve(token, false).Kind).toBe('drop');
        });

        it('drops a token from a rolled-back savepoint AFTER the outer transaction commits', () => {
            // The savepoint's fate must outlive the epoch: registration commonly lands after both.
            const t = new TransactionFrameTracker();
            t.PushFrame(); // outer transaction
            t.PushFrame(); // savepoint
            const token = t.Capture();

            t.RollBackFrame(); // savepoint rolled back — its work is gone
            t.ReleaseFrame();
            t.EndEpoch('committed'); // outer transaction commits

            expect(t.Resolve(token, false).Kind).toBe('drop');
        });

        it('runs a token from a RELEASED savepoint after the outer transaction commits', () => {
            // The control for the case above — otherwise a blanket "drop" would pass it too.
            const t = new TransactionFrameTracker();
            t.PushFrame();
            t.PushFrame();
            const token = t.Capture();

            t.ReleaseFrame();
            t.ReleaseFrame();
            t.EndEpoch('committed');

            expect(t.Resolve(token, false).Kind).toBe('run');
        });

        it('keeps each epoch\'s rolled-back frames separate', () => {
            const t = new TransactionFrameTracker();
            t.PushFrame();
            t.PushFrame();
            const rolledBackInFirst = t.Capture();
            t.RollBackFrame();
            t.ReleaseFrame();
            t.EndEpoch('committed');

            t.PushFrame();
            t.PushFrame();
            const releasedInSecond = t.Capture();
            t.ReleaseFrame();
            t.ReleaseFrame();
            t.EndEpoch('committed');

            expect(t.Resolve(rolledBackInFirst, false).Kind).toBe('drop');
            expect(t.Resolve(releasedInSecond, false).Kind).toBe('run');
        });

        it('drops while the transaction is doomed', () => {
            const t = new TransactionFrameTracker();
            t.PushFrame();
            const token = t.Capture();

            expect(t.Resolve(token, true).Kind).toBe('drop');
        });

        it('marks an unknown or evicted transaction as Unknown, so the caller can log it loudly', () => {
            const t = new TransactionFrameTracker();
            const foreign = { Epoch: -1, FrameIds: [-1] };
            const resolution = t.Resolve(foreign, false);

            expect(resolution.Kind).toBe('drop');
            expect(resolution.Kind === 'drop' && resolution.Unknown).toBe(true);
        });

        it('forgets epochs past the limit, and says so through Unknown', () => {
            const t = new TransactionFrameTracker();
            t.PushFrame();
            const oldest = t.Capture();
            t.ReleaseFrame();
            t.EndEpoch('committed');

            for (let i = 0; i < TransactionFrameTracker.SettledEpochLimit; i++) {
                t.PushFrame();
                t.ReleaseFrame();
                t.EndEpoch('committed');
            }

            const resolution = t.Resolve(oldest, false);
            expect(resolution.Kind).toBe('drop');
            expect(resolution.Kind === 'drop' && resolution.Unknown).toBe(true);
        });
    });
});
