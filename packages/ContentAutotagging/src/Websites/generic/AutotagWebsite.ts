import { AutotagBase, AutotagProgressCallback } from '../../Core';
import { AutotagBaseEngine, ContentSourceParams } from '../../Engine';
import { RunBudget } from '../../Engine/generic/RunBudget';
import { RegisterClass, NormalizeUUID } from '@memberjunction/global';
import { IMetadataProvider, UserInfo, Metadata, RunView, LogStatus } from '@memberjunction/core';
import { MJContentSourceEntity, MJContentItemEntity, MJContentSourceEntity_IContentSourceConfiguration } from '@memberjunction/core-entities';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { URL } from 'url';
import dotenv from 'dotenv';
dotenv.config({ quiet: true })

@RegisterClass(AutotagBase, 'AutotagWebsite')
export class AutotagWebsite extends AutotagBase {
    private contextUser: UserInfo;
    private engine: AutotagBaseEngine;
    protected contentSourceTypeID: string
    // Sensible defaults — overridable per content source via ContentSourceParam rows.
    // CrawlSitesInLowerLevelDomain=true + MaxDepth=2 means we crawl the start URL
    // plus two levels of in-domain links by default (~root + sections + content pages).
    // CrawlOtherSitesInTopLevelDomain stays false to avoid accidentally fanning out
    // across sibling paths of the seed URL unless explicitly opted in.
    protected CrawlOtherSitesInTopLevelDomain: boolean = false;
    protected CrawlSitesInLowerLevelDomain: boolean = true;
    protected MaxDepth: number = 2;
    protected RootURL: string;
    protected URLPattern: string;
    protected visitedURLs: Set<string>;

    /**
     * Per-source RunBudget tracker, keyed by normalized source ID. Items
     * processed in each batch are tallied against the budget of the source
     * they belong to; when any budget exhausts, the engine's OnAfterBatch
     * gate returns `continue:false` and the run pauses gracefully. Next
     * invocation will re-crawl, change-detection will skip the already-
     * processed pages, and the remaining ones get processed.
     */
    protected sourceBudgetMap: Map<string, RunBudget> = new Map();

    constructor() {
        super();
        this.engine = AutotagBaseEngine.Instance;
        this.visitedURLs = new Set<string>();
    }

    /**
     * Reset crawl-related instance fields back to the class defaults. Called at the
     * start of each content source so prior-source overrides don't leak forward.
     * URLPattern and RootURL default to undefined — derived later if unset.
     */
    protected applyDefaultCrawlSettings(): void {
        this.CrawlOtherSitesInTopLevelDomain = false;
        this.CrawlSitesInLowerLevelDomain = true;
        this.MaxDepth = 2;
        this.URLPattern = undefined as unknown as string;
        this.RootURL = undefined as unknown as string;
    }

    /**
     * Apply the typed `Configuration.Website` sub-object (if present) to this
     * crawler instance. Each field is optional — unset values leave the existing
     * (default) instance value intact.
     *
     * NOTE: pluggability — today this is hard-coded for AutotagWebsite. Once we
     * have more source types that need typed per-instance settings (RSS, Cloud
     * Storage, etc.), this pattern should be promoted to an
     * `IConfigurableContentSource<TConfig>` interface where each subclass declares
     * its typed config sub-object key and shape. For now this is the canonical
     * shape; other autotaggers can copy it when they need typed knobs.
     */
    protected applyWebsiteConfigFromSource(source: MJContentSourceEntity): void {
        const cfg = source.ConfigurationObject;
        if (!cfg) return;
        // `Website` is a new field on IContentSourceConfiguration; tolerate older
        // typed CodeGen output that doesn't know about it yet via an explicit cast.
        // Remove the cast after CodeGen regenerates the typed accessor.
        const extended = cfg as MJContentSourceEntity_IContentSourceConfiguration & {
            Website?: {
                MaxDepth?: number;
                CrawlSitesInLowerLevelDomain?: boolean;
                CrawlOtherSitesInTopLevelDomain?: boolean;
                URLPattern?: string;
                RootURL?: string;
            };
        };
        const w = extended.Website;
        if (!w) return;
        if (typeof w.MaxDepth === 'number' && Number.isFinite(w.MaxDepth)) this.MaxDepth = w.MaxDepth;
        if (typeof w.CrawlSitesInLowerLevelDomain === 'boolean') this.CrawlSitesInLowerLevelDomain = w.CrawlSitesInLowerLevelDomain;
        if (typeof w.CrawlOtherSitesInTopLevelDomain === 'boolean') this.CrawlOtherSitesInTopLevelDomain = w.CrawlOtherSitesInTopLevelDomain;
        if (typeof w.URLPattern === 'string' && w.URLPattern.length > 0) this.URLPattern = w.URLPattern;
        if (typeof w.RootURL === 'string' && w.RootURL.length > 0) this.RootURL = w.RootURL;
    }

    /**
     * Build a per-source RunBudget map from each source's ConfigurationObject.
     * Sources with no budget knobs set still get a RunBudget entry (with all
     * limits = null) so the OnAfterBatch hook can update item counts uniformly.
     *
     * Per-source overrides via ContentSourceParam rows (e.g., MaxItemsPerRun
     * stored as a param) take precedence over the ConfigurationObject value.
     */
    protected async setupRunBudgets(contentSources: MJContentSourceEntity[]): Promise<void> {
        this.sourceBudgetMap = new Map();
        for (const source of contentSources) {
            const id = NormalizeUUID(source.ID);
            const cfg: MJContentSourceEntity_IContentSourceConfiguration | null = source.ConfigurationObject;
            const params = await this.engine.getContentSourceParams(source, this.contextUser);

            // ContentSourceParam override beats ConfigurationObject — that
            // lets the per-source-instance UI knob win over the global
            // ContentSource defaults.
            const paramMaxItems = params?.get('MaxItemsPerRun');
            const paramMaxTokens = params?.get('MaxTokensPerRun');
            const paramMaxCost = params?.get('MaxCostPerRun');

            this.sourceBudgetMap.set(id, new RunBudget({
                MaxItemsPerRun: this.coerceNumber(paramMaxItems) ?? this.readConfigNumber(cfg, 'MaxItemsPerRun'),
                MaxNewTagsPerRun: this.readConfigNumber(cfg, 'MaxNewTagsPerRun'),
                MaxNewTagsPerItem: this.readConfigNumber(cfg, 'MaxNewTagsPerItem'),
                MaxTokensPerRun: this.coerceNumber(paramMaxTokens) ?? this.readConfigNumber(cfg, 'MaxTokensPerRun'),
                MaxCostPerRun: this.coerceNumber(paramMaxCost) ?? this.readConfigNumber(cfg, 'MaxCostPerRun'),
            }));
        }
    }

    private coerceNumber(value: unknown): number | null {
        if (value == null) return null;
        const n = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(n) ? n : null;
    }

    /**
     * Safely read a numeric budget knob from the typed configuration object.
     * `MaxItemsPerRun` is a transitional addition — the typed accessor on
     * MJContentSourceEntity may not include it yet on older CodeGen runs,
     * so we read it as an optional extension. Other knobs are stable typed
     * fields and the cast is just a tidiness aid.
     */
    private readConfigNumber(
        cfg: MJContentSourceEntity_IContentSourceConfiguration | null,
        key: 'MaxItemsPerRun' | 'MaxNewTagsPerRun' | 'MaxNewTagsPerItem' | 'MaxTokensPerRun' | 'MaxCostPerRun'
    ): number | null {
        if (!cfg) return null;
        const extended = cfg as MJContentSourceEntity_IContentSourceConfiguration & { MaxItemsPerRun?: number | null };
        const value = extended[key];
        return this.coerceNumber(value);
    }

    /**
     * Install the engine's OnAfterBatch hook so each batch's items are
     * counted against the budget of the source they belong to. Returns
     * `continue:false` from the gate when any source's budget exhausts,
     * which the engine then translates into a graceful pause.
     */
    protected installBudgetGate(): void {
        this.engine.OnAfterBatch = async (batch, _totalProcessed) => {
            // Tally items per source within this batch.
            const perSourceCounts = new Map<string, number>();
            for (const item of batch) {
                if (!item.ContentSourceID) continue;
                const id = NormalizeUUID(item.ContentSourceID);
                perSourceCounts.set(id, (perSourceCounts.get(id) ?? 0) + 1);
            }
            for (const [id, count] of perSourceCounts) {
                const budget = this.sourceBudgetMap.get(id);
                if (!budget) continue;
                budget.recordItemsProcessed(count);
                const verdict = budget.checkBudgets();
                if (!verdict.ok) {
                    return { continue: false, reason: `${verdict.reason}: ${verdict.details ?? ''}` };
                }
            }
            return { continue: true };
        };
    }

    protected getContextUser(): UserInfo {
        return this.contextUser;
    }

    /**
     * Implemented abstract method from the AutotagBase class. that runs the entire autotagging process. This method is the entry point for the autotagging process.
     * It initializes the connection, retrieves the content sources corresponding to the content source type, sets the content items that we want to process, 
     * extracts and processes the text, and sets the results in the database.
     */
    public async Autotag(contextUser: UserInfo, onProgress?: AutotagProgressCallback, contentSourceIDs?: string[], provider?: IMetadataProvider): Promise<number> {
        if (provider) this._provider = provider;
        this.contextUser = contextUser;
        this.contentSourceTypeID = this.engine.SetSubclassContentSourceType('Website');
        const contentSources: MJContentSourceEntity[] = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID);

        // Per-source budget setup — produces a RunBudget for each content
        // source and installs the OnAfterBatch gate on the engine so the
        // run pauses gracefully when any source exhausts its MaxItemsPerRun /
        // tokens / cost / tag budget.
        await this.setupRunBudgets(contentSources);
        this.installBudgetGate();

        // Stream content items source-by-source into the LLM batcher. The
        // crawl phase produces items as soon as they pass change-detection,
        // and the LLM phase consumes them in batches without waiting for the
        // last source to finish crawling. Wall-clock time becomes
        // max(crawl, classify) + a small buffer instead of crawl + classify.
        let itemsYielded = 0;
        const streamSource = this;
        const itemStream: AsyncIterable<MJContentItemEntity> = (async function*() {
            for await (const item of streamSource.streamContentItemsToProcess(contentSources)) {
                itemsYielded++;
                yield item;
            }
        })();

        try {
            await this.engine.ExtractTextAndProcessWithLLM(itemStream, this.contextUser, undefined, undefined, onProgress);
        } finally {
            // Clean up engine state — leaving stale hooks around would leak
            // budget state into the next Autotag invocation on a shared
            // engine singleton.
            this.engine.OnAfterBatch = null;
        }

        // Surface per-source budget pause reasons in the log so operators can
        // see why a run stopped short.
        for (const [sourceID, budget] of this.sourceBudgetMap) {
            const verdict = budget.checkBudgets();
            if (!verdict.ok) {
                LogStatus(`[autotag-website] Source ${sourceID} reached budget: ${verdict.reason} — ${verdict.details ?? ''}`);
            }
        }

        return itemsYielded;
    }


    /**
     * Streaming variant: yields each new/changed content item as soon as it
     * passes change detection. Lets the crawl and LLM phases overlap so total
     * wall-clock time is roughly max(crawl, classify) instead of crawl + classify.
     *
     * The canonical implementation lives here; the array-returning
     * `SetContentItemsToProcess` is a thin collector wrapper around this.
     */
    public async *streamContentItemsToProcess(contentSources: MJContentSourceEntity[]): AsyncIterable<MJContentItemEntity> {
        for (const contentSource of contentSources) {
            // Reset instance state to defaults before applying per-source overrides.
            // Without this, knobs set on the previous source would leak into the next.
            this.applyDefaultCrawlSettings();

            // First overlay: typed Configuration.Website sub-object (the structured editor
            // in the form writes here). This is the canonical storage for new sources.
            this.applyWebsiteConfigFromSource(contentSource);

            // Second overlay: per-source ContentSourceParam rows. These win — legacy
            // sources configured via the params grid (or anyone who wants a sharper
            // per-instance override) keep working.
            const contentSourceParamsMap = await this.engine.getContentSourceParams(contentSource, this.contextUser);
            if (contentSourceParamsMap) {
                contentSourceParamsMap.forEach((value, key) => {
                    if (key in this) {
                        (this as any)[key] = value;
                    }
                });
            }

            const contentSourceParams: ContentSourceParams = {
                contentSourceID: contentSource.ID,
                name: contentSource.Name,
                ContentTypeID: contentSource.ContentTypeID,
                ContentFileTypeID: contentSource.ContentFileTypeID,
                ContentSourceTypeID: contentSource.ContentSourceTypeID,
                URL: contentSource.URL
            };

            try {
                const startURL: string = contentSourceParams.URL;
                const rootURL: string = this.RootURL ? this.RootURL : this.getBasePath(startURL);
                const regex: RegExp = (this.URLPattern && new RegExp(this.URLPattern)) || new RegExp('.*');

                const allContentItemLinks: string[] = await this.getAllLinksFromContentSource(startURL, rootURL, regex);

                let yieldedForSource = 0;
                for (const link of allContentItemLinks) {
                    try {
                        const item = await this.processSingleURL(link, contentSourceParams);
                        if (item) {
                            yieldedForSource++;
                            yield item;
                        }
                    } catch (e) {
                        // Per-URL failures are isolated — log and keep going so a single
                        // bad page doesn't poison the rest of the source.
                        console.error(`[autotag-website] Failed to process URL ${link}:`, e);
                    }
                }

                if (yieldedForSource === 0) {
                    console.log(`No content items found to process for content source: ${contentSource.Get('Name')}`);
                }
            } catch (e) {
                console.error(`Failed to process content source: ${contentSource.Get('Name')}`);
            }
        }
    }

    /**
     * Given a content source, retrieve all content items associated with the content sources.
     * The content items are then processed to determine if they have been modified since the
     * last time they were processed or if they are new content items.
     *
     * Backwards-compatible array form. Internally drains the streaming variant
     * so there is exactly one implementation of the change-detection logic.
     */
    public async SetContentItemsToProcess(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]> {
        const contentItemsToProcess: MJContentItemEntity[] = [];
        for await (const item of this.streamContentItemsToProcess(contentSources)) {
            contentItemsToProcess.push(item);
        }
        return contentItemsToProcess;
    }

    /**
     * Given a list of content item links, check if the content item already exists in the database. 
     * If the content item exists, check if the content item has been modified since the last time it was processed.
     * If the content item does not exist, create a new content item and add it to the list of content items to process.
     * @param contentItemLinks 
     * @param contentSourceParams 
     * @param contextUser 
     * @returns 
     */
    /**
     * Backwards-compatible batch form: process an explicit list of URLs and
     * return all new/changed content items as an array. New code should prefer
     * `streamContentItemsToProcess` which pipelines into the LLM batcher.
     */
    protected async SetNewAndModifiedContentItems(contentItemLinks: string[], contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<MJContentItemEntity[]> {
        const addedContentItems: MJContentItemEntity[] = [];
        for (const link of contentItemLinks) {
            try {
                const item = await this.processSingleURL(link, contentSourceParams);
                if (item) addedContentItems.push(item);
            } catch (e) {
                console.log(e);
            }
        }
        return addedContentItems;
    }

    /**
     * Process one URL through the change-detection pipeline. Returns the
     * MJContentItem if the page is new or changed (caller should hand it off
     * to the LLM stage), or `null` if the page is unchanged.
     *
     * One axios.get per URL: the same response body provides both the
     * change-detection hash and the page text. Compare with `byChecksum`
     * scoped to the current ContentSource so identical boilerplate (404 pages,
     * shared error templates) from a *different* source can't silently mask
     * legitimate pages here.
     */
    protected async processSingleURL(url: string, contentSourceParams: ContentSourceParams): Promise<MJContentItemEntity | null> {
        const { text, checksum: newHash } = await this.fetchAndExtract(url);

        const rv = new RunView();
        const results = await rv.RunViews<MJContentItemEntity>([
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: `ContentSourceID = '${contentSourceParams.contentSourceID}' AND Checksum = '${newHash}'`,
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: `ContentSourceID = '${contentSourceParams.contentSourceID}' AND URL = '${url}'`,
                ResultType: 'entity_object'
            }
        ], this.contextUser);

        const byChecksum = results[0];
        const byURL = results[1];

        // Same content already in DB for this source — unchanged, skip.
        if (byChecksum.Success && byChecksum.Results.length) {
            return null;
        }

        // URL exists for this source but content has drifted — update in place.
        if (byURL.Success && byURL.Results.length) {
            const existing: MJContentItemEntity = byURL.Results[0];
            if (existing.Checksum === newHash) {
                return null;
            }
            const md = this.ProviderToUse;
            const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
            await contentItem.Load(existing.ID);
            contentItem.Checksum = newHash;
            contentItem.Text = text;
            await contentItem.Save();
            return contentItem;
        }

        // New URL — create the content item, reusing the already-fetched body.
        const md = this.ProviderToUse;
        const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
        contentItem.ContentSourceID = contentSourceParams.contentSourceID;
        contentItem.Name = this.getPathName(url); // Will get overwritten by title later if it exists
        contentItem.Description = this.engine.GetContentItemDescription(contentSourceParams);
        contentItem.ContentTypeID = contentSourceParams.ContentTypeID;
        contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID;
        contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID;
        contentItem.Checksum = newHash;
        contentItem.URL = url;
        contentItem.Text = text;
        await contentItem.Save();
        return contentItem;
    }

    public async fetchPageContent(url: string): Promise<string> {
        const { data } = await axios.get(url);
        return data;
    }

    public getTextWithLineBreaks(element: any, $: cheerio.CheerioAPI): string {
        let text = '';
        const children = $(element).contents();

        for (let i = 0; i < children.length; i++) {
            const el = children[i];
            if (el.type === 'text') {
                text += $(el).text().trim() + ' ';
            } else if (el.type === 'tag') {
                text += '\n' + this.getTextWithLineBreaks(el, $) + '\n';
            }
        }

        return text;
    }

    /**
     * Pure helper: extract clean body text from raw HTML. No IO. Exposed as
     * a protected method so subclasses and unit tests can exercise it without
     * monkey-patching axios.
     */
    protected extractTextFromHTML(html: string): string {
        const $ = cheerio.load(html);
        const body = $('body')[0];
        if (!body) return '';
        return this.getTextWithLineBreaks(body, $);
    }

    /**
     * Fetch a URL once, extract clean text, and compute a stable checksum
     * over that text. Returns both so callers don't have to fetch twice for
     * "is this changed?" + "what's the content?".
     *
     * The checksum is computed over the EXTRACTED body text, NOT the raw
     * HTML, because raw HTML routinely contains incidental changes (server
     * timestamps, CSRF tokens, build hashes, ad rotators) that would
     * falsely report a page as "changed" on every crawl. Hashing the
     * extracted text is what users actually mean by "did the content
     * change?"
     */
    public async fetchAndExtract(url: string): Promise<{ text: string; checksum: string }> {
        const { data } = await axios.get(url);
        const text = this.extractTextFromHTML(String(data));
        const checksum = await this.engine.getChecksumFromText(text);
        return { text, checksum };
    }

    /**
     * Given a URL, extracts text from a webpage. Kept for external callers
     * that just want the text — internal change-detection now uses
     * `fetchAndExtract` to avoid redundant fetches.
     */
    public async parseWebPage(url: string): Promise<string> {
        try {
            const pageContent: string = await this.fetchPageContent(url);
            return this.extractTextFromHTML(pageContent);
        }
        catch (error) {
            console.error(`Error processing ${url}:`, error);
            return '';
        }
    }

    /**
     * Given a root URL that corresponds to a content source, retrieve all the links in accordance to the crawl settings. 
     * If the crawl settings are set to crawl other sites in the top level domain, then all links in the top level domain will be retrieved.
     * If the crawl settings are set to crawl sites in lower level domains, then function is recursively called to retrieve all links in the lower level domains.
     * @param url 
     * @returns
     */
    protected async getAllLinksFromContentSource(url: string, rootURL: string, regex: RegExp): Promise<string[]> {
        // Start each content source with a clean visited set — otherwise URLs found
        // for one source silently get deduped away when the next source is crawled.
        this.visitedURLs = new Set<string>();

        // Normalize the seed URL once so all downstream comparisons share the same form.
        const seedURL = this.normalizeURL(url);

        try {
            await this.getLowerLevelLinks(seedURL, rootURL, this.MaxDepth, new Set<string>(), regex);
            await this.getTopLevelLinks(seedURL, this.getBasePath(seedURL), regex);

            return Array.from(this.visitedURLs);
        } catch (e) {
            console.error(`Failed to get links from ${url}`);
            return [];
        }
    }

    /**
     * For a given URL, retrieves all other links at that top level domain.
     * @param url 
     * @param rootURL 
     * @param visitedURLs 
     * @returns 
     */
    protected async getTopLevelLinks(url: string, rootURL: string, regex: RegExp): Promise<void> {
        if (!this.CrawlOtherSitesInTopLevelDomain) {
            this.visitedURLs.add(url);
            return
        }

        // If we have already visited this URL, return an empty array
        if (this.visitedURLs.has(url) || !await this.urlIsValid(url) || this.isHighestDomain(url)) {
            return
        }

        this.visitedURLs.add(url);

        try {
            const { data } = await axios.get(url);
            const $ = cheerio.load(data);

            // Get all links on the page for the current URL
            $('a').each((_, element) => {
                const link = $(element).attr('href');
                if (link) {
                    const newURL = this.normalizeURL(new URL(link, url).href);
                    if (newURL.startsWith(rootURL) && !this.visitedURLs.has(newURL) && regex.test(newURL)) {
                        this.visitedURLs.add(newURL);
                    }
                }
            });
            await this.delay(1000); // Delay to prevent rate limiting
        }
        catch (e) {
            console.error(`Failed to get links from ${url}`);
            return
        }
    }

    /**
     * Simple check to see if the URL is at the highest level domain.
     * @param url 
     * @returns 
     */
    protected isHighestDomain(url: string): boolean {
        try {
            const parsedURL: URL = new URL(url);
            return parsedURL.pathname === '/' || parsedURL.pathname === '';
        }
        catch (e) {
            console.error(`Invalid URL for same level parsing: ${url}`);
            throw e;
        }
    }

    protected getBasePath(url: string): string {
        const parsedURL: URL = new URL(url);
        const pathSegments: string[] = parsedURL.pathname.split('/').filter(segment => segment);
        if (pathSegments.length > 0) {
            pathSegments.pop(); //Remove last segment so that we are in the same level domain
        }
        const basePath = parsedURL.origin + '/' + pathSegments.join('/');
        return basePath;
    }
    
    // Creates a URL from input string and returns the path name in the form abc.com/xyz
    protected getPathName(url: string): string {
        try {
            const parsedURL: URL = new URL(url);
            const pathSegments: string[] = parsedURL.pathname.split('/').filter(segment => segment);
            const path = parsedURL.origin + '/' + pathSegments.join('/');
            return path
        }
        catch (e) {
            console.error(`Invalid URL for same level parsing: ${url}`);
            throw e;
        }
    }

    /**
     * Normalize a URL for use as a dedup key in `visitedURLs`. Conservative
     * normalization that catches the common variations without risking the merge
     * of two semantically distinct pages:
     *   - drops the fragment (always client-side per RFC 3986)
     *   - collapses trailing slash on the path (except the root "/")
     *   - sorts query parameters for stable equality
     *   - host is already lower-cased by URL parser
     * Path case is intentionally preserved — RFC 3986 says paths are case-sensitive
     * and some servers (wikis, certain Linux file fronts) actually treat them that way.
     */
    protected normalizeURL(href: string): string {
        try {
            const u = new URL(href);
            u.hash = '';
            if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
                u.pathname = u.pathname.slice(0, -1);
            }
            u.searchParams.sort();
            return u.href;
        }
        catch {
            return href;
        }
    }

    protected async urlIsValid(url: string): Promise<boolean> {
        try { 
            const response = await axios.head(url);
            return response.status === 200;
        }
        catch (e) {
            console.error(`Invalid URL: ${url}`);
            return false;
        }
    }

    /**
     * For a given URL, retrieves all links at lower level domains up to the specified crawl depth.
     * @param url 
     * @param rootURL 
     * @param crawlDepth 
     * @param visitedURLs 
     * @returns 
     */
    protected async getLowerLevelLinks(url: string, rootURL: string, crawlDepth: number, scrapedURLs: Set<string>, regex: RegExp): Promise<Set<string>> {
        
        try {
            console.log(`Scraping ${url}`);
            // If we have already visited this URL, return an empty array.
            // The Number.isFinite guard protects against accidental NaN/undefined
            // arriving as crawlDepth — without it, `undefined < 0` is false and the
            // recursion runs without a depth ceiling.
            if (scrapedURLs.has(url) || await this.urlIsValid(url) === false || !Number.isFinite(crawlDepth) || crawlDepth < 0 || !this.CrawlSitesInLowerLevelDomain) {
                return new Set<string>();
            }

            let combinedLinks = new Set<string>(); // Combined links from the current URL and all lower level URLs
            const extractedLinks = new Set<string>(); // Links extracted from the input URL

            const { data } = await axios.get(url);
            const $ = cheerio.load(data);

            // Get all links on the page for the current URL
            $('a').each((_, element) => {
                const link = $(element).attr('href');
                if (link) {
                    const newURL = this.normalizeURL(new URL(link, url).href);
                    if (newURL.startsWith(rootURL) && newURL !== url && !this.visitedURLs.has(newURL) && regex.test(newURL)) {
                        extractedLinks.add(newURL);
                        this.visitedURLs.add(newURL);
                    }
                }
            });
            await this.delay(1000); // Delay to prevent rate limiting
            scrapedURLs.add(url);

            // If we are at the depth limit, return the current set of URLs and don't recurse
            if (crawlDepth === 0) {
                return extractedLinks;
            }

            for (const subLink of extractedLinks) {
                //console.log(`Adding ${subLink}`);
                const lowerLevelLinks = await this.getLowerLevelLinks(subLink, rootURL, crawlDepth-1, scrapedURLs, regex);
                combinedLinks = new Set<string>([...extractedLinks, ...lowerLevelLinks]);
            }
            return combinedLinks;
        }
        catch (e) {
            console.error(`Failed to get links from ${url}`);
            return new Set<string>();
        }
    }

    protected async delay(ms: number) {
        return new Promise( resolve => setTimeout(resolve, ms) );
    }
}