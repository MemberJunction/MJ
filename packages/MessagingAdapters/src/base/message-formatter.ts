/**
 * @module @memberjunction/messaging-adapters
 * @description Shared formatting utilities used by all platform-specific formatters.
 */

import { OpenResourceCommand } from '@memberjunction/ai-core-plus';
import { MarkdownSection } from './types.js';

/**
 * Split Markdown text into typed sections for platform-specific formatting.
 *
 * Handles:
 * - Fenced code blocks (````...````)
 * - ATX headers (`# `, `## `, `### `)
 * - Paragraph breaks (blank lines)
 * - Inline text paragraphs
 *
 * @param markdown - Raw Markdown text from an agent response.
 * @returns Array of sections with type and content.
 *
 * @example
 * ```typescript
 * const sections = splitMarkdownIntoSections('# Title\n\nSome text\n\n```js\nconsole.log("hi")\n```');
 * // [
 * //   { Type: 'header', Content: 'Title' },
 * //   { Type: 'text', Content: 'Some text' },
 * //   { Type: 'code', Content: 'console.log("hi")' }
 * // ]
 * ```
 */
export function splitMarkdownIntoSections(markdown: string): MarkdownSection[] {
    const sections: MarkdownSection[] = [];
    const lines = markdown.split('\n');
    let currentSection: MarkdownSection | null = null;
    let inCodeBlock = false;
    let codeContent = '';

    for (const line of lines) {
        if (line.startsWith('```')) {
            if (inCodeBlock) {
                sections.push({ Type: 'code', Content: codeContent.trim() });
                codeContent = '';
                inCodeBlock = false;
            } else {
                flushCurrentSection(sections, currentSection);
                currentSection = null;
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeContent += line + '\n';
            continue;
        }

        if (isHeader(line)) {
            flushCurrentSection(sections, currentSection);
            currentSection = null;
            sections.push({ Type: 'header', Content: extractHeaderText(line) });
        } else if (line.trim() === '') {
            flushCurrentSection(sections, currentSection);
            currentSection = null;
        } else {
            if (!currentSection) {
                currentSection = { Type: 'text', Content: '' };
            }
            currentSection.Content += (currentSection.Content ? '\n' : '') + line;
        }
    }

    // Handle unclosed code blocks gracefully
    if (inCodeBlock && codeContent) {
        sections.push({ Type: 'code', Content: codeContent.trim() });
    }

    flushCurrentSection(sections, currentSection);

    return sections;
}

/**
 * Convert standard Markdown bold syntax to Slack's `mrkdwn` bold syntax.
 * Markdown uses `**bold**`, Slack uses `*bold*`.
 *
 * @param text - Text with Markdown formatting.
 * @returns Text with Slack-compatible bold formatting.
 */
export function convertBoldToSlackFormat(text: string): string {
    return text.replace(/\*\*(.+?)\*\*/g, '*$1*');
}

/**
 * Convert Markdown link syntax to Slack's `mrkdwn` link syntax.
 * Markdown uses `[text](url)`, Slack uses `<url|text>`.
 *
 * @param text - Text with Markdown links.
 * @returns Text with Slack-compatible links.
 */
export function convertLinksToSlackFormat(text: string): string {
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');
}

/**
 * Apply all Slack-compatible text transformations.
 *
 * @param text - Raw Markdown text.
 * @returns Text formatted for Slack's `mrkdwn` format.
 */
export function convertToSlackMrkdwn(text: string): string {
    let result = text;
    result = convertBoldToSlackFormat(result);
    result = convertLinksToSlackFormat(result);
    return result;
}

/**
 * Truncate text to fit within a platform's character limit.
 * Adds an ellipsis indicator if truncated.
 *
 * @param text - Text to truncate.
 * @param maxLength - Maximum character length (e.g., 3000 for Slack blocks).
 * @returns Truncated text with ellipsis if needed.
 */
export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }
    const truncationIndicator = '\n\n... (truncated)';
    return text.substring(0, maxLength - truncationIndicator.length) + truncationIndicator;
}

/**
 * Split text into chunks that fit within a platform's character limit.
 * Attempts to split at paragraph boundaries for clean breaks.
 *
 * @param text - Text to split.
 * @param maxLength - Maximum character length per chunk.
 * @returns Array of text chunks.
 */
export function splitTextIntoChunks(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
        return [text];
    }

    const chunks: string[] = [];
    const paragraphs = text.split('\n\n');
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        const separator = currentChunk ? '\n\n' : '';
        if ((currentChunk + separator + paragraph).length <= maxLength) {
            currentChunk += separator + paragraph;
        } else {
            if (currentChunk) {
                chunks.push(currentChunk);
            }
            // If a single paragraph exceeds the limit, force-split it
            if (paragraph.length > maxLength) {
                const forceSplit = forceChunkByLength(paragraph, maxLength);
                chunks.push(...forceSplit);
                currentChunk = '';
            } else {
                currentChunk = paragraph;
            }
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk);
    }

    return chunks;
}

/**
 * Check if a line is a Markdown header.
 */
function isHeader(line: string): boolean {
    return /^#{1,6}\s+/.test(line);
}

/**
 * Extract the text content from a Markdown header line.
 */
function extractHeaderText(line: string): string {
    return line.replace(/^#+\s+/, '');
}

/**
 * Flush the current section into the sections array if it exists.
 */
function flushCurrentSection(sections: MarkdownSection[], section: MarkdownSection | null): void {
    if (section && section.Content) {
        sections.push(section);
    }
}

/**
 * Force-split text by character length (for paragraphs that exceed the limit).
 * Tries to split at word boundaries.
 */
function forceChunkByLength(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
        let splitIndex = remaining.lastIndexOf(' ', maxLength);
        if (splitIndex <= 0) {
            splitIndex = maxLength;
        }
        chunks.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex).trim();
    }

    if (remaining) {
        chunks.push(remaining);
    }

    return chunks;
}

/**
 * Can this URI be opened from a chat client at all?
 *
 * An ALLOW-list of `http:`/`https:`, deliberately, because the answer has to hold for a hostile
 * URL as well as a broken one. Two separate problems:
 *
 * - `data:` (and `blob:`/`file:`) URIs are inert: Slack rejects the whole message and Adaptive
 *   Cards silently do nothing, so a button over one is indistinguishable from a broken bot. Agents
 *   do emit them — MJ's document actions inline a whole generated file as `data:<mime>;base64,...`
 *   whenever no file storage account is configured, which is the normal local-dev state.
 * - `javascript:`, `vbscript:` and OS handler schemes such as `ms-msdt:` are *worse* than inert.
 *   Teams desktop hands an unknown scheme to the operating system's URI handler, so a deny-list
 *   naming only the inert schemes would turn an agent-authored URL into a local code-execution
 *   surface. An allow-list cannot be outflanked by a scheme nobody thought to enumerate.
 *
 * Localhost stays allowed: dev "View in MJ Explorer" links depend on it, and Teams opens it.
 * Whether a platform will additionally refuse an openable URL — Slack rejects non-public http(s)
 * — is a separate screen; see `isButtonSafeURL` in the Slack builder.
 */
export function isOpenableURI(url: unknown): boolean {
    if (typeof url !== 'string') return false;
    try {
        const { protocol } = new URL(url.trim());
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Build an MJ Explorer deep link for an `open:resource` command.
 *
 * Returns `null` when there is nothing safe to link to — no configured Explorer base URL, or a
 * resource kind whose identifier is absent. `resourceId` is optional on the shared `UICommand`
 * type (a Record can be addressed by `keys` instead), so every branch checks it rather than
 * emitting a `/resource/dashboard/undefined` URL that 404s on click.
 */
export function buildExplorerDeepLink(cmd: OpenResourceCommand, explorerBaseURL?: string): string | null {
    if (!explorerBaseURL) return null;
    const base = explorerBaseURL.replace(/\/+$/, '');

    switch (cmd.resourceType) {
        case 'Record':
            if (cmd.entityName && cmd.resourceId) {
                const entity = encodeURIComponent(cmd.entityName);
                const id = encodeURIComponent(cmd.resourceId);
                return `${base}/resource/record/${entity}/${id}`;
            }
            break;
        case 'Dashboard':
            if (!cmd.resourceId) break;
            return `${base}/resource/dashboard/${encodeURIComponent(cmd.resourceId)}`;
        case 'Report':
            if (!cmd.resourceId) break;
            return `${base}/resource/report/${encodeURIComponent(cmd.resourceId)}`;
        case 'View':
            if (!cmd.resourceId) break;
            return `${base}/resource/view/${encodeURIComponent(cmd.resourceId)}`;
    }

    return null;
}
