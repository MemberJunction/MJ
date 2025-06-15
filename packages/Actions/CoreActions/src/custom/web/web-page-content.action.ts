import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";

/**
 * Action that retrieves and processes web page content with various output formats
 * Supports text extraction, HTML parsing, and basic document conversion
 * 
 * @example
 * ```typescript
 * // Get page content as text
 * await runAction({
 *   ActionName: 'Web Page Content',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://example.com'
 *   }, {
 *     Name: 'ContentType',
 *     Value: 'text'
 *   }]
 * });
 * 
 * // Get main content only (removes navigation, ads, etc.)
 * await runAction({
 *   ActionName: 'Web Page Content',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://news.example.com/article'
 *   }, {
 *     Name: 'ContentType',
 *     Value: 'markdown'
 *   }, {
 *     Name: 'ExtractMainContent',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__WebPageContent")
export class WebPageContentAction extends BaseAction {

    private readonly MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5MB limit
    private readonly MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB limit for images

    /**
     * Executes the web page content retrieval and processing
     * 
     * @param params - The action parameters containing:
     *   - URL: Web page URL to fetch (required)
     *   - ContentType: Output format - 'text', 'html', 'markdown', 'json' (default: 'text')
     *   - ExtractMainContent: Extract only main content vs full page (default: false)
     *   - IncludeMetadata: Include page metadata in response (default: true)
     *   - MaxContentLength: Maximum content length to return (default: 50000 chars)
     * 
     * @returns Processed web page content in the specified format
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const urlParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'url');
            const contentTypeParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'contenttype');
            const extractMainParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'extractmaincontent');
            const includeMetadataParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'includemetadata');
            const maxLengthParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'maxcontentlength');

            if (!urlParam || !urlParam.Value) {
                return {
                    Success: false,
                    Message: "URL parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const url = urlParam.Value.toString().trim();
            const contentType = contentTypeParam?.Value?.toString().toLowerCase() || 'text';
            const extractMain = extractMainParam?.Value === true || extractMainParam?.Value === 'true';
            const includeMetadata = includeMetadataParam?.Value !== false && includeMetadataParam?.Value !== 'false';
            const maxLength = parseInt(maxLengthParam?.Value?.toString() || '50000');

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

            // Validate content type
            if (!['text', 'html', 'markdown', 'json'].includes(contentType)) {
                return {
                    Success: false,
                    Message: "ContentType must be one of: text, html, markdown, json",
                    ResultCode: "INVALID_CONTENT_TYPE"
                };
            }

            // Fetch the web page
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; MemberJunction/1.0; +https://memberjunction.org)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate'
                },
                redirect: 'follow'
            });

            if (!response.ok) {
                return {
                    Success: false,
                    Message: `Failed to fetch URL: ${response.status} ${response.statusText}`,
                    ResultCode: "FETCH_FAILED"
                };
            }

            // Check content type and size
            const responseContentType = response.headers.get('content-type') || '';
            const contentLength = parseInt(response.headers.get('content-length') || '0');

            if (contentLength > this.MAX_CONTENT_SIZE) {
                return {
                    Success: false,
                    Message: `Content too large: ${contentLength} bytes (max: ${this.MAX_CONTENT_SIZE})`,
                    ResultCode: "CONTENT_TOO_LARGE"
                };
            }

            // Handle different content types
            if (responseContentType.startsWith('image/')) {
                if (contentLength > this.MAX_IMAGE_SIZE) {
                    return {
                        Success: false,
                        Message: `Image too large: ${contentLength} bytes (max: ${this.MAX_IMAGE_SIZE})`,
                        ResultCode: "IMAGE_TOO_LARGE"
                    };
                }
                
                // For images, return base64 encoded data
                const buffer = await response.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                
                const result = {
                    url,
                    contentType: responseContentType,
                    contentLength,
                    isImage: true,
                    base64Data: base64,
                    dataUrl: `data:${responseContentType};base64,${base64}`
                };

                return {
                    Success: true,
                    ResultCode: "SUCCESS",
                    Message: JSON.stringify(result, null, 2)
                };
            }

            // Handle text-based content
            if (!responseContentType.includes('text/html') && !responseContentType.includes('application/xhtml') && !responseContentType.includes('text/')) {
                return {
                    Success: false,
                    Message: `Unsupported content type: ${responseContentType}`,
                    ResultCode: "UNSUPPORTED_CONTENT_TYPE"
                };
            }

            const html = await response.text();
            
            if (html.length > this.MAX_CONTENT_SIZE) {
                return {
                    Success: false,
                    Message: `Content too large: ${html.length} characters (max: ${this.MAX_CONTENT_SIZE})`,
                    ResultCode: "CONTENT_TOO_LARGE"
                };
            }

            // Process the content based on requested format
            const processedContent = await this.processContent(html, contentType, extractMain, includeMetadata, maxLength);
            processedContent.url = url;
            processedContent.fetchedAt = new Date().toISOString();

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(processedContent, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to retrieve web page content: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    /**
     * Processes HTML content into the requested format
     */
    private async processContent(html: string, contentType: string, extractMain: boolean, includeMetadata: boolean, maxLength: number): Promise<any> {
        const result: any = {
            contentType,
            extractMainContent: extractMain,
            includeMetadata
        };

        // Extract metadata if requested
        if (includeMetadata) {
            result.metadata = this.extractMetadata(html);
        }

        // Extract main content or use full HTML
        let contentHtml = html;
        if (extractMain) {
            contentHtml = this.extractMainContent(html);
        }

        // Convert based on content type
        switch (contentType) {
            case 'html':
                result.content = this.truncateContent(contentHtml, maxLength);
                break;
            case 'text':
                result.content = this.truncateContent(this.htmlToText(contentHtml), maxLength);
                break;
            case 'markdown':
                result.content = this.truncateContent(this.htmlToMarkdown(contentHtml), maxLength);
                break;
            case 'json':
                result.content = {
                    html: this.truncateContent(contentHtml, maxLength),
                    text: this.truncateContent(this.htmlToText(contentHtml), maxLength),
                    structure: this.extractStructure(contentHtml)
                };
                break;
        }

        result.contentLength = typeof result.content === 'string' ? result.content.length : JSON.stringify(result.content).length;

        return result;
    }

    /**
     * Extracts page metadata from HTML
     */
    private extractMetadata(html: string): any {
        const metadata: any = {};

        // Title
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
        if (titleMatch) {
            metadata.title = this.stripHtml(titleMatch[1]).trim();
        }

        // Meta tags
        const metaRegex = /<meta[^>]+>/gi;
        const metas = html.match(metaRegex) || [];
        
        for (const meta of metas) {
            const nameMatch = meta.match(/name=['"]([^'"]+)['"]/i);
            const propertyMatch = meta.match(/property=['"]([^'"]+)['"]/i);
            const contentMatch = meta.match(/content=['"]([^'"]*)['"]/i);
            
            if (contentMatch) {
                const content = contentMatch[1];
                if (nameMatch) {
                    metadata[nameMatch[1]] = content;
                } else if (propertyMatch) {
                    metadata[propertyMatch[1]] = content;
                }
            }
        }

        // Canonical URL
        const canonicalMatch = html.match(/<link[^>]+rel=['"]canonical['"][^>]+href=['"]([^'"]+)['"]/i);
        if (canonicalMatch) {
            metadata.canonical = canonicalMatch[1];
        }

        return metadata;
    }

    /**
     * Attempts to extract main content from HTML (removes navigation, ads, etc.)
     */
    private extractMainContent(html: string): string {
        // Remove scripts and styles
        let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        
        // Try to find main content containers
        const mainSelectors = [
            /<main[^>]*>([\s\S]*?)<\/main>/i,
            /<article[^>]*>([\s\S]*?)<\/article>/i,
            /<div[^>]*class=['"][^'"]*content[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i,
            /<div[^>]*id=['"][^'"]*content[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i,
            /<div[^>]*class=['"][^'"]*post[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i
        ];

        for (const selector of mainSelectors) {
            const match = content.match(selector);
            if (match && match[1].trim().length > 100) {
                return match[1];
            }
        }

        // If no main content found, remove common non-content elements
        content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
        content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
        content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
        content = content.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
        content = content.replace(/<div[^>]*class=['"][^'"]*nav[^'"]*['"][^>]*>[\s\S]*?<\/div>/gi, '');

        return content;
    }

    /**
     * Converts HTML to plain text
     */
    private htmlToText(html: string): string {
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/h[1-6]>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/li>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\n\s+/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    /**
     * Converts HTML to basic Markdown
     */
    private htmlToMarkdown(html: string): string {
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
            .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
            .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
            .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
            .replace(/<a[^>]+href=['"]([^'"]+)['"][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
            .replace(/<img[^>]+src=['"]([^'"]+)['"][^>]*alt=['"]([^'"]*)['"]/gi, '![$2]($1)')
            .replace(/<img[^>]+src=['"]([^'"]+)['"][^>]*/gi, '![]($1)')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
            .replace(/<[^>]*>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\n\s+/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    /**
     * Extracts basic document structure
     */
    private extractStructure(html: string): any {
        const structure: any = {
            headings: [],
            links: [],
            images: []
        };

        // Extract headings
        const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
        let match;
        while ((match = headingRegex.exec(html)) !== null) {
            structure.headings.push({
                level: parseInt(match[1]),
                text: this.stripHtml(match[2]).trim()
            });
        }

        // Extract links
        const linkRegex = /<a[^>]+href=['"]([^'"]+)['"][^>]*>(.*?)<\/a>/gi;
        while ((match = linkRegex.exec(html)) !== null) {
            structure.links.push({
                url: match[1],
                text: this.stripHtml(match[2]).trim()
            });
        }

        // Extract images
        const imgRegex = /<img[^>]+src=['"]([^'"]+)['"][^>]*(?:alt=['"]([^'"]*)['"]*)?/gi;
        while ((match = imgRegex.exec(html)) !== null) {
            structure.images.push({
                src: match[1],
                alt: match[2] || ''
            });
        }

        return structure;
    }

    /**
     * Strips HTML tags from text
     */
    private stripHtml(html: string): string {
        return html.replace(/<[^>]*>/g, '');
    }

    /**
     * Truncates content to specified length
     */
    private truncateContent(content: string, maxLength: number): string {
        if (content.length <= maxLength) {
            return content;
        }
        return content.substring(0, maxLength) + '...';
    }
}

/**
 * Loader function to ensure the WebPageContentAction class is included in the bundle.
 */
export function LoadWebPageContentAction() {
    // this function is a stub that is used to force the bundler to include the above class in the final bundle and not tree shake them out
}