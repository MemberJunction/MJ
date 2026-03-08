/**
 * @module @memberjunction/messaging-adapters
 * @description Rich Slack Block Kit builder functions for agent responses.
 *
 * Composes structured Block Kit layouts from agent execution results,
 * including agent identity headers, artifact cards, action buttons,
 * media blocks, and metadata footers.
 *
 * @see https://api.slack.com/reference/block-kit
 */

import { ExecuteAgentResult, MJAIAgentEntityExtended, ActionableCommand } from '@memberjunction/ai-core-plus';
import { markdownToBlocks } from './slack-formatter.js';

/** Slack enforces a hard 50-block limit per message. */
const SLACK_MAX_BLOCKS = 50;

/** Blocks reserved for non-text elements (header, footer, dividers, actions). */
const RESERVED_BLOCK_SLOTS = 8;

/**
 * Structured payload detected in an agent result.
 * Used for rendering rich artifact cards.
 */
export interface ArtifactPayload {
    Title?: string;
    Summary?: string;
    Sections?: ArtifactSection[];
    Sources?: ArtifactSource[];
    URL?: string;
}

export interface ArtifactSection {
    Heading: string;
    Content: string;
}

export interface ArtifactSource {
    Title: string;
    URL: string;
}

/**
 * Build the complete Block Kit layout for an agent response.
 *
 * Layout:
 * ```
 * [Agent Context Header]     — agent avatar + name
 * [Divider]
 * [Text Content Blocks]      — markdown → mrkdwn sections
 * [Artifact Card]            — if structured payload detected
 * [Media Blocks]             — if mediaOutputs present
 * [Divider]
 * [Action Buttons]           — if actionableCommands present
 * [Metadata Footer]          — timing and token info
 * ```
 *
 * Enforces Slack's 50-block limit. If exceeded, truncates text blocks
 * and adds a truncation notice.
 */
export function buildRichResponse(
    result: ExecuteAgentResult | null,
    agent: MJAIAgentEntityExtended,
    responseText: string
): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];

    // Agent context header
    blocks.push(buildAgentContextBlock(agent));
    blocks.push(buildDivider());

    // Text content blocks
    const textBlocks = buildTextBlocks(responseText);
    blocks.push(...textBlocks);

    // Artifact card (if structured payload detected)
    if (result?.payload != null) {
        const artifact = detectArtifactPayload(result.payload);
        if (artifact) {
            blocks.push(buildDivider());
            blocks.push(...buildArtifactCard(artifact));
        }
    }

    // Action buttons (if actionableCommands present)
    const commands = result?.actionableCommands;
    if (commands && commands.length > 0) {
        blocks.push(buildDivider());
        blocks.push(buildActionButtons(commands));
    }

    // Metadata footer
    if (result?.agentRun) {
        blocks.push(buildDivider());
        blocks.push(buildMetadataFooter(result));
    }

    // Enforce 50-block limit
    return enforceBlockLimit(blocks);
}

/**
 * Build a context block showing the agent's avatar and name.
 */
export function buildAgentContextBlock(agent: MJAIAgentEntityExtended): Record<string, unknown> {
    const elements: Record<string, unknown>[] = [];
    const agentName = agent.Name ?? 'Agent';

    const logoURL = agent.LogoURL;
    if (logoURL && typeof logoURL === 'string' && logoURL.startsWith('https://')) {
        elements.push({
            type: 'image',
            image_url: logoURL,
            alt_text: agentName
        });
    }

    elements.push({
        type: 'mrkdwn',
        text: `*${agentName}*`
    });

    return {
        type: 'context',
        elements
    };
}

/**
 * Convert markdown response text to Block Kit text sections.
 * Reuses the existing `markdownToBlocks` logic from `slack-formatter.ts`.
 */
export function buildTextBlocks(markdown: string): Record<string, unknown>[] {
    return markdownToBlocks(markdown);
}

/**
 * Build a rich artifact card from a structured payload.
 * Renders title, summary, source links, and an optional "View Full" button.
 */
export function buildArtifactCard(artifact: ArtifactPayload): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];

    // Title section
    if (artifact.Title) {
        blocks.push({
            type: 'header',
            text: {
                type: 'plain_text',
                text: truncateToLength(artifact.Title, 150),
                emoji: true
            }
        });
    }

    // Summary
    if (artifact.Summary) {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncateToLength(artifact.Summary, 3000)
            }
        });
    }

    // Sections
    if (artifact.Sections && artifact.Sections.length > 0) {
        for (const section of artifact.Sections.slice(0, 5)) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${section.Heading}*\n${truncateToLength(section.Content, 2900)}`
                }
            });
        }
    }

    // Sources
    if (artifact.Sources && artifact.Sources.length > 0) {
        const sourceLinks = artifact.Sources.slice(0, 10)
            .map(s => `<${s.URL}|${s.Title}>`)
            .join(' · ');
        blocks.push({
            type: 'context',
            elements: [{
                type: 'mrkdwn',
                text: `📎 Sources: ${sourceLinks}`
            }]
        });
    }

    // "View Full" button if URL is available
    if (artifact.URL) {
        blocks.push({
            type: 'actions',
            elements: [{
                type: 'button',
                text: { type: 'plain_text', text: 'View Full Report', emoji: true },
                url: artifact.URL,
                action_id: 'mj:view_artifact'
            }]
        });
    }

    return blocks;
}

/**
 * Build action buttons from agent actionable commands.
 */
export function buildActionButtons(commands: ActionableCommand[]): Record<string, unknown> {
    const buttons = commands.slice(0, 5).map((cmd, index) => {
        const label = cmd.label ?? `Action ${index + 1}`;
        const actionId = `mj:action_${index}`;

        const button: Record<string, unknown> = {
            type: 'button',
            text: { type: 'plain_text', text: truncateToLength(label, 75), emoji: true },
            action_id: actionId,
        };

        // OpenURLCommand has a url field
        if (cmd.type === 'open:url' && 'url' in cmd) {
            button.url = cmd.url;
        }

        return button;
    });

    return {
        type: 'actions',
        elements: buttons
    };
}

/**
 * Build image blocks from media outputs.
 */
export function buildMediaBlocks(mediaOutputs: Record<string, unknown>[]): Record<string, unknown>[] {
    return mediaOutputs
        .filter(m => typeof m.url === 'string' && (m.url as string).startsWith('https://'))
        .slice(0, 5)
        .map(m => ({
            type: 'image',
            image_url: m.url,
            alt_text: (m.title as string) ?? (m.alt as string) ?? 'Agent output',
            title: m.title ? { type: 'plain_text', text: truncateToLength(m.title as string, 200) } : undefined
        }));
}

/**
 * Build a warning-styled error display block.
 */
export function buildErrorBlocks(errorMessage: string): Record<string, unknown>[] {
    return [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `⚠️ ${errorMessage}`
            }
        }
    ];
}

/**
 * Build a metadata footer with timing and token information.
 */
export function buildMetadataFooter(result: ExecuteAgentResult): Record<string, unknown> {
    const parts: string[] = [];

    // Timing
    const agentRun = result.agentRun;
    if (agentRun) {
        const startTime = agentRun.StartedAt;
        const endTime = agentRun.CompletedAt;
        if (startTime && endTime) {
            const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
            const durationSec = (durationMs / 1000).toFixed(1);
            parts.push(`Completed in ${durationSec}s`);
        }

        // Steps count
        const stepCount = agentRun.Steps?.length ?? 0;
        if (stepCount > 0) {
            parts.push(`${stepCount} step${stepCount === 1 ? '' : 's'}`);
        }

        // Token usage
        const tokens = agentRun.TotalTokensUsed;
        if (tokens != null && tokens > 0) {
            parts.push(`${tokens.toLocaleString()} tokens`);
        }
    }

    return {
        type: 'context',
        elements: [{
            type: 'mrkdwn',
            text: parts.length > 0 ? parts.join(' · ') : 'Completed'
        }]
    };
}

/**
 * Build a divider block.
 */
export function buildDivider(): Record<string, unknown> {
    return { type: 'divider' };
}

/**
 * Detect if a payload contains structured artifact data.
 * Looks for common patterns: object with title/sections/sources.
 */
function detectArtifactPayload(payload: unknown): ArtifactPayload | null {
    if (payload == null || typeof payload !== 'object') {
        return null;
    }

    const obj = payload as Record<string, unknown>;

    // Must have at least a title or sections to be considered an artifact
    const hasTitle = typeof obj.title === 'string' || typeof obj.Title === 'string';
    const hasSections = Array.isArray(obj.sections) || Array.isArray(obj.Sections);
    const hasSources = Array.isArray(obj.sources) || Array.isArray(obj.Sources);

    if (!hasTitle && !hasSections) {
        return null;
    }

    return {
        Title: (obj.title as string) ?? (obj.Title as string),
        Summary: (obj.summary as string) ?? (obj.Summary as string),
        Sections: normalizeSections((obj.sections ?? obj.Sections) as unknown[]),
        Sources: normalizeSources((obj.sources ?? obj.Sources) as unknown[]),
        URL: (obj.url as string) ?? (obj.URL as string),
    };
}

function normalizeSections(raw: unknown[] | undefined): ArtifactSection[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter(s => s != null && typeof s === 'object')
        .map(s => {
            const section = s as Record<string, unknown>;
            return {
                Heading: (section.heading as string) ?? (section.Heading as string) ?? (section.title as string) ?? '',
                Content: (section.content as string) ?? (section.Content as string) ?? (section.text as string) ?? ''
            };
        })
        .filter(s => s.Heading || s.Content);
}

function normalizeSources(raw: unknown[] | undefined): ArtifactSource[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter(s => s != null && typeof s === 'object')
        .map(s => {
            const source = s as Record<string, unknown>;
            return {
                Title: (source.title as string) ?? (source.Title as string) ?? (source.name as string) ?? 'Source',
                URL: (source.url as string) ?? (source.URL as string) ?? (source.link as string) ?? ''
            };
        })
        .filter(s => s.URL);
}

/**
 * Enforce the Slack 50-block limit by truncating text blocks if needed.
 */
function enforceBlockLimit(blocks: Record<string, unknown>[]): Record<string, unknown>[] {
    if (blocks.length <= SLACK_MAX_BLOCKS) {
        return blocks;
    }

    // Keep the first blocks up to the limit - 1, add a truncation notice
    const truncated = blocks.slice(0, SLACK_MAX_BLOCKS - 1);
    truncated.push({
        type: 'context',
        elements: [{
            type: 'mrkdwn',
            text: '⋯ _Response truncated due to length. Ask me to continue for more details._'
        }]
    });

    return truncated;
}

/**
 * Truncate a string to a given length with ellipsis.
 */
function truncateToLength(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}
