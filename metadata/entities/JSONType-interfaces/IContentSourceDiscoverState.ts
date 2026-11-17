/**
 * Where an unfinished Discover or Sync walk of a content source stopped (`ContentSource.DiscoverState`).
 *
 * Written by the content pipeline's Discover stage when a source's driver returns a resume token (the walk
 * ran past `Options.Tuning.DiscoverWalkBudgetMs`), read by the next walk, which carries on from it, and
 * cleared when a walk finishes. Not configuration: nothing but the pipeline should write it.
 */
export interface IContentSourceDiscoverState {
    /** The driver's token: where the walk stopped. Opaque to everything but the driver that wrote it. */
    ResumeToken: string;
    /**
     * When the walk's first part started (ISO 8601). `LastDiscoveredAt` (or `LastSyncedAt`) takes it once the
     * walk finishes, so a page changed while the walk was in progress is still seen as changed by the next walk.
     */
    WalkStartedAt: string;
    /** The mode the walk was started in. A walk resumes only in that mode; a walk of the other mode starts afresh. */
    Mode: 'Discover' | 'Sync';
    /** Items the walk's earlier parts found. */
    ItemsFound: number;
}
