import { NormalizeUUID } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJConversationDetailEntity,
    LoadDetailWindowParams,
    DetailWindowLoadResult
} from '@memberjunction/core-entities';
import { BuildConversationTimeline, ConversationTimelineItem } from '../utils/realtime-session-timeline';
import {
    ConversationDetailWindowCursor,
    DEFAULT_TRANSCRIPT_PAGE_SIZE
} from '../utils/conversation-detail-window';

/**
 * The engine surface this store needs. Declared structurally rather than importing
 * ConversationEngine so tests can pass a plain `{ LoadDetailWindow: vi.fn() }` with no
 * TestBed and no engine bootstrap.
 */
export interface DetailWindowLoader {
    LoadDetailWindow(params: LoadDetailWindowParams, contextUser: UserInfo): Promise<DetailWindowLoadResult>;
}

/** What the chat area binds to after any store operation. */
export interface ConversationDetailWindowSnapshot {
    ConversationID: string | null;
    /** Loaded rows, chronological by Sequence. A NEW array each call, so ngOnChanges fires. */
    Details: MJConversationDetailEntity[];
    /** Derived from Details — never independent state. */
    Timeline: ConversationTimelineItem<MJConversationDetailEntity>[];
    Cursor: ConversationDetailWindowCursor;
    /** Pinned rows for the pins panel, INCLUDING pins older than the window. */
    PinnedDetails: MJConversationDetailEntity[];
    IsLoadingLatest: boolean;
    IsLoadingOlder: boolean;
}

/**
 * Holds ONE conversation's loaded transcript window and the cursors for paging further back.
 *
 * Owned per chat-area instance (not a singleton) so two hosts can never share window state.
 *
 * Contracts:
 *  - {@link Reset} bumps a generation counter; every in-flight load checks it after each
 *    await and discards its result if the conversation changed underneath.
 *  - {@link LoadOlder} is a no-op while a load is in flight or when nothing is above.
 *  - Merges dedupe by normalized ID and re-sort by `Sequence` — session expansion can
 *    return rows an earlier page already had.
 *  - {@link ApplyLocalDetail} never hits the network; it is the send/stream/edit path.
 *  - Pins live in their own array. They are NOT unioned into the transcript, because a pin
 *    below the window's oldest Sequence would break contiguity and the paging cursor.
 */
export class ConversationDetailWindowStore {
    private loader: DetailWindowLoader;
    private conversationId: string | null = null;
    private loadedDetails: MJConversationDetailEntity[] = [];
    private pinnedDetails: MJConversationDetailEntity[] = [];
    private cursor: ConversationDetailWindowCursor = emptyCursor();
    private generation = 0;
    private isLoadingLatest = false;
    private isLoadingOlder = false;

    constructor(loader: DetailWindowLoader) {
        this.loader = loader;
    }

    /** Drops all state and invalidates in-flight loads. Call on every conversation switch. */
    public Reset(conversationId: string | null): void {
        this.generation++;
        this.conversationId = conversationId;
        this.loadedDetails = [];
        this.pinnedDetails = [];
        this.cursor = emptyCursor();
        this.isLoadingLatest = false;
        this.isLoadingOlder = false;
    }

    /**
     * First paint: the newest page of a conversation.
     *
     * The loader is not expected to throw — `LoadDetailWindow` logs and returns an empty
     * window on a failed read — but a transport-layer rejection would otherwise strand
     * `isLoadingLatest` at true and wedge the store, so the flag is cleared in `finally`.
     */
    public async LoadLatest(conversationId: string, contextUser: UserInfo): Promise<void> {
        this.Reset(conversationId);
        const generation = this.generation;
        this.isLoadingLatest = true;

        try {
            const result = await this.loader.LoadDetailWindow(
                { ConversationID: conversationId, PageSize: DEFAULT_TRANSCRIPT_PAGE_SIZE },
                contextUser
            );

            if (generation !== this.generation) {
                return;   // user switched conversations mid-flight
            }
            this.mergeDetails(result.Details);
            this.cursor = cursorFrom(result);
        } finally {
            // Guarded: a stale load must not clear a newer load's flag.
            if (generation === this.generation) {
                this.isLoadingLatest = false;
            }
        }
    }

    /**
     * Prepends the next older page. No-op when nothing is above or a load is running.
     *
     * `isLoadingOlder` is cleared in `finally` for the same reason as {@link LoadLatest} —
     * and it matters more here, because a stuck flag makes {@link CanLoadOlder} false
     * forever, which silently kills the transcript's "earlier messages" sentinel.
     */
    public async LoadOlder(contextUser: UserInfo): Promise<void> {
        if (!this.CanLoadOlder()) {
            return;
        }
        const generation = this.generation;
        const conversationId = this.conversationId as string;
        const before = this.cursor.OldestSequence as number;
        this.isLoadingOlder = true;

        try {
            const result = await this.loader.LoadDetailWindow(
                { ConversationID: conversationId, BeforeSequence: before, PageSize: DEFAULT_TRANSCRIPT_PAGE_SIZE },
                contextUser
            );

            if (generation !== this.generation) {
                return;
            }
            this.mergeDetails(result.Details);
            // Only the upward bound moves — the tail is whatever we already had.
            this.cursor = {
                OldestSequence: this.loadedDetails[0]?.Sequence ?? this.cursor.OldestSequence,
                NewestSequence: this.cursor.NewestSequence,
                HasMoreAbove: result.HasMoreAbove
            };
        } finally {
            if (generation === this.generation) {
                this.isLoadingOlder = false;
            }
        }
    }

    /** True when a `LoadOlder` would actually do work. Drives the sentinel's observer. */
    public CanLoadOlder(): boolean {
        return this.conversationId !== null
            && this.cursor.HasMoreAbove
            && this.cursor.OldestSequence !== null
            && !this.isLoadingOlder
            && !this.isLoadingLatest;
    }

    /**
     * Applies a locally-known row — sent, streamed, edited. Inserts or replaces by ID and
     * re-sorts. Never queries; the caller already has the entity.
     */
    public ApplyLocalDetail(detail: MJConversationDetailEntity): void {
        this.mergeDetails([detail]);
        const newest = this.loadedDetails[this.loadedDetails.length - 1]?.Sequence ?? null;
        this.cursor = { ...this.cursor, NewestSequence: newest };
    }

    /** Removes a row by ID — the delete path. */
    public RemoveDetail(detailId: string): void {
        const key = NormalizeUUID(detailId);
        this.loadedDetails = this.loadedDetails.filter(d => NormalizeUUID(d.ID) !== key);
        this.pinnedDetails = this.pinnedDetails.filter(d => NormalizeUUID(d.ID) !== key);
    }

    /** Replaces the pins panel's contents. Pins outside the window are expected here. */
    public SetPinnedDetails(pins: MJConversationDetailEntity[]): void {
        this.pinnedDetails = [...pins];
    }

    /** Everything the chat area needs to render. Arrays are fresh so ngOnChanges fires. */
    public GetSnapshot(): ConversationDetailWindowSnapshot {
        const details = [...this.loadedDetails];
        return {
            ConversationID: this.conversationId,
            Details: details,
            Timeline: BuildConversationTimeline(details),
            Cursor: { ...this.cursor },
            PinnedDetails: [...this.pinnedDetails],
            IsLoadingLatest: this.isLoadingLatest,
            IsLoadingOlder: this.isLoadingOlder
        };
    }

    /**
     * Union-merges rows into the loaded set: replace-by-ID, then sort by `Sequence`.
     * Dedupe is required because session expansion can re-return rows a prior page held.
     */
    private mergeDetails(incoming: MJConversationDetailEntity[]): void {
        const byId = new Map<string, MJConversationDetailEntity>();
        for (const detail of this.loadedDetails) {
            byId.set(NormalizeUUID(detail.ID), detail);
        }
        for (const detail of incoming) {
            byId.set(NormalizeUUID(detail.ID), detail);
        }
        this.loadedDetails = [...byId.values()].sort((a, b) => a.Sequence - b.Sequence);
    }
}

/** The empty-window cursor. */
function emptyCursor(): ConversationDetailWindowCursor {
    return { OldestSequence: null, NewestSequence: null, HasMoreAbove: false };
}

/** Cursor for a freshly-loaded latest window. */
function cursorFrom(result: DetailWindowLoadResult): ConversationDetailWindowCursor {
    return {
        OldestSequence: result.OldestSequence,
        NewestSequence: result.NewestSequence,
        HasMoreAbove: result.HasMoreAbove
    };
}
