/**
 * Trusted, server-side version watermark for one collaboration room. It is recorded every time the
 * room persists, compacts or hydrates, and read back when a room for the same artifact is created
 * again, so a recreated room resumes from the version the server last saw instead of trusting
 * client-writable document metadata.
 */
export interface ServerPersistedWatermark {
    BaseVersionID: string | null;
    BaseVersionNumber: number;
    /** Full text of the base version (the whole document, sheet or slide payload). */
    BaseVersionText: string;
    LastAppliedRestoreVersionID: string | null;
    LastAppliedRestoreVersionNumber: number;
    UpdatedAtMs: number;
}

/** Limits for a {@link ServerWatermarkStore}. */
export interface ServerWatermarkStoreOptions {
    /** Most rooms to keep a watermark for. Defaults to {@link ServerWatermarkStore.DEFAULT_MAX_ENTRIES}. */
    MaxEntries?: number;
    /**
     * Most `BaseVersionText` to hold across all watermarks, in UTF-16 code units (`string.length`).
     * Defaults to {@link ServerWatermarkStore.DEFAULT_MAX_TEXT_LENGTH}.
     */
    MaxTextLength?: number;
}

/**
 * Bounded, least-recently-used store of {@link ServerPersistedWatermark}s keyed by room key.
 *
 * Watermarks deliberately outlive their room (the room is disposed 30 s after the last client
 * leaves; the watermark is what the next room for that artifact resumes from), so nothing removes
 * one when a room is torn down. Each one holds a full copy of the artifact's text, so a plain `Map`
 * kept every collaboratively edited artifact's content for the life of the process.
 *
 * Two limits apply, and the least recently used watermark is evicted while either is exceeded:
 * an entry count, and a total `BaseVersionText` budget. The most recent watermark is never evicted,
 * so one oversized artifact still gets its watermark.
 *
 * Losing a watermark is safe: a room created with none behaves exactly as it does after a server
 * restart or on another replica, where it resumes from the persisted working state and version rows.
 */
export class ServerWatermarkStore {
    public static readonly DEFAULT_MAX_ENTRIES = 512;
    /** 32M UTF-16 code units, about 64 MB of string data. */
    public static readonly DEFAULT_MAX_TEXT_LENGTH = 32 * 1024 * 1024;

    private readonly entries = new Map<string, ServerPersistedWatermark>();
    private readonly maxEntries: number;
    private readonly maxTextLength: number;
    private totalTextLength = 0;

    constructor(options: ServerWatermarkStoreOptions = {}) {
        this.maxEntries = ServerWatermarkStore.positiveIntegerOr(
            options.MaxEntries,
            ServerWatermarkStore.DEFAULT_MAX_ENTRIES
        );
        this.maxTextLength = ServerWatermarkStore.positiveIntegerOr(
            options.MaxTextLength,
            ServerWatermarkStore.DEFAULT_MAX_TEXT_LENGTH
        );
    }

    private static positiveIntegerOr(value: number | undefined, fallback: number): number {
        return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
    }

    /** Number of rooms a watermark is currently held for. */
    public get Size(): number {
        return this.entries.size;
    }

    /** Total `BaseVersionText` length currently held, in UTF-16 code units. */
    public get TotalTextLength(): number {
        return this.totalTextLength;
    }

    /** Returns the watermark for a room, marking it most recently used, or `undefined` when there is none. */
    public Get(roomKey: string): ServerPersistedWatermark | undefined {
        const watermark = this.entries.get(roomKey);
        if (watermark) {
            // Map keeps insertion order, so delete + re-insert moves the entry to the newest end.
            this.entries.delete(roomKey);
            this.entries.set(roomKey, watermark);
        }
        return watermark;
    }

    /** Records (or replaces) the watermark for a room, then evicts least recently used ones past the limits. */
    public Set(roomKey: string, watermark: ServerPersistedWatermark): void {
        this.remove(roomKey);
        this.entries.set(roomKey, watermark);
        this.totalTextLength += watermark.BaseVersionText.length;
        this.evictPastLimits();
    }

    /** Removes every watermark. */
    public Clear(): void {
        this.entries.clear();
        this.totalTextLength = 0;
    }

    private remove(roomKey: string): void {
        const existing = this.entries.get(roomKey);
        if (!existing) {
            return;
        }
        this.entries.delete(roomKey);
        this.totalTextLength -= existing.BaseVersionText.length;
    }

    private evictPastLimits(): void {
        while (
            this.entries.size > 1 &&
            (this.entries.size > this.maxEntries || this.totalTextLength > this.maxTextLength)
        ) {
            const oldestKey = this.entries.keys().next().value;
            if (oldestKey === undefined) {
                return;
            }
            this.remove(oldestKey);
        }
    }
}
