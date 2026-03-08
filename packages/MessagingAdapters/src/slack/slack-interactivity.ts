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
import type { AgentResponseForm } from '@memberjunction/ai-core-plus';
import { buildFormModal } from './slack-block-builder.js';
import type { SlackAdapter } from './SlackAdapter.js';
import type { IncomingMessage } from '../base/types.js';

/**
 * In-memory store for active response forms, keyed by `channelId:threadTs`.
 * Allows the modal open handler to look up the form definition.
 * Entries expire after 30 minutes.
 */
const activeFormStore = new Map<string, { form: AgentResponseForm; timestamp: number }>();
const FORM_STORE_TTL_MS = 30 * 60 * 1000;

/**
 * Register a response form for a given channel/thread so it can be opened as a modal.
 * Called by the block builder when a form with non-choice questions is rendered.
 */
export function registerActiveForm(channelId: string, threadTs: string, form: AgentResponseForm): void {
    const key = `${channelId}:${threadTs}`;
    activeFormStore.set(key, { form, timestamp: Date.now() });
    // Cleanup old entries
    for (const [k, v] of activeFormStore) {
        if (Date.now() - v.timestamp > FORM_STORE_TTL_MS) {
            activeFormStore.delete(k);
        }
    }
}

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
    view?: {
        callback_id: string;
        private_metadata?: string;
        state?: { values: Record<string, Record<string, { value?: string; selected_option?: { value: string }; selected_options?: Array<{ value: string }> }>> };
    };
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
 * @param adapter - Optional SlackAdapter for form round-trip (posting choices back as messages).
 */
export async function handleSlackInteraction(
    rawPayload: string,
    client: WebClient,
    adapter?: SlackAdapter
): Promise<void> {
    let payload: SlackInteractionPayload;
    try {
        payload = JSON.parse(rawPayload) as SlackInteractionPayload;
    } catch {
        LogError('Failed to parse Slack interaction payload');
        return;
    }

    if (payload.type === 'view_submission') {
        await handleModalSubmission(payload, client, adapter);
        return;
    }

    if (payload.type !== 'block_actions') {
        LogStatus(`Slack interaction: ignoring type '${payload.type}'`);
        return;
    }

    const actions = payload.actions ?? [];
    for (const action of actions) {
        await routeAction(action, payload, client, adapter);
    }
}

/**
 * Route a single Slack action to its handler.
 */
async function routeAction(
    action: SlackAction,
    payload: SlackInteractionPayload,
    client: WebClient,
    adapter?: SlackAdapter
): Promise<void> {
    const actionId = action.action_id;
    LogStatus(`Slack interaction: action_id='${actionId}', user='${payload.user?.name}'`);

    if (actionId.startsWith('mj:view_full:')) {
        await handleViewFull(action, payload, client);
    } else if (actionId === 'mj:view_artifact') {
        // URL buttons — handled client-side, no server action needed
        LogStatus('Slack interaction: artifact view button clicked (URL button, no-op)');
    } else if (actionId === 'mj:form_modal:open') {
        await handleFormModalOpen(payload, client);
    } else if (actionId.startsWith('mj:form_choice:')) {
        await handleFormChoice(action, payload, client, adapter);
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
 * Handle "Fill Out Form" button: open a Slack modal with input fields.
 *
 * The form definition is stored in the button's `value` field as JSON.
 * Falls back to the in-memory form store if the value is too large.
 */
async function handleFormModalOpen(
    payload: SlackInteractionPayload,
    client: WebClient
): Promise<void> {
    try {
        const channelId = payload.channel?.id;
        const threadTs = payload.message?.ts;
        if (!channelId) {
            LogStatus('Slack form modal: missing channel');
            return;
        }

        // Try to get the form from the button value first
        const action = payload.actions?.[0];
        let form: AgentResponseForm | null = null;

        if (action?.value && action.value !== 'too_large') {
            try {
                form = JSON.parse(action.value) as AgentResponseForm;
            } catch {
                LogStatus('Slack form modal: failed to parse form from button value');
            }
        }

        // Fall back to in-memory store
        if (!form) {
            const key = `${channelId}:${threadTs}`;
            const stored = activeFormStore.get(key);
            if (stored) {
                form = stored.form;
            }
        }

        if (!form) {
            await client.chat.postEphemeral({
                channel: channelId,
                user: payload.user.id,
                text: 'This form has expired. Please ask the agent again.'
            });
            return;
        }

        const modalView = buildFormModal(form);
        // Store channel/thread in private_metadata so we can post the response back
        (modalView as Record<string, unknown>).private_metadata = JSON.stringify({ channelId, threadTs });

        await client.views.open({
            trigger_id: payload.trigger_id,
            view: modalView as unknown as Parameters<typeof client.views.open>[0]['view']
        });
    } catch (error) {
        LogError('Failed to open form modal:', undefined, error);
    }
}

/**
 * Handle a modal form submission (view_submission callback).
 * Extracts field values, formats as `@{_mode:"form",...}`, and posts back to the thread.
 */
async function handleModalSubmission(
    payload: SlackInteractionPayload,
    client: WebClient,
    adapter?: SlackAdapter
): Promise<void> {
    try {
        const view = payload.view;
        if (!view || view.callback_id !== 'mj:form_modal:submit') return;

        // Parse channel/thread from private_metadata
        let channelId: string | undefined;
        let threadTs: string | undefined;
        if (view.private_metadata) {
            try {
                const meta = JSON.parse(view.private_metadata) as { channelId: string; threadTs: string };
                channelId = meta.channelId;
                threadTs = meta.threadTs;
            } catch {
                // Invalid metadata
            }
        }

        if (!channelId) {
            LogStatus('Slack modal submit: missing channel metadata');
            return;
        }

        // Extract field values from modal state
        const values = view.state?.values ?? {};
        const fields: Array<{ name: string; value: string; label: string; displayValue: string }> = [];

        for (const [blockId, blockValues] of Object.entries(values)) {
            // Block IDs are formatted as mj_form_{questionId}
            const questionId = blockId.replace('mj_form_', '');

            for (const [, fieldState] of Object.entries(blockValues)) {
                let fieldValue = '';
                let displayVal = '';

                if (fieldState.selected_option) {
                    fieldValue = fieldState.selected_option.value;
                    displayVal = fieldValue;
                } else if (fieldState.selected_options && fieldState.selected_options.length > 0) {
                    fieldValue = fieldState.selected_options.map(o => o.value).join(',');
                    displayVal = fieldValue;
                } else if (fieldState.value != null) {
                    fieldValue = fieldState.value;
                    displayVal = fieldValue;
                }

                if (fieldValue) {
                    fields.push({
                        name: questionId,
                        value: fieldValue,
                        label: questionId,
                        displayValue: displayVal
                    });
                }
            }
        }

        if (fields.length === 0) {
            LogStatus('Slack modal submit: no fields extracted');
            return;
        }

        LogStatus(`Slack modal submit: user='${payload.user?.name}', fields=${fields.length}`);

        // Build @{_mode:"form"} message
        const formResponse = JSON.stringify({
            _mode: 'form',
            action: 'formSubmit',
            fields
        });
        const messageText = `@${formResponse}`;

        // Post as a visible message in the thread
        const displayText = fields.map(f => `${f.label}: ${f.displayValue}`).join(', ');
        const postResult = await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: displayText
        });

        // Route through adapter for agent re-execution
        if (adapter && postResult.ts) {
            const incomingMessage: IncomingMessage = {
                MessageID: postResult.ts,
                Text: messageText,
                SenderID: payload.user.id,
                SenderName: payload.user.name,
                ChannelID: channelId,
                ThreadID: threadTs ?? null,
                IsDirectMessage: false,
                IsBotMention: true,
                Timestamp: new Date(),
                RawEvent: {}
            };

            adapter.HandleMessage(incomingMessage).catch(err => {
                LogError('Failed to re-execute agent after modal submit:', undefined, err);
            });
        }
    } catch (error) {
        LogError('Failed to handle modal submission:', undefined, error);
    }
}

/**
 * Handle a form choice button click with full round-trip back to the agent.
 *
 * The action_id format is `mj:form_choice:{questionId}:{value}`.
 *
 * Flow (mirrors MJ Explorer):
 * 1. Parse the selected value from the action_id
 * 2. Format it as a `@{_mode:"form",...}` message (same format Explorer uses)
 * 3. Post the choice as a visible user message in the thread
 * 4. Route the message through the adapter so the agent processes it
 */
async function handleFormChoice(
    action: SlackAction,
    payload: SlackInteractionPayload,
    client: WebClient,
    adapter?: SlackAdapter
): Promise<void> {
    try {
        // Parse action_id: mj:form_choice:{questionId}:{value}
        const parts = action.action_id.split(':');
        const questionId = parts[2] ?? 'unknown';
        const chosenValue = parts.slice(3).join(':') || action.value || 'unknown';
        // Use the value as display — it's the option label we set on the button
        const displayValue = action.value || chosenValue;

        LogStatus(`Slack form choice: user='${payload.user?.name}', question='${questionId}', value='${chosenValue}'`);

        const channelId = payload.channel?.id;
        const threadTs = payload.message?.ts;
        if (!channelId) return;

        // Build the @{_mode:"form"} message matching Explorer's format
        const formResponse = JSON.stringify({
            _mode: 'form',
            action: 'formSubmit',
            fields: [{
                name: questionId,
                value: chosenValue,
                label: questionId,
                displayValue
            }]
        });
        const messageText = `@${formResponse}`;

        // Post the choice as a visible user message in the thread
        const postResult = await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: displayValue  // Show the friendly label as fallback text
        });

        // Route through the adapter for agent re-execution
        if (adapter && postResult.ts) {
            const incomingMessage: IncomingMessage = {
                MessageID: postResult.ts,
                Text: messageText,
                SenderID: payload.user.id,
                SenderName: payload.user.name,
                ChannelID: channelId,
                ThreadID: threadTs ?? null,
                IsDirectMessage: false,
                IsBotMention: true, // Treat as bot mention so it triggers a response
                Timestamp: new Date(),
                RawEvent: {}
            };

            // Fire-and-forget: let the adapter handle re-execution asynchronously
            adapter.HandleMessage(incomingMessage).catch(err => {
                LogError('Failed to re-execute agent after form choice:', undefined, err);
            });
        }
    } catch (error) {
        LogError('Failed to handle form choice interaction:', undefined, error);
    }
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
