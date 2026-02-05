import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import xml2js from 'xml2js';
import Papa from 'papaparse';

/**
 * Action that retrieves and processes web content in various formats
 * Supports JSON, PDF, DOCX, XML, CSV, HTML and more - similar to Claude's web reading capabilities
 *
 * @example
 * ```typescript
 * // Get JSON API response
 * await runAction({
 *   ActionName: 'Web Page Content',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://api.example.com/data'
 *   }, {
 *     Name: 'ContentType',
 *     Value: 'json'
 *   }]
 * });
 *
 * // Get PDF content as text
 * await runAction({
 *   ActionName: 'Web Page Content',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://example.com/document.pdf'
 *   }, {
 *     Name: 'ContentType',
 *     Value: 'text'
 *   }]
 * });
 *
 * // Get DOCX content as markdown
 * await runAction({
 *   ActionName: 'Web Page Content',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://example.com/document.docx'
 *   }, {
 *     Name: 'ContentType',
 *     Value: 'markdown'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__WebPageContent")
export class WebPageContentAction extends BaseAction {

    private readonly MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB limit
    private readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit for images
    private turndown: TurndownService;

    constructor() {
        super();
        this.turndown = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            emDelimiter: '*'
        });
    }

    /**
     * Executes web content retrieval and processing
     *
     * @param params - The action parameters containing:
     *   - URL: Web resource URL to fetch (required)
     *   - ContentType: Output format - 'auto', 'text', 'html', 'markdown', 'json' (default: 'auto')
     *   - ExtractMainContent: Extract only main content vs full page (default: false)
     *   - IncludeMetadata: Include resource metadata in response (default: true)
     *   - MaxContentLength: Maximum content length to return (default: 100000 chars)
     *
     * @returns Processed content in the specified format
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
            const requestedContentType = contentTypeParam?.Value?.toString().toLowerCase() || 'auto';
            const extractMain = extractMainParam?.Value === true || extractMainParam?.Value === 'true';
            const includeMetadata = includeMetadataParam?.Value !== false && includeMetadataParam?.Value !== 'false';
            const maxLength = parseInt(maxLengthParam?.Value?.toString() || '100000');

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
            if (!['auto', 'text', 'html', 'markdown', 'json'].includes(requestedContentType)) {
                return {
                    Success: false,
                    Message: "ContentType must be one of: auto, text, html, markdown, json",
                    ResultCode: "INVALID_CONTENT_TYPE"
                };
            }

            // Fetch the resource with browser-like headers
            const response = await this.fetchWithRetry(url, {
                headers: this.getBrowserHeaders(parsedUrl.hostname),
                redirect: 'follow',
                signal: AbortSignal.timeout(30000) // 30 second timeout
            });

            if (!response.ok) {
                return {
                    Success: false,
                    Message: `Failed to fetch URL: ${response.status} ${response.statusText}`,
                    ResultCode: "FETCH_FAILED"
                };
            }

            // Get response metadata
            const responseContentType = response.headers.get('content-type') || '';
            const contentLength = parseInt(response.headers.get('content-length') || '0');

            if (contentLength > this.MAX_CONTENT_SIZE) {
                return {
                    Success: false,
                    Message: `Content too large: ${contentLength} bytes (max: ${this.MAX_CONTENT_SIZE})`,
                    ResultCode: "CONTENT_TOO_LARGE"
                };
            }

            // Process based on detected content type
            const detectedType = this.detectContentType(responseContentType, parsedUrl.pathname);
            const processResult = await this.processResponse(
                response,
                detectedType,
                requestedContentType,
                extractMain,
                includeMetadata,
                maxLength
            );

            processResult.url = url;
            processResult.fetchedAt = new Date().toISOString();
            processResult.responseContentType = responseContentType;

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(processResult, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to retrieve web content: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    /**
     * Detects content type from response headers and URL
     */
    private detectContentType(contentType: string, pathname: string): string {
        const lowerContentType = contentType.toLowerCase();
        const lowerPath = pathname.toLowerCase();

        // Check content-type header first
        if (lowerContentType.includes('application/json')) return 'json';
        if (lowerContentType.includes('application/pdf')) return 'pdf';
        if (lowerContentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml')) return 'docx';
        if (lowerContentType.includes('application/msword')) return 'doc';
        if (lowerContentType.includes('text/csv') || lowerContentType.includes('application/csv')) return 'csv';
        if (lowerContentType.includes('text/xml') || lowerContentType.includes('application/xml')) return 'xml';
        if (lowerContentType.includes('text/html') || lowerContentType.includes('application/xhtml')) return 'html';
        if (lowerContentType.includes('text/plain')) return 'text';
        if (lowerContentType.includes('image/')) return 'image';

        // Check file extension if content-type is ambiguous
        if (lowerPath.endsWith('.json')) return 'json';
        if (lowerPath.endsWith('.pdf')) return 'pdf';
        if (lowerPath.endsWith('.docx')) return 'docx';
        if (lowerPath.endsWith('.doc')) return 'doc';
        if (lowerPath.endsWith('.csv')) return 'csv';
        if (lowerPath.endsWith('.xml')) return 'xml';
        if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm')) return 'html';
        if (lowerPath.endsWith('.txt')) return 'text';

        // Default to text
        return 'text';
    }

    /**
     * Processes response based on detected content type
     */
    private async processResponse(
        response: Response,
        detectedType: string,
        requestedType: string,
        extractMain: boolean,
        includeMetadata: boolean,
        maxLength: number
    ): Promise<Record<string, unknown>> {

        const outputType = requestedType === 'auto' ? this.inferOutputType(detectedType) : requestedType;

        switch (detectedType) {
            case 'json':
                return this.processJson(response, outputType, includeMetadata);

            case 'pdf':
                return this.processPdf(response, outputType, includeMetadata, maxLength);

            case 'docx':
                return this.processDocx(response, outputType, includeMetadata, maxLength);

            case 'csv':
                return this.processCsv(response, outputType, includeMetadata);

            case 'xml':
                return this.processXml(response, outputType, includeMetadata);

            case 'html':
                return this.processHtml(response, outputType, extractMain, includeMetadata, maxLength);

            case 'image':
                return this.processImage(response, includeMetadata);

            case 'text':
            default:
                return this.processText(response, outputType, maxLength);
        }
    }

    /**
     * Infers best output type based on detected content type
     */
    private inferOutputType(detectedType: string): string {
        switch (detectedType) {
            case 'json':
            case 'csv':
            case 'xml':
                return 'json';
            case 'html':
                return 'markdown';
            case 'pdf':
            case 'docx':
            case 'text':
            default:
                return 'text';
        }
    }

    /**
     * Process JSON content
     */
    private async processJson(response: Response, outputType: string, includeMetadata: boolean): Promise<Record<string, unknown>> {
        const text = await response.text();
        const parsed = JSON.parse(text);

        const result: Record<string, unknown> = {
            detectedType: 'json',
            outputType
        };

        if (includeMetadata) {
            result.metadata = {
                size: text.length,
                isArray: Array.isArray(parsed),
                isObject: typeof parsed === 'object' && !Array.isArray(parsed),
                keys: typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed) : undefined
            };
        }

        if (outputType === 'json') {
            result.content = parsed;
        } else if (outputType === 'text' || outputType === 'markdown') {
            result.content = JSON.stringify(parsed, null, 2);
        } else {
            result.content = text;
        }

        return result;
    }

    /**
     * Process PDF content
     */
    private async processPdf(response: Response, outputType: string, includeMetadata: boolean, maxLength: number): Promise<Record<string, unknown>> {
        const buffer = await response.arrayBuffer();
        const pdfData = await pdfParse(Buffer.from(buffer));

        const result: Record<string, unknown> = {
            detectedType: 'pdf',
            outputType
        };

        if (includeMetadata) {
            result.metadata = {
                pages: pdfData.numpages,
                info: pdfData.info,
                version: pdfData.version
            };
        }

        const text = pdfData.text || '';

        if (outputType === 'json') {
            result.content = {
                text: this.truncateContent(text, maxLength),
                pages: pdfData.numpages,
                metadata: pdfData.info
            };
        } else {
            result.content = this.truncateContent(text, maxLength);
        }

        return result;
    }

    /**
     * Process DOCX content
     */
    private async processDocx(response: Response, outputType: string, includeMetadata: boolean, maxLength: number): Promise<Record<string, unknown>> {
        const buffer = await response.arrayBuffer();
        const docxResult = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) });
        const htmlContent = docxResult.value;

        const result: Record<string, unknown> = {
            detectedType: 'docx',
            outputType
        };

        if (includeMetadata) {
            result.metadata = {
                warnings: docxResult.messages,
                htmlLength: htmlContent.length
            };
        }

        let content: string;
        if (outputType === 'markdown') {
            content = this.turndown.turndown(htmlContent);
        } else if (outputType === 'html') {
            content = htmlContent;
        } else {
            content = this.htmlToText(htmlContent);
        }

        if (outputType === 'json') {
            result.content = {
                text: this.truncateContent(content, maxLength),
                html: this.truncateContent(htmlContent, maxLength)
            };
        } else {
            result.content = this.truncateContent(content, maxLength);
        }

        return result;
    }

    /**
     * Process CSV content
     */
    private async processCsv(response: Response, outputType: string, includeMetadata: boolean): Promise<Record<string, unknown>> {
        const text = await response.text();
        const parsed = Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true
        });

        const result: Record<string, unknown> = {
            detectedType: 'csv',
            outputType
        };

        if (includeMetadata) {
            result.metadata = {
                rows: parsed.data.length,
                fields: parsed.meta.fields,
                errors: parsed.errors
            };
        }

        if (outputType === 'json') {
            result.content = parsed.data;
        } else if (outputType === 'markdown') {
            result.content = this.csvToMarkdownTable(parsed.data as Array<Record<string, string | number | boolean>>, parsed.meta.fields || []);
        } else {
            result.content = text;
        }

        return result;
    }

    /**
     * Process XML content
     */
    private async processXml(response: Response, outputType: string, includeMetadata: boolean): Promise<Record<string, unknown>> {
        const text = await response.text();
        const parser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: true,
            normalizeTags: true
        });

        const parsed = await parser.parseStringPromise(text);

        const result: Record<string, unknown> = {
            detectedType: 'xml',
            outputType
        };

        if (includeMetadata) {
            result.metadata = {
                size: text.length,
                rootElement: Object.keys(parsed)[0]
            };
        }

        if (outputType === 'json') {
            result.content = parsed;
        } else if (outputType === 'markdown' || outputType === 'text') {
            result.content = JSON.stringify(parsed, null, 2);
        } else {
            result.content = text;
        }

        return result;
    }

    /**
     * Process HTML content
     */
    private async processHtml(
        response: Response,
        outputType: string,
        extractMain: boolean,
        includeMetadata: boolean,
        maxLength: number
    ): Promise<Record<string, unknown>> {
        const html = await response.text();

        const result: Record<string, unknown> = {
            detectedType: 'html',
            outputType,
            extractMainContent: extractMain
        };

        if (includeMetadata) {
            result.metadata = this.extractHtmlMetadata(html);
        }

        let contentHtml = html;
        if (extractMain) {
            contentHtml = this.extractMainContent(html);
        }

        let content: string;
        if (outputType === 'markdown') {
            content = this.turndown.turndown(contentHtml);
        } else if (outputType === 'text') {
            content = this.htmlToText(contentHtml);
        } else if (outputType === 'json') {
            const dom = new JSDOM(contentHtml);
            result.content = {
                html: this.truncateContent(contentHtml, maxLength),
                text: this.truncateContent(this.htmlToText(contentHtml), maxLength),
                markdown: this.truncateContent(this.turndown.turndown(contentHtml), maxLength),
                structure: this.extractStructure(dom.window.document)
            };
            return result;
        } else {
            content = contentHtml;
        }

        result.content = this.truncateContent(content, maxLength);
        return result;
    }

    /**
     * Process image content
     */
    private async processImage(response: Response, includeMetadata: boolean): Promise<Record<string, unknown>> {
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/unknown';

        if (buffer.byteLength > this.MAX_IMAGE_SIZE) {
            throw new Error(`Image too large: ${buffer.byteLength} bytes (max: ${this.MAX_IMAGE_SIZE})`);
        }

        const base64 = Buffer.from(buffer).toString('base64');

        const result: Record<string, unknown> = {
            detectedType: 'image',
            outputType: 'base64',
            contentType,
            size: buffer.byteLength,
            base64Data: base64,
            dataUrl: `data:${contentType};base64,${base64}`
        };

        if (includeMetadata) {
            result.metadata = {
                mimeType: contentType,
                sizeBytes: buffer.byteLength,
                sizeMB: (buffer.byteLength / (1024 * 1024)).toFixed(2)
            };
        }

        return result;
    }

    /**
     * Process plain text content
     */
    private async processText(response: Response, outputType: string, maxLength: number): Promise<Record<string, unknown>> {
        const text = await response.text();

        const result: Record<string, unknown> = {
            detectedType: 'text',
            outputType
        };

        if (outputType === 'json') {
            result.content = {
                text: this.truncateContent(text, maxLength),
                lines: text.split('\n').length
            };
        } else {
            result.content = this.truncateContent(text, maxLength);
        }

        return result;
    }

    /**
     * Extracts HTML metadata
     */
    private extractHtmlMetadata(html: string): Record<string, unknown> {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const metadata: Record<string, unknown> = {};

        // Title
        const title = doc.querySelector('title');
        if (title) {
            metadata.title = title.textContent?.trim();
        }

        // Meta tags
        const metas = doc.querySelectorAll('meta');
        metas.forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property');
            const content = meta.getAttribute('content');
            if (name && content) {
                metadata[name] = content;
            }
        });

        // Canonical URL
        const canonical = doc.querySelector('link[rel="canonical"]');
        if (canonical) {
            metadata.canonical = canonical.getAttribute('href');
        }

        return metadata;
    }

    /**
     * Attempts to extract main content from HTML
     */
    private extractMainContent(html: string): string {
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        // Remove scripts and styles
        doc.querySelectorAll('script, style, nav, header, footer, aside').forEach(el => el.remove());

        // Try to find main content containers
        const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content', '.post', '.article'];

        for (const selector of mainSelectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent && element.textContent.trim().length > 100) {
                return element.innerHTML;
            }
        }

        // If no main content found, return body without nav/header/footer
        const body = doc.querySelector('body');
        return body ? body.innerHTML : html;
    }

    /**
     * Converts HTML to plain text
     */
    private htmlToText(html: string): string {
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        // Remove script and style elements
        doc.querySelectorAll('script, style').forEach(el => el.remove());

        return doc.body.textContent || '';
    }

    /**
     * Extracts document structure from HTML
     */
    private extractStructure(doc: Document): Record<string, unknown> {
        const structure: Record<string, unknown> = {
            headings: [],
            links: [],
            images: []
        };

        // Extract headings
        const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
        (structure.headings as Array<Record<string, unknown>>) = Array.from(headings).map(h => ({
            level: parseInt(h.tagName[1]),
            text: h.textContent?.trim() || ''
        }));

        // Extract links
        const links = doc.querySelectorAll('a[href]');
        (structure.links as Array<Record<string, unknown>>) = Array.from(links).map(a => ({
            url: a.getAttribute('href'),
            text: a.textContent?.trim() || ''
        }));

        // Extract images
        const images = doc.querySelectorAll('img[src]');
        (structure.images as Array<Record<string, unknown>>) = Array.from(images).map(img => ({
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt') || ''
        }));

        return structure;
    }

    /**
     * Converts CSV data to markdown table
     */
    private csvToMarkdownTable(data: Array<Record<string, string | number | boolean>>, fields: string[]): string {
        if (data.length === 0) return '';

        const headers = fields.length > 0 ? fields : Object.keys(data[0] || {});
        if (headers.length === 0) return '';

        // Header row
        let markdown = '| ' + headers.join(' | ') + ' |\n';

        // Separator row
        markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

        // Data rows
        data.forEach(row => {
            const values = headers.map(header => {
                const value = row[header];
                return value != null ? String(value) : '';
            });
            markdown += '| ' + values.join(' | ') + ' |\n';
        });

        return markdown;
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

    /**
     * Returns browser-like headers to avoid bot detection
     */
    private getBrowserHeaders(hostname: string): Record<string, string> {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Connection': 'keep-alive',
            'DNT': '1',
            'Referer': `https://${hostname}/`
        };
    }

    /**
     * Fetches URL with retry logic for transient failures
     */
    private async fetchWithRetry(
        url: string,
        options: RequestInit,
        maxRetries: number = 3
    ): Promise<Response> {
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);

                // Retry on specific status codes that might be transient
                if (attempt < maxRetries && this.shouldRetry(response.status)) {
                    await this.delay(this.getRetryDelay(attempt));
                    continue;
                }

                return response;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // Don't retry on timeout or abort errors on the last attempt
                if (attempt === maxRetries) {
                    throw lastError;
                }

                // Check if error is retryable (network errors, timeouts)
                if (this.isRetryableError(lastError)) {
                    await this.delay(this.getRetryDelay(attempt));
                    continue;
                }

                // Non-retryable error, throw immediately
                throw lastError;
            }
        }

        throw lastError || new Error('Failed to fetch URL after retries');
    }

    /**
     * Determines if HTTP status code warrants a retry
     */
    private shouldRetry(status: number): boolean {
        // Retry on rate limiting, server errors, and gateway issues
        return status === 429 || status === 502 || status === 503 || status === 504;
    }

    /**
     * Determines if an error is retryable
     */
    private isRetryableError(error: Error): boolean {
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('econnrefused') ||
            message.includes('econnreset') ||
            message.includes('etimedout') ||
            message.includes('fetch failed')
        );
    }

    /**
     * Calculates exponential backoff delay for retries
     */
    private getRetryDelay(attempt: number): number {
        // Exponential backoff: 1s, 2s, 4s
        return Math.min(1000 * Math.pow(2, attempt - 1), 5000);
    }

    /**
     * Delays execution for specified milliseconds
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Loader function to ensure the WebPageContentAction class is included in the bundle.
 */
export function LoadWebPageContentAction() {
    // this function is a stub that is used to force the bundler to include the above class in the final bundle and not tree shake them out
}
