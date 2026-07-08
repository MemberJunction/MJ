/**
 * @fileoverview Incremental extractor that pulls the user-facing reply text out of a
 * Loop agent's STREAMED JSON turn envelope, so core Loop agents can surface
 * `kind:'final-response'` deltas (rendered live by the conversation client) without
 * changing how they produce their envelope.
 *
 * The problem this solves: a Loop agent's answer is born INSIDE its JSON envelope
 * (`{"taskComplete": true, "message": "the answer", ...}`), so its raw stream is not
 * renderable. This parser consumes the envelope AS IT STREAMS and re-emits just the
 * root-level `message` string's content — and only for a FINAL turn:
 *
 * - `taskComplete` precedes `message` in the loop system prompt's examples, so in the
 *   common case finality is known before the answer text arrives and deltas are
 *   emitted token-by-token as the model writes them.
 * - If a model emits `message` first, its content is buffered and flushed in one piece
 *   the moment `taskComplete: true` is parsed (graceful degradation: the reply appears
 *   at once rather than typing in).
 * - Non-final turns (`taskComplete: false`) and `message` keys nested inside other
 *   values (e.g. payloadChangeRequest) are never emitted.
 *
 * Tolerates leading non-JSON (prose/markdown fences) by scanning to the first `{`,
 * handles all JSON string escapes incrementally (including `\uXXXX` split across
 * chunk boundaries), and ignores anything after the envelope's closing brace.
 */

import { AgentFinalResponseStreamExtractor } from './base-agent-type';

/** Where characters of the string token currently being read should go. */
type StringSink = 'key' | 'message' | 'discard';

/** What the tokenizer expects next at the envelope root (depth 1). */
type RootMode = 'key' | 'colon' | 'value' | 'post';

export class LoopAgentStreamExtractor implements AgentFinalResponseStreamExtractor {
    // --- envelope framing ---
    private started = false; // saw the envelope's opening '{'
    private done = false;    // saw the envelope's closing '}' — ignore trailing output
    private depth = 0;       // object/array nesting depth; 1 = envelope root

    // --- string tokenizing (escape state survives chunk boundaries) ---
    private inString = false;
    private escaped = false;
    private unicodeRemaining = 0;
    private unicodeBuffer = '';
    private sink: StringSink = 'discard';

    // --- root-level key/value tracking ---
    private mode: RootMode = 'key';
    private keyBuffer = '';
    private rootKey: string | null = null;
    private literalBuffer = ''; // accumulates non-string root scalars (true/false/...)

    // --- finality + message routing ---
    private finalTurn: boolean | null = null; // null until taskComplete parsed
    private messageBuffer = '';               // message text seen before finality is known
    private out = '';                         // text ready to hand back from Feed()
    private emittedAny = false;

    /** True once any final-reply text has been emitted (drives the closing tagged chunk). */
    public get HasEmitted(): boolean {
        return this.emittedAny;
    }

    /**
     * Consume the next raw delta of the turn's output and return any newly-available
     * final-reply text (already unescaped). Returns '' when nothing new is renderable.
     */
    public Feed(delta: string): string {
        if (this.done || !delta) return '';
        for (let i = 0; i < delta.length; i++) {
            this.consume(delta[i]);
            if (this.done) break;
        }
        const emit = this.out;
        this.out = '';
        if (emit) this.emittedAny = true;
        return emit;
    }

    private consume(c: string): void {
        if (!this.started) {
            if (c === '{') {
                this.started = true;
                this.depth = 1;
                this.mode = 'key';
            }
            return; // scan past prose / ```json fences until the envelope opens
        }

        if (this.inString) {
            this.consumeStringChar(c);
            return;
        }

        switch (c) {
            case '"':
                this.inString = true;
                this.beginString();
                return;
            case '{':
            case '[':
                this.depth++;
                return;
            case '}':
            case ']':
                this.depth--;
                // Returning TO the root closes a nested root value; reaching depth 0
                // closes the envelope itself — the last root value (e.g. a trailing
                // `"taskComplete": true}`) must be finalized then too.
                if (this.depth <= 1) this.endRootValue();
                if (this.depth === 0) this.done = true;
                return;
            case ':':
                if (this.depth === 1 && this.mode === 'colon') this.mode = 'value';
                return;
            case ',':
                if (this.depth === 1) {
                    this.endRootValue();
                    this.mode = 'key';
                }
                return;
            default:
                if (this.depth === 1 && this.mode === 'value' && !/\s/.test(c)) {
                    // Non-string root scalar (true/false/null/number) — only
                    // taskComplete's literal matters, but accumulating is cheap.
                    this.literalBuffer += c;
                }
                return;
        }
    }

    private beginString(): void {
        if (this.depth !== 1) {
            this.sink = 'discard';
            return;
        }
        if (this.mode === 'key') {
            this.sink = 'key';
            this.keyBuffer = '';
        } else if (this.mode === 'value' && this.rootKey === 'message') {
            this.sink = 'message';
        } else {
            this.sink = 'discard';
        }
    }

    private consumeStringChar(c: string): void {
        if (this.unicodeRemaining > 0) {
            this.unicodeBuffer += c;
            this.unicodeRemaining--;
            if (this.unicodeRemaining === 0) {
                const code = parseInt(this.unicodeBuffer, 16);
                if (!Number.isNaN(code)) this.appendToSink(String.fromCharCode(code));
            }
            return;
        }
        if (this.escaped) {
            this.escaped = false;
            switch (c) {
                case 'n': this.appendToSink('\n'); return;
                case 't': this.appendToSink('\t'); return;
                case 'r': this.appendToSink('\r'); return;
                case 'b': this.appendToSink('\b'); return;
                case 'f': this.appendToSink('\f'); return;
                case 'u':
                    this.unicodeRemaining = 4;
                    this.unicodeBuffer = '';
                    return;
                default: this.appendToSink(c); return; // \" \\ \/ and anything else literal
            }
        }
        if (c === '\\') {
            this.escaped = true;
            return;
        }
        if (c === '"') {
            this.inString = false;
            this.endString();
            return;
        }
        this.appendToSink(c);
    }

    private appendToSink(text: string): void {
        switch (this.sink) {
            case 'key':
                this.keyBuffer += text;
                return;
            case 'message':
                if (this.finalTurn === true) this.out += text;
                else if (this.finalTurn === null) this.messageBuffer += text;
                // finalTurn === false → this turn's message is loop narration, not the reply
                return;
            default:
                return;
        }
    }

    private endString(): void {
        if (this.sink === 'key') {
            this.rootKey = this.keyBuffer;
            this.mode = 'colon';
        } else if (this.depth === 1 && this.mode === 'value') {
            this.mode = 'post'; // string value ended; ',' or '}' closes it out
        }
        this.sink = 'discard';
    }

    /** A root-level value just closed (via ',' or the envelope's '}'). */
    private endRootValue(): void {
        if (this.rootKey === 'taskComplete' && this.literalBuffer) {
            this.finalTurn = this.literalBuffer.trim().startsWith('true');
            if (this.finalTurn && this.messageBuffer) {
                // message streamed before finality was known — flush it in one piece
                this.out += this.messageBuffer;
            }
            if (!this.finalTurn) this.messageBuffer = '';
            if (this.finalTurn) this.messageBuffer = '';
        }
        this.rootKey = null;
        this.literalBuffer = '';
        this.mode = 'key';
    }
}
