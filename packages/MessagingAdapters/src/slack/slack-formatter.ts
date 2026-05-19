/**
 * @module @memberjunction/messaging-adapters
 * @description Convert Markdown agent responses to Slack Block Kit format.
 *
 * Slack Block Kit has specific formatting requirements and limitations:
 * - Text blocks have a 3000-character limit
 * - Uses `mrkdwn` format (similar to but not identical to Markdown)
 * - Bold: `*text*` (not `**text**`)
 * - Links: `<url|text>` (not `[text](url)`)
 * - Code blocks: triple backticks work the same
 * - Headers use a dedicated `header` block type
 *
 * @see https://api.slack.com/reference/block-kit
 */

import { splitMarkdownIntoSections, convertToSlackMrkdwn, splitTextIntoChunks } from '../base/message-formatter.js';

/** Maximum character length for a single Slack text element. */
const SLACK_TEXT_BLOCK_MAX_LENGTH = 3000;

/** Maximum character length for a Slack header text element. */
const SLACK_HEADER_MAX_LENGTH = 150;

/**
 * Convert Markdown text from an agent response to Slack Block Kit blocks.
 *
 * Handles:
 * - ATX headers → Block Kit `header` blocks
 * - Fenced code blocks → `section` blocks with triple backtick wrapping
 * - Paragraphs → `section` blocks with `mrkdwn` formatting
 * - Long text → auto-split into multiple blocks to respect the 3000-char limit
 *
 * @param markdown - Raw Markdown text from an agent response.
 * @returns Array of Slack Block Kit block objects.
 *
 * @example
 * ```typescript
 * const blocks = markdownToBlocks('# Hello\n\nThis is **bold** text.');
 * // [
 * //   { type: 'header', text: { type: 'plain_text', text: 'Hello' } },
 * //   { type: 'section', text: { type: 'mrkdwn', text: 'This is *bold* text.' } }
 * // ]
 * ```
 */
export function markdownToBlocks(markdown: string): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];
    const sections = splitMarkdownIntoSections(markdown);

    for (const section of sections) {
        switch (section.Type) {
            case 'header':
                blocks.push(createHeaderBlock(section.Content));
                break;
            case 'code':
                blocks.push(...createCodeBlocks(section.Content));
                break;
            case 'text':
                blocks.push(...createTextBlocks(section.Content));
                break;
        }
    }

    // Ensure we always return at least one block
    if (blocks.length === 0) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: markdown || '(empty response)' }
        });
    }

    return blocks;
}

/**
 * Create a Slack header block. Truncates if the header text exceeds the limit.
 */
function createHeaderBlock(text: string): Record<string, unknown> {
    const headerText = text.length > SLACK_HEADER_MAX_LENGTH
        ? text.substring(0, SLACK_HEADER_MAX_LENGTH - 3) + '...'
        : text;

    return {
        type: 'header',
        text: { type: 'plain_text', text: headerText, emoji: true }
    };
}

/**
 * Create Slack section blocks for a code block.
 * Wraps in triple backticks and splits if too long.
 */
function createCodeBlocks(code: string): Record<string, unknown>[] {
    const wrapped = '```\n' + code + '\n```';

    if (wrapped.length <= SLACK_TEXT_BLOCK_MAX_LENGTH) {
        return [{
            type: 'section',
            text: { type: 'mrkdwn', text: wrapped }
        }];
    }

    // Split long code blocks
    const chunks = splitTextIntoChunks(code, SLACK_TEXT_BLOCK_MAX_LENGTH - 10); // Account for backtick wrapping
    return chunks.map(chunk => ({
        type: 'section',
        text: { type: 'mrkdwn', text: '```\n' + chunk + '\n```' }
    }));
}

/**
 * Create Slack section blocks for text content.
 * Converts Markdown formatting to Slack mrkdwn and splits if too long.
 */
function createTextBlocks(text: string): Record<string, unknown>[] {
    const mrkdwn = convertToSlackMrkdwn(text);

    if (mrkdwn.length <= SLACK_TEXT_BLOCK_MAX_LENGTH) {
        return [{
            type: 'section',
            text: { type: 'mrkdwn', text: mrkdwn }
        }];
    }

    // Split long text blocks
    const chunks = splitTextIntoChunks(mrkdwn, SLACK_TEXT_BLOCK_MAX_LENGTH);
    return chunks.map(chunk => ({
        type: 'section',
        text: { type: 'mrkdwn', text: chunk }
    }));
}
