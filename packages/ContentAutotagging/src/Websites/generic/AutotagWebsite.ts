import { AutotagBase } from '../../Core';
import { AutotagBaseEngine, ContentSourceParams } from '../../Engine';
import { RegisterClass } from '@memberjunction/global';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';
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
    protected CrawlOtherSitesInTopLevelDomain: boolean;
    protected CrawlSitesInLowerLevelDomain: boolean;
    protected MaxDepth: number;
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
    public async Autotag(contextUser: UserInfo): Promise<void> {
        this.contextUser = contextUser;
        this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('Website', this.contextUser);
        const contentSources: MJContentSourceEntity[] = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID);
        const contentItemsToProcess: MJContentItemEntity[] = await this.SetContentItemsToProcess(contentSources);
        await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
    }


    /**
     * Given a content source, retrieve all content items associated with the content sources. 
     * The content items are then processed to determine if they have been modified since the last time they were processed or if they are new content items.
     * @param contentSource 
     * @returns 
     */
    public async SetContentItemsToProcess(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]> {
        const contentItemsToProcess: MJContentItemEntity[] = []
        
        // If content source parameters were provided, set them. Otherwise, use the default values.
        for (const contentSource of contentSources) {
            const contentSourceParamsMap = await this.engine.getContentSourceParams(contentSource, this.contextUser);
            if (contentSourceParamsMap) {
                // Override defaults with content source specific params
                contentSourceParamsMap.forEach((value, key) => {
                    if (key in this) {
                        (this as any)[key] = value;
                    }
                })
            }
            
            const contentSourceParams: ContentSourceParams = {
                contentSourceID: contentSource.ID, 
                name: contentSource.Name,
                ContentTypeID: contentSource.ContentTypeID,
                ContentFileTypeID: contentSource.ContentFileTypeID,
                ContentSourceTypeID: contentSource.ContentSourceTypeID,
                URL: contentSource.URL
            }

            try {
            
                // All content items associated with the content source
                const startURL: string = contentSourceParams.URL;

                // root url should be set to this.RootURL if it exists, otherwise it should be set to the base path of the startURL. 
                const rootURL: string = this.RootURL ? this.RootURL : this.getBasePath(startURL);

                // regex should be set to this.URLPattern if it exists, otherwise it should be set to match any URL.
                const regex: RegExp = this.URLPattern && new RegExp(this.URLPattern) || new RegExp('.*');
         
                const allContentItemLinks: string[] = await this.getAllLinksFromContentSource(startURL, rootURL, regex);
                const contentItems: MJContentItemEntity[] = await this.SetNewAndModifiedContentItems(allContentItemLinks, contentSourceParams, this.contextUser);
                if (contentItems && contentItems.length > 0) {
                    contentItemsToProcess.push(...contentItems);
                }
                else {
                    // No content items found to process
                    console.log(`No content items found to process for content source: ${contentSource.Get('Name')}`);
                }
            } catch (e) {
                console.error(`Failed to process content source: ${contentSource.Get('Name')}`);
            }
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
    protected async SetNewAndModifiedContentItems(contentItemLinks: string[], contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<MJContentItemEntity[]> { 

        const addedContentItems: MJContentItemEntity[] = [];
        for (const contentItemLink of contentItemLinks) {
            try {
                const newHash = await this.engine.getChecksumFromURL(contentItemLink);

                const rv = new RunView();
                const results = await rv.RunViews<MJContentItemEntity>([
                    {
                        EntityName: 'MJ: Content Items',
                        ExtraFilter: `Checksum = '${newHash}'`,
                        ResultType: 'entity_object'
                    }, 
                    {
                        EntityName: 'MJ: Content Items',
                        ExtraFilter: `ContentSourceID = '${contentSourceParams.contentSourceID}' AND URL = '${contentItemLink}'`,
                        ResultType: 'entity_object'
                    }
                ], this.contextUser)
                
                const contentItemResultsWithChecksum = results[0]
                const contentItemResultsWithURL = results[1]
                
                if (contentItemResultsWithChecksum.Success && contentItemResultsWithChecksum.Results.length) {
                    // We found the checksum so this content item has not changed since we last accessed it, do nothing
                    continue;
                }
                
                else if (contentItemResultsWithURL.Success && contentItemResultsWithURL.Results.length) {
                    // This content item already exists, update the hash and last updated date
                    const contentItemResult: MJContentItemEntity = contentItemResultsWithURL.Results[0]; 
                    const lastStoredHash: string = contentItemResult.Checksum
            
                    if (lastStoredHash !== newHash) {
                        // This content item has changed since we last access it, update the hash and last updated date
                        const md = new Metadata();
                        const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
                        contentItem.Load(contentItemResult.ID);
                        contentItem.Checksum = newHash
                        contentItem.Text = await this.parseWebPage(contentItemLink)
            
                        await contentItem.Save();
                        addedContentItems.push(contentItem); // Content item was modified, add to list
                    }
                }
                else {
                    // This content item does not exist, add it
                    const md = new Metadata();
                    const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
                    contentItem.ContentSourceID = contentSourceParams.contentSourceID
                    contentItem.Name = this.getPathName(contentItemLink) // Will get overwritten by title later if it exists
                    contentItem.Description = await this.engine.getContentItemDescription(contentSourceParams, this.contextUser)
                    contentItem.ContentTypeID = contentSourceParams.ContentTypeID
                    contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID
                    contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID
                    contentItem.Checksum = await this.engine.getChecksumFromURL(contentItemLink)
                    contentItem.URL = contentItemLink
                    contentItem.Text = await this.parseWebPage(contentItemLink)
                
                    await contentItem.Save();
                    addedContentItems.push(contentItem); // Content item was added, add to list
                }
                }catch (e) {
                    console.log(e)
                } 
        }
        return addedContentItems;
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
     * Given a URL, this function extracts text from a webpage. 
     * @param url 
     * @returns The text extracted from the webpage
     */
    public async parseWebPage(url: string): Promise<string> {
        try {
            const pageContent: string = await this.fetchPageContent(url);
            const $ = cheerio.load(pageContent);
            const text: string = this.getTextWithLineBreaks($('body')[0], $);
            return text;
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
    
        try {
            await this.getLowerLevelLinks(url, rootURL, this.MaxDepth, new Set<string>(), regex);
            await this.getTopLevelLinks(url, this.getBasePath(url));
            
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
    protected async getTopLevelLinks(url: string, rootURL: string): Promise<void> {
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
                    const newURL = new URL(link, url).href;
                    if (newURL.startsWith(rootURL) && !this.visitedURLs.has(newURL)) {
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
            // If we have already visited this URL, return an empty array
            if (scrapedURLs.has(url) || await this.urlIsValid(url) === false || crawlDepth < 0 || !this.CrawlSitesInLowerLevelDomain) {
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
                    const newURL = new URL(link, url).href;
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