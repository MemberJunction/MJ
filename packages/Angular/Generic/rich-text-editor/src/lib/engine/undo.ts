import { SerializedSelection } from './path';

/**
 * Undo history as a stack of pure snapshots.
 *
 * Each entry is the document's raw HTML plus a structurally-addressed selection — nothing
 * that refers to a live node. Restoring is `innerHTML = snapshot` followed by rebuilding the
 * range from index paths. That is the whole design: no bookmarks inserted into the
 * document, no diffing, no special cases. It costs memory proportional to document size
 * per entry, which `UndoLimit` and `UndoSizeThreshold` bound.
 *
 * ## The one piece of state that matters
 *
 * `inUndoState` is true exactly when the live document equals the snapshot at `index`.
 * Commands call {@link Checkpoint} **before** mutating and {@link MarkChanged} **after**;
 * native typing calls only {@link MarkChanged} (from the `input` event). While
 * `inUndoState` holds, another checkpoint just refreshes the stored selection instead of
 * pushing a duplicate snapshot — so a run of toolbar clicks with no typing between them
 * still produces one undo step per click, and never two entries with identical HTML.
 */

/** One entry in the history. */
export interface UndoSnapshot {
    Html: string;
    Selection: SerializedSelection | null;
}

/** Bounds for the stack. */
export interface UndoStackOptions {
    /** Maximum snapshots retained; older ones fall off. Non-positive means unbounded. */
    Limit: number;
    /** Skip recording when the HTML is longer than this. Non-positive disables the check. */
    SizeThreshold: number;
}

/** Default bounds: fifty steps, no size threshold. */
export const DEFAULT_UNDO_OPTIONS: UndoStackOptions = { Limit: 50, SizeThreshold: -1 };

export class UndoStack {
    private stack: UndoSnapshot[] = [];
    private index = -1;
    private inUndoState = false;
    private readonly options: UndoStackOptions;

    constructor(options: Partial<UndoStackOptions> = {}) {
        this.options = { ...DEFAULT_UNDO_OPTIONS, ...options };
    }

    /** True when {@link Undo} would return a snapshot. */
    public get CanUndo(): boolean {
        return this.inUndoState ? this.index > 0 : this.index >= 0;
    }

    /** True when {@link Redo} would return a snapshot. */
    public get CanRedo(): boolean {
        return this.inUndoState && this.index + 1 < this.stack.length;
    }

    /** Number of snapshots currently held. Exposed for tests and diagnostics. */
    public get Length(): number {
        return this.stack.length;
    }

    /**
     * Record the document as it is *right now*, before a command mutates it.
     *
     * If the document is already known to equal the top snapshot, only the selection is
     * refreshed. Otherwise any redo history is discarded — the timeline has forked — and the
     * snapshot is pushed.
     */
    public Checkpoint(snapshot: UndoSnapshot): void {
        if (this.exceedsSizeThreshold(snapshot)) {
            return;
        }
        if (this.inUndoState && this.index >= 0) {
            this.stack[this.index] = snapshot;
            return;
        }
        this.push(snapshot);
        this.inUndoState = true;
    }

    /** The document has diverged from the top snapshot. */
    public MarkChanged(): void {
        this.inUndoState = false;
    }

    /**
     * Step back. `current` is the live document, which is recorded first when it has
     * unsaved changes so that a subsequent redo can return to it. Returns the snapshot to
     * restore, or null when there is nothing earlier.
     */
    public Undo(current: UndoSnapshot): UndoSnapshot | null {
        if (!this.inUndoState) {
            this.push(current);
            this.inUndoState = true;
        }
        if (this.index <= 0) {
            return null;
        }
        this.index -= 1;
        return this.stack[this.index];
    }

    /** Step forward. Only meaningful while the document still equals a snapshot. */
    public Redo(): UndoSnapshot | null {
        if (!this.CanRedo) {
            return null;
        }
        this.index += 1;
        return this.stack[this.index];
    }

    /** Forget everything. Called when new content is loaded. */
    public Clear(): void {
        this.stack = [];
        this.index = -1;
        this.inUndoState = false;
    }

    /** Discard redo history, append, and enforce the limit. */
    private push(snapshot: UndoSnapshot): void {
        this.stack.length = this.index + 1;
        this.stack.push(snapshot);
        this.index += 1;
        const limit = this.options.Limit;
        if (limit > 0 && this.stack.length > limit) {
            const excess = this.stack.length - limit;
            this.stack.splice(0, excess);
            this.index -= excess;
        }
    }

    private exceedsSizeThreshold(snapshot: UndoSnapshot): boolean {
        const threshold = this.options.SizeThreshold;
        return threshold > 0 && snapshot.Html.length > threshold;
    }
}
