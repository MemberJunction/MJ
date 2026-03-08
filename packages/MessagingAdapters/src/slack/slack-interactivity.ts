/**
 * @module @memberjunction/messaging-adapters
 * @description Handler for Slack interactive message payloads (button clicks, etc.).
 *
 * When users click buttons in Block Kit messages (e.g., "View Full Report"),
 * Slack sends an interaction payload to the configured Request URL. This module
 * routes those payloads to the appropriate handler.
 *
 * ## Slack App Setup
 *
 * 1. Go to your Slack App → Interactivity & Shortcuts
 * 2. Enable Interactivity
 * 3. Set Request URL to: `{your-server}/webhook/slack/interact`
 *
 * @see https://api.slack.com/reference/interaction-payloads
 */

import { WebClient } from '@slack/web-api';
import { LogError, LogStatus } from '@memberjunction/core';

/**
 * Parsed Slack interaction payload.
 */
interface SlackInteractionPayload {
    type: string;
    trigger_id: string;
    user: { id: string; name: string };
    channel?: { id: string };
    message?: { ts: string; text: string; blocks: Record<string, unknown>[] };
    actions?: SlackAction[];
    token: string;
}

interface SlackAction {
    action_id: string;
    block_id: string;
    value?: string;
    type: string;
}

/**
 * Handle a Slack interactivity payload.
 *
 * Routes by `action_id` prefix:
 * - `mj:view_full:*` — Opens a modal with the full agent response
 * - `mj:action_*` — Custom agent action buttons (logged, no-op for now)
 * - URL buttons are handled client-side and don't trigger callbacks
 *
 * @param rawPayload - The raw JSON string from the `payload` form field.
 * @param client - Slack WebClient for API calls (e.g., opening modals).
 */
export async function handleSlackInteraction(
    rawPayload: string,
    client: WebClient
): Promise<void> {
    let payload: SlackInteractionPayload;
    try {
        payload = JSON.parse(rawPayload) as SlackInteractionPayload;
    } catch {
        LogError('Failed to parse Slack interaction payload');
        return;
    }

    if (payload.type !== 'block_actions') {
        LogStatus(`Slack interaction: ignoring type '${payload.type}'`);
        return;
    }

    const actions = payload.actions ?? [];
    for (const action of actions) {
        await routeAction(action, payload, client);
    }
}

/**
 * Route a single Slack action to its handler.
 */
async function routeAction(
    action: SlackAction,
    payload: SlackInteractionPayload,
    client: WebClient
): Promise<void> {
    const actionId = action.action_id;
    LogStatus(`Slack interaction: action_id='${actionId}', user='${payload.user?.name}'`);

    if (actionId.startsWith('mj:view_full:')) {
        await handleViewFull(action, payload, client);
    } else if (actionId === 'mj:view_artifact') {
        // URL buttons — handled client-side, no server action needed
        LogStatus('Slack interaction: artifact view button clicked (URL button, no-op)');
    } else if (actionId.startsWith('mj:action_')) {
        LogStatus(`Slack interaction: custom action '${actionId}' clicked by ${payload.user?.name}`);
    } else {
        LogStatus(`Slack interaction: unhandled action_id '${actionId}'`);
    }
}

/**
 * Handle "View Full Report" button: open a Slack modal with the full content.
 *
 * The action_id format is `mj:view_full:{identifier}`.
 * The full content is pulled from the original message blocks.
 */
async function handleViewFull(
    action: SlackAction,
    payload: SlackInteractionPayload,
    client: WebClient
): Promise<void> {
    try {
        // Extract text from the original message blocks
        const messageBlocks = payload.message?.blocks ?? [];
        const fullText = extractTextFromBlocks(messageBlocks);

        // Split content into modal blocks (modal has same 50-block limit)
        const modalBlocks = buildModalContentBlocks(fullText);

        await client.views.open({
            trigger_id: payload.trigger_id,
            view: {
                type: 'modal',
                title: {
                    type: 'plain_text',
                    text: 'Full Response',
                    emoji: true
                },
                close: {
                    type: 'plain_text',
                    text: 'Close'
                },
                blocks: modalBlocks as unknown as Parameters<typeof client.views.open>[0]['view']['blocks']
            }
        });
    } catch (error) {
        LogError('Failed to open Slack modal for full response:', undefined, error);
    }
}

/**
 * Extract plain text content from Block Kit blocks.
 */
function extractTextFromBlocks(blocks: Record<string, unknown>[]): string {
    const textParts: string[] = [];

    for (const block of blocks) {
        const blockType = block.type as string;

        if (blockType === 'section' || blockType === 'header') {
            const textObj = block.text as Record<string, unknown> | undefined;
            if (textObj && typeof textObj.text === 'string') {
                textParts.push(textObj.text);
            }
        } else if (blockType === 'context') {
            const elements = block.elements as Record<string, unknown>[] | undefined;
            if (elements) {
                for (const el of elements) {
                    if (typeof el.text === 'string') {
                        textParts.push(el.text);
                    }
                }
            }
        }
    }

    return textParts.join('\n\n');
}

/**
 * Build Block Kit blocks for the modal content.
 */
function buildModalContentBlocks(text: string): Record<string, unknown>[] {
    const maxBlockTextLength = 3000;
    const blocks: Record<string, unknown>[] = [];

    // Split text into chunks that fit in section blocks
    let remaining = text;
    while (remaining.length > 0 && blocks.length < 48) {
        const chunk = remaining.substring(0, maxBlockTextLength);
        remaining = remaining.substring(maxBlockTextLength);

        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: chunk || '(empty)'
            }
        });
    }

    if (remaining.length > 0) {
        blocks.push({
            type: 'context',
            elements: [{
                type: 'mrkdwn',
                text: '⋯ _Content truncated due to length._'
            }]
        });
    }

    if (blocks.length === 0) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: '(No content available)' }
        });
    }

    return blocks;
}
