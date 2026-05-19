/**
 * @module @memberjunction/messaging-adapters
 * @description Convert Markdown agent responses to Microsoft Teams Adaptive Card format.
 *
 * Adaptive Cards are Microsoft's rich content card format used across
 * Teams, Outlook, and other Microsoft products. They support:
 * - TextBlock elements with built-in Markdown rendering
 * - Monospace font for code blocks
 * - Multiple text sizes and weights for headers
 * - Auto-wrapping text
 *
 * @see https://adaptivecards.io/designer/
 * @see https://learn.microsoft.com/en-us/adaptive-cards/
 */

import { splitMarkdownIntoSections } from '../base/message-formatter.js';

/**
 * Convert Markdown text from an agent response to a Microsoft Teams Adaptive Card.
 *
 * Teams TextBlock elements support a subset of Markdown natively, so most
 * formatting is passed through directly. Code blocks use the `Monospace`
 * font type.
 *
 * @param markdown - Raw Markdown text from an agent response.
 * @returns Adaptive Card JSON object ready to attach to a Teams message.
 *
 * @example
 * ```typescript
 * const card = markdownToAdaptiveCard('# Hello\n\nThis is **bold** text.');
 * // {
 * //   type: 'AdaptiveCard',
 * //   version: '1.4',
 * //   body: [
 * //     { type: 'TextBlock', text: 'Hello', size: 'Large', weight: 'Bolder', wrap: true },
 * //     { type: 'TextBlock', text: 'This is **bold** text.', wrap: true }
 * //   ]
 * // }
 * ```
 */
export function markdownToAdaptiveCard(markdown: string): Record<string, unknown> {
    const bodyElements: Record<string, unknown>[] = [];
    const sections = splitMarkdownIntoSections(markdown);

    for (const section of sections) {
        switch (section.Type) {
            case 'header':
                bodyElements.push(createHeaderElement(section.Content));
                break;
            case 'code':
                bodyElements.push(createCodeElement(section.Content));
                break;
            case 'text':
                bodyElements.push(createTextElement(section.Content));
                break;
        }
    }

    // Ensure we always have at least one element
    if (bodyElements.length === 0) {
        bodyElements.push({
            type: 'TextBlock',
            text: markdown || '(empty response)',
            wrap: true
        });
    }

    return {
        type: 'AdaptiveCard',
        version: '1.4',
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        body: bodyElements
    };
}

/**
 * Create an Adaptive Card TextBlock for a header.
 */
function createHeaderElement(text: string): Record<string, unknown> {
    return {
        type: 'TextBlock',
        text,
        size: 'Large',
        weight: 'Bolder',
        wrap: true,
        spacing: 'Medium'
    };
}

/**
 * Create an Adaptive Card TextBlock for a code block.
 * Uses monospace font and wraps content in backticks for rendering.
 */
function createCodeElement(code: string): Record<string, unknown> {
    return {
        type: 'TextBlock',
        text: '```\n' + code + '\n```',
        fontType: 'Monospace',
        wrap: true,
        spacing: 'Small'
    };
}

/**
 * Create an Adaptive Card TextBlock for regular text.
 * Markdown is passed through since TextBlock supports it natively.
 */
function createTextElement(text: string): Record<string, unknown> {
    return {
        type: 'TextBlock',
        text,
        wrap: true
    };
}
