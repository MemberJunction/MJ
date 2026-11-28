/**
 * @fileoverview Reusable streaming `<think>...</think>` (or `<thinking>...</thinking>`) block
 * extractor for LLM providers that embed reasoning inside text streams.
 *
 * Encapsulates split-tag holdback across arbitrary chunk boundaries (including case-insensitive
 * tag matching and UTF-16 surrogate-pair safety) plus end-of-stream visible remainder flushing
 * without ever leaking unterminated thinking blocks.
 *
 * @module @memberjunction/ai
 */

/**
 * Tag delimiters for a thinking/reasoning block embedded in streamed text.
 */
export interface ThinkingTagFormat {
    open: string;
    close: string;
}

/**
 * Result of feeding one raw text delta into {@link ThinkingStreamExtractor.ProcessChunk}.
 */
export interface ThinkingChunkResult {
    /** User-visible content delta safe to emit immediately. */
    contentDelta: string;
    /** Thinking/reasoning text delta captured inside the thinking block during this chunk. */
    thinkingDelta: string;
}

/**
 * Stateful streaming extractor that separates `<think>...</think>` (or custom tag pair) blocks
 * from user-visible text across arbitrary chunk boundaries.
 *
 * One extractor instance is owned per active stream (reset at start and in `finally`) so no
 * provider needs to hand-roll `_streamingState` tag-parsing loops.
 */
export class ThinkingStreamExtractor {
    private readonly _openTag: string;
    private readonly _closeTag: string;
    private _accumulatedThinking: string = '';
    private _inThinkingBlock: boolean = false;
    private _pendingContent: string = '';
    private _thinkingComplete: boolean = false;

    constructor(tags: ThinkingTagFormat = { open: '<think>', close: '</think>' }) {
        this._openTag = tags.open;
        this._closeTag = tags.close;
    }

    /** Full thinking/reasoning text accumulated so far during the current stream. */
    public get AccumulatedThinking(): string {
        return this._accumulatedThinking;
    }

    /** True while currently inside an open thinking block waiting for the closing tag. */
    public get InThinkingBlock(): boolean {
        return this._inThinkingBlock;
    }

    /** True once a thinking block has been closed and all subsequent text passes straight through. */
    public get ThinkingComplete(): boolean {
        return this._thinkingComplete;
    }

    /** Any buffered trailing fragment currently held back pending the next chunk. */
    public get PendingContent(): string {
        return this._pendingContent;
    }

    /**
     * Appends native reasoning text received out-of-band (e.g., OpenAI `delta.reasoning_content`,
     * Groq `reasoning`, or Anthropic `thinking_delta`) directly into {@link AccumulatedThinking}.
     */
    public AppendThinking(delta: string): void {
        if (delta) {
            this._accumulatedThinking += delta;
        }
    }

    /**
     * Processes one raw streaming text chunk, returning the user-visible `contentDelta` and any
     * captured `thinkingDelta`. Handles tags split across arbitrary chunk boundaries and
     * case-insensitive matching.
     */
    public ProcessChunk(rawChunk: string): ThinkingChunkResult {
        if (rawChunk) {
            this._pendingContent += rawChunk;
        }

        let contentDelta = '';
        let thinkingDelta = '';

        const openLower = this._openTag.toLowerCase();
        const closeLower = this._closeTag.toLowerCase();

        while (this._pendingContent.length > 0) {
            if (this._thinkingComplete) {
                contentDelta += this._pendingContent;
                this._pendingContent = '';
                break;
            }

            if (this._inThinkingBlock) {
                const pendingLower = this._pendingContent.toLowerCase();
                const endIdx = pendingLower.indexOf(closeLower);
                if (endIdx !== -1) {
                    const captured = this._pendingContent.substring(0, endIdx);
                    this._accumulatedThinking += captured;
                    thinkingDelta += captured;
                    this._pendingContent = this._pendingContent.substring(endIdx + this._closeTag.length);
                    this._inThinkingBlock = false;
                    this._thinkingComplete = true;
                    continue;
                }

                // Hold back any suffix that could be the start of a split close tag.
                const closeHoldBack = this.partialTagSuffixLength(this._pendingContent, this._closeTag);
                const closeCut = this._pendingContent.length - closeHoldBack;
                const captured = this._pendingContent.substring(0, closeCut);
                this._accumulatedThinking += captured;
                thinkingDelta += captured;
                this._pendingContent = this._pendingContent.substring(closeCut);
                break;
            }

            const pendingLower = this._pendingContent.toLowerCase();
            const startIdx = pendingLower.indexOf(openLower);
            if (startIdx !== -1) {
                if (startIdx > 0) {
                    contentDelta += this._pendingContent.substring(0, startIdx);
                }
                this._inThinkingBlock = true;
                this._pendingContent = this._pendingContent.substring(startIdx + this._openTag.length);
                continue;
            }

            // Hold back any suffix that could be the start of a split open tag, without splitting a UTF-16 surrogate pair.
            const openHoldBack = this.partialTagSuffixLength(this._pendingContent, this._openTag);
            const emitEnd = this.avoidSurrogateSplit(
                this._pendingContent,
                this._pendingContent.length - openHoldBack
            );
            contentDelta += this._pendingContent.substring(0, emitEnd);
            this._pendingContent = this._pendingContent.substring(emitEnd);
            break;
        }

        return { contentDelta, thinkingDelta };
    }

    /**
     * Flushes any held-back visible text fragment at end-of-stream (e.g. a trailing `"<"` that
     * never became `<think>`). Never flushes buffered text while inside an unterminated thinking
     * block so reasoning text cannot leak into user-visible output.
     */
    public Flush(): string {
        if (this._inThinkingBlock) {
            return '';
        }
        const remainder = this._pendingContent;
        this._pendingContent = '';
        return remainder;
    }

    /**
     * Resets all accumulated thinking and pending buffer state for reuse or memory release.
     */
    public Reset(): void {
        this._accumulatedThinking = '';
        this._inThinkingBlock = false;
        this._pendingContent = '';
        this._thinkingComplete = false;
    }

    private partialTagSuffixLength(text: string, tag: string): number {
        if (!text || !tag) {
            return 0;
        }
        const t = text.toLowerCase();
        const g = tag.toLowerCase();
        const max = Math.min(t.length, g.length - 1);
        for (let len = max; len > 0; len--) {
            if (t.endsWith(g.substring(0, len))) {
                return len;
            }
        }
        return 0;
    }

    private avoidSurrogateSplit(text: string, cut: number): number {
        if (cut > 0 && cut < text.length) {
            const code = text.charCodeAt(cut - 1);
            if (code >= 0xD800 && code <= 0xDBFF) {
                return cut - 1;
            }
        }
        return cut;
    }
}
