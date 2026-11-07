/** Total characters a seed may carry. Older whole entries are dropped beyond this. */
export const REALTIME_MEMORY_MAX_SEED_CHARS = 24_000;
/** Longest single Text / ArgumentsJson / OutputJson kept before the tail marker is added. */
export const REALTIME_MEMORY_MAX_ENTRY_CHARS = 2_000;
/** Appended to a payload that `Record` cut short. */
export const REALTIME_MEMORY_TRUNCATED_TAIL = '…[truncated]';

/** One final turn (or tool exchange) of a realtime conversation. */
export type RealtimeMemoryEntry =
    | { Kind: 'user'; Text: string }
    | { Kind: 'assistant'; Text: string }
    | { Kind: 'note'; Text: string }
    | { Kind: 'toolCall'; Name: string; ArgumentsJson: string }
    | { Kind: 'toolResult'; Name: string; OutputJson: string };

export interface RealtimeConversationMemoryOptions {
    /** Cap on total seed characters. Default `REALTIME_MEMORY_MAX_SEED_CHARS`. */
    MaxSeedChars?: number;
    /** Cap on one entry's payload. Default `REALTIME_MEMORY_MAX_ENTRY_CHARS`. */
    MaxEntryChars?: number;
    /** Receives one line when `Record` truncates an entry. Never carries content. */
    Log?: (message: string) => void;
}

/** What a resumed session is reseeded with. */
export interface RealtimeMemorySeed {
    /** Kept entries, oldest first. */
    readonly Entries: readonly RealtimeMemoryEntry[];
    /** Older entries left out to respect `MaxSeedChars`. */
    readonly DroppedEntries: number;
    /** Total characters of `Entries`. */
    readonly Chars: number;
}

/**
 * Provider-neutral notebook of final turns. A realtime provider that loses its
 * session (for example Gemini Live at its connection limit) reseeds the new
 * session from `Seed()`. Pure data: no I/O, no timers.
 */
export class RealtimeConversationMemory {
    private readonly maxSeedChars: number;
    private readonly maxEntryChars: number;
    private readonly log?: (message: string) => void;
    private entries: RealtimeMemoryEntry[] = [];

    constructor(options: RealtimeConversationMemoryOptions = {}) {
        this.maxSeedChars = options.MaxSeedChars ?? REALTIME_MEMORY_MAX_SEED_CHARS;
        this.maxEntryChars = options.MaxEntryChars ?? REALTIME_MEMORY_MAX_ENTRY_CHARS;
        this.log = options.Log;
    }

    /** Number of entries held. */
    public get Length(): number {
        return this.entries.length;
    }

    /** Adds an entry. Blank text is ignored; long payloads are truncated here so `Seed()` stays pure. */
    public Record(entry: RealtimeMemoryEntry): void {
        if (entry.Kind === 'user' || entry.Kind === 'assistant' || entry.Kind === 'note') {
            if (entry.Text.trim().length === 0) return;
            this.entries.push({ Kind: entry.Kind, Text: this.truncate(entry.Text, entry.Kind) });
            return;
        }
        if (entry.Kind === 'toolCall') {
            this.entries.push({ Kind: 'toolCall', Name: entry.Name, ArgumentsJson: this.truncate(entry.ArgumentsJson, `toolCall ${entry.Name}`) });
            return;
        }
        this.entries.push({ Kind: 'toolResult', Name: entry.Name, OutputJson: this.truncate(entry.OutputJson, `toolResult ${entry.Name}`) });
    }

    /** The newest entries that fit `MaxSeedChars`, oldest first. Does not change the notebook. */
    public Seed(): RealtimeMemorySeed {
        let chars = 0;
        let firstKept = this.entries.length;
        // Newest to oldest: stop at the first entry that overflows, so the kept run is contiguous.
        for (let i = this.entries.length - 1; i >= 0; i--) {
            const size = entryChars(this.entries[i]);
            if (chars + size > this.maxSeedChars) break;
            chars += size;
            firstKept = i;
        }
        return { Entries: this.entries.slice(firstKept), DroppedEntries: firstKept, Chars: chars };
    }

    /** Forgets everything. */
    public Clear(): void {
        this.entries = [];
    }

    private truncate(payload: string, label: string): string {
        if (payload.length <= this.maxEntryChars) return payload;
        this.log?.(`RealtimeConversationMemory: truncated ${label} entry from ${payload.length} to ${this.maxEntryChars} chars`);
        return payload.slice(0, this.maxEntryChars) + REALTIME_MEMORY_TRUNCATED_TAIL;
    }
}

function entryChars(entry: RealtimeMemoryEntry): number {
    switch (entry.Kind) {
        case 'toolCall':
            return entry.Name.length + entry.ArgumentsJson.length;
        case 'toolResult':
            return entry.Name.length + entry.OutputJson.length;
        default:
            return entry.Text.length;
    }
}
