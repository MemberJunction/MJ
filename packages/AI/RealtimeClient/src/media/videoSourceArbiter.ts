/**
 * @fileoverview The VIDEO SOURCE ARBITER: the single writer of a session's inbound video.
 *
 * A realtime session can have many things worth showing the model at once: a shared screen, the camera,
 * a whiteboard, a remote browser. Today's video models accept ONE inbound stream. Before this existed,
 * every source wrote to that one stream directly: whichever happened to send last "won", and the model
 * was never told what it was looking at. The arbiter owns the decision:
 *
 * - **Sources register** (`RegisterSource`) with an id, a label and a kind, and push frames to the
 *   arbiter (`PushFrame`) rather than to the client.
 * - **The arbiter maps N live sources onto the model's `MaxInboundVideoStreams`.** With enough streams
 *   for every enabled source (a future multi-stream model) frames pass through untouched, each tagged
 *   with its source id. Otherwise it ranks the sources by a POLICY (data, overridable) and forwards only
 *   the top N.
 * - **The model is told when the choice changes** (`[You can now see: Camera]`), because a model
 *   that silently starts seeing something else will describe the old thing.
 * - **The user can switch a source off.** A disabled source is not a candidate, sends nothing, and the
 *   model is told it was turned off (`[You can no longer see: Camera (the user turned it off)]`).
 *
 * The notes speak to the model in the second person, as one set with the notes a meeting's bot sends
 * (`[You can now see: …]`, `[You can no longer see: …]`).
 * - **The rate comes only from the negotiated track.** Pacing is read from the sink
 *   (`InboundVideoRate`), never a constant here.
 *
 * It deliberately depends only on the narrow {@link IVideoFrameSink} interface (which
 * `BaseRealtimeClient` satisfies) and imports nothing from `generic/` or the drivers, so the media code
 * can be split into its own subpath without untangling it.
 *
 * The default policy and the rationale for its ordering are on {@link DEFAULT_VIDEO_SOURCE_POLICY}.
 *
 * @module @memberjunction/ai-realtime-client
 */

import type { RealtimeTrackDirection } from '@memberjunction/ai';
import { MinVideoFrameSpacingMs } from './videoPacing';

/**
 * The slice of a realtime client the arbiter writes to. `BaseRealtimeClient` satisfies it structurally,
 * and tests satisfy it with a plain object.
 */
export interface IVideoFrameSink {
    /**
     * How many concurrent inbound video streams the model accepts. `0` when none is live (no video track
     * negotiated), `1` for every model shipped so far.
     */
    readonly MaxInboundVideoStreams: number;

    /** The negotiated inbound video rate in frames per second, or `undefined` when none was negotiated. */
    readonly InboundVideoRate: number | undefined;

    /** Whether a track of the given modality and direction is established and live. */
    IsTrackEstablished(modality: string, direction: RealtimeTrackDirection): boolean;

    /**
     * Streams one frame to the model, tagged with the source that produced it. Optional because most
     * drivers have no video; a sink without it makes the arbiter inert.
     *
     * @returns `true` if the frame was sent.
     */
    SendVideoFrame?(base64Image: string, mimeType?: string, sourceId?: string): boolean;

    /** Injects a context note into the conversation without triggering a reply. */
    SendContextNote(text: string): void;
}

/**
 * What kind of source this is. Open vocabulary: `'camera'` and `'screen'` are CAPTURES (the user chose to
 * share them), `'surface'` is a channel surface (a whiteboard, a remote browser); anything else is treated
 * as a surface unless the policy says otherwise.
 */
export type VideoSourceKind = 'camera' | 'screen' | 'surface' | (string & {});

/** Source kinds the default ranking treats as captures: things a person started sharing on purpose. */
const CAPTURE_KINDS: ReadonlySet<string> = new Set(['camera', 'screen']);

/** Whether a source kind is a capture (as opposed to a channel surface). */
export function IsVideoCaptureKind(kind: VideoSourceKind | undefined): boolean {
    return kind !== undefined && CAPTURE_KINDS.has(kind);
}

/** What a source registers itself as. */
export interface VideoSourceDescriptor {
    /** Stable id of the source within the session. Registering an existing id updates it in place. */
    SourceID: string;
    /** Human-readable name, used in the notes sent to the model and in the UI's "agent can see" list. */
    Label: string;
    /** What kind of source this is. Defaults to `'surface'`. */
    Kind?: VideoSourceKind;
    /**
     * The channel this source belongs to, when it comes from one. The UI maps a source to the user's
     * persisted per-channel visual-perception choice by this key.
     */
    ChannelKey?: string;
    /**
     * Whether a newly registered source starts enabled. Default `true`. A source the agent may not see yet registers
     * disabled, so the model is never told it is looking at it. Ignored for an id that is already registered; use
     * {@link VideoSourceArbiter.SetSourceEnabled} for that.
     */
    Enabled?: boolean;
}

/** A source as the arbiter currently sees it. */
export interface VideoSourceState extends VideoSourceDescriptor {
    /** `false` when the user (or exposure policy) turned the source off: it is not a candidate and sends nothing. */
    Enabled: boolean;
    /** Whether the arbiter is currently forwarding this source's frames to the model. */
    Active: boolean;
    /** Frames forwarded to the model so far. */
    FramesSent: number;
    /** Epoch ms of the last forwarded frame; `undefined` before the first. */
    LastFrameAt?: number;
    /**
     * `true` while it is the user's pick ({@link VideoSourceArbiter.SelectSource}), which beats every other rule. Absent
     * otherwise, and while nothing is picked the policy decides.
     */
    Picked?: boolean;
}

/**
 * One rule of the source-selection policy. Rules apply in order and each contributes the sources it
 * prefers; the arbiter forwards the first `MaxInboundVideoStreams` of the combined ranking.
 *
 * - `'user-pick'`: the source the user explicitly chose ({@link VideoSourceArbiter.SelectSource}).
 * - `'recent-capture'`: captures (camera, screen), the most recently started first.
 * - `'focused'`: the source belonging to the surface the user is looking at
 *   ({@link VideoSourceArbiter.SetFocusedSource}).
 * - `'recent'`: any source at all, the most recently started first. The catch-all, so a session whose
 *   only source is a surface with no focus still shows it.
 */
export type VideoSourcePolicyRule = 'user-pick' | 'recent-capture' | 'focused' | 'recent';

/**
 * The default selection policy, as DATA so an agent or host can reorder or trim it.
 *
 * Order: an explicit user pick beats everything (the user is the authority on what the agent sees);
 * then the most recently started CAPTURE, because starting a camera or share is a deliberate "look at
 * this" and a surface is always there to come back to; then the focused surface; then simply the newest
 * source, so a lone unfocused surface is never invisible.
 *
 * "Most recently started" is applied to captures rather than to every source. Applied to everything it
 * would always produce a winner and the focused-surface rule could never be reached.
 */
export const DEFAULT_VIDEO_SOURCE_POLICY: readonly VideoSourcePolicyRule[] = Object.freeze([
    'user-pick',
    'recent-capture',
    'focused',
    'recent',
] as const);

/** Options for a {@link VideoSourceArbiter}. */
export interface VideoSourceArbiterOptions {
    /** The selection policy. Defaults to {@link DEFAULT_VIDEO_SOURCE_POLICY}. */
    Policy?: readonly VideoSourcePolicyRule[];
    /**
     * The note sent when the set of sources the model sees changes while sources are being arbitrated.
     * Receives the labels now in view. Return `null` to send nothing. Default:
     * `[You can now see: <label>]` (labels joined with ", ").
     */
    FormatSwitchNote?: (labels: readonly string[]) => string | null;
    /** The note sent when a source is turned off. Default: `[You can no longer see: <label> (the user turned it off)]`. */
    FormatDisabledNote?: (label: string) => string | null;
    /** The note sent when a source is turned back on. Default: `[You can now see: <label> (turned back on)]`. */
    FormatEnabledNote?: (label: string) => string | null;
    /** Reports a problem (a throwing sink). Defaults to `console.error`; the arbiter never throws into a caller's timer. */
    OnError?: (context: string, error: unknown) => void;
    /** Clock, injectable for tests. Defaults to `Date.now`. */
    Now?: () => number;
}

/** Internal record of a registered source. */
interface SourceRecord extends VideoSourceDescriptor {
    Enabled: boolean;
    /** Registration order: the arbiter's notion of "most recently started" (a counter, so it is deterministic). */
    Seq: number;
    FramesSent: number;
    LastFrameAt?: number;
    LastSentAt: number;
}

/**
 * How many streams a sink can take right now. A sink that predates `MaxInboundVideoStreams` (a custom
 * client, a test double) is read the way every model was until the field existed: one stream while an
 * inbound video track is live, none otherwise.
 */
function streamCapacity(sink: IVideoFrameSink | null): number {
    if (!sink) {
        return 0;
    }
    if (typeof sink.MaxInboundVideoStreams === 'number') {
        return sink.MaxInboundVideoStreams;
    }
    return sink.IsTrackEstablished('video', 'inbound') ? 1 : 0;
}

/** A sink or a way to find the current one (the client changes across a reconnect). */
export type VideoFrameSinkSource = IVideoFrameSink | (() => IVideoFrameSink | null | undefined) | null | undefined;

/**
 * The per-session arbiter. Obtain the one for a client with {@link VideoSourceArbiter.ForSink} so every
 * writer shares it; constructing a second one for the same client would make two writers again.
 */
export class VideoSourceArbiter {
    private static readonly bySink = new WeakMap<object, VideoSourceArbiter>();

    /**
     * The arbiter for a sink, created on first use. One arbiter per sink is the whole point (a single
     * writer), so every bridge and channel that gets its arbiter this way shares it.
     *
     * @param sink The client (anything satisfying {@link IVideoFrameSink}).
     * @param options Options applied only when the arbiter is created.
     */
    public static ForSink(sink: IVideoFrameSink, options?: VideoSourceArbiterOptions): VideoSourceArbiter {
        let arbiter = VideoSourceArbiter.bySink.get(sink);
        if (!arbiter) {
            arbiter = new VideoSourceArbiter(sink, options);
            VideoSourceArbiter.bySink.set(sink, arbiter);
        }
        return arbiter;
    }

    private readonly sources = new Map<string, SourceRecord>();
    private readonly policy: readonly VideoSourcePolicyRule[];
    private readonly handlers = new Set<() => void>();
    private nextSeq = 1;
    private userPick: string | null = null;
    private focused: string | null = null;
    private focusedChannel: string | null = null;
    /** The ids forwarded as of the last reconcile — the baseline a change is detected against. */
    private lastActive: readonly string[] = [];
    /** Whether the previous reconcile had more enabled sources than streams (arbitration in effect). */
    private lastArbitrating = false;

    constructor(
        private readonly sinkSource: VideoFrameSinkSource,
        private readonly options: VideoSourceArbiterOptions = {}
    ) {
        this.policy = options.Policy ?? DEFAULT_VIDEO_SOURCE_POLICY;
    }

    private get sink(): IVideoFrameSink | null {
        const resolved = typeof this.sinkSource === 'function' ? this.sinkSource() : this.sinkSource;
        return resolved ?? null;
    }

    /**
     * Registers a source, or updates its label/kind if the id is already registered (its recency, enabled
     * state and counters are kept). A newly registered source counts as the most recently STARTED.
     */
    public RegisterSource(descriptor: VideoSourceDescriptor): void {
        if (!descriptor.SourceID) {
            throw new Error('VideoSourceArbiter.RegisterSource requires a SourceID.');
        }
        const existing = this.sources.get(descriptor.SourceID);
        if (existing) {
            existing.Label = descriptor.Label;
            existing.Kind = descriptor.Kind ?? existing.Kind;
            existing.ChannelKey = descriptor.ChannelKey ?? existing.ChannelKey;
        } else {
            this.sources.set(descriptor.SourceID, {
                ...descriptor,
                Kind: descriptor.Kind ?? 'surface',
                Enabled: descriptor.Enabled ?? true,
                Seq: this.nextSeq++,
                FramesSent: 0,
                LastSentAt: 0,
            });
        }
        this.reconcile();
        this.emitChange();
    }

    /** Removes a source. Its explicit pick or focus, if it held one, is cleared. */
    public UnregisterSource(sourceId: string): void {
        if (!this.sources.delete(sourceId)) {
            return;
        }
        if (this.userPick === sourceId) {
            this.userPick = null;
        }
        if (this.focused === sourceId) {
            this.focused = null;
        }
        this.reconcile();
        this.emitChange();
    }

    /** Whether a source id is registered. */
    public HasSource(sourceId: string): boolean {
        return this.sources.has(sourceId);
    }

    /**
     * The user explicitly picks the source the agent sees (`null` clears the pick). A pick beats every
     * other rule. Returns `false` for an unknown or disabled source (nothing changes).
     */
    public SelectSource(sourceId: string | null): boolean {
        if (sourceId !== null) {
            const source = this.sources.get(sourceId);
            if (!source || !source.Enabled) {
                return false;
            }
        }
        this.userPick = sourceId;
        this.reconcile();
        this.emitChange();
        return true;
    }

    /**
     * Marks the CHANNEL whose surface the user is looking at (`null` clears it): every source registered for that
     * channel counts as focused, including one that registers after this call (a surface the user is already on
     * before its first frame). Used by the `'focused'` rule alongside {@link SetFocusedSource}.
     */
    public SetFocusedChannel(channelKey: string | null): void {
        if (this.focusedChannel === channelKey) {
            return;
        }
        this.focusedChannel = channelKey;
        this.reconcile();
        this.emitChange();
    }

    /** Marks the source whose surface the user is looking at (`null` clears it). Used by the `'focused'` rule. */
    public SetFocusedSource(sourceId: string | null): void {
        this.focused = sourceId !== null && this.sources.has(sourceId) ? sourceId : null;
        this.reconcile();
        this.emitChange();
    }

    /**
     * Turns a source on or off. A disabled source is not a candidate and forwards nothing.
     *
     * @param sourceId The source.
     * @param enabled The new state.
     * @param notify Whether to tell the model. Default `true`. A caller that sends its own note about the
     *   same change (a channel lowering its exposure) passes `false` so the model is told once.
     * @returns `false` for an unknown source; `true` otherwise (including "already in that state").
     */
    public SetSourceEnabled(sourceId: string, enabled: boolean, notify = true): boolean {
        const source = this.sources.get(sourceId);
        if (!source) {
            return false;
        }
        if (source.Enabled === enabled) {
            return true;
        }
        source.Enabled = enabled;
        if (!enabled && this.userPick === sourceId) {
            this.userPick = null;
        }
        // Reconcile FIRST and quietly: the toggle has its own note, so a switch note on top of it
        // would tell the model the same thing twice.
        this.reconcile(true);
        if (notify) {
            this.sendNote(enabled ? this.formatEnabledNote(source.Label) : this.formatDisabledNote(source.Label));
        }
        this.emitChange();
        return true;
    }

    /** A snapshot of every registered source and whether it is being forwarded, in registration order. */
    public GetSources(): VideoSourceState[] {
        const active = new Set(this.computeActive());
        return [...this.sources.values()]
            .sort((a, b) => a.Seq - b.Seq)
            .map((s) => ({
                SourceID: s.SourceID,
                Label: s.Label,
                Kind: s.Kind,
                ChannelKey: s.ChannelKey,
                Enabled: s.Enabled,
                Active: active.has(s.SourceID),
                FramesSent: s.FramesSent,
                LastFrameAt: s.LastFrameAt,
                ...(this.userPick === s.SourceID ? { Picked: true } : {}),
            }));
    }

    /** The ids the arbiter would forward right now, best first. */
    public GetActiveSourceIDs(): string[] {
        return this.computeActive();
    }

    /**
     * Subscribes to structural changes (a source registered, removed, enabled, disabled, picked, focused,
     * or the forwarded set changing). Not called per frame.
     *
     * @returns An unsubscribe function.
     */
    public OnChange(handler: () => void): () => void {
        this.handlers.add(handler);
        return () => {
            this.handlers.delete(handler);
        };
    }

    /**
     * A source offers a frame. It is forwarded to the model only if the source is enabled, among the
     * sources the model should see, and not inside the negotiated pacing interval.
     *
     * @param sourceId The producing source (it must be registered).
     * @param base64Image The frame, base64-encoded.
     * @param mimeType Image MIME type. Defaults to `'image/jpeg'`.
     * @returns `true` if the frame was sent to the model.
     */
    public PushFrame(sourceId: string, base64Image: string, mimeType = 'image/jpeg'): boolean {
        const source = this.sources.get(sourceId);
        const sink = this.sink;
        if (!source || !source.Enabled || !sink || typeof sink.SendVideoFrame !== 'function') {
            return false;
        }
        if (!sink.IsTrackEstablished('video', 'inbound')) {
            return false;
        }
        // The stream count can change once the track is negotiated, so the active set is re-derived
        // here rather than trusted from the last registration.
        this.reconcile();
        if (!this.computeActive().includes(sourceId)) {
            return false;
        }
        const now = this.now();
        if (source.LastSentAt > 0 && now - source.LastSentAt < MinVideoFrameSpacingMs(sink.InboundVideoRate)) {
            return false;
        }
        const sent = this.send(sink, base64Image, mimeType, sourceId);
        if (sent) {
            source.LastSentAt = now;
            source.LastFrameAt = now;
            source.FramesSent++;
        }
        return sent;
    }

    /** Drops every source and subscription. The arbiter stays usable (it simply has no sources). */
    public Dispose(): void {
        this.sources.clear();
        this.userPick = null;
        this.focused = null;
        this.focusedChannel = null;
        this.lastActive = [];
        this.lastArbitrating = false;
        this.handlers.clear();
    }

    // ── selection ───────────────────────────────────────────────────────────

    /** The enabled sources, ranked by policy, best first. */
    private rank(): SourceRecord[] {
        const enabled = [...this.sources.values()].filter((s) => s.Enabled);
        const newestFirst = (list: SourceRecord[]): SourceRecord[] => [...list].sort((a, b) => b.Seq - a.Seq);
        const ranked: SourceRecord[] = [];
        const add = (list: SourceRecord[]): void => {
            for (const s of list) {
                if (!ranked.includes(s)) {
                    ranked.push(s);
                }
            }
        };
        for (const rule of this.policy) {
            switch (rule) {
                case 'user-pick':
                    add(enabled.filter((s) => s.SourceID === this.userPick));
                    break;
                case 'recent-capture':
                    add(newestFirst(enabled.filter((s) => IsVideoCaptureKind(s.Kind))));
                    break;
                case 'focused':
                    add(enabled.filter((s) => s.SourceID === this.focused || (this.focusedChannel !== null && s.ChannelKey === this.focusedChannel)));
                    break;
                case 'recent':
                    add(newestFirst(enabled));
                    break;
            }
        }
        // A policy without the catch-all must still be total over the enabled sources' ORDER, but it is
        // allowed to leave some out: that is what trimming the policy means.
        return ranked;
    }

    /** The ids to forward: the top N of the ranking, N being the model's inbound video stream count. */
    private computeActive(): string[] {
        const streams = streamCapacity(this.sink);
        if (streams <= 0) {
            return [];
        }
        return this.rank().slice(0, streams).map((s) => s.SourceID);
    }

    /**
     * Re-derives the forwarded set and, when it changed while sources are being arbitrated, tells the model.
     *
     * @param quiet Update the baseline without sending a switch note (the caller sends its own).
     */
    private reconcile(quiet = false): void {
        const sink = this.sink;
        const streams = streamCapacity(sink);
        const enabledCount = [...this.sources.values()].filter((s) => s.Enabled).length;
        const arbitrating = streams > 0 && enabledCount > streams;
        const active = this.computeActive();
        const changed = active.length !== this.lastActive.length || active.some((id, i) => id !== this.lastActive[i]);
        const wasArbitrating = this.lastArbitrating;
        this.lastActive = active;
        this.lastArbitrating = arbitrating;
        if (!changed || quiet || !sink) {
            return;
        }
        // Notes only matter when the model could be confused about what it sees: more sources than
        // streams now, or just before. A lone source appearing or leaving is not a "switch".
        if (!arbitrating && !wasArbitrating) {
            return;
        }
        if (active.length === 0) {
            // Nothing left to switch TO. A source the user turned off has its own note, and a session whose
            // last source stopped has nothing the model could be confused about.
            return;
        }
        const labels = active.map((id) => this.sources.get(id)?.Label ?? id);
        this.sendNote(this.options.FormatSwitchNote ? this.options.FormatSwitchNote(labels) : `[You can now see: ${labels.join(', ')}]`);
    }

    // ── plumbing ────────────────────────────────────────────────────────────

    private formatDisabledNote(label: string): string | null {
        return this.options.FormatDisabledNote ? this.options.FormatDisabledNote(label) : `[You can no longer see: ${label} (the user turned it off)]`;
    }

    private formatEnabledNote(label: string): string | null {
        return this.options.FormatEnabledNote ? this.options.FormatEnabledNote(label) : `[You can now see: ${label} (turned back on)]`;
    }

    private now(): number {
        return this.options.Now ? this.options.Now() : Date.now();
    }

    private send(sink: IVideoFrameSink, base64Image: string, mimeType: string, sourceId: string): boolean {
        try {
            return Boolean(sink.SendVideoFrame?.(base64Image, mimeType, sourceId));
        } catch (error) {
            this.reportError('sending a video frame', error);
            return false;
        }
    }

    private sendNote(note: string | null): void {
        const sink = this.sink;
        if (!note || !sink) {
            return;
        }
        try {
            sink.SendContextNote(note);
        } catch (error) {
            this.reportError('sending a source note', error);
        }
    }

    private emitChange(): void {
        for (const handler of [...this.handlers]) {
            try {
                handler();
            } catch (error) {
                this.reportError('notifying a change handler', error);
            }
        }
    }

    private reportError(context: string, error: unknown): void {
        if (this.options.OnError) {
            this.options.OnError(context, error);
            return;
        }
        console.error(`[VideoSourceArbiter] Error ${context}:`, error);
    }
}
