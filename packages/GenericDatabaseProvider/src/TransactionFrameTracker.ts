import type { PostCommitToken } from '@memberjunction/core';

/** How a settled outermost transaction ended. */
export type TransactionEpochOutcome = 'committed' | 'rolledBack';

/**
 * What to do with a post-commit task registered with a {@link PostCommitToken}.
 * - `run` — the token's transaction committed; run the task now.
 * - `queue` — the token's transaction is still open; queue at `Depth` (the deepest captured frame
 *   that is still open — a released savepoint's work belongs to its enclosing frame).
 * - `drop` — the work was rolled back, or the token cannot be matched to known state.
 */
export type PostCommitTokenResolution =
    | { Kind: 'run' }
    | { Kind: 'queue'; Depth: number }
    | { Kind: 'drop'; Reason: string };

/**
 * Gives every transaction frame on one provider an identity, so work captured inside a frame can be
 * matched to that frame's fate after the fact.
 *
 * - An **epoch** is one outermost transaction. Epoch and frame ids come from process-wide counters,
 *   so a token from a different provider instance never matches this one's state by accident.
 * - The **frame stack** mirrors the provider's transaction depth: index 0 is the outermost
 *   transaction, each later entry a savepoint.
 * - Savepoint frames rolled back in the open epoch are remembered until the epoch ends.
 * - The outcomes of the last {@link SettledEpochLimit} epochs are remembered; older ones are
 *   forgotten, and a token naming one is treated as unknown (dropped).
 *
 * The owner must call the mutators in step with its own depth changes. Not thread-safe beyond what
 * the owner's transaction lock provides; {@link Capture} and {@link Resolve} are synchronous.
 */
export class TransactionFrameTracker {
    /** How many settled epochs are remembered. */
    public static readonly SettledEpochLimit = 1000;

    private static _lastEpoch = 0;
    private static _lastFrameId = 0;

    private _openEpoch: number | null = null;
    private _frames: number[] = [];
    private readonly _rolledBackFrames = new Set<number>();
    private readonly _settledEpochs = new Map<number, TransactionEpochOutcome>();

    /** Number of open frames. */
    public get Depth(): number {
        return this._frames.length;
    }

    /** A frame was begun. The first frame opens a new epoch. */
    public PushFrame(): void {
        if (this._frames.length === 0) {
            // An epoch with no frames left is one whose begin failed; it never committed.
            this.EndEpoch('rolledBack');
            this._openEpoch = ++TransactionFrameTracker._lastEpoch;
        }
        this._frames.push(++TransactionFrameTracker._lastFrameId);
    }

    /** The innermost frame ended without undoing its work (savepoint released, or never created). */
    public ReleaseFrame(): void {
        this._frames.pop();
    }

    /** The innermost frame's work was undone (savepoint rolled back, or its frame dropped as doomed). */
    public RollBackFrame(): void {
        const id = this._frames.pop();
        if (id !== undefined) {
            this._rolledBackFrames.add(id);
        }
    }

    /** The outermost transaction settled. No-op when no epoch is open. */
    public EndEpoch(outcome: TransactionEpochOutcome): void {
        if (this._openEpoch === null) {
            return;
        }
        this._settledEpochs.set(this._openEpoch, outcome);
        this.evictOldEpochs();
        this._openEpoch = null;
        this._frames = [];
        this._rolledBackFrames.clear();
    }

    /** Snapshot of the open frames, or `undefined` when none is open. */
    public Capture(): PostCommitToken | undefined {
        if (this._openEpoch === null || this._frames.length === 0) {
            return undefined;
        }
        return { Epoch: this._openEpoch, FrameIds: [...this._frames] };
    }

    /**
     * Decide what a task registered with `token` should do now.
     * @param doomed Whether the owner's open transaction can no longer commit.
     */
    public Resolve(token: PostCommitToken, doomed: boolean): PostCommitTokenResolution {
        if (token.Epoch === this._openEpoch) {
            return this.resolveOpenEpoch(token, doomed);
        }
        const outcome = this._settledEpochs.get(token.Epoch);
        if (outcome === 'committed') {
            return { Kind: 'run' };
        }
        if (outcome === 'rolledBack') {
            return { Kind: 'drop', Reason: 'the transaction it was registered in rolled back' };
        }
        return {
            Kind: 'drop',
            Reason: `transaction ${token.Epoch} is unknown to this provider (another instance's, or too old to remember)`,
        };
    }

    private resolveOpenEpoch(token: PostCommitToken, doomed: boolean): PostCommitTokenResolution {
        if (doomed) {
            return { Kind: 'drop', Reason: 'the transaction it was registered in was abandoned' };
        }
        if (token.FrameIds.some((id) => this._rolledBackFrames.has(id))) {
            return { Kind: 'drop', Reason: 'the savepoint it was registered in rolled back' };
        }
        for (let i = token.FrameIds.length - 1; i >= 0; i--) {
            const index = this._frames.indexOf(token.FrameIds[i]);
            if (index >= 0) {
                return { Kind: 'queue', Depth: index + 1 };
            }
        }
        return { Kind: 'drop', Reason: 'none of the frames it was registered in is still open' };
    }

    private evictOldEpochs(): void {
        while (this._settledEpochs.size > TransactionFrameTracker.SettledEpochLimit) {
            const oldest = this._settledEpochs.keys().next();
            if (oldest.done) {
                return;
            }
            this._settledEpochs.delete(oldest.value);
        }
    }
}
