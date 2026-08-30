import { NormalizeUUID } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJConversationDetailEntity,
    LoadDetailWindowParams,
    DetailWindowLoadResult
} from '@memberjunction/core-entities';
import { BuildConversationTimeline } from '../utils/realtime-session-timeline';
import {
    ConversationDetailWindowCursor,
    SelectLatestTimelinePage,
    DEFAULT_TRANSCRIPT_PAGE_SIZE,
    DEFAULT_RAW_OVERREAD,
    MAX_OVERREAD_ATTEMPTS,
    OVERREAD_GROWTH_FACTOR,
    MAX_REFRESH_BACKFILL_PAGES
} from '../utils/conversation-detail-window';

/**
 * The engine surface this store needs. Declared structurally rather than importing
 * ConversationEngine so tests can pass a plain `{ LoadDetailWindow: vi.fn() }` with no
 * TestBed and no engine bootstrap.
 */
export interface DetailWindowLoader {
    LoadDetailWindow(params: LoadDetailWindowParams, contextUser: UserInfo): Promise<DetailWindowLoadResult>;
}

/**
 * Peripheral data for the loaded window, keyed the way the chat area already consumes it.
 *
 * Accumulates across pages: an older page brings its own artifacts and ratings, which merge
 * into these maps rather than replacing them.
 */
export type ConversationDetailWindowPeripherals = Pick<
    DetailWindowLoadResult,
    'AgentRunsByDetailId' | 'UserAvatars' | 'RatingsByDetailId' | 'ArtifactsByDetailId'
>;

/**
 * What a tail refresh read, and whether it managed to reach back to the rows already loaded.
 *
 * `ReachedPreviousTail: false` is the "the conversation ran away from us" case — see
 * {@link MAX_REFRESH_BACKFILL_PAGES}. It is the only signal that the loaded set and the fresh
 * set do not join up, so it must not be dropped between the read and the merge.
 */
interface RefreshedTail {
    Results: DetailWindowLoadResult[];
    ReachedPreviousTail: boolean;
    /**
     * True when any read in the bridge failed.
     *
     * Kept separate from `ReachedPreviousTail: false`, which means "the tail is genuinely
     * further away than the budget allows" and legitimately discards the disconnected older
     * rows. A FAILED read must never trigger that — throwing away a reader's loaded history
     * because one query blipped is not a recovery, it is the bug wearing a different hat.
     */
    Failed: boolean;
}

/** What the chat area binds to after any store operation. */
export interface ConversationDetailWindowSnapshot extends ConversationDetailWindowPeripherals {
    ConversationID: string | null;
    /** Loaded rows, chronological by Sequence. A NEW array each call, so ngOnChanges fires. */
    Details: MJConversationDetailEntity[];
    Cursor: ConversationDetailWindowCursor;
    /** Pinned rows for the pins panel, INCLUDING pins older than the window. */
    PinnedDetails: MJConversationDetailEntity[];
    /**
     * TRUE total pins in the conversation, which is NOT `PinnedDetails.length` until the
     * panel has been opened — the open path reads only the count so the chip has a number
     * without hydrating anything.
     */
    PinnedTotalCount: number;
    IsLoadingLatest: boolean;
    IsLoadingOlder: boolean;
    /**
     * True when the most recent load FAILED, as opposed to returning nothing.
     *
     * Exists so an empty transcript can be told apart from a broken one. Without it a failed
     * first read renders as a conversation with no messages, which reads to the user as "my
     * conversation is gone" — the one failure mode worse than an error message.
     */
    LoadFailed: boolean;
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
    private pinnedTotalCount = 0;
    private peripherals: ConversationDetailWindowPeripherals = emptyPeripherals();
    private cursor: ConversationDetailWindowCursor = emptyCursor();
    private generation = 0;
    private isLoadingLatest = false;
    private isLoadingOlder = false;
    private loadFailed = false;

    constructor(loader: DetailWindowLoader) {
        this.loader = loader;
    }

    /** Drops all state and invalidates in-flight loads. Call on every conversation switch. */
    public Reset(conversationId: string | null): void {
        this.generation++;
        this.conversationId = conversationId;
        this.loadedDetails = [];
        this.pinnedDetails = [];
        this.pinnedTotalCount = 0;
        this.peripherals = emptyPeripherals();
        this.cursor = emptyCursor();
        this.isLoadingLatest = false;
        this.isLoadingOlder = false;
        this.loadFailed = false;
    }

    /**
     * Fetches a page, WIDENING the raw over-read until it yields a full page of timeline
     * items (or the conversation runs out).
     *
     * Raw rows are not display items: a realtime session folds many stamped rows into ONE
     * timeline card, so the default `3 × pageSize` over-read can come back holding two or
     * three items instead of ten. Taking that at face value gives the reader a stubby page
     * and makes the sentinel fire again immediately — which is worse than one wider read.
     *
     * Bounded by {@link MAX_OVERREAD_ATTEMPTS}: a conversation that is almost entirely one
     * long session would otherwise grow the read until it pulled the whole table.
     */
    private async fetchPageFillingTimeline(
        params: LoadDetailWindowParams,
        contextUser: UserInfo
    ): Promise<DetailWindowLoadResult> {
        let overread = DEFAULT_RAW_OVERREAD;
        let result = await this.loader.LoadDetailWindow({ ...params, RawOverread: overread }, contextUser);

        for (let attempt = 1; attempt < MAX_OVERREAD_ATTEMPTS; attempt++) {
            const itemCount = BuildConversationTimeline(result.Details).length;
            if (itemCount >= DEFAULT_TRANSCRIPT_PAGE_SIZE) {
                break;                      // already a full page of display items
            }
            if (result.Failed) {
                break;                      // widening a failed read just fails again
            }
            if (!result.HasMoreAbove) {
                break;                      // start of the conversation — short IS complete
            }
            // The decisive test: did the read actually HIT its row limit? A fetch that came
            // back under its own `MaxRows` has already returned everything available in that
            // range, so a wider read would return the identical rows. Only a fetch that filled
            // its limit can have been truncated by collapse, and only that is worth re-reading.
            if (result.Details.length < overread) {
                break;
            }

            overread *= OVERREAD_GROWTH_FACTOR;
            const wider = await this.loader.LoadDetailWindow({ ...params, RawOverread: overread }, contextUser);
            // A failed or non-productive retry must not discard the page we already have.
            if (!wider || wider.Details.length <= result.Details.length) {
                break;
            }
            result = wider;
        }
        return result;
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
            const result = await this.fetchPageFillingTimeline(
                { ConversationID: conversationId, PageSize: DEFAULT_TRANSCRIPT_PAGE_SIZE },
                contextUser
            );

            if (generation !== this.generation) {
                return;   // user switched conversations mid-flight
            }
            // The engine OVER-READS raw rows (a page of N rows can collapse to one session
            // card), so the fetch returns more than a page's worth. Slice to the newest
            // `pageSize` TIMELINE ITEMS here — this is what actually bounds the transcript.
            const page = SelectLatestTimelinePage(result.Details, DEFAULT_TRANSCRIPT_PAGE_SIZE);
            const droppedOlderRows = page.Page.length < result.Details.length;

            this.mergeDetails(page.Page);
            this.peripherals = peripheralsFrom(result);
            // A failed first read leaves the window empty. `LoadFailed` is what stops that
            // rendering as "this conversation has no messages" — there is no cursor to
            // protect here (an empty window cannot page), so the flag IS the whole remedy.
            this.loadFailed = result.Failed;
            this.cursor = {
                OldestSequence: page.OldestIncluded?.Sequence ?? result.OldestSequence,
                NewestSequence: result.NewestSequence,
                // Rows the slice discarded are older content that IS available — the engine's
                // probe only knows about rows below what it fetched, not below what we kept.
                HasMoreAbove: result.HasMoreAbove || droppedOlderRows
            };
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
            const result = await this.fetchPageFillingTimeline(
                { ConversationID: conversationId, BeforeSequence: before, PageSize: DEFAULT_TRANSCRIPT_PAGE_SIZE },
                contextUser
            );

            if (generation !== this.generation) {
                return;
            }
            this.loadFailed = result.Failed;
            if (result.Failed) {
                // Leave the cursor EXACTLY as it was. Folding a failed read's `HasMoreAbove:
                // false` into it would retire the "earlier messages" sentinel permanently —
                // the template unmounts it, the observer disconnects, and no later call ever
                // sets the flag back, so one transport blip costs the reader the rest of the
                // conversation's history with nothing said. The next sentinel fire retries.
                return;
            }

            // Same over-read slice as LoadLatest: keep the newest page of timeline items
            // from what came back, not every raw row.
            const page = SelectLatestTimelinePage(result.Details, DEFAULT_TRANSCRIPT_PAGE_SIZE);
            const droppedOlderRows = page.Page.length < result.Details.length;

            this.mergeDetails(page.Page);
            // Older pages bring their OWN artifacts/ratings/runs — merge, never replace,
            // or paging up would strip the peripherals off the rows already on screen.
            this.mergePeripherals(result);
            // Only the upward bound moves — the tail is whatever we already had.
            this.cursor = {
                OldestSequence: this.loadedDetails[0]?.Sequence ?? this.cursor.OldestSequence,
                NewestSequence: this.cursor.NewestSequence,
                HasMoreAbove: result.HasMoreAbove || droppedOlderRows
            };
        } finally {
            if (generation === this.generation) {
                this.isLoadingOlder = false;
            }
        }
    }

    /**
     * Re-fetches the tail and folds it into the existing window.
     *
     * The refresh-in-place counterpart to {@link LoadLatest}: used when something changed at
     * the tail (an agent finished, artifacts were written) and the transcript needs to pick
     * it up. Unlike `LoadLatest` it does NOT `Reset`, so a user who has paged up five times
     * keeps those pages instead of being yanked back to a 10-row tail.
     *
     * Reads via {@link fetchRefreshedTail}, which keeps paging down until it reaches rows the
     * window already holds — otherwise a conversation that grew by more than a page leaves a
     * hole in the middle of the merged set that nothing in the UI can reveal.
     */
    public async RefreshLatest(contextUser: UserInfo): Promise<void> {
        const conversationId = this.conversationId;
        if (!conversationId) {
            return;
        }
        const generation = this.generation;
        const previousOldest = this.cursor.OldestSequence;
        const previousNewest = this.cursor.NewestSequence;
        this.isLoadingLatest = true;

        try {
            const tail = await this.fetchRefreshedTail(
                conversationId, previousNewest, generation, contextUser
            );
            if (generation !== this.generation) {
                return;
            }
            this.loadFailed = tail.Failed;
            if (tail.Failed) {
                // Apply NOTHING. A bridge only reaches a second page because the first did not
                // join, so a failure part-way through means the fresh rows cannot be merged
                // without opening the very gap this method exists to close — and the fallback
                // for an unbridgeable tail discards loaded history, which is far too
                // destructive a response to a transient read error. Leave the window as it
                // was; the next refresh retries.
                return;
            }
            this.applyRefreshedTail(tail, previousOldest, previousNewest);
        } finally {
            if (generation === this.generation) {
                this.isLoadingLatest = false;
            }
        }
    }

    /**
     * Reads the newest page, then keeps paging down until the read reaches back to
     * `previousNewest` — the newest row the window already holds.
     *
     * One page is enough in the normal case: a refresh usually returns rows we already have
     * plus the handful that arrived since. The loop is for the case that is not normal, where
     * the tail has moved further than a page and a single read would land entirely above the
     * loaded set.
     *
     * @returns Every page read, plus whether the reads joined up with the loaded window.
     */
    private async fetchRefreshedTail(
        conversationId: string,
        previousNewest: number | null,
        generation: number,
        contextUser: UserInfo
    ): Promise<RefreshedTail> {
        const results: DetailWindowLoadResult[] = [];
        let before: number | undefined = undefined;

        for (let page = 0; page <= MAX_REFRESH_BACKFILL_PAGES; page++) {
            const result = await this.loader.LoadDetailWindow(
                { ConversationID: conversationId, BeforeSequence: before, PageSize: DEFAULT_TRANSCRIPT_PAGE_SIZE },
                contextUser
            );
            if (generation !== this.generation) {
                return { Results: results, ReachedPreviousTail: false, Failed: false }; // discarded
            }
            // Checked BEFORE tailIsJoined, which reads `HasMoreAbove` — false on a failed read,
            // which would report the bridge as joined and hand back a set with a hole in it.
            if (result.Failed) {
                return { Results: results, ReachedPreviousTail: false, Failed: true };
            }
            results.push(result);

            if (this.tailIsJoined(result, previousNewest)) {
                return { Results: results, ReachedPreviousTail: true, Failed: false };
            }
            before = result.OldestSequence ?? undefined;
        }
        return { Results: results, ReachedPreviousTail: false, Failed: false };
    }

    /** True when this page reaches back into the loaded window, so nothing sits between them. */
    private tailIsJoined(result: DetailWindowLoadResult, previousNewest: number | null): boolean {
        // Nothing loaded to join up WITH, or the read came back empty — either way, done.
        if (previousNewest === null || result.OldestSequence === null) {
            return true;
        }
        // The page overlaps or abuts what we hold.
        if (result.OldestSequence <= previousNewest) {
            return true;
        }
        // The engine's probe says no row exists below this page at all. The rows we hold are
        // below it, so they have since been deleted — there is no gap left to bridge.
        return !result.HasMoreAbove;
    }

    /**
     * Folds a refreshed tail into the window, choosing what to keep by whether the read
     * joined up with the rows already loaded.
     */
    private applyRefreshedTail(
        tail: RefreshedTail,
        previousOldest: number | null,
        previousNewest: number | null
    ): void {
        const fetched = tail.Results.flatMap(result => result.Details);
        const hasMoreAbove = this.mergeRefreshedRows(tail, fetched, previousOldest, previousNewest);

        for (const result of tail.Results) {
            this.mergePeripherals(result);
        }
        this.cursor = {
            OldestSequence: this.loadedDetails[0]?.Sequence ?? null,
            NewestSequence: this.loadedDetails[this.loadedDetails.length - 1]?.Sequence ?? null,
            HasMoreAbove: hasMoreAbove
        };
    }

    /** Merges the refreshed rows per the three refresh cases. @returns the new `HasMoreAbove`. */
    private mergeRefreshedRows(
        tail: RefreshedTail,
        fetched: MJConversationDetailEntity[],
        previousOldest: number | null,
        previousNewest: number | null
    ): boolean {
        if (previousNewest === null) {
            // Nothing loaded — this is a first paint wearing a refresh's name, so bound it to
            // a page the way LoadLatest does.
            const page = SelectLatestTimelinePage(fetched, DEFAULT_TRANSCRIPT_PAGE_SIZE);
            this.mergeDetails(page.Page);
            const last = tail.Results[tail.Results.length - 1];
            return (last?.HasMoreAbove ?? false) || page.Page.length < fetched.length;
        }

        if (tail.ReachedPreviousTail) {
            // Keep EVERY fetched row down to the window's existing floor. Slicing to a page
            // here is what opened the hole: the read deliberately spans the distance back to
            // the loaded tail, and discarding its middle throws away the very rows that make
            // the merged set contiguous. Rows below the floor are dropped so a refresh cannot
            // quietly grow the window downward — that is LoadOlder's job.
            this.mergeDetails(previousOldest === null
                ? fetched
                : fetched.filter(detail => detail.Sequence >= previousOldest));
            // The floor did not move, so what is below it is still whatever we last learned.
            return this.cursor.HasMoreAbove;
        }

        // Could not bridge within the page budget. Drop the now-disconnected older rows and
        // keep the fresh tail: a visible gap the sentinel can close beats an invisible one.
        this.loadedDetails = [];
        this.mergeDetails(fetched);
        return true;
    }

    /**
     * Cheap single-value reads for TEMPLATE binding.
     *
     * These exist because the chat area exposes `HasMoreAbove`, `IsLoadingOlder`,
     * `PinnedTotalCount`, and `PinnedDetails` as getters bound in its template, so every
     * change-detection cycle reads all four. Routing those through {@link GetSnapshot} copied
     * the whole loaded window four times per cycle — during streaming, per token — on a
     * component whose entire purpose is to stop doing work proportional to conversation length.
     *
     * {@link PinnedDetails} deliberately returns the internal array BY REFERENCE. Every mutator
     * replaces that array rather than mutating it, so the reference is stable between real
     * changes — which is precisely what keeps the pins panel's `ngOnChanges` from firing on
     * every cycle. Callers must not mutate it.
     */
    public get HasMoreAbove(): boolean {
        return this.cursor.HasMoreAbove;
    }

    public get IsLoadingOlder(): boolean {
        return this.isLoadingOlder;
    }

    public get IsLoadingLatest(): boolean {
        return this.isLoadingLatest;
    }

    public get PinnedTotalCount(): number {
        return this.pinnedTotalCount;
    }

    public get PinnedDetails(): readonly MJConversationDetailEntity[] {
        return this.pinnedDetails;
    }

    /** True when the most recent load failed — an empty transcript vs. a broken one. */
    public get LoadFailed(): boolean {
        return this.loadFailed;
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
        const pinnedBefore = this.pinnedDetails.length;
        this.pinnedDetails = this.pinnedDetails.filter(d => NormalizeUUID(d.ID) !== key);
        if (this.pinnedDetails.length < pinnedBefore) {
            this.pinnedTotalCount = Math.max(0, this.pinnedTotalCount - 1);
        }
    }

    /**
     * Records how many pins exist WITHOUT loading them.
     *
     * The conversation-open path calls only this: the chip needs a number, the panel needs
     * nothing until it is opened, and hydrating every pin on open re-imports the cost this
     * windowing work exists to remove.
     */
    public SetPinnedCount(total: number): void {
        this.pinnedTotalCount = Math.max(0, total);
    }

    /** Replaces the pins panel's contents. Pins outside the window are expected here. */
    public SetPinnedDetails(pins: MJConversationDetailEntity[]): void {
        this.pinnedDetails = [...pins];
        // Hydration is unbounded, so once it lands the loaded set IS the whole set — any
        // drift the local pin/unpin bookkeeping accumulated is reconciled here on purpose.
        this.pinnedTotalCount = pins.length;
    }

    /**
     * Reflects a pin/unpin the user just performed, without re-querying.
     *
     * Newly pinned rows go to the FRONT to match the panel's newest-pin-first order, which
     * the initial `Sequence DESC` fetch also produces.
     */
    public ApplyLocalPin(detail: MJConversationDetailEntity): void {
        const key = NormalizeUUID(detail.ID);
        const wasPinned = this.pinnedDetails.some(d => NormalizeUUID(d.ID) === key);
        const without = this.pinnedDetails.filter(d => NormalizeUUID(d.ID) !== key);
        this.pinnedDetails = detail.IsPinned ? [detail, ...without] : without;

        // Counted independently of the set: before the panel is opened `pinnedDetails` is
        // deliberately EMPTY, so deriving a count from its length would report zero pins on
        // a conversation that has many. `wasPinned` keeps the two in step — without it an
        // unpin of a row that was never in the set decrements a count it never entered.
        if (detail.IsPinned && !wasPinned) {
            this.pinnedTotalCount++;
        } else if (!detail.IsPinned && wasPinned) {
            this.pinnedTotalCount = Math.max(0, this.pinnedTotalCount - 1);
        }
    }

    /**
     * Everything the chat area needs to render, copied. Arrays are fresh so ngOnChanges fires.
     *
     * Call this from imperative paths (a load completing, a jump loop) — NOT from a template
     * getter. It copies the loaded set on every call, so binding it into change detection
     * pays that copy once per checked cycle for state that mostly has not moved. The cheap
     * single-value accessors above exist for exactly that case.
     */
    public GetSnapshot(): ConversationDetailWindowSnapshot {
        const details = [...this.loadedDetails];
        return {
            ConversationID: this.conversationId,
            Details: details,
            Cursor: { ...this.cursor },
            PinnedDetails: [...this.pinnedDetails],
            PinnedTotalCount: this.pinnedTotalCount,
            // Peripheral maps are handed out by reference — the chat area copies them into
            // its own UI-shaped maps (LazyArtifactInfo etc.) rather than mutating these.
            AgentRunsByDetailId: this.peripherals.AgentRunsByDetailId,
            UserAvatars: this.peripherals.UserAvatars,
            RatingsByDetailId: this.peripherals.RatingsByDetailId,
            ArtifactsByDetailId: this.peripherals.ArtifactsByDetailId,
            IsLoadingLatest: this.isLoadingLatest,
            IsLoadingOlder: this.isLoadingOlder,
            LoadFailed: this.loadFailed
        };
    }

    /**
     * Folds a newly-loaded page's peripherals into the accumulated maps.
     *
     * Later entries win on a key collision, which matters for a window refresh: a re-fetched
     * newest page should replace a row's stale agent run rather than keep the old one.
     */
    private mergePeripherals(incoming: ConversationDetailWindowPeripherals): void {
        for (const [id, run] of incoming.AgentRunsByDetailId) {
            this.peripherals.AgentRunsByDetailId.set(id, run);
        }
        for (const [id, avatar] of incoming.UserAvatars) {
            this.peripherals.UserAvatars.set(id, avatar);
        }
        for (const [id, ratings] of incoming.RatingsByDetailId) {
            this.peripherals.RatingsByDetailId.set(id, ratings);
        }
        for (const [id, artifacts] of incoming.ArtifactsByDetailId) {
            this.peripherals.ArtifactsByDetailId.set(id, artifacts);
        }
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

/** Empty peripheral maps — the reset / no-window state. */
function emptyPeripherals(): ConversationDetailWindowPeripherals {
    return {
        AgentRunsByDetailId: new Map(),
        UserAvatars: new Map(),
        RatingsByDetailId: new Map(),
        ArtifactsByDetailId: new Map()
    };
}

/** Copies a load result's peripheral maps into fresh maps the store then owns and merges into. */
function peripheralsFrom(result: DetailWindowLoadResult): ConversationDetailWindowPeripherals {
    return {
        AgentRunsByDetailId: new Map(result.AgentRunsByDetailId),
        UserAvatars: new Map(result.UserAvatars),
        RatingsByDetailId: new Map(result.RatingsByDetailId),
        ArtifactsByDetailId: new Map(result.ArtifactsByDetailId)
    };
}

/** The empty-window cursor. */
function emptyCursor(): ConversationDetailWindowCursor {
    return { OldestSequence: null, NewestSequence: null, HasMoreAbove: false };
}

// NOTE: there is deliberately no `cursorFrom(result)` helper. A cursor can never be copied
// straight off a load result, because the store slices the over-read page down to `pageSize`
// timeline items — so both the oldest bound and `HasMoreAbove` depend on what survived the
// slice, not on what the engine fetched.
