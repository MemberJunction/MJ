/**
 * Normalized content-block streaming events for agent/voice surfaces.
 *
 * Background (see `plans/streaming-architecture-analysis.md` §2, §5.2): MJ's loop
 * agent emits one structured-JSON envelope per turn (`LoopAgentResponse`). To
 * stream the *spoken answer* to TTS you otherwise have to re-parse that JSON
 * mid-flight. This module defines the target shape that dissolves the problem —
 * a discriminated event union where spoken text, reasoning, and tool calls are
 * *different event types*, separated at the boundary, so "stream the answer to
 * TTS" is just "forward the `TextDelta` events".
 *
 * Three properties this design insists on:
 *   (a) `Partial` (the assembled message-so-far) rides on every text event —
 *       consumers re-render `Partial`, they never fold deltas themselves.
 *   (b) Errors are *values*, not exceptions — once a stream starts, the producer
 *       never throws; failures arrive as a terminal `Error` event carrying the
 *       partial. For voice this is not optional: a provider hiccup mid-utterance
 *       must degrade gracefully, not tear down the call.
 *   (c) A dual stream/result primitive (`AgentEventStream`) is both
 *       `AsyncIterable<AgentStreamEvent>` (deltas, for voice) and exposes
 *       `result()` (the assembled turn, for batch) — one object, no second path.
 *
 * Scope note (prototype): the tool-call variants are declared so the shape is
 * complete and consumers can switch exhaustively, but the demo producers emit
 * only the text/lifecycle events. Tool-call streaming lands with the
 * streaming-native runtime post-demo.
 */

/**
 * The assembled assistant turn so far. Carried as `Partial` on every text event
 * and returned by `AgentEventStream.result()`. `Thinking` is accumulated
 * separately so it is never spoken by construction.
 */
export interface AssistantTurn {
    /** Accumulated user-facing text (the spoken answer). */
    Text: string;
    /** Accumulated reasoning/thinking, suppressed from TTS. Optional. */
    Thinking?: string;
    /** True once the turn has reached a terminal state (Done or Error). */
    IsComplete: boolean;
}

/** A single resolved tool call (declared for shape completeness; not emitted in the prototype). */
export interface AgentStreamToolCall {
    CallID: string;
    ToolName: string;
    Args: Record<string, unknown>;
}

/**
 * Normalized streaming event union. `ContentIndex` addresses the position in the
 * message's content array (a turn may produce multiple text/thinking/tool blocks).
 */
export type AgentStreamEvent =
    | { Kind: 'TurnStart' }
    | { Kind: 'TextStart'; ContentIndex: number; Partial: AssistantTurn }
    | { Kind: 'TextDelta'; ContentIndex: number; Delta: string; Partial: AssistantTurn }
    | { Kind: 'TextEnd'; ContentIndex: number; Content: string; Partial: AssistantTurn }
    | { Kind: 'ThinkingDelta'; ContentIndex: number; Delta: string; Partial: AssistantTurn }
    | { Kind: 'ToolCallStart'; ContentIndex: number; ToolName: string }
    | { Kind: 'ToolCallDelta'; ContentIndex: number; PartialArgs: Record<string, unknown> }
    | { Kind: 'ToolCallEnd'; ContentIndex: number; ToolCall: AgentStreamToolCall }
    | { Kind: 'TurnEnd'; Turn: AssistantTurn }
    | { Kind: 'Done'; Reason: 'Stop' | 'Length' | 'ToolUse'; Final: AssistantTurn }
    | { Kind: 'Error'; Reason: 'Aborted' | 'Error'; Error: AssistantTurn; Message?: string };

/** Terminal reason for a normal completion. */
export type AgentStreamDoneReason = 'Stop' | 'Length' | 'ToolUse';

/**
 * Unbounded single-producer / single-consumer async queue. Inlined here (rather
 * than imported) to keep `ai-core-plus` dependency-free; mirrors the queue idiom
 * used by the channel transports. Internal to this module.
 */
class EventQueue<T> implements AsyncIterable<T> {
    private items: T[] = [];
    private waiters: Array<(value: IteratorResult<T>) => void> = [];
    private closed = false;

    public push(item: T): void {
        if (this.closed) {
            return;
        }
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter({ value: item, done: false });
        } else {
            this.items.push(item);
        }
    }

    public close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        while (this.waiters.length) {
            const w = this.waiters.shift();
            if (w) {
                w({ value: undefined as never, done: true });
            }
        }
    }

    public [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        const self = this;
        return {
            [Symbol.asyncIterator](): AsyncIterableIterator<T> {
                return this;
            },
            next(): Promise<IteratorResult<T>> {
                if (self.items.length > 0) {
                    const value = self.items.shift() as T;
                    return Promise.resolve({ value, done: false });
                }
                if (self.closed) {
                    return Promise.resolve({ value: undefined as never, done: true });
                }
                return new Promise<IteratorResult<T>>((resolve) => self.waiters.push(resolve));
            },
        };
    }
}

/**
 * The dual stream/result primitive. A producer drives it with the `Emit*` /
 * `Complete` / `Fail` methods; a consumer either `for await`s the events (voice,
 * incremental) or `await`s `result()` (batch, the assembled turn).
 *
 * The producer-side methods maintain the accumulating `AssistantTurn` and stamp
 * a *snapshot* of it onto every text event, so a consumer that retains an early
 * event still sees that event's `Partial` unchanged. After a terminal event
 * (`Complete`/`Fail`) all further `Emit*` calls are ignored — the producer never
 * throws, and the stream closes exactly once.
 */
export class AgentEventStream implements AsyncIterable<AgentStreamEvent> {
    private readonly queue = new EventQueue<AgentStreamEvent>();
    private readonly turn: AssistantTurn = { Text: '', Thinking: '', IsComplete: false };
    private settled = false;
    private contentIndex = 0;
    private textStarted = false;
    private readonly resultPromise: Promise<AssistantTurn>;
    private resolveResult!: (t: AssistantTurn) => void;

    constructor() {
        this.resultPromise = new Promise<AssistantTurn>((resolve) => {
            this.resolveResult = resolve;
        });
    }

    /** Snapshot the current turn so retained events keep their own `Partial`. */
    private snapshot(): AssistantTurn {
        return { Text: this.turn.Text, Thinking: this.turn.Thinking, IsComplete: this.turn.IsComplete };
    }

    /** Emit the turn-start marker. Safe to call once at the top of a turn. */
    public EmitTurnStart(): void {
        if (this.settled) {
            return;
        }
        this.queue.push({ Kind: 'TurnStart' });
    }

    /**
     * Emit a chunk of user-facing text. Lazily emits `TextStart` before the first
     * delta. Empty deltas are ignored (no-op) so callers can forward extractor
     * output without filtering.
     */
    public EmitTextDelta(delta: string): void {
        if (this.settled || delta.length === 0) {
            return;
        }
        if (!this.textStarted) {
            this.textStarted = true;
            this.queue.push({ Kind: 'TextStart', ContentIndex: this.contentIndex, Partial: this.snapshot() });
        }
        this.turn.Text += delta;
        this.queue.push({ Kind: 'TextDelta', ContentIndex: this.contentIndex, Delta: delta, Partial: this.snapshot() });
    }

    /** Emit a chunk of reasoning. Accumulated into `Thinking`, never into `Text`. */
    public EmitThinkingDelta(delta: string): void {
        if (this.settled || delta.length === 0) {
            return;
        }
        this.turn.Thinking = (this.turn.Thinking ?? '') + delta;
        this.queue.push({ Kind: 'ThinkingDelta', ContentIndex: this.contentIndex, Delta: delta, Partial: this.snapshot() });
    }

    /**
     * Complete the turn normally. Closes the open text block (if any), then emits
     * `TurnEnd` + `Done`, settles `result()`, and closes the stream. Idempotent.
     */
    public Complete(reason: AgentStreamDoneReason = 'Stop'): void {
        if (this.settled) {
            return;
        }
        if (this.textStarted) {
            this.queue.push({
                Kind: 'TextEnd',
                ContentIndex: this.contentIndex,
                Content: this.turn.Text,
                Partial: this.snapshot(),
            });
        }
        this.turn.IsComplete = true;
        const final = this.snapshot();
        this.queue.push({ Kind: 'TurnEnd', Turn: final });
        this.queue.push({ Kind: 'Done', Reason: reason, Final: final });
        this.finish(final);
    }

    /**
     * Fail the turn. Emits a single terminal `Error` event carrying the partial
     * turn, settles `result()` with that partial (never rejects), and closes the
     * stream. This is the errors-as-values path — consumers need no try/catch.
     */
    public Fail(reason: 'Aborted' | 'Error', message?: string): void {
        if (this.settled) {
            return;
        }
        this.turn.IsComplete = true;
        const partial = this.snapshot();
        this.queue.push({ Kind: 'Error', Reason: reason, Error: partial, Message: message });
        this.finish(partial);
    }

    private finish(turn: AssistantTurn): void {
        this.settled = true;
        this.resolveResult(turn);
        this.queue.close();
    }

    /** Consume the event deltas. */
    public [Symbol.asyncIterator](): AsyncIterableIterator<AgentStreamEvent> {
        return this.queue[Symbol.asyncIterator]();
    }

    /**
     * The assembled turn. Resolves on `Complete` (with the final turn) or on
     * `Fail` (with the partial turn). Never rejects.
     */
    public result(): Promise<AssistantTurn> {
        return this.resultPromise;
    }
}
