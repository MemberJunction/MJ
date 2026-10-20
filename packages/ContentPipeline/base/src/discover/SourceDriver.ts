/**
 * @fileoverview Request/response shapes for a Content Source Type driver's optional `Discover`,
 * `Fetch` and `OpenSession` methods. The driver is the type's `AutotagBase` subclass.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { WellKnownField, WellKnownFieldValue } from '../WorkingRecord.types.js';

/** An open session, cached for the run. Plain data, not a live client. */
export interface AccessArtifact {
    /** Headers to send — `Authorization`, `Cookie`. */
    Headers?: Readonly<Record<string, string>>;
    /** Query parameters to append, for sources that authenticate in the URL. */
    QueryParameters?: Readonly<Record<string, string>>;
    /** Origins (`https://host[:port]`) the session may go to. Unset means the source URL's origin only. */
    Origins?: readonly string[];
}

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
}

/** The source a driver is asked about. */
export interface SessionRequest {
    /** The Content Source's primary key. */
    ContentSourceID: string;
    /** The source's URL column. */
    URL: string;
    /** `Configuration.SourceSpecificConfiguration`, flattened to strings. */
    Parameters: Readonly<Record<string, string>>;
    /** The source's full parsed `Configuration`. */
    Configuration: Readonly<Record<string, unknown>>;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
}

/** What a driver is told when walking a source. */
export interface DiscoverRequest extends SessionRequest {
    /** The run's session for this source, or null when it needs none. */
    Access?: AccessArtifact | null;
    /**
     * When this source was last walked (`ContentSource.LastDiscoveredAt`), or `null`/`undefined` on a first walk
     * or an exhaustive `Sync` run. Drivers that can cheaply see modification timestamps skip unchanged items
     * older than `Since` and yield only new or modified items.
     */
    Since?: Date | null;
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

/** The bytes behind a locator. */
export interface LocatorFetchResponse {
    Content: Uint8Array;
    /** What the store said the bytes are. A weak signal, not a declaration. */
    ContentType?: string;
    /** A name to resolve a file type from — the path or object key. */
    ResolvedURL?: string;
}
