/**
 * @fileoverview Discover — what exists at a source.
 *
 * Discover runs over Content Source and produces working records for whatever content it finds. It
 * is the only stage whose input needs no other stage's output, and the only one whose records have
 * no prior identity.
 *
 * Walking a large source is the pipeline's longest-running unit of work, so a driver yields items as
 * it finds them rather than returning a list: that is what lets the stage report progress between
 * pages and stop cleanly when asked, without the driver knowing either concern exists.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';
import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { WellKnownField, WellKnownFieldValue } from '../WorkingRecord.types.js';

/** One field a driver determined directly, with how much it trusts it. */
export interface DiscoveredField {
    Field: WellKnownField;
    Value: WellKnownFieldValue;
    /** Higher is more trusted. A later stage's better finding overrides this; an equal one does not. */
    Confidence: number;
}

/** One piece of content a driver found. */
export interface DiscoveredItem {
    /**
     * The item's stable identity at the source — in practice its URL. Used as the working record's
     * ephemeral identity until it is committed, and afterwards to match a re-discovery against the
     * existing record.
     */
    URL: string;
    /**
     * A cheap fingerprint of the item's content, if the source can supply one without fetching it —
     * an ETag, a content hash, a size-and-modified-time pair.
     *
     * This is the pipeline's change signal: an item whose checksum matches what is stored is a
     * genuine no-op, and one whose checksum moved resets the field confidence so every later stage
     * reconsiders it. A driver that cannot produce one cheaply should leave it unset rather than
     * fetch the content to compute it — Extract will supply one from the text it reads.
     */
    Checksum?: string;
    /** Whatever well-known fields the driver could determine directly — a declared file type, a title, a date. */
    Fields?: DiscoveredField[];
    /**
     * Raise the completion signal on this item: nothing further needs to happen to it, whatever
     * stages might otherwise pick it up.
     *
     * For a source that hands back everything a use case needs — a structured API response with full
     * text attached has no reason to wait on Extract.
     */
    Complete?: boolean;
    /** Anything the driver wants a later stage in the same run to see, namespaced by the driver. */
    Extensions?: Record<string, unknown>;
}

/** What a driver is told about the source it is walking. */
export interface DiscoverRequest {
    /** The Content Source's primary key. */
    ContentSourceID: string;
    /** The source's URL column. */
    URL: string;
    /** `Configuration.SourceSpecificConfiguration`, flattened — keys match the type's `RequiredFields`. */
    Parameters: Readonly<Record<string, string>>;
    /** The source's full parsed `Configuration`, for a driver needing a typed sub-object. */
    Configuration: Readonly<Record<string, unknown>>;
    /** The acting user. */
    ContextUser: UserInfo;
    /** The provider to read through. */
    Provider: IMetadataProvider;
    /**
     * Fires when the run is asked to stop. A driver walking a large source checks this between
     * pages and returns, rather than throwing.
     */
    Signal: AbortSignal;
    /** Report progress — pages read, items found — so a long walk is visible while it runs. */
    ReportProgress(message: string): void;
}

/**
 * A registered way of finding out what exists at a source.
 *
 * @example
 * ```ts
 * @RegisterClass(BaseDiscoverDriver, 'RSS')
 * export class RssDiscoverDriver extends BaseDiscoverDriver {
 *     public readonly Key = 'RSS';
 *     public async *Discover(request: DiscoverRequest): AsyncIterable<DiscoveredItem> {
 *         for (const entry of await fetchFeed(request.URL)) {
 *             if (request.Signal.aborted) return;
 *             yield { URL: entry.link, Fields: [{ Field: 'Title', Value: entry.title, Confidence: 3 }] };
 *         }
 *     }
 * }
 * ```
 */
export abstract class BaseDiscoverDriver {
    /** The registration key. Must match the key passed to `@RegisterClass`. */
    public abstract readonly Key: string;

    /**
     * Walk the source, yielding each item as it is found.
     *
     * Yielding rather than returning is what keeps a large source's walk observable and
     * interruptible — the stage sees each item immediately, and the driver stays ignorant of both
     * concerns beyond honouring `Signal`.
     */
    public abstract Discover(request: DiscoverRequest): AsyncIterable<DiscoveredItem>;

    /** Resolve a registered driver by key, returning null rather than a hollow base instance. */
    public static Resolve(key: string): BaseDiscoverDriver | null {
        if (!key || key.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseDiscoverDriver>(
            BaseDiscoverDriver,
            key.trim(),
        );
        return result.Resolved ? result.Instance : null;
    }
}
