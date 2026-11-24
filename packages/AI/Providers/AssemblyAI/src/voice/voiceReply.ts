import type { LLMToolCall } from './assemblyAILLMGateway';
import { HeardText, SentenceChunker, ToSpeakableText, type SpokenSegment } from './voiceText';

/** How models start a tool call they write as text instead of making. */
const TOOL_CALL_MARKUP = /<(?:call:|\|?tool|\|?function)/i;

/** What a reply needs from the pipeline that runs it. */
export interface VoiceReplyHost {
    /** Queues one piece of text to speak and returns its id, unique in the call. */
    Speak(text: string): number;
    /** A piece starts playing: `delta` is its text, with a leading space when it is not the first. */
    OnPieceStarted(delta: string): void;
}

/**
 * One reply of the agent: its text as it is written, the pieces being spoken, and when each piece plays.
 *
 * Speech arrives faster than it plays, so the time a listener has heard is estimated: each chunk plays after the one
 * before it, or on arrival when nothing is playing. Nothing on the wire reports the browser's real playback.
 */
export class VoiceReply {
    public readonly Abort = new AbortController();
    public Usage: { InputTokens: number; OutputTokens: number } | null = null;
    public FailureMessage = '';
    /** Tool calls to hand over once the words before them have arrived. */
    public ToolCalls: LLMToolCall[] = [];
    /** Set when the reply's words are recorded with its tool calls, so they are not recorded again. */
    public RecordedWithToolCalls = false;
    /** False for words the application adds (an apology), which the model should not think it said. */
    public KeepInHistory = true;

    private readonly chunker = new SentenceChunker();
    private readonly segments: Array<SpokenSegment & { Number: number }> = [];
    private textFinished = false;
    private markupSeen = false;
    private playEndMs = 0;

    constructor(
        public readonly ID: string,
        public readonly ItemID: string,
        private readonly bytesPerMs: number,
        private readonly host: VoiceReplyHost
    ) {}

    /** Adds streamed text. Ignored once the text is finished. */
    public AddText(text: string): void {
        if (this.textFinished) {
            return;
        }
        for (const piece of this.chunker.Push(text)) {
            this.speak(piece);
        }
    }

    public FinishText(): void {
        if (this.textFinished) {
            return;
        }
        const rest = this.chunker.Flush();
        if (rest) {
            this.speak(rest);
        }
        this.textFinished = true;
    }

    /** Takes audio for one of this reply's pieces. False when the piece is not this reply's. */
    public AddAudio(segmentID: number, byteLength: number, nowMs: number): boolean {
        const segment = this.segments.find((s) => s.Number === segmentID);
        if (!segment) {
            return false;
        }
        const startMs = Math.max(nowMs, this.playEndMs);
        if (segment.StartMs === null) {
            segment.StartMs = startMs;
            this.host.OnPieceStarted(segment === this.segments[0] ? segment.Text : ` ${segment.Text}`);
        }
        this.playEndMs = startMs + byteLength / this.bytesPerMs;
        segment.EndMs = this.playEndMs;
        return true;
    }

    public FinishSegment(segmentID: number): void {
        const segment = this.segments.find((s) => s.Number === segmentID);
        if (segment) {
            segment.Done = true;
        }
    }

    /** Drops a sentence that was cut off while it was being written. */
    public DiscardUnfinishedText(): void {
        this.chunker.Flush();
    }

    /** Gives up on pieces that will get no more audio (the voice was lost). */
    public AbandonUnspoken(): void {
        this.textFinished = true;
        for (const segment of this.segments) {
            segment.Done = true;
        }
    }

    public get HasSpeech(): boolean {
        return this.segments.length > 0;
    }

    /** Whether the text is finished and all of its audio has arrived. */
    public get IsComplete(): boolean {
        return this.textFinished && this.segments.every((s) => s.Done);
    }

    /** When what has arrived will have finished playing. */
    public get PlayEndMs(): number {
        return this.playEndMs;
    }

    /** All the words of this reply that were sent to be spoken. */
    public get FullText(): string {
        return this.segments.map((s) => s.Text).join(' ');
    }

    /** The words heard by `nowMs`. */
    public HeardBy(nowMs: number): string {
        return HeardText(this.segments, nowMs);
    }

    /** Some models now and then write a tool call into their words. It and what follows it are not speech. */
    private withoutToolCallMarkup(piece: string): string {
        if (this.markupSeen) {
            return '';
        }
        const start = piece.search(TOOL_CALL_MARKUP);
        if (start < 0) {
            return piece;
        }
        this.markupSeen = true;
        console.warn('[AssemblyAIVoice] the model wrote a tool call as text; it was not run or spoken');
        return piece.slice(0, start);
    }

    private speak(piece: string): void {
        const text = ToSpeakableText(this.withoutToolCallMarkup(piece));
        if (text.length > 0) {
            this.segments.push({ Number: this.host.Speak(text), Text: text, StartMs: null, EndMs: 0, Done: false });
        }
    }
}
