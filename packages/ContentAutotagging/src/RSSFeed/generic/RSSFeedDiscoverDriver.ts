/**
 * @fileoverview The RSS feed walk, as a Discover driver.
 *
 * Lifted out of {@link AutotagRSSFeed} so the feed is parsed in one place and consumed twice: by the
 * autotagger, which fetches each article's text and saves it, and by the content pipeline's Discover
 * stage, which records what the feed advertised and leaves fetching to Extract.
 *
 * The split matters more here than elsewhere. The autotagger fetched every article body during
 * discovery in order to checksum it, so an unchanged feed still cost one HTTP request per entry. A
 * feed already publishes a per-entry identity — the guid, or the publication date — so the walk can
 * report what changed without fetching anything, and the pipeline only fetches entries that moved.
 *
 * @module @memberjunction/content-autotagging
 */

import Parser from 'rss-parser';
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseDiscoverDriver, DiscoverRequest, DiscoveredItem } from '@memberjunction/content-pipeline-base';

/** Registered under the name `ContentSourceType.DriverClass` already carries for this source type. */
@RegisterClass(BaseDiscoverDriver, 'AutotagRSSFeed')
export class RSSFeedDiscoverDriver extends BaseDiscoverDriver {
    public readonly Key = 'AutotagRSSFeed';

    public async *Discover(request: DiscoverRequest): AsyncIterable<DiscoveredItem> {
        let feed: Parser.Output<Record<string, unknown>>;
        try {
            feed = await new Parser().parseURL(request.URL);
        } catch (error) {
            throw new Error(
                `Could not parse RSS feed '${request.URL}': ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        let reported = 0;
        for (const entry of feed.items ?? []) {
            if (request.Signal.aborted) {
                return;
            }
            const link = entry.link ?? '';
            if (!link) {
                // An entry with no link has no stable identity, so there is nothing to re-match it
                // against on the next walk.
                LogError(`RSSFeedDiscoverDriver: skipping an entry with no link in '${request.URL}'`);
                continue;
            }
            const published = entry.pubDate ? new Date(entry.pubDate) : undefined;
            yield {
                URL: link,
                // guid is the feed's own statement of identity-and-version; pubDate is the fallback
                // when a feed does not set one. Either way, no article fetch.
                Checksum: (entry.guid as string | undefined) || entry.pubDate || undefined,
                Fields: [
                    ...(entry.title ? [{ Field: 'Title' as const, Value: entry.title, Confidence: 4 }] : []),
                    ...(published && !Number.isNaN(published.getTime())
                        ? [{ Field: 'Date' as const, Value: published, Confidence: 4 }]
                        : []),
                ],
                Extensions: {
                    Description: entry.contentSnippet ?? entry.description ?? '',
                    Author: entry.creator ?? entry.author ?? '',
                    Categories: entry.categories ?? [],
                },
            };
            reported++;
            if (reported % 25 === 0) {
                request.ReportProgress(`read ${reported} feed entries`);
            }
        }
    }
}
