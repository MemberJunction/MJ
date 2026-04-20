/**
 * @module @memberjunction/messaging-adapters
 * @description Rich Adaptive Card builder functions for Teams agent responses.
 *
 * Composes structured Adaptive Card v1.4 layouts from agent execution results,
 * including agent identity headers, text content, action buttons, explorer
 * deep-links, and metadata footers.
 *
 * Mirrors the layout and feature parity of `slack-block-builder.ts` using
 * Microsoft Adaptive Card elements instead of Slack Block Kit.
 *
 * @see https://adaptivecards.io/designer/
 * @see https://learn.microsoft.com/en-us/adaptive-cards/
 */

import { ExecuteAgentResult, MJAIAgentEntityExtended, ActionableCommand, OpenResourceCommand, AutomaticCommand, MediaOutput, AgentResponseForm, FormQuestion } from '@memberjunction/ai-core-plus';
import { splitMarkdownIntoSections } from '../base/message-formatter.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Approximate max payload size in bytes for a Teams Adaptive Card.
 * Teams' actual limit is ~28KB for the card itself; we budget 4KB for the
 * Bot Framework activity envelope, leaving 24KB for card content.
 */
const TEAMS_MAX_PAYLOAD_BYTES = 24_000;

/** Adaptive Card schema URL. */
const ADAPTIVE_CARD_SCHEMA = 'http://adaptivecards.io/schemas/adaptive-card.json';

/** Adaptive Card version used throughout. */
const ADAPTIVE_CARD_VERSION = '1.4';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Options for building a rich Adaptive Card response.
 */
export interface BuildRichCardOptions {
    /** Base URL of MJ Explorer for deep-linking. */
    explorerBaseURL?: string;
    /** MJ Conversation Artifact ID — links to the artifact viewer. */
    artifactId?: string;
    /** MJ Conversation ID — links to the conversation in MJ Explorer. */
    conversationId?: string;
}

// ─── Main Composer ───────────────────────────────────────────────────────────

/**
 * Build the complete Adaptive Card for an agent response.
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────┐
 * │ [Avatar] **Agent Name**         │  ← ColumnSet (agent header)
 * │─────────────────────────────────│  ← separator on next element
 * │ Response text (TextBlocks)      │  ← from splitMarkdownIntoSections
 * │                                 │
 * │ ┌─ Artifact link ─────────────┐ │  ← Container (if artifact/conversation)
 * │ │ View in MJ Explorer         │ │
 * │ └─────────────────────────────┘ │
 * │                                 │
 * │ Completed in 4.2s · 1,240 tok  │  ← TextBlock (subtle footer)
 * ├─────────────────────────────────┤
 * │ [Action1] [Action2] [Explorer]  │  ← actions[] array
 * └─────────────────────────────────┘
 * ```
 */
export function buildRichAdaptiveCard(
    result: ExecuteAgentResult | null,
    agent: MJAIAgentEntityExtended,
    responseText: string,
    options?: BuildRichCardOptions
): Record<string, unknown> {
    const body: Record<string, unknown>[] = [];
    const actions: Record<string, unknown>[] = [];

    // Agent header
    body.push(buildAgentHeader(agent));

    // Text content (with separator from header)
    const textElements = buildTextBody(responseText);
    if (textElements.length > 0) {
        // Add separator to first text element
        textElements[0] = { ...textElements[0], separator: true };
    }
    body.push(...textElements);

    // Media images
    if (result?.mediaOutputs && result.mediaOutputs.length > 0) {
        body.push(...buildMediaElements(result.mediaOutputs));
    }

    // Notification blocks
    const notifications = buildNotificationElements(result?.automaticCommands);
    if (notifications.length > 0) {
        body.push(...notifications);
    }

    // Response form (structured input from agent)
    if (result?.responseForm?.questions && result.responseForm.questions.length > 0) {
        body.push(...buildResponseFormElements(result.responseForm));
    }

    // Metadata footer
    if (result?.agentRun) {
        body.push(buildMetadataFooter(result));
    }

    // Action buttons (go in the card's top-level actions array)
    const commands = result?.actionableCommands;
    if (commands && commands.length > 0) {
        actions.push(...buildActionButtons(commands, options?.explorerBaseURL));
    }

    // "Open in MJ Explorer" action (single action button, no inline body link)
    const explorerAction = buildExplorerLink(
        options?.explorerBaseURL,
        options?.artifactId,
        options?.conversationId
    );
    if (explorerAction) {
        actions.push(explorerAction);
    }

    // Enforce payload size limit
    const card = assembleCard(body, actions);
    return enforcePayloadSize(card, responseText, options);
}

/**
 * Build a ColumnSet showing the agent's avatar and name.
 */
export function buildAgentHeader(agent: MJAIAgentEntityExtended): Record<string, unknown> {
    const agentName = agent.Name ?? 'Agent';
    const columns: Record<string, unknown>[] = [];

    const logoURL = agent.LogoURL;
    if (logoURL && typeof logoURL === 'string' && logoURL.startsWith('https://')) {
        columns.push({
            type: 'Column',
            width: 'auto',
            items: [{
                type: 'Image',
                url: logoURL,
                size: 'Small',
                style: 'Person',
                altText: agentName,
            }],
        });
    }

    columns.push({
        type: 'Column',
        width: 'stretch',
        verticalContentAlignment: 'Center',
        items: [{
            type: 'TextBlock',
            text: `**${agentName}**`,
            wrap: true,
            weight: 'Bolder',
        }],
    });

    return {
        type: 'ColumnSet',
        columns,
    };
}

/**
 * Convert markdown text to Adaptive Card TextBlock elements.
 * Uses `splitMarkdownIntoSections` from the shared message formatter.
 */
export function buildTextBody(markdown: string): Record<string, unknown>[] {
    const sections = splitMarkdownIntoSections(markdown);
    const elements: Record<string, unknown>[] = [];

    for (const section of sections) {
        switch (section.Type) {
            case 'header':
                elements.push({
                    type: 'TextBlock',
                    text: section.Content,
                    size: 'Large',
                    weight: 'Bolder',
                    wrap: true,
                    spacing: 'Medium',
                });
                break;
            case 'code':
                elements.push({
                    type: 'TextBlock',
                    text: '```\n' + section.Content + '\n```',
                    fontType: 'Monospace',
                    wrap: true,
                    spacing: 'Small',
                });
                break;
            case 'text':
                elements.push({
                    type: 'TextBlock',
                    text: section.Content,
                    wrap: true,
                });
                break;
        }
    }

    // Ensure at least one element
    if (elements.length === 0) {
        elements.push({
            type: 'TextBlock',
            text: markdown || '(empty response)',
            wrap: true,
        });
    }

    return elements;
}

/**
 * Build an Adaptive Card Container linking to the artifact in MJ Explorer.
 * Returns null if no explorer URL or neither artifact/conversation ID is available.
 */
export function buildArtifactCard(
    artifactId: string,
    explorerBaseURL: string
): Record<string, unknown> {
    const base = explorerBaseURL.replace(/\/+$/, '');
    const artifactLink = `${base}/resource/artifact/${encodeURIComponent(artifactId)}`;

    return {
        type: 'Container',
        style: 'emphasis',
        spacing: 'Medium',
        items: [
            {
                type: 'TextBlock',
                text: 'View full artifact in MJ Explorer',
                wrap: true,
                weight: 'Bolder',
                size: 'Small',
            },
        ],
        selectAction: {
            type: 'Action.OpenUrl',
            url: artifactLink,
        },
    };
}

/**
 * Build Action.OpenUrl buttons from actionable commands.
 * Handles `open:url` and `open:resource` command types.
 * Returns at most 5 action buttons.
 */
export function buildActionButtons(
    commands: ActionableCommand[],
    explorerBaseURL?: string
): Record<string, unknown>[] {
    const actions: Record<string, unknown>[] = [];

    for (const cmd of commands.slice(0, 5)) {
        if (cmd.type === 'open:url' && 'url' in cmd) {
            actions.push({
                type: 'Action.OpenUrl',
                title: truncateToLength(cmd.label ?? 'Open Link', 40),
                url: cmd.url,
            });
        } else if (cmd.type === 'open:resource') {
            const resourceCmd = cmd as OpenResourceCommand;
            const deepLink = buildExplorerDeepLink(resourceCmd, explorerBaseURL);
            if (deepLink) {
                actions.push({
                    type: 'Action.OpenUrl',
                    title: truncateToLength(cmd.label ?? 'View in Explorer', 40),
                    url: deepLink,
                });
            }
        }
    }

    return actions;
}

/**
 * Build an "Open in MJ Explorer" Action.OpenUrl.
 * Prefers artifact link; falls back to conversation link.
 * Returns null if neither ID is available or no explorer URL.
 */
export function buildExplorerLink(
    explorerBaseURL?: string,
    artifactId?: string,
    conversationId?: string
): Record<string, unknown> | null {
    if (!explorerBaseURL) return null;
    if (!conversationId && !artifactId) return null;

    const base = explorerBaseURL.replace(/\/+$/, '');

    if (artifactId) {
        return {
            type: 'Action.OpenUrl',
            title: 'View in MJ Explorer',
            url: `${base}/resource/artifact/${encodeURIComponent(artifactId)}`,
        };
    }

    if (conversationId) {
        return {
            type: 'Action.OpenUrl',
            title: 'Open in MJ Explorer',
            url: `${base}/app/Chat/Conversations?conversationId=${encodeURIComponent(conversationId)}`,
        };
    }

    return null;
}

/**
 * Build a subtle metadata footer with timing and token info.
 */
export function buildMetadataFooter(result: ExecuteAgentResult): Record<string, unknown> {
    const parts: string[] = [];

    const agentRun = result.agentRun;
    if (agentRun) {
        const startTime = agentRun.StartedAt;
        const endTime = agentRun.CompletedAt;
        if (startTime && endTime) {
            const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
            const durationSec = (durationMs / 1000).toFixed(1);
            parts.push(`Completed in ${durationSec}s`);
        }

        const stepCount = agentRun.Steps?.length ?? 0;
        if (stepCount > 0) {
            parts.push(`${stepCount} step${stepCount === 1 ? '' : 's'}`);
        }

        const tokens = agentRun.TotalTokensUsed;
        if (tokens != null && tokens > 0) {
            parts.push(`${tokens.toLocaleString()} tokens`);
        }

        const cost = agentRun.TotalCostRollup ?? agentRun.TotalCost;
        if (cost != null && cost > 0) {
            parts.push(`$${cost.toFixed(cost < 0.01 ? 4 : 2)}`);
        }
    }

    return {
        type: 'TextBlock',
        text: parts.length > 0 ? parts.join(' · ') : 'Completed',
        size: 'Small',
        isSubtle: true,
        wrap: true,
        spacing: 'Medium',
        separator: true,
    };
}

/**
 * Build a full Adaptive Card for an error message.
 */
export function buildErrorCard(errorMessage: string): Record<string, unknown> {
    return {
        type: 'AdaptiveCard',
        version: ADAPTIVE_CARD_VERSION,
        '$schema': ADAPTIVE_CARD_SCHEMA,
        body: [
            {
                type: 'TextBlock',
                text: `⚠️ ${errorMessage}`,
                wrap: true,
                color: 'Attention',
                weight: 'Bolder',
            },
        ],
    };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Build notification elements from automatic commands.
 */
function buildNotificationElements(commands: AutomaticCommand[] | undefined): Record<string, unknown>[] {
    if (!commands || commands.length === 0) return [];

    const elements: Record<string, unknown>[] = [];

    for (const cmd of commands) {
        if (cmd.type !== 'notification') continue;
        const icon = NOTIFICATION_ICONS[cmd.severity ?? 'info'];
        elements.push({
            type: 'TextBlock',
            text: `${icon} ${cmd.message}`,
            wrap: true,
            size: 'Small',
            spacing: 'Small',
        });
    }

    return elements;
}

/** Unicode icons for notification severities (Adaptive Cards don't support Slack emoji syntax). */
const NOTIFICATION_ICONS: Record<string, string> = {
    success: '✅',
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
};

/**
 * Build response form elements from an AgentResponseForm.
 *
 * Adaptive Cards support native input elements (Input.Text, Input.Number,
 * Input.Date, Input.Time, Input.ChoiceSet) so we render the form inline
 * in the card body rather than requiring a separate modal.
 *
 * Note: Action.Submit handlers are out of scope — forms are rendered
 * read-only as a summary for now. Full interactivity is follow-up work
 * (requires Task Modules or Action.Submit webhook handling).
 */
export function buildResponseFormElements(form: AgentResponseForm): Record<string, unknown>[] {
    const elements: Record<string, unknown>[] = [];

    // Form title
    if (form.title) {
        elements.push({
            type: 'TextBlock',
            text: `**${form.title}**`,
            wrap: true,
            size: 'Medium',
            weight: 'Bolder',
            spacing: 'Medium',
            separator: true,
        });
    }

    // Form description
    if (form.description) {
        elements.push({
            type: 'TextBlock',
            text: form.description,
            wrap: true,
            size: 'Small',
            isSubtle: true,
        });
    }

    // Input elements for each question
    for (const question of form.questions) {
        const inputEl = buildFormInputElement(question);
        if (inputEl) {
            elements.push(inputEl);
        }
    }

    // Submit action rendered as an ActionSet in the body
    // (Action.Submit in an ActionSet is the Adaptive Card pattern for inline forms)
    elements.push({
        type: 'ActionSet',
        actions: [{
            type: 'Action.Submit',
            title: form.submitLabel ?? 'Submit',
            style: 'positive',
            data: { action: 'mj:form_submit' },
        }],
    });

    return elements;
}

/**
 * Build the appropriate Adaptive Card input element for a form question.
 */
function buildFormInputElement(question: FormQuestion): Record<string, unknown> | null {
    const qType = question.type;
    const baseProps = {
        id: `mj_form_${question.id}`,
        isRequired: question.required ?? false,
        label: question.label,
        errorMessage: question.required ? `${question.label} is required` : undefined,
    };

    switch (qType.type) {
        case 'text':
        case 'email':
            return {
                type: 'Input.Text',
                ...baseProps,
                placeholder: qType.placeholder ?? '',
                maxLength: qType.maxLength,
                style: qType.type === 'email' ? 'Email' : 'Text',
            };

        case 'textarea':
            return {
                type: 'Input.Text',
                ...baseProps,
                placeholder: qType.placeholder ?? '',
                maxLength: qType.maxLength,
                isMultiline: true,
            };

        case 'number':
        case 'currency':
            return {
                type: 'Input.Number',
                ...baseProps,
                min: qType.min,
                max: qType.max,
                placeholder: qType.type === 'currency' ? (qType.prefix ?? '$') + '0.00' : undefined,
            };

        case 'date':
        case 'datetime':
            return {
                type: 'Input.Date',
                ...baseProps,
            };

        case 'time':
            return {
                type: 'Input.Time',
                ...baseProps,
            };

        case 'buttongroup':
        case 'radio':
        case 'dropdown': {
            const opts = qType.options ?? [];
            return {
                type: 'Input.ChoiceSet',
                ...baseProps,
                style: qType.type === 'dropdown' ? 'Compact' : 'Expanded',
                choices: opts.slice(0, 100).map(opt => ({
                    title: String(opt.label),
                    value: String(opt.value),
                })),
            };
        }

        case 'checkbox': {
            const opts = qType.options ?? [];
            return {
                type: 'Input.ChoiceSet',
                ...baseProps,
                isMultiSelect: true,
                style: 'Expanded',
                choices: opts.slice(0, 100).map(opt => ({
                    title: String(opt.label),
                    value: String(opt.value),
                })),
            };
        }

        case 'slider':
            // Adaptive Cards don't have a native slider — use number input with min/max
            return {
                type: 'Input.Number',
                ...baseProps,
                min: qType.min,
                max: qType.max,
                placeholder: `${qType.min} - ${qType.max}${qType.suffix ? ' ' + qType.suffix : ''}`,
            };

        case 'daterange':
            // No native date range — render as two date inputs in a ColumnSet
            return {
                type: 'ColumnSet',
                columns: [
                    {
                        type: 'Column',
                        width: 'stretch',
                        items: [{
                            type: 'Input.Date',
                            id: `mj_form_${question.id}_start`,
                            label: `${question.label} (Start)`,
                            isRequired: question.required ?? false,
                        }],
                    },
                    {
                        type: 'Column',
                        width: 'stretch',
                        items: [{
                            type: 'Input.Date',
                            id: `mj_form_${question.id}_end`,
                            label: `${question.label} (End)`,
                            isRequired: question.required ?? false,
                        }],
                    },
                ],
            };

        default:
            // Fallback to text input
            return {
                type: 'Input.Text',
                ...baseProps,
                placeholder: `Enter ${question.label}`,
            };
    }
}

/**
 * Build image elements from media outputs.
 */
function buildMediaElements(mediaOutputs: MediaOutput[]): Record<string, unknown>[] {
    return mediaOutputs
        .filter(m => typeof m.url === 'string' && m.url.startsWith('https://'))
        .slice(0, 5)
        .map(m => ({
            type: 'Image',
            url: m.url,
            altText: m.description ?? m.label ?? 'Agent output',
            size: 'Large',
            spacing: 'Medium',
        }));
}

/**
 * Build a deep link URL into MJ Explorer for an `open:resource` command.
 */
function buildExplorerDeepLink(cmd: OpenResourceCommand, explorerBaseURL?: string): string | null {
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
            return `${base}/resource/dashboard/${encodeURIComponent(cmd.resourceId)}`;
        case 'Report':
            return `${base}/resource/report/${encodeURIComponent(cmd.resourceId)}`;
        case 'View':
            return `${base}/resource/view/${encodeURIComponent(cmd.resourceId)}`;
    }

    return null;
}

/**
 * Assemble the final Adaptive Card JSON structure.
 */
function assembleCard(
    body: Record<string, unknown>[],
    actions: Record<string, unknown>[]
): Record<string, unknown> {
    const card: Record<string, unknown> = {
        type: 'AdaptiveCard',
        version: ADAPTIVE_CARD_VERSION,
        '$schema': ADAPTIVE_CARD_SCHEMA,
        body,
    };

    if (actions.length > 0) {
        card.actions = actions;
    }

    return card;
}

/**
 * Enforce the Teams payload size limit via progressive truncation.
 *
 * Strategy:
 * 1. If under budget, return as-is
 * 2. Truncate long TextBlocks to 500 chars
 * 3. Truncate to 200 chars
 * 4. Remove tail body elements
 * 5. Add "View full in MJ Explorer" link if available
 */
function enforcePayloadSize(
    card: Record<string, unknown>,
    fullText: string,
    options?: BuildRichCardOptions
): Record<string, unknown> {
    let serialized = JSON.stringify(card);
    if (serialized.length <= TEAMS_MAX_PAYLOAD_BYTES) return card;

    const body = card.body as Record<string, unknown>[];

    // Pass 1: truncate TextBlocks to 500 chars
    let trimmedBody = truncateTextBlocks(body, 500);
    let trimmedCard = { ...card, body: trimmedBody };
    serialized = JSON.stringify(trimmedCard);
    if (serialized.length <= TEAMS_MAX_PAYLOAD_BYTES) return trimmedCard;

    // Pass 2: truncate TextBlocks to 200 chars
    trimmedBody = truncateTextBlocks(body, 200);
    trimmedCard = { ...card, body: trimmedBody };
    serialized = JSON.stringify(trimmedCard);
    if (serialized.length <= TEAMS_MAX_PAYLOAD_BYTES) return trimmedCard;

    // Pass 3: remove tail body elements (keep header + at least 1 text element)
    const reduced = [...trimmedBody];
    while (reduced.length > 2 && JSON.stringify({ ...card, body: reduced }).length > TEAMS_MAX_PAYLOAD_BYTES) {
        reduced.splice(reduced.length - 1, 1);
    }

    // Add truncation notice
    reduced.push({
        type: 'TextBlock',
        text: '_Response truncated due to length._',
        wrap: true,
        isSubtle: true,
        size: 'Small',
        spacing: 'Medium',
    });

    // Add "View full in MJ Explorer" action if possible
    const explorerLink = buildExplorerLink(
        options?.explorerBaseURL,
        options?.artifactId,
        options?.conversationId
    );
    const actions = (card.actions as Record<string, unknown>[] | undefined) ?? [];
    const finalActions = explorerLink
        ? [...actions.filter(a => (a as Record<string, unknown>).title !== 'View in MJ Explorer' && (a as Record<string, unknown>).title !== 'Open in MJ Explorer'), explorerLink]
        : actions;

    return {
        ...card,
        body: reduced,
        ...(finalActions.length > 0 ? { actions: finalActions } : {}),
    };
}

/**
 * Clone body elements with TextBlock text fields truncated to maxChars.
 */
function truncateTextBlocks(body: Record<string, unknown>[], maxChars: number): Record<string, unknown>[] {
    return body.map(element => {
        if (element.type !== 'TextBlock') return element;
        const text = element.text;
        if (typeof text !== 'string' || text.length <= maxChars) return element;
        return {
            ...element,
            text: text.substring(0, maxChars) + '...',
        };
    });
}

/**
 * Truncate a string to a given length with ellipsis.
 */
function truncateToLength(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}
