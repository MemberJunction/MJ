/**
 * @module @memberjunction/messaging-adapters
 * @description Shared Markdown parsing utilities used by all platform-specific formatters.
 */

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
