/**
 * @fileoverview The **perception coalescer** — turns a burst of channel state changes into ONE
 * structured note carrying a delta.
 *
 * A user dragging a shape on a whiteboard, or typing in a form, changes state dozens of times a
 * second. The model needs to know *where things ended up*, not to be narrated every intermediate
 * step: each note is context it must read, tokens it is billed for, and — worst — a prompt to
 * respond. So changes are debounced: the first change arms a timer, further changes inside the
 * window only extend the count, and when the window closes exactly one note goes out describing
 * the difference between what the model was last told and the state now.
 *
 * Deliberately a small standalone class with injected clock/timers/state access, so the debounce
 * and delta behavior are unit-testable with fake timers and no channel, session or DOM.
 *
 * @module @memberjunction/realtime-runtime
 */

import type { JSONObject } from '@memberjunction/ai';
import { ComputeStateDelta, FormatChannelNote, ListChangedPaths } from './channel-state-delta';

/** How the coalescer reaches the channel it speaks for. */
export interface ChannelPerceptionHost {
    /** The channel's key, for the note prefix. */
    readonly ChannelKey: string;
    /** The instance id, for the note prefix. */
    readonly InstanceId: string;
    /** Reads the channel's current state snapshot (the nouns). */
    GetState(): JSONObject;
    /** Delivers a finished note to the model. */
    SendNote(text: string): void;
    /** Reports a problem reading state (logged by the caller); the coalescer never throws into a timer. */
    OnError(error: unknown): void;
}

/** Tuning for a {@link ChannelPerceptionCoalescer}. */
export interface ChannelPerceptionOptions {
    /** How long a burst may keep extending before its note is sent (default 750ms — matches the whiteboard's surface coalescing). */
    DebounceMs: number;
    /** The largest note body (JSON chars) sent in full; larger ones degrade to a list of changed paths (default 4000). */
    MaxNoteChars: number;
}

/** The defaults. */
export const DEFAULT_CHANNEL_PERCEPTION_OPTIONS: ChannelPerceptionOptions = {
    DebounceMs: 750,
    MaxNoteChars: 4000,
};

/**
 * Coalesces state changes into debounced delta notes. One instance per channel instance.
 */
export class ChannelPerceptionCoalescer {
    private timer: ReturnType<typeof setTimeout> | null = null;
    /** What the model was last told, or `null` before the first note (the first note is a snapshot). */
    private baseline: JSONObject | null = null;
    private pendingChanges = 0;
    private pendingChangeId = 0;

    constructor(
        private readonly host: ChannelPerceptionHost,
        private readonly options: ChannelPerceptionOptions = DEFAULT_CHANNEL_PERCEPTION_OPTIONS,
    ) {}

    /**
     * Records that the state changed. Arms the debounce timer if it is not already running; the
     * timer is NOT re-armed by further changes, so a continuous stream of edits still produces a
     * note every {@link ChannelPerceptionOptions.DebounceMs} rather than starving until it stops.
     *
     * @param changeId The id the change was assigned; the note carries the latest one.
     */
    public Record(changeId: number): void {
        this.pendingChanges++;
        this.pendingChangeId = Math.max(this.pendingChangeId, changeId);
        if (this.timer === null) {
            this.timer = setTimeout(() => this.Flush(), this.options.DebounceMs);
        }
    }

    /**
     * Sets what the model is known to have been told, without sending anything — used right after a
     * snapshot note went out by another route (e.g. when a channel opens), so the next change is
     * described as a delta against it.
     */
    public SetBaseline(state: JSONObject): void {
        this.baseline = state;
    }

    /** Sends the pending note now, if anything is pending. Safe to call at any time. */
    public Flush(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.pendingChanges === 0) {
            return;
        }
        const changes = this.pendingChanges;
        const changeId = this.pendingChangeId;
        this.pendingChanges = 0;
        try {
            this.sendNote(this.host.GetState(), changes, changeId);
        } catch (error) {
            this.host.OnError(error);
        }
    }

    /** Cancels any pending note. Call at teardown. */
    public Dispose(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.pendingChanges = 0;
    }

    /** Builds and sends the note for the current burst: a snapshot the first time, a delta after. */
    private sendNote(state: JSONObject, changes: number, changeId: number): void {
        const previous = this.baseline;
        this.baseline = state;
        if (previous === null) {
            this.deliver({ changeId, changes, snapshot: state }, () => ({ changeId, changes, truncated: true, keys: Object.keys(state) }));
            return;
        }
        const delta = ComputeStateDelta(previous, state);
        if (delta === null) {
            return; // the burst netted out to no change — nothing to tell the model
        }
        this.deliver(
            { changeId, changes, delta: { changed: delta.Changed, removed: delta.Removed } },
            () => ({ changeId, changes, truncated: true, changedPaths: ListChangedPaths(delta) }),
        );
    }

    /** Sends `full` unless it is too large, in which case the compact fallback goes instead. */
    private deliver(full: JSONObject, compact: () => JSONObject): void {
        const body = JSON.stringify(full).length <= this.options.MaxNoteChars ? full : compact();
        this.host.SendNote(FormatChannelNote(this.host.ChannelKey, this.host.InstanceId, 'state_changed', body));
    }
}
