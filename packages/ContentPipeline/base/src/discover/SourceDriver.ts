/**
 * @fileoverview Request/response shapes for a Content Source Type driver's `Discover` and `Fetch`
 * methods. The driver is the type's `AutotagBase` subclass.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { AccessArtifact } from '../access/BaseAccessDriver.js';
import { ResolvedConfidenceScale } from '../ConfidenceScale.js';
import { WellKnownField, WellKnownFieldValue } from '../WorkingRecord.types.js';

/** One field a driver determined directly, with how much it trusts it. */
export interface DiscoveredField {
    Field: WellKnownField;
    Value: WellKnownFieldValue;
    /** Higher is more trusted; a later stage's better finding overrides it. */
    Confidence: number;
}

/**
 * A downstream stage transition a driver or extractor may request for a Content Item:
 * - `'MetadataChanged'`: re-push vector metadata (`EmbeddingStatus = 'MetadataOnly'`) when already embedded, without re-extracting or re-embedding.
 * - `'Reextract'`: queue the item for extraction (`ExtractionStatus = 'Pending'`); Extract will compare the SHA-256 content hash to decide whether downstream stages need to re-run.
 * - `'Reprocess'`: force full re-extraction, re-tagging, re-segmentation, and re-embedding even if the extracted text hash is unchanged.
 */
export type PipelineStageRequest = 'MetadataChanged' | 'Reextract' | 'Reprocess';

/** One piece of content a driver found. */
export interface DiscoveredItem {
    /** The item's stable identity at the source (usually its URL); matches a re-discovery to its row. */
    URL: string;
    /** Well-known fields the listing determined directly. */
    Fields?: DiscoveredField[];
    /** Extra or custom columns on `MJ: Content Items` (validated against entity metadata; framework-owned columns are refused). */
    Columns?: Record<string, unknown>;
    /** Explicit request for downstream pipeline work on this item. */
    Request?: PipelineStageRequest;
    /** Nothing further needs to happen to this item. */
    Complete?: boolean;
    /** Anything a later stage in the same run should see, namespaced by the driver. */
    Extensions?: Record<string, unknown>;
    /**
     * The driver knows this locator is gone (the source reported a deletion, or a page now answers 404).
     * The source's top-level item at {@link URL} moves to `DeleteStatus = 'Pending'` without waiting for a
     * Sync, and the Delete stage removes it and its vectors. Only {@link URL} is read from a removed item.
     */
    Removed?: boolean;
}

/**
 * What a driver's `Discover` may return when it ends: a token saying where to carry on, when the walk is not
 * finished (it ran out of time, or reached a page limit). MJ keeps the token on the Content Source and hands
 * it back as {@link DiscoverRequest.ResumeToken} on the next walk. Returning nothing, or no token, means the
 * walk is finished.
 */
export interface DiscoverWalkEnd {
    ResumeToken?: string | null;
}

/** What a driver is told when walking a source. */
export interface DiscoverRequest {
    /** The Content Source's primary key. */
    ContentSourceID: string;
    /** The source's URL column. */
    URL: string;
    /** `Configuration.SourceSpecificConfiguration`, flattened to strings. */
    Parameters: Readonly<Record<string, string>>;
    /** The source's full parsed `Configuration`. */
    Configuration: Readonly<Record<string, unknown>>;
    /**
     * The run's `Configuration` (a Record Process run's options), which outranks the source's. Absent when the walk
     * was not started by a run. See {@link SourceConfigurationLayers}.
     */
    RunConfiguration?: Readonly<Record<string, unknown>>;
    /** The Content Source Type's `Configuration`, which the source's own settings outrank. */
    TypeConfiguration?: Readonly<Record<string, unknown>>;
    /** The run's session for this source, or null when it needs none. */
    Access?: AccessArtifact | null;
    /**
     * When this source was last walked (`ContentSource.LastDiscoveredAt` minus `ClockSkewOverlapMs`), or
     * `null`/`undefined` on a first walk or an exhaustive `Sync` run. Drivers that can cheaply see
     * modification timestamps skip unchanged items older than `Since` and yield only new or modified items.
     */
    Since?: Date | null;
    /** The resolved confidence scale for this source and run. */
    Confidence?: ResolvedConfidenceScale;
    /**
     * Where the previous walk of this source stopped: the token its `Discover` returned. `null` or absent on
     * a fresh walk. A resumed walk keeps the {@link Since} of the walk it continues.
     */
    ResumeToken?: string | null;
    /**
     * When the driver should stop and return a resume token (`Options.Tuning.DiscoverWalkBudgetMs` after the
     * walk started). Absent when no budget is set. A driver that cannot resume ignores it and runs to the end
     * or until {@link Signal} fires.
     */
    Deadline?: Date | null;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
    /** Fires when the run is asked to stop; a driver checks it between pages and returns. */
    Signal: AbortSignal;
    ReportProgress(message: string): void;
}

/** What a driver is asked to read back: one locator it produced. */
export interface LocatorFetchRequest {
    /** The locator the driver yielded as the item's URL — a path, an object key, a record id. */
    URL: string;
    ContentSourceID: string;
    /** The source's URL column — for a file source, the root its locators must stay inside. */
    SourceURL: string;
    Parameters: Readonly<Record<string, string>>;
    Configuration: Readonly<Record<string, unknown>>;
    Access?: AccessArtifact | null;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
    Signal: AbortSignal;
}

/** What a driver is asked to read back in one go: several locators it produced, for one session. */
export interface LocatorBatchFetchRequest extends Omit<LocatorFetchRequest, 'URL'> {
    /** The locators, as the driver yielded them. */
    URLs: readonly string[];
}

/** One locator's result from a batch fetch: its bytes, or why it could not be read. */
export interface LocatorBatchFetchResult {
    URL: string;
    Response?: LocatorFetchResponse;
    /** Why this locator could not be read. Its item fails or retries alone, as a single fetch's error would. */
    Error?: Error;
}

/** The bytes behind a locator. */
export interface LocatorFetchResponse {
    Content: Uint8Array;
    /** What the store said the bytes are. A weak signal, not a declaration. */
    ContentType?: string;
    /** A name to resolve a file type from — the path or object key. */
    ResolvedURL?: string;
}
