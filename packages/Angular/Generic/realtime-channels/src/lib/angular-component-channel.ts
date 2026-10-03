/**
 * @fileoverview {@link AngularComponentChannel}: turns an EXISTING Angular component into a realtime channel surface
 * without rewriting it.
 *
 * A channel is what an agent and a user both operate during a call: the agent acts through verbs, perceives through
 * state notes (and, if allowed, pictures), and the user acts directly on the surface. Writing one from scratch means
 * writing the whole contract (descriptor, perception, verbs, binding the surface, completion). This base class owns the
 * mechanics so a channel over a component you already have is a descriptor plus a few binding functions:
 *
 * ```ts
 * @RegisterClass(BaseRealtimeChannelClient, 'SudokuChannel')
 * export class SudokuChannel extends AngularComponentChannel<SudokuComponent> {
 *   protected readonly ComponentClass = SudokuComponent;
 *   protected readonly Descriptor: RealtimeChannelDescriptor = { Key: 'Sudoku', ... };
 *   protected ReadSurfaceState(c: SudokuComponent): JSONObject { return { board: c.Board, moves: c.MoveCount }; }
 *   protected ApplySurfaceVerb(c: SudokuComponent, verb: string, args: JSONObject): RealtimeChannelVerbResult { ... }
 *   protected SurfaceEvents(c: SudokuComponent): Observable<ChannelSurfaceEvent> { return c.CellChanged.pipe(map(...)); }
 * }
 * export function LoadSudokuChannel(): void {}
 * ```
 *
 * ## What the adapter does for you
 *
 * - **Binding.** The overlay creates the component and hands it to {@link BindSurface}; the adapter subscribes to
 *   {@link SurfaceEvents}, applies anything that arrived early, and lets go cleanly on {@link UnbindSurface} (a panel that
 *   collapses and expands creates a NEW component instance, so durable state belongs to the channel, see below).
 * - **Perception.** Every event the component emits, and every verb the agent runs, is recorded as a change: observers
 *   see a typed event, and the model gets ONE coalesced structured note carrying a delta of {@link ReadSurfaceState}
 *   (see `RecordChange` in the base class). Exposure policy gates it like any channel.
 * - **Verbs.** Parameters are validated against the descriptor's schema before your code runs; a verb the agent may not
 *   have (exposure) is refused by the dispatcher; the outcome is a structured result the model can recover from.
 * - **Completion.** An optional {@link SurfaceCompletion} stream becomes `Complete(output)`.
 * - **Pictures.** If you can name the component's root element ({@link SurfaceElement}) and the host registered a
 *   rasterizer (`EnableChannelFrameCapture`), the channel shows the model what the component looks like.
 * - **Persistence.** The last state is saved as the channel's state of record and handed back to
 *   {@link OnSurfaceBound} when the surface is created again (collapse/expand, or a resumed session).
 *
 * ## When there is no surface
 *
 * A verb can arrive while no component is bound (the panel was just opened and the overlay is still creating the
 * component). The adapter does NOT run the verb against a hidden second instance, and it does NOT acknowledge it and apply
 * it later: the agent needs the real outcome (a move can be refused), and a second instance would hold state the user is
 * not looking at. Instead the call WAITS, bounded ({@link SurfaceBindTimeoutMs}, 5 s), for the surface, runs once it
 * binds (calls are serialized, so order is preserved), and fails with `'surface_unavailable'` and a message the agent can
 * act on ("ask the user to open it") if it never binds. Seed inputs of `open` are different: there is nothing to report back
 * but success, so they are applied when the surface binds. (A channel with no surface at all, a pure wire, does not need this
 * class.)
 *
 * @module @memberjunction/ng-realtime-channels
 */

import type { Type } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import type { JSONObject } from '@memberjunction/ai';
import { ValidateJsonAgainstSchemaSubset, type RealtimeChannelActor, type RealtimeChannelDescriptor } from '@memberjunction/ai-core-plus';
import { LogError } from '@memberjunction/core';
import { IsPlainObject } from '@memberjunction/global';
import { BaseRealtimeChannelClient, type RealtimeChannelVerbResult } from '@memberjunction/realtime-runtime';
import { ChannelFrameCapture } from './channel-frame-capture';

/**
 * Something the wrapped component did that the channel should know about: a user's move, a selection, a state
 * change worth telling the model about. Return these from {@link AngularComponentChannel.SurfaceEvents}.
 */
export interface ChannelSurfaceEvent {
    /** The event's name; declare it in the descriptor's `Events` so the agent knows it exists. */
    Name: string;
    /** The event's payload (JSON). */
    Payload?: JSONObject;
    /**
     * Who caused it. Default `'user'`, except that an event emitted while the adapter is running an agent's verb is
     * attributed to the agent (the component echoes the agent's own move through the same outputs the user's use).
     */
    Author?: RealtimeChannelActor | 'system';
    /** Set `false` for an event observers should see but the model should not be told about. Default `true`. */
    Perceive?: boolean;
}

/** How long a verb waits for the surface to bind before failing, in ms. */
const SURFACE_BIND_TIMEOUT_MS = 5000;

/** A failure result the dispatcher turns into a message the model can act on. */
function failure(code: string, error: string, details?: string[]): RealtimeChannelVerbResult {
    return details ? { Success: false, ErrorCode: code, Error: error, Details: details } : { Success: false, ErrorCode: code, Error: error };
}

/**
 * Base class for a realtime channel whose surface is an existing Angular component. See the file comment for the model.
 *
 * @typeParam TComponent The component class the channel shows and operates.
 */
export abstract class AngularComponentChannel<TComponent extends object> extends BaseRealtimeChannelClient<TComponent> {
    // ── What a subclass declares ───────────────────────────────────────────────

    /** The existing component to show as the channel's surface. The overlay creates it; the adapter binds to it. */
    protected abstract readonly ComponentClass: Type<TComponent>;

    /**
     * The channel's self-description: what it is, what it holds (nouns), what it accepts (verbs with parameter schemas and
     * `InvokableBy`), what it emits (events), how it opens (inputs) and what it hands back (output). Pure data, and the only
     * thing an agent has to go on, so write `Instructions` and every description for the MODEL.
     */
    protected abstract readonly Descriptor: RealtimeChannelDescriptor;

    /**
     * The channel's state as the model should perceive it: one entry per noun in the descriptor, JSON only. Called whenever
     * a perception note is built, so it must be a pure, cheap read of the component.
     *
     * @param component The bound component.
     */
    protected abstract ReadSurfaceState(component: TComponent): JSONObject;

    /**
     * Runs one verb on the component. The adapter has already resolved the verb against the descriptor and validated
     * `args` against its schema, so trust the shape; check the GAME or DOCUMENT rules (is it the agent's turn? is the cell
     * free?) and return a failure result with a message the model can act on rather than throwing.
     *
     * @param component The bound component.
     * @param verb The verb's name, as declared in the descriptor.
     * @param args The validated parameters.
     * @param actor Who is acting: the agent, or the user acting through the same verb.
     */
    protected abstract ApplySurfaceVerb(
        component: TComponent,
        verb: string,
        args: JSONObject,
        actor: RealtimeChannelActor
    ): RealtimeChannelVerbResult | Promise<RealtimeChannelVerbResult>;

    /**
     * What the component emits that the channel should react to, as a stream. Subscribed when the surface binds and
     * unsubscribed when it unbinds. Merge the component's outputs here; map each to a {@link ChannelSurfaceEvent}.
     *
     * @param component The bound component.
     */
    protected abstract SurfaceEvents(component: TComponent): Observable<ChannelSurfaceEvent>;

    /**
     * Applies the seed inputs of `open` to the component (optional). Return a failure to refuse the open. Called when the
     * surface is bound, immediately if it already is.
     *
     * @param component The bound component.
     * @param inputs The validated open inputs.
     */
    protected OnSurfaceOpen?(component: TComponent, inputs: JSONObject): void | RealtimeChannelVerbResult | Promise<void | RealtimeChannelVerbResult>;

    /**
     * Emits when the component's job is done and it has something to hand back (a finished game, a submitted form):
     * becomes `Complete(output)`, validated against the descriptor's `Output`. Optional.
     *
     * @param component The bound component.
     */
    protected SurfaceCompletion?(component: TComponent): Observable<JSONObject>;

    /**
     * Called each time a component is bound, with the last state the channel knew (this session's, or the saved one on a
     * resumed session), so a component created fresh (a panel expanded again, a session resumed) can be restored to it.
     * Optional; a component that keeps its own state elsewhere does not need it.
     *
     * @param component The newly bound component.
     * @param lastState The last known state, or `null` when there is none.
     */
    protected OnSurfaceBound?(component: TComponent, lastState: JSONObject | null): void;

    /**
     * The component's root element, so the channel can show the model a picture of it. Optional: without it (or without a
     * rasterizer registered by the host) the channel offers state only. A component can expose its host element by
     * injecting `ElementRef`.
     *
     * @param component The bound component.
     */
    protected SurfaceElement?(component: TComponent): HTMLElement | null;

    /** How long a verb waits for the surface to bind before failing with `'surface_unavailable'`, in ms. Override to change it. */
    protected SurfaceBindTimeoutMs: number = SURFACE_BIND_TIMEOUT_MS;

    // ── Identity, derived from the descriptor ──────────────────────────────────

    public get ChannelName(): string {
        return this.Descriptor.Key;
    }

    public override get TabTitle(): string {
        return this.Descriptor.DisplayName;
    }

    public override GetDescriptor(): RealtimeChannelDescriptor {
        return this.Descriptor;
    }

    /** The channel has no native tools: its verbs are reached through the `ContextTool` proxy. */
    public override GetToolDefinitions(): never[] {
        return [];
    }

    public override GetSurfaceComponent(): Type<TComponent> {
        return this.ComponentClass;
    }

    // ── Surface binding ────────────────────────────────────────────────────────

    private surface: TComponent | null = null;
    private surfaceSubscriptions: Subscription[] = [];
    private bindWaiters: Array<(component: TComponent | null) => void> = [];
    private lastState: JSONObject | null = null;
    private pendingOpenInputs: JSONObject | null = null;
    private verbChain: Promise<unknown> = Promise.resolve();
    private applyingActor: RealtimeChannelActor | null = null;

    /** The bound component, or `null` while no surface is up. */
    protected get Surface(): TComponent | null {
        return this.surface;
    }

    /**
     * Opts into pictures when the subclass can name the component's element and the host registered a rasterizer. Subclasses
     * that override this MUST call `super.OnInitialize()`.
     */
    protected override OnInitialize(): void {
        if (this.SurfaceElement && ChannelFrameCapture.Instance.Capturer) {
            this.EnableVisualPerception({ GetLatestFrame: () => this.captureFrame() });
        }
    }

    /**
     * The overlay created the component: bind to it. Subscribes to its events and completion, restores the last known
     * state, applies any seed inputs that arrived before it existed, and releases verbs that were waiting for it.
     */
    public override BindSurface(component: TComponent): void {
        this.unbindSubscriptions();
        this.surface = component;
        this.OnSurfaceBound?.(component, this.lastState);
        this.surfaceSubscriptions.push(
            this.SurfaceEvents(component).subscribe({
                next: (event) => this.onSurfaceEvent(event),
                error: (error: unknown) => LogError(`[RealtimeChannel:${this.ChannelName}] The surface's event stream failed: ${error instanceof Error ? error.message : String(error)}`),
            })
        );
        const completion = this.SurfaceCompletion?.(component);
        if (completion) {
            this.surfaceSubscriptions.push(
                completion.subscribe({
                    next: (output) => this.Complete(output),
                    error: (error: unknown) => LogError(`[RealtimeChannel:${this.ChannelName}] The surface's completion stream failed: ${error instanceof Error ? error.message : String(error)}`),
                })
            );
        }
        void this.applyPendingOpen(component);
        const waiters = this.bindWaiters;
        this.bindWaiters = [];
        for (const release of waiters) {
            release(component);
        }
    }

    /** The component is going away (the panel collapsed, or the session ended): keep its last state, let go of it. */
    public override UnbindSurface(): void {
        if (this.surface) {
            this.lastState = this.safeReadState(this.surface) ?? this.lastState;
        }
        this.unbindSubscriptions();
        this.surface = null;
    }

    private unbindSubscriptions(): void {
        for (const subscription of this.surfaceSubscriptions) {
            subscription.unsubscribe();
        }
        this.surfaceSubscriptions = [];
    }

    /** Resolves with the bound component, waiting (bounded) for it to bind; `null` when it never does. */
    private whenSurfaceBound(): Promise<TComponent | null> {
        if (this.surface) {
            return Promise.resolve(this.surface);
        }
        return new Promise<TComponent | null>((resolve) => {
            const release = (component: TComponent | null): void => {
                clearTimeout(timer);
                resolve(component);
            };
            const timer = setTimeout(() => {
                this.bindWaiters = this.bindWaiters.filter((w) => w !== release);
                resolve(null);
            }, this.SurfaceBindTimeoutMs);
            this.bindWaiters.push(release);
        });
    }

    // ── State ──────────────────────────────────────────────────────────────────

    /**
     * The channel's state: the live component's, or the last known when no component is bound (so a note built while the
     * panel is collapsed still describes the channel truthfully).
     */
    public override GetState(): JSONObject {
        if (this.surface) {
            const live = this.safeReadState(this.surface);
            if (live) {
                this.lastState = live;
                return live;
            }
        }
        return this.lastState ?? {};
    }

    /** Reads the component's state, logging and returning `null` if the subclass's reader throws (a perception note must never break a call). */
    private safeReadState(component: TComponent): JSONObject | null {
        try {
            return this.ReadSurfaceState(component);
        } catch (error) {
            LogError(`[RealtimeChannel:${this.ChannelName}] ReadSurfaceState failed: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /** The state of record: the last known state as JSON, or `null` before there is any. */
    public override SerializeState(): string | null {
        const state = this.GetState();
        return Object.keys(state).length > 0 ? JSON.stringify(state) : null;
    }

    /**
     * A saved state came back (a resumed session): hold it, and hand it to {@link OnSurfaceBound} when the component is
     * created. Returns `false` for anything that is not a JSON object.
     */
    public override RestoreState(stateJson: string): boolean {
        try {
            const parsed: unknown = JSON.parse(stateJson);
            if (!IsPlainObject(parsed)) {
                return false;
            }
            this.lastState = parsed as JSONObject;
            return true;
        } catch {
            return false;
        }
    }

    // ── Open ───────────────────────────────────────────────────────────────────

    /**
     * Seeds the surface with the open inputs: now if the component is bound, otherwise when it binds (there is nothing to
     * report back but success, so there is nothing to wait for).
     */
    protected override async OnOpen(inputs: JSONObject): Promise<void | RealtimeChannelVerbResult> {
        if (!this.OnSurfaceOpen) {
            return;
        }
        if (this.surface) {
            return this.OnSurfaceOpen(this.surface, inputs);
        }
        this.pendingOpenInputs = inputs;
        return;
    }

    private async applyPendingOpen(component: TComponent): Promise<void> {
        const inputs = this.pendingOpenInputs;
        this.pendingOpenInputs = null;
        if (inputs === null || !this.OnSurfaceOpen) {
            return;
        }
        try {
            const result = await this.OnSurfaceOpen(component, inputs);
            if (result && !result.Success) {
                LogError(`[RealtimeChannel:${this.ChannelName}] Seeding the surface was refused: ${result.Error ?? result.ErrorCode ?? 'no reason given'}`);
            }
        } catch (error) {
            LogError(`[RealtimeChannel:${this.ChannelName}] Seeding the surface failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // ── Verbs ──────────────────────────────────────────────────────────────────

    /**
     * Runs one verb. Verbs are serialized (a second call waits for the first), wait (bounded) for the surface, and run
     * against the real component, so the outcome the agent hears is the outcome the user sees.
     */
    public override ApplyVerb(verb: string, args: JSONObject, actor: RealtimeChannelActor): Promise<RealtimeChannelVerbResult> {
        const run = this.verbChain.then(() => this.runVerb(verb, args, actor));
        this.verbChain = run.catch(() => undefined);
        return run;
    }

    private async runVerb(verb: string, args: JSONObject, actor: RealtimeChannelActor): Promise<RealtimeChannelVerbResult> {
        const declared = this.Descriptor.Verbs.find((v) => v.Name.toLowerCase() === verb.trim().toLowerCase());
        if (!declared) {
            return failure('unknown_verb', `The ${this.Descriptor.DisplayName} channel has no action "${verb}".`, [`available: ${this.Descriptor.Verbs.map((v) => v.Name).join(', ')}`]);
        }
        const refusal = actor === 'agent' ? this.RefuseVerbForExposure(declared) : null;
        if (refusal) {
            return failure('exposure_restricted', refusal, [...this.ExposureReasons]);
        }
        const issues = ValidateJsonAgainstSchemaSubset(args, declared.ParametersSchema);
        if (issues.length > 0) {
            return failure('invalid_params', `The parameters for ${declared.Name} are invalid.`, issues);
        }
        const component = await this.whenSurfaceBound();
        if (!component) {
            return failure(
                'surface_unavailable',
                `The ${this.Descriptor.DisplayName} is not on screen right now, so "${declared.Name}" could not be done. Ask the user to open it.`
            );
        }
        return this.applyOnSurface(component, declared.Name, args, actor);
    }

    private async applyOnSurface(component: TComponent, verb: string, args: JSONObject, actor: RealtimeChannelActor): Promise<RealtimeChannelVerbResult> {
        this.applyingActor = actor;
        try {
            const result = await this.ApplySurfaceVerb(component, verb, args, actor);
            if (result.Success) {
                this.RecordChange({ Author: actor });
                if (actor === 'agent') {
                    void this.ConfirmVisualChange();
                }
            }
            return result;
        } catch (error) {
            LogError(`[RealtimeChannel:${this.ChannelName}] ${verb} threw: ${error instanceof Error ? error.message : String(error)}`);
            return failure('verb_failed', `${verb} failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.applyingActor = null;
        }
    }

    // ── Events ─────────────────────────────────────────────────────────────────

    /** The component emitted something: tell observers, and (unless told not to) record it as a change the model perceives. */
    private onSurfaceEvent(event: ChannelSurfaceEvent): void {
        const author = event.Author ?? this.applyingActor ?? 'user';
        const changeId = this.RecordChange({ Author: author, Perceive: event.Perceive !== false });
        this.EmitChannelEvent(event.Name, event.Payload ?? {}, changeId);
        if (author === 'user') {
            void this.NotifyVisualChange();
        }
    }

    // ── Pictures ───────────────────────────────────────────────────────────────

    /** A picture of the component, or `null` when there is none to send (see the rules in the Interactive Component channel). */
    private async captureFrame(): Promise<string | null> {
        const capturer = ChannelFrameCapture.Instance.Capturer;
        if (!capturer || !this.surface || this.Exposure !== 'pixels' || !this.Context?.Client?.IsTrackEstablished('video', 'inbound')) {
            return null;
        }
        const element = this.SurfaceElement?.(this.surface) ?? null;
        if (!element) {
            return null;
        }
        try {
            return await capturer(element);
        } catch (error) {
            LogError(`[RealtimeChannel:${this.ChannelName}] Capturing a frame failed: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    // ── Teardown ───────────────────────────────────────────────────────────────

    public override Dispose(): void {
        this.unbindSubscriptions();
        this.surface = null;
        for (const release of this.bindWaiters) {
            release(null);
        }
        this.bindWaiters = [];
        super.Dispose();
    }
}
