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

import { ExecuteAgentResult, MJAIAgentEntityExtended, ActionableCommand, AgentResponseForm, FormQuestion, MediaOutput } from '@memberjunction/ai-core-plus';
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

    // Structured payload rendering — detect rich payloads and render natively
    // before falling back to generic markdown→blocks conversion
    const structuredBlocks = buildStructuredPayloadBlocks(result);
    if (structuredBlocks) {
        blocks.push(...structuredBlocks);
    } else {
        // Fallback: generic markdown → Block Kit conversion
        const textBlocks = buildTextBlocks(responseText);
        blocks.push(...textBlocks);
    }

    // Artifact card (check both in-memory payload and FinalPayload)
    const artifact = detectArtifactFromResult(result);
    if (artifact) {
        blocks.push(buildDivider());
        blocks.push(...buildArtifactCard(artifact));
    }

    // Media blocks (images from agent)
    if (result?.mediaOutputs && result.mediaOutputs.length > 0) {
        blocks.push(...buildMediaBlocks(
            result.mediaOutputs.map(m => mediaOutputToRecord(m))
        ));
    }

    // Action buttons (if actionableCommands present)
    const commands = result?.actionableCommands;
    if (commands && commands.length > 0) {
        blocks.push(buildDivider());
        blocks.push(buildActionButtons(commands));
    }

    // Response form (choice buttons for structured input)
    if (result?.responseForm?.questions && result.responseForm.questions.length > 0) {
        blocks.push(...buildResponseForm(result.responseForm));
    }

    // Metadata footer
    if (result?.agentRun) {
        blocks.push(buildDivider());
        blocks.push(buildMetadataFooter(result));
    }

    // Enforce 50-block limit (adds "View Full" button when truncating)
    return enforceBlockLimit(blocks, responseText);
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

        // Cost (prefer rollup which includes sub-agents)
        const cost = agentRun.TotalCostRollup ?? agentRun.TotalCost;
        if (cost != null && cost > 0) {
            parts.push(`$${cost.toFixed(cost < 0.01 ? 4 : 2)}`);
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
 * Convert a strongly-typed MediaOutput to a plain record for buildMediaBlocks.
 */
function mediaOutputToRecord(m: MediaOutput): Record<string, unknown> {
    return {
        url: m.url,
        title: m.label ?? m.description,
        alt: m.description ?? m.label ?? 'Agent output'
    };
}

/**
 * Detect artifact payload from an ExecuteAgentResult, checking multiple sources:
 * 1. `result.payload` (in-memory)
 * 2. `result.agentRun.FinalPayload` (persisted, includes sub-agent payloads)
 */
function detectArtifactFromResult(result: ExecuteAgentResult | null): ArtifactPayload | null {
    if (!result) return null;

    // Check in-memory payload first
    if (result.payload != null) {
        const artifact = detectArtifactPayload(result.payload);
        if (artifact) return artifact;
    }

    // Check FinalPayload (persisted payload, may contain sub-agent output)
    const finalPayloadStr = result.agentRun?.FinalPayload;
    if (finalPayloadStr && typeof finalPayloadStr === 'string') {
        try {
            const parsed = JSON.parse(finalPayloadStr) as unknown;
            const artifact = detectArtifactPayload(parsed);
            if (artifact) return artifact;
        } catch {
            // Not JSON, skip
        }
    }

    return null;
}

/**
 * Detect if a payload contains structured artifact data.
 * Looks for common patterns including:
 * - Standard: object with title/sections/sources
 * - Research Agent: object with metadata.researchGoal, plan, findings
 */
function detectArtifactPayload(payload: unknown): ArtifactPayload | null {
    if (payload == null || typeof payload !== 'object') {
        return null;
    }

    const obj = payload as Record<string, unknown>;

    // Research Agent pattern: { metadata: { researchGoal }, plan: {...} }
    const researchArtifact = detectResearchPayload(obj);
    if (researchArtifact) return researchArtifact;

    // Standard artifact: must have at least a title or sections
    const hasTitle = typeof obj.title === 'string' || typeof obj.Title === 'string';
    const hasSections = Array.isArray(obj.sections) || Array.isArray(obj.Sections);

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

/**
 * Detect Research Agent payloads and map them to ArtifactPayload.
 *
 * Patterns:
 * - `{ metadata: { researchGoal }, plan: {...} }` — research plan artifact
 * - `{ findings: [...], sources: [...] }` — research results artifact
 */
function detectResearchPayload(obj: Record<string, unknown>): ArtifactPayload | null {
    // Pattern: { metadata: { researchGoal: "..." }, plan: { ... } }
    if (obj.metadata != null && typeof obj.metadata === 'object') {
        const meta = obj.metadata as Record<string, unknown>;
        const goal = (meta.researchGoal as string) ?? (meta.ResearchGoal as string);
        if (goal) {
            return {
                Title: goal,
                Summary: (obj.summary as string) ?? (obj.Summary as string),
                Sections: normalizeSections((obj.sections ?? obj.Sections ?? obj.findings ?? obj.Findings) as unknown[]),
                Sources: normalizeSources((obj.sources ?? obj.Sources) as unknown[]),
            };
        }
    }

    // Pattern: { findings: [...], sources: [...] }
    const hasFindings = Array.isArray(obj.findings) || Array.isArray(obj.Findings);
    const hasSources = Array.isArray(obj.sources) || Array.isArray(obj.Sources);
    if (hasFindings && hasSources) {
        const findings = (obj.findings ?? obj.Findings) as unknown[];
        return {
            Title: (obj.title as string) ?? (obj.Title as string) ?? 'Research Findings',
            Summary: (obj.summary as string) ?? (obj.Summary as string),
            Sections: normalizeSections(findings),
            Sources: normalizeSources((obj.sources ?? obj.Sources) as unknown[]),
        };
    }

    return null;
}

/**
 * Build response form blocks from an AgentResponseForm.
 *
 * All forms render as a summary + a single green button that opens a Slack modal.
 * This is agent-agnostic and avoids partial submissions — the user fills out
 * everything in the modal and submits once.
 */
export function buildResponseForm(form: AgentResponseForm): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];

    // Form title
    if (form.title) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*${form.title}*` }
        });
    }
    if (form.description) {
        blocks.push({
            type: 'context',
            elements: [{ type: 'mrkdwn', text: form.description }]
        });
    }

    // Compact summary of fields
    const fieldNames = form.questions.map(q => q.label).join(', ');
    blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_Fields: ${truncateToLength(fieldNames, 280)}_` }]
    });

    // Single green button opens the full modal
    const formJson = JSON.stringify(form);
    blocks.push({
        type: 'actions',
        elements: [{
            type: 'button',
            text: { type: 'plain_text', text: form.submitLabel ?? 'Fill Out Form', emoji: true },
            action_id: 'mj:form_modal:open',
            value: formJson.length <= 2000 ? formJson : 'too_large',
            style: 'primary'
        }]
    });

    return blocks;
}

function isChoiceQuestion(question: FormQuestion): boolean {
    const t = question.type.type;
    return t === 'buttongroup' || t === 'radio' || t === 'dropdown' || t === 'checkbox';
}

/**
 * Build inline action blocks for a choice question.
 */
function buildInlineChoiceQuestion(question: FormQuestion): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];
    const questionType = question.type.type;

    blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: question.label }
    });

    if (questionType === 'checkbox') {
        // Checkbox → Slack checkboxes element
        const choiceType = question.type as { options: Array<{ value: string | number | boolean; label: string }> };
        blocks.push({
            type: 'actions',
            elements: [{
                type: 'checkboxes',
                action_id: `mj:form_choice:${question.id}:multi`,
                options: choiceType.options.slice(0, 10).map(opt => ({
                    text: { type: 'plain_text', text: truncateToLength(String(opt.label), 75) },
                    value: String(opt.value)
                }))
            }]
        });
    } else {
        // buttongroup / radio / dropdown → buttons
        const choiceType = question.type as { options: Array<{ value: string | number | boolean; label: string }> };
        const buttons = choiceType.options.slice(0, 5).map(opt => ({
            type: 'button',
            text: { type: 'plain_text', text: truncateToLength(String(opt.label), 75), emoji: true },
            action_id: `mj:form_choice:${question.id}:${String(opt.value)}`,
            value: String(opt.value)
        }));

        blocks.push({
            type: 'actions',
            elements: buttons
        });
    }

    return blocks;
}

/**
 * Build a Slack modal view definition from an AgentResponseForm.
 * Used when the form contains non-choice questions that need input fields.
 *
 * Slack modals support: plain_text_input, number_input, datepicker, checkboxes,
 * radio_buttons, static_select, and multi_static_select.
 */
export function buildFormModal(form: AgentResponseForm): Record<string, unknown> {
    const modalBlocks: Record<string, unknown>[] = [];

    for (const question of form.questions) {
        const element = buildModalInputElement(question);
        if (element) {
            modalBlocks.push({
                type: 'input',
                block_id: `mj_form_${question.id}`,
                label: { type: 'plain_text', text: truncateToLength(question.label, 2000) },
                element,
                optional: !question.required
            });
        }
    }

    return {
        type: 'modal',
        callback_id: 'mj:form_modal:submit',
        title: { type: 'plain_text', text: truncateToLength(form.title ?? 'Form', 24) },
        submit: { type: 'plain_text', text: form.submitLabel ?? 'Submit' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: modalBlocks
    };
}

/**
 * Build the appropriate Slack input element for a form question type.
 */
function buildModalInputElement(question: FormQuestion): Record<string, unknown> | null {
    const qType = question.type;

    switch (qType.type) {
        case 'text':
        case 'textarea':
        case 'email': {
            const textType = qType as { type: string; placeholder?: string; maxLength?: number };
            return {
                type: 'plain_text_input',
                action_id: `mj:form_field:${question.id}`,
                multiline: textType.type === 'textarea',
                ...(textType.placeholder ? { placeholder: { type: 'plain_text', text: textType.placeholder } } : {}),
                ...(textType.maxLength ? { max_length: textType.maxLength } : {})
            };
        }

        case 'number':
        case 'currency':
            return {
                type: 'number_input',
                action_id: `mj:form_field:${question.id}`,
                is_decimal_allowed: qType.type === 'currency',
                ...(qType.min != null ? { min_value: String(qType.min) } : {}),
                ...(qType.max != null ? { max_value: String(qType.max) } : {})
            };

        case 'date':
        case 'datetime':
            return {
                type: 'datepicker',
                action_id: `mj:form_field:${question.id}`
            };

        case 'buttongroup':
        case 'radio': {
            const opts = (qType as { options: Array<{ value: string | number | boolean; label: string }> }).options;
            return {
                type: 'radio_buttons',
                action_id: `mj:form_field:${question.id}`,
                options: opts.slice(0, 10).map(opt => ({
                    text: { type: 'plain_text', text: truncateToLength(String(opt.label), 75) },
                    value: String(opt.value)
                }))
            };
        }

        case 'dropdown': {
            const opts = (qType as { options: Array<{ value: string | number | boolean; label: string }> }).options;
            return {
                type: 'static_select',
                action_id: `mj:form_field:${question.id}`,
                options: opts.slice(0, 100).map(opt => ({
                    text: { type: 'plain_text', text: truncateToLength(String(opt.label), 75) },
                    value: String(opt.value)
                }))
            };
        }

        case 'checkbox': {
            const opts = (qType as { options: Array<{ value: string | number | boolean; label: string }> }).options;
            return {
                type: 'checkboxes',
                action_id: `mj:form_field:${question.id}`,
                options: opts.slice(0, 10).map(opt => ({
                    text: { type: 'plain_text', text: truncateToLength(String(opt.label), 75) },
                    value: String(opt.value)
                }))
            };
        }

        default:
            // Fallback for slider, time, date_range, etc. — use text input
            return {
                type: 'plain_text_input',
                action_id: `mj:form_field:${question.id}`,
                placeholder: { type: 'plain_text', text: `Enter ${question.label}` }
            };
    }
}

// ─── Structured Payload Block Builders ───────────────────────────────────

/**
 * Structured payload representation detected from an agent result.
 */
interface StructuredPayload {
    Type: 'code' | 'research' | 'structured';
    Data: Record<string, unknown>;
}

/**
 * Detect and build rich Block Kit blocks from structured payloads in the result.
 *
 * Checks both in-memory `result.payload` and `agentRun.FinalPayload` for
 * known structured patterns (Codesmith, Research Agent, generic structured).
 * Returns `null` if no structured payload is detected — caller falls back to markdown.
 */
function buildStructuredPayloadBlocks(result: ExecuteAgentResult | null): Record<string, unknown>[] | null {
    if (!result) return null;

    const payload = detectStructuredPayload(result);
    if (!payload) return null;

    switch (payload.Type) {
        case 'code':
            return buildCodePayloadBlocks(payload.Data);
        case 'research':
            return buildResearchPayloadBlocks(payload.Data);
        case 'structured':
            return buildStructuredContentBlocks(payload.Data);
        default:
            return null;
    }
}

/**
 * Detect a structured payload from the agent result, checking multiple sources.
 */
function detectStructuredPayload(result: ExecuteAgentResult): StructuredPayload | null {
    // Check in-memory payload first, then FinalPayload
    const candidates: Record<string, unknown>[] = [];

    if (result.payload != null && typeof result.payload === 'object') {
        candidates.push(result.payload as Record<string, unknown>);
    }

    const finalPayloadStr = result.agentRun?.FinalPayload;
    if (finalPayloadStr && typeof finalPayloadStr === 'string') {
        try {
            const parsed = JSON.parse(finalPayloadStr);
            if (parsed != null && typeof parsed === 'object') {
                candidates.push(parsed as Record<string, unknown>);
            }
        } catch {
            // Not JSON
        }
    }

    for (const obj of candidates) {
        // Skip orchestration metadata (delegation, sub-agent control flow)
        if (isOrchestrationPayload(obj)) continue;

        // Code payload: must have `code` + `results`
        if (typeof obj.code === 'string' && 'results' in obj) {
            return { Type: 'code', Data: obj };
        }
        // Research state: metadata.researchGoal + plan
        if (isResearchState(obj)) {
            return { Type: 'research', Data: obj };
        }
        // Generic structured: title/summary + findings/sections arrays
        if (isStructuredContent(obj)) {
            return { Type: 'structured', Data: obj };
        }
    }

    return null;
}

/**
 * Check if a payload is orchestration/control-flow metadata (not user-facing content).
 * These payloads contain delegation instructions, sub-agent routing, etc.
 */
function isOrchestrationPayload(obj: Record<string, unknown>): boolean {
    const orchestrationKeys = ['subAgentResult', 'payloadChangeResult', 'shouldTerminate'];
    if (orchestrationKeys.some(key => key in obj)) return true;

    if (obj.nextStep != null && typeof obj.nextStep === 'object') {
        const nextStep = obj.nextStep as Record<string, unknown>;
        if (nextStep.subAgent != null || nextStep.step === 'Sub-Agent' || nextStep.terminate === true) {
            return true;
        }
    }
    return false;
}

function isResearchState(obj: Record<string, unknown>): boolean {
    const meta = obj.metadata as Record<string, unknown> | undefined;
    return meta != null && typeof meta === 'object'
        && (typeof meta.researchGoal === 'string' || typeof meta.ResearchGoal === 'string')
        && obj.plan != null && typeof obj.plan === 'object';
}

function isStructuredContent(obj: Record<string, unknown>): boolean {
    const hasTitle = typeof obj.title === 'string' || typeof obj.Title === 'string';
    const hasSummary = typeof obj.summary === 'string' || typeof obj.Summary === 'string';
    const hasArrayContent = ['findings', 'Findings', 'sections', 'Sections', 'items', 'results']
        .some(f => Array.isArray(obj[f]) && (obj[f] as unknown[]).length > 0);
    return (hasTitle || hasSummary) && hasArrayContent;
}

/**
 * Build rich Block Kit blocks for a Codesmith-style code execution payload.
 *
 * Layout:
 * ```
 * [Task header]          — bold task description
 * [Results section]      — primary output (text or JSON code block)
 * [Code section]         — collapsible-style code block with language tag
 * [Errors context]       — warning-styled error list (if any)
 * [Iterations context]   — iteration count (if multiple)
 * ```
 */
function buildCodePayloadBlocks(obj: Record<string, unknown>): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];

    // Task description
    if (typeof obj.task === 'string' && (obj.task as string).trim()) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*Task:* ${truncateToLength(obj.task as string, 2900)}` }
        });
    }

    // Results — the primary output the user cares about
    const results = obj.results;
    if (results != null) {
        blocks.push(buildDivider());
        if (typeof results === 'string') {
            // Plain text results — render as mrkdwn sections
            const resultBlocks = markdownToBlocks(results);
            blocks.push(...resultBlocks.slice(0, 10));
        } else {
            // JSON results — render as code block
            const json = JSON.stringify(results, null, 2);
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: '*Results:*' }
            });
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: '```\n' + truncateToLength(json, 2990) + '\n```' }
            });
        }
    }

    // Code — show in a preformatted block
    const code = obj.code as string;
    if (code && code.trim()) {
        blocks.push(buildDivider());
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: '*Code:*' }
        });

        const codePreview = code.length > 2900 ? code.slice(0, 2900) + '\n// ...(truncated)' : code;
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: '```\n' + codePreview + '\n```' }
        });
    }

    // Errors
    if (Array.isArray(obj.errors) && (obj.errors as unknown[]).length > 0) {
        const errors = (obj.errors as string[]).filter(Boolean);
        if (errors.length > 0) {
            blocks.push({
                type: 'context',
                elements: [{
                    type: 'mrkdwn',
                    text: `⚠️ *Errors:* ${errors.slice(0, 5).join('; ')}`
                }]
            });
        }
    }

    // Iteration count
    const iterations = obj.iterations;
    if (typeof iterations === 'number' && iterations > 1) {
        blocks.push({
            type: 'context',
            elements: [{
                type: 'mrkdwn',
                text: `Completed in ${iterations} iterations`
            }]
        });
    }

    return blocks.length > 0 ? blocks : [];
}

/**
 * Build rich Block Kit blocks for a Research Agent state payload.
 *
 * Layout:
 * ```
 * [Goal header]           — research goal as header
 * [Status context]        — "in progress" indicator
 * [Plan text]             — initial research plan
 * [Questions list]        — numbered research questions
 * [Iteration sections]    — per-iteration findings
 * [Findings sections]     — extracted findings with headings
 * [Sources context]       — source links
 * ```
 */
function buildResearchPayloadBlocks(obj: Record<string, unknown>): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];
    const metadata = obj.metadata as Record<string, unknown>;
    const plan = obj.plan as Record<string, unknown>;

    // Research goal as header
    const goal = (metadata.researchGoal ?? metadata.ResearchGoal) as string;
    if (goal) {
        blocks.push({
            type: 'header',
            text: { type: 'plain_text', text: truncateToLength(goal, 150), emoji: true }
        });
    }

    // Status indicator
    const status = metadata.status as string | undefined;
    if (status === 'in_progress') {
        blocks.push({
            type: 'context',
            elements: [{ type: 'mrkdwn', text: '_Research is in progress..._' }]
        });
    }

    // Plan description
    const initialPlan = plan.initialPlan as string | undefined;
    if (initialPlan) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: truncateToLength(initialPlan, 3000) }
        });
    }

    // Research questions
    const questions = plan.researchQuestions as string[] | undefined;
    if (Array.isArray(questions) && questions.length > 0) {
        const questionList = questions.slice(0, 10).map((q, i) => `${i + 1}. ${q}`).join('\n');
        blocks.push(buildDivider());
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*Research Questions*\n${truncateToLength(questionList, 2900)}` }
        });
    }

    // Iterations
    const iterations = obj.iterations as Record<string, unknown>[] | undefined;
    if (Array.isArray(iterations) && iterations.length > 0) {
        blocks.push(buildDivider());
        for (const iteration of iterations.slice(0, 5)) {
            const iterBlocks = buildIterationBlocks(iteration);
            blocks.push(...iterBlocks);
        }
    }

    // Extracted findings
    const findingsFields = ['extractedFindings', 'findings', 'Findings'];
    for (const field of findingsFields) {
        if (Array.isArray(obj[field]) && (obj[field] as unknown[]).length > 0) {
            blocks.push(buildDivider());
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: '*Findings*' }
            });
            const items = obj[field] as Record<string, unknown>[];
            for (const item of items.slice(0, 8)) {
                const heading = (item.heading ?? item.Heading ?? item.title ?? item.Title) as string | undefined;
                const content = (item.content ?? item.Content ?? item.text ?? item.Text ?? item.finding ?? item.Finding) as string | undefined;
                if (heading || content) {
                    const text = heading && content
                        ? `*${heading}*\n${truncateToLength(content, 2800)}`
                        : truncateToLength((heading ?? content) as string, 2900);
                    blocks.push({ type: 'section', text: { type: 'mrkdwn', text } });
                }
            }
            break;
        }
    }

    // Sources
    const sourceFields = ['sources', 'Sources'];
    for (const field of sourceFields) {
        if (Array.isArray(obj[field]) && (obj[field] as unknown[]).length > 0) {
            const sources = (obj[field] as Record<string, unknown>[]).slice(0, 10);
            const links = sources
                .map(s => {
                    const title = (s.title ?? s.Title ?? s.name ?? 'Source') as string;
                    const url = (s.url ?? s.URL ?? s.link) as string | undefined;
                    return url ? `<${url}|${title}>` : title;
                })
                .join(' · ');
            blocks.push({
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `📎 Sources: ${links}` }]
            });
            break;
        }
    }

    return blocks.length > 0 ? blocks : [];
}

/**
 * Build blocks for a single research iteration.
 */
function buildIterationBlocks(iteration: Record<string, unknown>): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];
    const iterNum = iteration.iterationNumber ?? iteration.number;

    if (iterNum != null) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*Iteration ${iterNum}*` }
        });
    }

    // Summary or content
    const summary = (iteration.summary ?? iteration.findings ?? iteration.content ?? iteration.result) as string | undefined;
    if (typeof summary === 'string' && summary.trim()) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: truncateToLength(summary, 3000) }
        });
    }

    // Nested findings
    const findings = iteration.extractedFindings as Record<string, unknown>[] | undefined;
    if (Array.isArray(findings) && findings.length > 0) {
        for (const f of findings.slice(0, 5)) {
            const heading = (f.heading ?? f.Heading ?? f.title ?? f.Title) as string | undefined;
            const content = (f.content ?? f.Content ?? f.text ?? f.Text) as string | undefined;
            if (heading || content) {
                const text = heading && content
                    ? `*${heading}*\n${truncateToLength(content, 2800)}`
                    : truncateToLength((heading ?? content) as string, 2900);
                blocks.push({ type: 'section', text: { type: 'mrkdwn', text } });
            }
        }
    }

    return blocks;
}

/**
 * Build rich Block Kit blocks for a generic structured payload with title/sections/findings.
 *
 * Layout:
 * ```
 * [Title header]          — payload title
 * [Summary section]       — summary text
 * [Finding sections]      — heading + content pairs
 * [Sources context]       — source links
 * ```
 */
function buildStructuredContentBlocks(obj: Record<string, unknown>): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];

    // Title
    const title = (obj.title ?? obj.Title) as string | undefined;
    if (title) {
        blocks.push({
            type: 'header',
            text: { type: 'plain_text', text: truncateToLength(title, 150), emoji: true }
        });
    }

    // Summary
    const summary = (obj.summary ?? obj.Summary) as string | undefined;
    if (summary) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: truncateToLength(summary, 3000) }
        });
    }

    // Findings / Sections — first matching array
    const arrayFields = ['findings', 'Findings', 'extractedFindings', 'sections', 'Sections', 'items', 'results'];
    for (const field of arrayFields) {
        if (Array.isArray(obj[field]) && (obj[field] as unknown[]).length > 0) {
            blocks.push(buildDivider());
            const items = obj[field] as Record<string, unknown>[];
            for (const item of items.slice(0, 10)) {
                const heading = (item.heading ?? item.Heading ?? item.title ?? item.Title ?? item.name ?? item.Name) as string | undefined;
                const content = (item.content ?? item.Content ?? item.text ?? item.Text ?? item.description ?? item.Description ?? item.finding ?? item.Finding) as string | undefined;
                if (heading || content) {
                    const text = heading && content
                        ? `*${heading}*\n${truncateToLength(content, 2800)}`
                        : truncateToLength((heading ?? content) as string, 2900);
                    blocks.push({ type: 'section', text: { type: 'mrkdwn', text } });
                }
            }
            break;
        }
    }

    // Sources
    const sourceFields = ['sources', 'Sources', 'sourceRecords', 'references'];
    for (const field of sourceFields) {
        if (Array.isArray(obj[field]) && (obj[field] as unknown[]).length > 0) {
            const sources = (obj[field] as Record<string, unknown>[]).slice(0, 10);
            const links = sources
                .map(s => {
                    const sTitle = (s.title ?? s.Title ?? s.name ?? 'Source') as string;
                    const url = (s.url ?? s.URL ?? s.link) as string | undefined;
                    return url ? `<${url}|${sTitle}>` : sTitle;
                })
                .join(' · ');
            blocks.push({
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `📎 Sources: ${links}` }]
            });
            break;
        }
    }

    return blocks.length > 0 ? blocks : [];
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
 * When truncating, adds a "View Full Response" button that opens the modal handler.
 *
 * @param blocks - The full set of blocks to potentially truncate.
 * @param _fullText - The full response text (stored as value on the button for modal retrieval).
 */
function enforceBlockLimit(blocks: Record<string, unknown>[], _fullText?: string): Record<string, unknown>[] {
    if (blocks.length <= SLACK_MAX_BLOCKS) {
        return blocks;
    }

    // Keep the first blocks up to the limit - 2 (notice + button)
    const truncated = blocks.slice(0, SLACK_MAX_BLOCKS - 2);
    truncated.push({
        type: 'context',
        elements: [{
            type: 'mrkdwn',
            text: '⋯ _Response truncated due to length._'
        }]
    });
    truncated.push({
        type: 'actions',
        elements: [{
            type: 'button',
            text: { type: 'plain_text', text: 'View Full Response', emoji: true },
            action_id: 'mj:view_full:response'
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
