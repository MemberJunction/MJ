import { AutotagBase, AutotagProgressCallback } from '../../Core';
import { AutotagBaseEngine, ContentSourceParams } from '../../Engine';
import { RegisterClass } from '@memberjunction/global';
import { IMetadataProvider, UserInfo, Metadata, RunView } from '@memberjunction/core';
import { MJContentSourceEntity, MJContentItemEntity } from '@memberjunction/core-entities';
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

    constructor() {
        super();
        this.engine = AutotagBaseEngine.Instance;
        this.visitedURLs = new Set<string>();
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

        await this.engine.ExtractTextAndProcessWithLLM(itemStream, this.contextUser, undefined, undefined, onProgress);
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
            // Apply per-source params (MaxDepth, CrawlSitesInLowerLevelDomain, etc.)
            // before crawling. Params are stored as instance fields so the crawler
            // helpers (which already exist on `this`) pick them up automatically.
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