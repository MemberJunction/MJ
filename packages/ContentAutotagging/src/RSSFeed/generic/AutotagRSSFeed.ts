import { IMetadataProvider, UserInfo, Metadata, RunView, DatabaseProviderBase, LogStatus, LogError } from '@memberjunction/core';
import { RegisterClass, NormalizeUUID } from '@memberjunction/global';
import { AutotagBase, AutotagProgressCallback } from '../../Core';
import { AutotagBaseEngine, ContentSourceParams } from '../../Engine';
import { MJContentSourceEntity, MJContentItemEntity } from '@memberjunction/core-entities';
import { RSSItem } from './RSS.types';
import axios from 'axios';
import crypto from 'crypto';
import Parser from 'rss-parser';

/**
 * Autotag provider for RSS and Atom feeds. Parses feed items, follows article
 * links to fetch full page content via Cheerio, and creates ContentItems with
 * the extracted article text rather than raw RSS metadata.
 *
 * Fixes:
 * - Text capture: follows item.link to fetch full article text instead of
 *   storing JSON.stringify(RSSItem)
 * - Item naming: uses the RSS item title for ContentItem.Name, and the RSS
 *   description for ContentItem.Description, instead of the source name
 */
@RegisterClass(AutotagBase, 'AutotagRSSFeed')
export class AutotagRSSFeed extends AutotagBase {
    private contextUser!: UserInfo;
    private engine!: AutotagBaseEngine;
    protected contentSourceTypeID!: string;

    constructor() {
        super();
        this.engine = AutotagBaseEngine.Instance;
    }

    public async Autotag(contextUser: UserInfo, onProgress?: AutotagProgressCallback, contentSourceIDs?: string[], provider?: IMetadataProvider): Promise<number> {
        if (provider) this._provider = provider;
        this.contextUser = contextUser;
        this.contentSourceTypeID = this.engine.SetSubclassContentSourceType('RSS Feed');
        LogStatus(`[RSS] Starting RSS autotag...`);
        const contentSources = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID);
        LogStatus(`[RSS] Found ${contentSources.length} RSS source(s)`);

        let contentItemsToProcess: MJContentItemEntity[];
        try {
            contentItemsToProcess = await this.SetContentItemsToProcess(contentSources);
            LogStatus(`[RSS] SetContentItemsToProcess returned ${contentItemsToProcess.length} items`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`[RSS] SetContentItemsToProcess THREW: ${msg}`);
            return 0;
        }

        if (contentItemsToProcess.length > 0) {
            LogStatus(`[RSS] Calling ExtractTextAndProcessWithLLM with ${contentItemsToProcess.length} items...`);
            try {
                await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser, undefined, undefined, onProgress);
                LogStatus(`[RSS] ExtractTextAndProcessWithLLM completed successfully`);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`[RSS] ExtractTextAndProcessWithLLM THREW: ${msg}`);
            }
        } else {
            LogStatus('[RSS] No new or modified feed items to process');
        }

        return contentItemsToProcess.length;
    }

    public async SetContentItemsToProcess(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]> {
        const contentItemsToProcess: MJContentItemEntity[] = [];

        for (const contentSource of contentSources) {
            try {
                const items = await this.ProcessContentSource(contentSource);
                contentItemsToProcess.push(...items);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`AutotagRSSFeed: failed to process source "${contentSource.Name}": ${msg}`);
            }
        }

        return contentItemsToProcess;
    }

    /**
     * Process a single content source: parse the RSS feed, detect new/modified
     * items, fetch full article text, and create/update ContentItems.
     */
    private async ProcessContentSource(contentSource: MJContentSourceEntity): Promise<MJContentItemEntity[]> {
        const contentSourceParams: ContentSourceParams = {
            contentSourceID: contentSource.ID,
            name: contentSource.Name ?? '',
            ContentTypeID: contentSource.ContentTypeID,
            ContentFileTypeID: contentSource.ContentFileTypeID,
            ContentSourceTypeID: contentSource.ContentSourceTypeID,
            URL: contentSource.URL
        };

        LogStatus(`[RSS] Parsing feed "${contentSource.Name}" at ${contentSourceParams.URL}...`);
        const allRSSItems = await this.ParseRSSFeed(contentSourceParams.URL);
        if (allRSSItems.length === 0) {
            LogStatus(`AutotagRSSFeed: no items in feed "${contentSource.Name}"`);
            return [];
        }
        LogStatus(`[RSS] Parsed ${allRSSItems.length} items from "${contentSource.Name}"`);

        // Load existing content items for upsert by URL
        const existingItems = await this.LoadExistingContentItems(contentSourceParams.contentSourceID);
        LogStatus(`[RSS] ${existingItems.size} existing items for "${contentSource.Name}"`);

        const items: MJContentItemEntity[] = [];
        for (let idx = 0; idx < allRSSItems.length; idx++) {
            const rssItem = allRSSItems[idx];
            try {
                LogStatus(`[RSS] Processing item ${idx + 1}/${allRSSItems.length}: "${rssItem.title?.substring(0, 60) ?? 'untitled'}"...`);
                const item = await this.ProcessSingleFeedItem(rssItem, contentSourceParams, existingItems);
                if (item) {
                    items.push(item);
                    LogStatus(`[RSS] Item ${idx + 1} created/updated (text: ${item.Text?.length ?? 0} chars)`);
                } else {
                    LogStatus(`[RSS] Item ${idx + 1} skipped (unchanged or empty)`);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`[RSS] Item ${idx + 1} FAILED "${rssItem.title ?? rssItem.link}": ${msg}`);
            }
        }

        LogStatus(`AutotagRSSFeed: ${items.length} new/modified items from "${contentSource.Name}"`);
        return items;
    }

    /**
     * Process a single RSS feed item: fetch full article text, compute checksum,
     * create or update the ContentItem.
     */
    private async ProcessSingleFeedItem(
        rssItem: RSSItem,
        contentSourceParams: ContentSourceParams,
        existingItems: Map<string, MJContentItemEntity>
    ): Promise<MJContentItemEntity | null> {
        // Fetch full article text from the link URL
        const articleText = await this.FetchArticleText(rssItem);
        if (!articleText || articleText.trim().length === 0) {
            return null;
        }

        const checksum = crypto.createHash('sha256').update(articleText).digest('hex');
        const itemUrl = rssItem.link ?? '';
        const urlKey = itemUrl.toLowerCase();

        // Check for existing content item (skip if unchanged, unless force reprocess)
        const existing = existingItems.get(urlKey);
        if (existing && existing.Checksum === checksum && !this.engine.ForceReprocess) {
            return null; // Content unchanged
        }

        const md = this.ProviderToUse;
        let contentItem: MJContentItemEntity;

        if (existing) {
            contentItem = existing;
        } else {
            contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
            contentItem.NewRecord();
            contentItem.ContentSourceID = contentSourceParams.contentSourceID;
            contentItem.ContentTypeID = contentSourceParams.ContentTypeID;
            contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID;
            contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID;
        }

        // Fix #6: Use RSS item title and description, not the source name
        contentItem.Name = rssItem.title ?? contentSourceParams.name;
        contentItem.Description = rssItem.description ?? this.engine.GetContentItemDescription(contentSourceParams);
        contentItem.URL = itemUrl;
        contentItem.Text = articleText;
        contentItem.Checksum = checksum;

        const saved = await contentItem.Save();
        if (!saved) {
            throw new Error(`Failed to save ContentItem for "${itemUrl}"`);
        }

        existingItems.set(urlKey, contentItem);
        return contentItem;
    }

    /**
     * Fetch the full article text for an RSS item.
     *
     * Strategy:
     * 1. If the RSS item has inline content (content:encoded), use that
     * 2. Otherwise, follow the item's link URL and extract text with Cheerio
     * 3. Fall back to the RSS description if link fetching fails
     */
    private async FetchArticleText(rssItem: RSSItem): Promise<string> {
        // 1. Prefer inline content if it's substantial (> 200 chars after HTML stripping)
        if (rssItem.content && rssItem.content.trim().length > 200) {
            return rssItem.content; // Already HTML-parsed by parseRSSFeed
        }

        // 2. Follow the link URL to get the full article
        if (rssItem.link) {
            try {
                const fullText = await this.FetchAndParseWebPage(rssItem.link);
                if (fullText && fullText.trim().length > 100) {
                    return fullText;
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                LogStatus(`AutotagRSSFeed: failed to fetch article from "${rssItem.link}": ${msg}`);
            }
        }

        // 3. Fall back to whatever content we have
        if (rssItem.content && rssItem.content.trim().length > 0) {
            return rssItem.content;
        }

        // 4. Last resort: use description (usually just a summary)
        return rssItem.description ?? '';
    }

    /**
     * Fetch a web page and extract its main text content using Cheerio.
     * Strips navigation, headers, footers, scripts, and styles.
     */
    private async FetchAndParseWebPage(url: string): Promise<string> {
        const response = await axios.get(url, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MemberJunction/1.0)',
                'Accept': 'text/html,application/xhtml+xml'
            }
        });

        if (typeof response.data !== 'string') {
            return '';
        }

        return this.engine.parseHTML(response.data);
    }

    /**
     * Parse an RSS/Atom feed URL and return structured items.
     * The content field is HTML-stripped via the engine's parseHTML.
     */
    public async ParseRSSFeed(url: string): Promise<RSSItem[]> {
        if (!await this.UrlIsValid(url)) {
            LogError(`AutotagRSSFeed: invalid feed URL: ${url}`);
            return [];
        }

        try {
            const parser = new Parser();
            const feed = await parser.parseURL(url);

            const items: RSSItem[] = [];
            for (const item of feed.items) {
                const rssItem = new RSSItem();
                rssItem.title = item.title ?? '';
                rssItem.link = item.link ?? '';
                rssItem.description = item.contentSnippet ?? item.description ?? '';
                rssItem.pubDate = item.pubDate ?? '';
                rssItem.guid = item.guid ?? '';
                rssItem.category = item.categories?.join(', ') ?? '';
                rssItem.author = item.creator ?? item.author ?? '';
                rssItem.comments = (item as Record<string, unknown>)['comments'] as string ?? '';
                rssItem.source = (item as Record<string, unknown>)['source'] as string ?? '';

                // Parse inline content (content:encoded or content)
                const rawContent = item['content:encoded'] ?? item.content ?? '';
                if (rawContent) {
                    rssItem.content = await this.engine.parseHTML(rawContent);
                }

                items.push(rssItem);
            }

            return items;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`AutotagRSSFeed: error parsing feed "${url}": ${msg}`);
            return [];
        }
    }

    /**
     * Check if a URL is reachable via HTTP HEAD request.
     */
    private async UrlIsValid(url: string): Promise<boolean> {
        try {
            const response = await axios.head(url, { timeout: 10000 });
            return response.status >= 200 && response.status < 400;
        } catch {
            return false;
        }
    }

    /**
     * Load existing ContentItems for this source, keyed by lowercase URL for upsert.
     */
    private async LoadExistingContentItems(contentSourceID: string): Promise<Map<string, MJContentItemEntity>> {
        const rv = new RunView();
        const result = await rv.RunView<MJContentItemEntity>({
            EntityName: 'MJ: Content Items',
            ExtraFilter: `ContentSourceID='${contentSourceID}'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        const map = new Map<string, MJContentItemEntity>();
        if (result.Success) {
            for (const ci of result.Results) {
                if (ci.URL) {
                    map.set(ci.URL.toLowerCase(), ci);
                }
            }
        }
        return map;
    }
}
