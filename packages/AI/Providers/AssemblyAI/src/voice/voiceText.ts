// Text helpers for a spoken conversation: when to start speaking, what to say aloud, and what was heard.

/** The longest piece of text sent to text to speech at once. The provider's own limit is 2000 characters per frame. */
const MAX_SEGMENT_CHARS = 400;

/** The first clause of a reply is spoken at a comma once it is this long, so a long sentence does not delay the voice. */
const MIN_FIRST_CLAUSE_CHARS = 40;

/** Words whose trailing period does not end a sentence. */
const ABBREVIATIONS: ReadonlySet<string> = new Set(['dr', 'mr', 'mrs', 'ms', 'prof', 'st', 'sr', 'jr', 'vs', 'approx', 'e.g', 'i.e']);

/** Sentence-ending punctuation with any closing quote, bracket or markdown marker, followed by whitespace. */
const SENTENCE_END = /[.!?…]+["'”’)\]*_]*(?=\s)|\n/g;

/** A clause boundary followed by whitespace. */
const CLAUSE_END = /[,;:](?=\s)/g;

/**
 * Cuts a streamed reply into pieces to speak, as early as it can without cutting a sentence in an odd place. Pieces come
 * out trimmed; the pieces of one reply, joined by a space, are the reply.
 */
export class SentenceChunker {
    private buffer = '';
    private released = 0;

    /** Adds streamed text and returns the pieces now complete. */
    public Push(text: string): string[] {
        this.buffer += text;
        const out: string[] = [];
        for (let end = this.nextBoundary(); end > 0; end = this.nextBoundary()) {
            const piece = this.buffer.slice(0, end).trim();
            this.buffer = this.buffer.slice(end);
            if (piece.length > 0) {
                out.push(piece);
                this.released++;
            }
        }
        return out;
    }

    /** Returns whatever is left, or null when nothing is. */
    public Flush(): string | null {
        const rest = this.buffer.trim();
        this.buffer = '';
        return rest.length > 0 ? rest : null;
    }

    /** The index to cut at, or 0 when there is no boundary yet. */
    private nextBoundary(): number {
        const sentence = this.sentenceEnd();
        if (sentence > 0 && sentence <= MAX_SEGMENT_CHARS) {
            return sentence;
        }
        const clause = this.released === 0 ? this.clauseEnd(MIN_FIRST_CLAUSE_CHARS) : 0;
        if (clause > 0) {
            return clause;
        }
        return this.buffer.length > MAX_SEGMENT_CHARS ? this.longestCut() : 0;
    }

    private sentenceEnd(): number {
        for (const match of this.buffer.matchAll(SENTENCE_END)) {
            const end = match.index + match[0].length;
            if (match[0] === '\n' || !this.isInsideSentence(match.index, match[0])) {
                return end;
            }
        }
        return 0;
    }

    /** Whether a period belongs to an abbreviation, an initial (`U.S.`) or a list number rather than ending a sentence. */
    private isInsideSentence(index: number, punctuation: string): boolean {
        if (!punctuation.startsWith('.') || punctuation.startsWith('..')) {
            return false;
        }
        const word = this.buffer.slice(0, index).split(/\s/).pop() ?? '';
        const isListNumber = /^\d{1,2}$/.test(word) && this.buffer.slice(0, index).trim() === word;
        return isListNumber || /(?:^|\.)[A-Za-z]$/.test(word) || ABBREVIATIONS.has(word.toLowerCase());
    }

    private clauseEnd(minimum: number): number {
        for (const match of this.buffer.matchAll(CLAUSE_END)) {
            const end = match.index + 1;
            if (end >= minimum) {
                return end <= MAX_SEGMENT_CHARS ? end : 0;
            }
        }
        return 0;
    }

    /** The last clause or word boundary inside the limit, so an unpunctuated run still gets spoken. */
    private longestCut(): number {
        const window = this.buffer.slice(0, MAX_SEGMENT_CHARS);
        const space = window.lastIndexOf(' ');
        return space > 0 ? space : MAX_SEGMENT_CHARS;
    }
}

/** Removes what a voice should not read out (markdown, links' targets, emoji). Empty when nothing speakable is left. */
export function ToSpeakableText(text: string): string {
    const cleaned = text
        .replace(/\[([^[\]]*)\]\([^()\s]*\)/g, '$1')
        .replace(/`+/g, '')
        .replace(/^\s*#{1,6}\s+/gm, '')
        .replace(/^\s*(?:[-*+•]|\d{1,2}[.)])\s+/gm, '')
        .replace(/(^|[\s(])[*_]{1,3}(?=\S)/g, '$1')
        .replace(/(?<=\S)[*_]{1,3}(?=$|[\s.,!?;:)])/g, '')
        .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : '';
}

/**
 * Sounds a listener makes without wanting the floor. `yes` and `no` are left out: they are answers. So are `stop` and
 * `wait`, which must interrupt.
 */
const BACKCHANNEL_WORDS: ReadonlySet<string> = new Set([
    'mhm', 'mm', 'mmhm', 'mmhmm', 'hm', 'hmm', 'uh', 'huh', 'uhhuh', 'um', 'umm', 'uhm', 'er', 'erm', 'ah', 'oh',
    'yeah', 'yep', 'yup', 'okay', 'ok', 'right', 'alright', 'gotcha',
]);

/** Whether speech is only listening sounds ("mm-hm", "yeah, okay"). Empty speech is not. */
export function IsBackchannel(text: string): boolean {
    const words = text
        .toLowerCase()
        .replace(/(?<=\p{L})-(?=\p{L})/gu, '')
        .split(/[^\p{L}\p{N}']+/u)
        .filter((word) => word.length > 0);
    return words.length > 0 && words.every((word) => BACKCHANNEL_WORDS.has(word));
}

/** One spoken piece of a reply and when it plays. */
export interface SpokenSegment {
    Text: string;
    /** When its first audio plays, or null while it has no audio. */
    StartMs: number | null;
    /** When the audio received so far ends. */
    EndMs: number;
    /** Whether all of its audio has been received. */
    Done: boolean;
}

/** A usual speaking rate, for a segment whose full length is not known yet. */
const TYPICAL_CHARS_PER_SECOND = 15;

/** The part of a reply the listener had heard at `nowMs`, estimated from when each piece plays. Whole words only. */
export function HeardText(segments: readonly SpokenSegment[], nowMs: number): string {
    const heard: string[] = [];
    for (const segment of segments) {
        if (segment.StartMs === null || nowMs <= segment.StartMs) {
            break;
        }
        if (segment.Done && nowMs >= segment.EndMs) {
            heard.push(segment.Text);
            continue;
        }
        const partial = heardWords(segment, nowMs - segment.StartMs);
        if (partial.length > 0) {
            heard.push(partial);
        }
        break;
    }
    return heard.join(' ');
}

function heardWords(segment: SpokenSegment, playedMs: number): string {
    const typicalMs = (segment.Text.length / TYPICAL_CHARS_PER_SECOND) * 1000;
    const receivedMs = segment.EndMs - (segment.StartMs ?? 0);
    const totalMs = segment.Done ? receivedMs : Math.max(receivedMs, typicalMs);
    const share = totalMs > 0 ? Math.min(1, Math.min(playedMs, receivedMs) / totalMs) : 0;
    const words = segment.Text.split(/\s+/);
    return words.slice(0, Math.floor(words.length * share)).join(' ');
}
