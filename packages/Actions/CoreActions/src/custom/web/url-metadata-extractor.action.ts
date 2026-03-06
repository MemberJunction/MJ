import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import axios, { AxiosResponse } from 'axios';

/**
 * Action that extracts comprehensive metadata from web pages including OpenGraph, Twitter Cards,
 * Schema.org structured data, and standard HTML meta tags
 * 
 * @example
 * ```typescript
 * // Extract all metadata from a webpage
 * await runAction({
 *   ActionName: 'URL Metadata Extractor',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://example.com/article'
 *   }]
 * });
 * 
 * // Extract specific metadata types
 * await runAction({
 *   ActionName: 'URL Metadata Extractor',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://news.site.com/story'
 *   }, {
 *     Name: 'IncludeOpenGraph',
 *     Value: true
 *   }, {
 *     Name: 'IncludeSchemaOrg',
 *     Value: false
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__URLMetadataExtractor")
export class URLMetadataExtractorAction extends BaseAction {

    private readonly TIMEOUT = 10000; // 10 seconds
    private readonly MAX_CONTENT_SIZE = 2 * 1024 * 1024; // 2MB limit

    /**
     * Executes metadata extraction from the specified URL
     * 
     * @param params - The action parameters containing:
     *   - URL: Web page URL to extract metadata from (required)
     *   - IncludeOpenGraph: Extract OpenGraph metadata (default: true)
     *   - IncludeTwitterCards: Extract Twitter Card metadata (default: true)
     *   - IncludeSchemaOrg: Extract Schema.org JSON-LD data (default: true)
     *   - IncludeBasicMeta: Extract standard HTML meta tags (default: true)
     *   - IncludeFavicon: Extract favicon information (default: true)
     * 
     * @returns Comprehensive metadata extracted from the webpage
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const urlParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'url');
            const includeOGParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'includeopengraph');
            const includeTwitterParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'includetwittercards');
            const includeSchemaParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'includeschemaorg');
            const includeBasicParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'includebasicmeta');
            const includeFaviconParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'includefavicon');

            if (!urlParam || !urlParam.Value) {
                return {
                    Success: false,
                    Message: "URL parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const url = urlParam.Value.toString().trim();
            const includeOpenGraph = includeOGParam?.Value !== false && includeOGParam?.Value !== 'false';
            const includeTwitterCards = includeTwitterParam?.Value !== false && includeTwitterParam?.Value !== 'false';
            const includeSchemaOrg = includeSchemaParam?.Value !== false && includeSchemaParam?.Value !== 'false';
            const includeBasicMeta = includeBasicParam?.Value !== false && includeBasicParam?.Value !== 'false';
            const includeFavicon = includeFaviconParam?.Value !== false && includeFaviconParam?.Value !== 'false';

            // Validate URL
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(url);
                if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                    throw new Error('Only HTTP and HTTPS URLs are supported');
                }
            } catch (error) {
                return {
                    Success: false,
                    Message: "Invalid URL format",
                    ResultCode: "INVALID_URL"
                };
            }

            // Fetch the webpage
            try {
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Cache-Control': 'max-age=0',
                        'Upgrade-Insecure-Requests': '1'
                    },
                    timeout: this.TIMEOUT,
                    maxContentLength: this.MAX_CONTENT_SIZE,
                    maxBodyLength: this.MAX_CONTENT_SIZE,
                    responseType: 'text',
                    validateStatus: (status) => status >= 200 && status < 400 // Only accept success status codes
                });

                const contentType = response.headers['content-type'] || '';
                if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
                    return {
                        Success: false,
                        Message: `URL does not return HTML content: ${contentType}`,
                        ResultCode: "NOT_HTML"
                    };
                }

                const html = response.data;
                
                if (html.length > this.MAX_CONTENT_SIZE) {
                    return {
                        Success: false,
                        Message: `Content too large: ${html.length} characters (max: ${this.MAX_CONTENT_SIZE})`,
                        ResultCode: "CONTENT_TOO_LARGE"
                    };
                }

                // Extract metadata
                const metadata = await this.extractAllMetadata(
                    html, 
                    parsedUrl, 
                    includeOpenGraph, 
                    includeTwitterCards, 
                    includeSchemaOrg, 
                    includeBasicMeta, 
                    includeFavicon
                );

                const result = {
                    url,
                    extractedAt: new Date().toISOString(),
                    options: {
                        includeOpenGraph,
                        includeTwitterCards,
                        includeSchemaOrg,
                        includeBasicMeta,
                        includeFavicon
                    },
                    metadata
                };

                return {
                    Success: true,
                    ResultCode: "SUCCESS",
                    Message: JSON.stringify(result, null, 2)
                };

            } catch (fetchError) {
                if (axios.isAxiosError(fetchError)) {
                    // Check for 404 or other HTTP errors
                    if (fetchError.response) {
                        return {
                            Success: false,
                            Message: `HTTP Error ${fetchError.response.status}: ${fetchError.response.statusText} for URL: ${url}`,
                            ResultCode: `HTTP_${fetchError.response.status}`
                        };
                    }
                    
                    if (fetchError.code === 'ECONNABORTED' || fetchError.code === 'ETIMEDOUT') {
                        return {
                            Success: false,
                            Message: `Request timed out after ${this.TIMEOUT}ms`,
                            ResultCode: "TIMEOUT"
                        };
                    }
                    if (fetchError.code === 'ENOTFOUND') {
                        return {
                            Success: false,
                            Message: `DNS lookup failed for URL: ${url}`,
                            ResultCode: "DNS_FAILURE"
                        };
                    }
                    if (fetchError.code === 'ECONNREFUSED') {
                        return {
                            Success: false,
                            Message: `Connection refused for URL: ${url}`,
                            ResultCode: "CONNECTION_REFUSED"
                        };
                    }
                }
                throw fetchError;
            }

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to extract metadata: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    /**
     * Extracts all types of metadata from HTML content
     */
    private async extractAllMetadata(
        html: string, 
        baseUrl: URL, 
        includeOpenGraph: boolean, 
        includeTwitterCards: boolean, 
        includeSchemaOrg: boolean, 
        includeBasicMeta: boolean, 
        includeFavicon: boolean
    ): Promise<any> {
        const metadata: any = {};

        if (includeBasicMeta) {
            metadata.basic = this.extractBasicMetadata(html);
        }

        if (includeOpenGraph) {
            metadata.openGraph = this.extractOpenGraphMetadata(html);
        }

        if (includeTwitterCards) {
            metadata.twitterCards = this.extractTwitterCardMetadata(html);
        }

        if (includeSchemaOrg) {
            metadata.schemaOrg = this.extractSchemaOrgMetadata(html);
        }

        if (includeFavicon) {
            metadata.favicon = this.extractFaviconMetadata(html, baseUrl);
        }

        // Additional extracted data
        metadata.links = this.extractLinks(html, baseUrl);
        metadata.images = this.extractImages(html, baseUrl);
        metadata.language = this.extractLanguage(html);
        metadata.viewport = this.extractViewport(html);

        return metadata;
    }

    /**
     * Extracts basic HTML metadata
     */
    private extractBasicMetadata(html: string): any {
        const basic: any = {};

        // Title
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
        if (titleMatch) {
            basic.title = this.cleanText(titleMatch[1]);
        }

        // Meta tags
        const metaRegex = /<meta[^>]+>/gi;
        const metas = html.match(metaRegex) || [];
        
        for (const meta of metas) {
            const nameMatch = meta.match(/name=['"]([^'"]+)['"]/i);
            const contentMatch = meta.match(/content=['"]([^'"]*)['"]/i);
            
            if (nameMatch && contentMatch) {
                const name = nameMatch[1].toLowerCase();
                const content = contentMatch[1];
                
                switch (name) {
                    case 'description':
                        basic.description = content;
                        break;
                    case 'keywords':
                        basic.keywords = content.split(',').map(k => k.trim());
                        break;
                    case 'author':
                        basic.author = content;
                        break;
                    case 'robots':
                        basic.robots = content;
                        break;
                    case 'copyright':
                        basic.copyright = content;
                        break;
                    default:
                        if (!basic.other) basic.other = {};
                        basic.other[name] = content;
                }
            }
        }

        return basic;
    }

    /**
     * Extracts OpenGraph metadata
     */
    private extractOpenGraphMetadata(html: string): any {
        const og: any = {};
        const ogRegex = /<meta[^>]+property=['"]og:([^'"]+)['"][^>]+content=['"]([^'"]*)['"]/gi;
        
        let match;
        while ((match = ogRegex.exec(html)) !== null) {
            const property = match[1];
            const content = match[2];
            
            // Handle nested properties (e.g., og:image:width)
            if (property.includes(':')) {
                const parts = property.split(':');
                let current = og;
                for (let i = 0; i < parts.length - 1; i++) {
                    // If the current value is a string (from a previous assignment),
                    // convert it to an object with a 'url' property
                    if (typeof current[parts[i]] === 'string') {
                        current[parts[i]] = { url: current[parts[i]] };
                    } else if (!current[parts[i]]) {
                        current[parts[i]] = {};
                    }
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = content;
            } else {
                og[property] = content;
            }
        }

        return og;
    }

    /**
     * Extracts Twitter Card metadata
     */
    private extractTwitterCardMetadata(html: string): any {
        const twitter: any = {};
        const twitterRegex = /<meta[^>]+name=['"]twitter:([^'"]+)['"][^>]+content=['"]([^'"]*)['"]/gi;
        
        let match;
        while ((match = twitterRegex.exec(html)) !== null) {
            const property = match[1];
            const content = match[2];
            twitter[property] = content;
        }

        return twitter;
    }

    /**
     * Extracts Schema.org JSON-LD structured data
     */
    private extractSchemaOrgMetadata(html: string): any[] {
        const schemas: any[] = [];
        const scriptRegex = /<script[^>]*type=['"]application\/ld\+json['"][^>]*>(.*?)<\/script>/gis;
        
        let match;
        while ((match = scriptRegex.exec(html)) !== null) {
            try {
                const jsonData = JSON.parse(match[1]);
                schemas.push(jsonData);
            } catch (error) {
                // Invalid JSON, skip
            }
        }

        return schemas;
    }

    /**
     * Extracts favicon information
     */
    private extractFaviconMetadata(html: string, baseUrl: URL): any {
        const favicon: any = {};
        const iconLinks: any[] = [];

        // Look for various favicon link tags
        const linkRegex = /<link[^>]+>/gi;
        const links = html.match(linkRegex) || [];
        
        for (const link of links) {
            const relMatch = link.match(/rel=['"]([^'"]+)['"]/i);
            const hrefMatch = link.match(/href=['"]([^'"]+)['"]/i);
            const sizesMatch = link.match(/sizes=['"]([^'"]+)['"]/i);
            
            if (relMatch && hrefMatch) {
                const rel = relMatch[1].toLowerCase();
                const href = hrefMatch[1];
                
                if (rel.includes('icon') || rel.includes('shortcut')) {
                    iconLinks.push({
                        rel,
                        href: this.resolveUrl(href, baseUrl),
                        sizes: sizesMatch ? sizesMatch[1] : null
                    });
                }
            }
        }

        if (iconLinks.length > 0) {
            favicon.icons = iconLinks;
            // Default favicon if none specified
            if (!iconLinks.some(icon => icon.href.includes('favicon.ico'))) {
                favicon.defaultIcon = this.resolveUrl('/favicon.ico', baseUrl);
            }
        } else {
            favicon.defaultIcon = this.resolveUrl('/favicon.ico', baseUrl);
        }

        return favicon;
    }

    /**
     * Extracts all links from the page
     */
    private extractLinks(html: string, baseUrl: URL): any[] {
        const links: any[] = [];
        const linkRegex = /<a[^>]+href=['"]([^'"]+)['"][^>]*>(.*?)<\/a>/gi;
        
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
            const href = match[1];
            const text = this.cleanText(match[2]);
            
            if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                links.push({
                    href: this.resolveUrl(href, baseUrl),
                    text,
                    isExternal: !href.startsWith('/') && !href.includes(baseUrl.hostname)
                });
            }
        }

        return links.slice(0, 50); // Limit to first 50 links
    }

    /**
     * Extracts image information
     */
    private extractImages(html: string, baseUrl: URL): any[] {
        const images: any[] = [];
        const imgRegex = /<img[^>]+>/gi;
        const imgs = html.match(imgRegex) || [];
        
        for (const img of imgs) {
            const srcMatch = img.match(/src=['"]([^'"]+)['"]/i);
            const altMatch = img.match(/alt=['"]([^'"]*)['"]/i);
            const titleMatch = img.match(/title=['"]([^'"]*)['"]/i);
            
            if (srcMatch) {
                images.push({
                    src: this.resolveUrl(srcMatch[1], baseUrl),
                    alt: altMatch ? altMatch[1] : '',
                    title: titleMatch ? titleMatch[1] : ''
                });
            }
        }

        return images.slice(0, 20); // Limit to first 20 images
    }

    /**
     * Extracts language information
     */
    private extractLanguage(html: string): string | null {
        const langMatch = html.match(/<html[^>]+lang=['"]([^'"]+)['"]/i);
        if (langMatch) {
            return langMatch[1];
        }
        
        const metaLangMatch = html.match(/<meta[^>]+http-equiv=['"]content-language['"][^>]+content=['"]([^'"]+)['"]/i);
        if (metaLangMatch) {
            return metaLangMatch[1];
        }
        
        return null;
    }

    /**
     * Extracts viewport information
     */
    private extractViewport(html: string): string | null {
        const viewportMatch = html.match(/<meta[^>]+name=['"]viewport['"][^>]+content=['"]([^'"]+)['"]/i);
        return viewportMatch ? viewportMatch[1] : null;
    }

    /**
     * Resolves relative URLs to absolute URLs
     */
    private resolveUrl(url: string, baseUrl: URL): string {
        try {
            return new URL(url, baseUrl).toString();
        } catch {
            return url;
        }
    }

    /**
     * Cleans and normalizes text content
     */
    private cleanText(text: string): string {
        return text
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
}