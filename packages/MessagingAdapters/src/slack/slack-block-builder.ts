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

import { ExecuteAgentResult, MJAIAgentEntityExtended, ActionableCommand, OpenResourceCommand, AutomaticCommand, AgentResponseForm, FormQuestion, MediaOutput } from '@memberjunction/ai-core-plus';
import { LogStatus } from '@memberjunction/core';
import { markdownToBlocks } from './slack-formatter.js';

/** Slack enforces a hard 50-block limit per message. */
const SLACK_MAX_BLOCKS = 50;

/** Blocks reserved for non-text elements (header, footer, dividers, actions). */
const RESERVED_BLOCK_SLOTS = 8;

/**
 * Approximate max payload size in bytes. Slack's actual limit is ~50KB,
 * but we leave headroom for the API envelope (metadata, token, etc.).
 */
const SLACK_MAX_PAYLOAD_BYTES = 38_000;

// ─── Full Response Text Store ─────────────────────────────────────────────
// Stores full response text for retrieval by the "View Full" modal.
// This prevents content loss when blocks are truncated for payload size.

/** In-memory store for full response text, keyed by unique ID. Entries expire after 30 min. */
const fullResponseStore = new Map<string, { text: string; timestamp: number }>();
const FULL_RESPONSE_TTL_MS = 30 * 60 * 1000;
let fullResponseCounter = 0;

/**
 * Store full response text and return a retrieval key.
 */
function storeFullResponseText(text: string): string {
  const key = `fr_${Date.now()}_${++fullResponseCounter}`;
  fullResponseStore.set(key, { text, timestamp: Date.now() });
  // Cleanup expired entries
  for (const [k, v] of fullResponseStore) {
    if (Date.now() - v.timestamp > FULL_RESPONSE_TTL_MS) {
      fullResponseStore.delete(k);
    }
  }
  return key;
}

/**
 * Retrieve full response text by store key.
 * Returns null if expired or not found.
 */
export function getFullResponseText(key: string): string | null {
  const entry = fullResponseStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > FULL_RESPONSE_TTL_MS) {
    fullResponseStore.delete(key);
    return null;
  }
  return entry.text;
}

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
 * Options for building a rich response layout.
 */
export interface BuildRichResponseOptions {
  /** Base URL of MJ Explorer for deep-linking `open:resource` commands. */
  explorerBaseURL?: string;
  /** MJ Conversation Artifact ID — when provided, the Explorer link points to the artifact viewer. */
  artifactId?: string;
  /** MJ Conversation ID — when no artifact exists, links to the conversation in MJ Explorer. */
  conversationId?: string;
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
 * [Notification Blocks]      — if automatic notification commands present
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
  responseText: string,
  options?: BuildRichResponseOptions
): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  // Agent context header
  blocks.push(buildAgentContextBlock(agent));
  blocks.push(buildDivider());

  // When an artifact exists (artifactId provided), MJ Explorer shows the Message
  // text inline and puts the full payload in a separate artifact viewer. Mirror that
  // here: render responseText as the primary content and let the Explorer deep-link
  // handle the full payload. Only render structured payloads inline when there is
  // NO artifact — meaning Slack is the only way to see the content.
  const hasArtifact = !!options?.artifactId;

  if (!hasArtifact) {
    // No artifact — try structured payload rendering so content isn't lost.
    const structuredPayload = result ? detectStructuredPayload(result) : null;
    const structuredBlocks = structuredPayload ? buildStructuredPayloadBlocksFromType(structuredPayload) : null;

    if (structuredBlocks) {
      blocks.push(...structuredBlocks);
    } else {
      // No structured payload — fall through to text rendering below
      blocks.push(...buildTextBlocks(responseText));
    }

    // Artifact card from payload structure (no artifactId but payload looks artifact-like)
    const artifact = detectArtifactFromResult(result);
    if (artifact) {
      blocks.push(buildDivider());
      blocks.push(...buildArtifactCard(artifact));
    }

    // Catch-all: if nothing structured was found, check for buried content
    if (!structuredBlocks && !artifact) {
      const payloadContent = extractPayloadContent(result);
      if (payloadContent && !isContentSimilar(payloadContent.content, responseText)) {
        blocks.push(buildDivider());
        blocks.push(...buildPayloadContentCard(payloadContent.title, payloadContent.content));
      }
    }
  } else {
    // Artifact exists — show only the user-facing Message text.
    // The "View full artifact in MJ Explorer" link (rendered below) gives access
    // to the complete structured payload, just like the artifact viewer in Explorer.
    blocks.push(...buildTextBlocks(responseText));
  }

  // Media blocks (images from agent)
  if (result?.mediaOutputs && result.mediaOutputs.length > 0) {
    blocks.push(...buildMediaBlocks(result.mediaOutputs.map((m) => mediaOutputToRecord(m))));
  }

  // Notification blocks from automatic commands
  const notificationBlocks = buildNotificationBlocks(result?.automaticCommands);
  if (notificationBlocks.length > 0) {
    blocks.push(...notificationBlocks);
  }

  // Action buttons (if actionableCommands present)
  const commands = result?.actionableCommands;
  if (commands && commands.length > 0) {
    blocks.push(buildDivider());
    blocks.push(...buildActionButtons(commands, options?.explorerBaseURL));
  }

  // Response form (choice buttons for structured input)
  if (result?.responseForm?.questions && result.responseForm.questions.length > 0) {
    blocks.push(...buildResponseForm(result.responseForm));
  }

  // "Open in MJ Explorer" link — shown for all successful agent runs when ExplorerBaseURL is configured
  const explorerLink = buildExplorerArtifactLink(result, options?.explorerBaseURL, options?.artifactId, options?.conversationId);
  if (explorerLink) {
    blocks.push(...explorerLink);
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
      alt_text: agentName,
    });
  }

  elements.push({
    type: 'mrkdwn',
    text: `*${agentName}*`,
  });

  return {
    type: 'context',
    elements,
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
        emoji: true,
      },
    });
  }

  // Summary / Body content — render as inline preview with "View Full" for long content
  if (artifact.Summary) {
    const PREVIEW_LIMIT = 1500;
    const needsModal = artifact.Summary.length > PREVIEW_LIMIT;
    const preview = needsModal
      ? artifact.Summary.substring(0, PREVIEW_LIMIT) + '\n\n_... content continues ..._'
      : artifact.Summary;

    // Render preview as markdown blocks
    const previewBlocks = markdownToBlocks(preview);
    blocks.push(...previewBlocks.slice(0, 10));

    // "View Full Content" button for long content
    if (needsModal) {
      const storeKey = storeFullResponseText(artifact.Summary);
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Full Content', emoji: true },
            action_id: 'mj:view_full:artifact',
            value: storeKey,
          },
        ],
      });
    }
  }

  // Sections
  if (artifact.Sections && artifact.Sections.length > 0) {
    for (const section of artifact.Sections.slice(0, 5)) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${section.Heading}*\n${truncateToLength(section.Content, 2900)}`,
        },
      });
    }
  }

  // Sources
  if (artifact.Sources && artifact.Sources.length > 0) {
    const sourceLinks = artifact.Sources.slice(0, 10)
      .map((s) => `<${s.URL}|${s.Title}>`)
      .join(' · ');
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📎 Sources: ${sourceLinks}`,
        },
      ],
    });
  }

  // "View Full" button if URL is available
  if (artifact.URL) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Full Report', emoji: true },
          url: artifact.URL,
          action_id: 'mj:view_artifact',
        },
      ],
    });
  }

  return blocks;
}

/**
 * Build action buttons from agent actionable commands.
 *
 * Handles both command types:
 * - `open:url` → Slack URL button (opens external link)
 * - `open:resource` → Deep-link button to MJ Explorer if `explorerBaseURL` is configured,
 *   otherwise rendered as an informational context block showing entity/resource info
 *
 * Returns an array of blocks (may include both action and context blocks).
 */
export function buildActionButtons(commands: ActionableCommand[], explorerBaseURL?: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const buttons: Record<string, unknown>[] = [];
  const resourceInfoItems: string[] = [];

  for (const cmd of commands.slice(0, 5)) {
    if (cmd.type === 'open:url' && 'url' in cmd) {
      buttons.push(buildURLButton(cmd.label, cmd.url, buttons.length));
    } else if (cmd.type === 'open:resource') {
      const resourceCmd = cmd as OpenResourceCommand;
      const deepLink = buildExplorerDeepLink(resourceCmd, explorerBaseURL);
      if (deepLink) {
        buttons.push(buildURLButton(cmd.label, deepLink, buttons.length));
      } else {
        resourceInfoItems.push(formatResourceInfo(resourceCmd));
      }
    }
  }

  // Add clickable buttons
  if (buttons.length > 0) {
    blocks.push({ type: 'actions', elements: buttons });
  }

  // Add resource info context for open:resource without deep-link
  if (resourceInfoItems.length > 0) {
    blocks.push({
      type: 'context',
      elements: resourceInfoItems.map(text => ({
        type: 'mrkdwn',
        text
      }))
    });
  }

  return blocks;
}

/**
 * Build a single Slack URL button.
 */
function buildURLButton(label: string | undefined, url: string, index: number): Record<string, unknown> {
  return {
    type: 'button',
    text: { type: 'plain_text', text: truncateToLength(label ?? `Link ${index + 1}`, 75), emoji: true },
    action_id: `mj:action_${index}`,
    url
  };
}

/**
 * Build a deep link URL into MJ Explorer for an `open:resource` command.
 * Returns null if no explorer base URL is configured.
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
 * Format an `open:resource` command as descriptive text for a context block.
 * Used when no MJ Explorer URL is configured for deep-linking.
 */
function formatResourceInfo(cmd: OpenResourceCommand): string {
  const label = cmd.label ?? 'Resource';
  const typeIcon = RESOURCE_TYPE_ICONS[cmd.resourceType] ?? '';
  const entityNote = cmd.entityName ? ` (${cmd.entityName})` : '';
  return `${typeIcon} ${label}${entityNote} — _open in MJ Explorer_`;
}

/** Icons for resource types in context blocks. */
const RESOURCE_TYPE_ICONS: Record<string, string> = {
  Record: ':page_facing_up:',
  Dashboard: ':bar_chart:',
  Report: ':clipboard:',
  Form: ':pencil:',
  View: ':mag:',
};

/**
 * Build MJ Explorer deep-link context blocks.
 *
 * - No artifact: single "Open conversation in MJ Explorer" link
 * - With artifact: two links — conversation + artifact
 * - Neither ID present: returns `null`
 */
function buildExplorerArtifactLink(
  _result: ExecuteAgentResult | null,
  explorerBaseURL: string | undefined,
  artifactId?: string,
  conversationId?: string,
): Record<string, unknown>[] | null {
  if (!explorerBaseURL) return null;
  if (!conversationId && !artifactId) return null;

  const base = explorerBaseURL.replace(/\/+$/, '');
  const links: string[] = [];

  if (conversationId) {
    const convoLink = `${base}/app/Chat/Conversations?conversationId=${encodeURIComponent(conversationId)}`;
    links.push(`:speech_balloon: <${convoLink}|Open conversation in MJ Explorer>`);
  }

  if (artifactId) {
    const artifactLink = `${base}/resource/artifact/${encodeURIComponent(artifactId)}`;
    links.push(`:desktop_computer: <${artifactLink}|View full artifact in MJ Explorer>`);
  }

  return [
    {
      type: 'context',
      elements: links.map(text => ({ type: 'mrkdwn', text }))
    }
  ];
}

/**
 * Build notification blocks from automatic commands.
 *
 * Only handles `notification` type automatic commands — other types
 * (like `refresh:data`) have no meaningful Slack representation.
 *
 * Renders notifications as styled context blocks with severity icons.
 */
export function buildNotificationBlocks(commands: AutomaticCommand[] | undefined): Record<string, unknown>[] {
  if (!commands || commands.length === 0) return [];

  const blocks: Record<string, unknown>[] = [];

  for (const cmd of commands) {
    if (cmd.type !== 'notification') continue;
    const icon = NOTIFICATION_ICONS[cmd.severity ?? 'info'];
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `${icon} ${cmd.message}`
      }]
    });
  }

  return blocks;
}

/** Severity icons for notification automatic commands. */
const NOTIFICATION_ICONS: Record<string, string> = {
  success: ':white_check_mark:',
  info: ':information_source:',
  warning: ':warning:',
  error: ':x:',
};

/**
 * Build image blocks from media outputs.
 */
export function buildMediaBlocks(mediaOutputs: Record<string, unknown>[]): Record<string, unknown>[] {
  return mediaOutputs
    .filter((m) => typeof m.url === 'string' && (m.url as string).startsWith('https://'))
    .slice(0, 5)
    .map((m) => ({
      type: 'image',
      image_url: m.url,
      alt_text: (m.title as string) ?? (m.alt as string) ?? 'Agent output',
      title: m.title ? { type: 'plain_text', text: truncateToLength(m.title as string, 200) } : undefined,
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
        text: `⚠️ ${errorMessage}`,
      },
    },
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
    elements: [
      {
        type: 'mrkdwn',
        text: parts.length > 0 ? parts.join(' · ') : 'Completed',
      },
    ],
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
    alt: m.description ?? m.label ?? 'Agent output',
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

  // Look for body/content text to use as Summary when no explicit summary exists
  const summary = (obj.summary as string) ?? (obj.Summary as string)
    ?? (obj.body as string) ?? (obj.Body as string)
    ?? (obj.content as string) ?? (obj.Content as string)
    ?? (obj.text as string) ?? (obj.Text as string);

  return {
    Title: (obj.title as string) ?? (obj.Title as string),
    Summary: summary ?? undefined,
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
      text: { type: 'mrkdwn', text: `*${form.title}*` },
    });
  }
  if (form.description) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: form.description }],
    });
  }

  // Compact summary of fields
  const fieldNames = form.questions.map((q) => q.label).join(', ');
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `_Fields: ${truncateToLength(fieldNames, 280)}_` }],
  });

  // Single green button opens the full modal
  const formJson = JSON.stringify(form);
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: form.submitLabel ?? 'Fill Out Form', emoji: true },
        action_id: 'mj:form_modal:open',
        value: formJson.length <= 2000 ? formJson : 'too_large',
        style: 'primary',
      },
    ],
  });

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
        optional: !question.required,
      });
    }
  }

  return {
    type: 'modal',
    callback_id: 'mj:form_modal:submit',
    title: { type: 'plain_text', text: truncateToLength(form.title ?? 'Form', 24) },
    submit: { type: 'plain_text', text: form.submitLabel ?? 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: modalBlocks,
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
        ...(textType.maxLength ? { max_length: textType.maxLength } : {}),
      };
    }

    case 'number':
    case 'currency':
      return {
        type: 'number_input',
        action_id: `mj:form_field:${question.id}`,
        is_decimal_allowed: qType.type === 'currency',
        ...(qType.min != null ? { min_value: String(qType.min) } : {}),
        ...(qType.max != null ? { max_value: String(qType.max) } : {}),
      };

    case 'date':
    case 'datetime':
      return {
        type: 'datepicker',
        action_id: `mj:form_field:${question.id}`,
      };

    case 'buttongroup':
    case 'radio': {
      const opts = (qType as { options: Array<{ value: string | number | boolean; label: string }> }).options;
      return {
        type: 'radio_buttons',
        action_id: `mj:form_field:${question.id}`,
        options: opts.slice(0, 10).map((opt) => ({
          text: { type: 'plain_text', text: truncateToLength(String(opt.label), 75) },
          value: String(opt.value),
        })),
      };
    }

    case 'dropdown': {
      const opts = (qType as { options: Array<{ value: string | number | boolean; label: string }> }).options;
      return {
        type: 'static_select',
        action_id: `mj:form_field:${question.id}`,
        options: opts.slice(0, 100).map((opt) => ({
          text: { type: 'plain_text', text: truncateToLength(String(opt.label), 75) },
          value: String(opt.value),
        })),
      };
    }

    case 'checkbox': {
      const opts = (qType as { options: Array<{ value: string | number | boolean; label: string }> }).options;
      return {
        type: 'checkboxes',
        action_id: `mj:form_field:${question.id}`,
        options: opts.slice(0, 10).map((opt) => ({
          text: { type: 'plain_text', text: truncateToLength(String(opt.label), 75) },
          value: String(opt.value),
        })),
      };
    }

    default:
      // Fallback for slider, time, date_range, etc. — use text input
      return {
        type: 'plain_text_input',
        action_id: `mj:form_field:${question.id}`,
        placeholder: { type: 'plain_text', text: `Enter ${question.label}` },
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
 * Build blocks from an already-detected structured payload type.
 */
function buildStructuredPayloadBlocksFromType(payload: StructuredPayload): Record<string, unknown>[] | null {
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

  // Also check agentRun.Result as a candidate — some agents populate Result but not FinalPayload
  const resultStr = result.agentRun?.Result;
  if (resultStr && typeof resultStr === 'string' && !finalPayloadStr) {
    try {
      const parsed = JSON.parse(resultStr);
      if (parsed != null && typeof parsed === 'object') {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not JSON
    }
  }

  for (const obj of candidates) {
    // Code payload detection runs FIRST — before orchestration filtering.
    // Loop agents (Codesmith, Query Builder) may include loop control fields
    // (e.g., shouldTerminate) alongside code+results. We don't want to discard
    // the actual output just because orchestration keys are also present.
    // Detection: `code` field is sufficient — `results` may live in Message or be omitted.
    if (typeof obj.code === 'string' && (obj.code as string).length > 10) {
      return { Type: 'code', Data: obj };
    }

    // Skip orchestration metadata (delegation, sub-agent control flow)
    if (isOrchestrationPayload(obj)) continue;

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
  const orchestrationKeys = ['subAgentResult', 'payloadChangeResult', 'shouldTerminate', 'taskGraph', 'actionResult'];
  if (orchestrationKeys.some((key) => key in obj)) return true;

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
  return (
    meta != null &&
    typeof meta === 'object' &&
    (typeof meta.researchGoal === 'string' || typeof meta.ResearchGoal === 'string') &&
    obj.plan != null &&
    typeof obj.plan === 'object'
  );
}

function isStructuredContent(obj: Record<string, unknown>): boolean {
  const hasTitle = typeof obj.title === 'string' || typeof obj.Title === 'string';
  const hasSummary = typeof obj.summary === 'string' || typeof obj.Summary === 'string';
  const hasArrayContent = ['findings', 'Findings', 'sections', 'Sections', 'items', 'results'].some(
    (f) => Array.isArray(obj[f]) && (obj[f] as unknown[]).length > 0,
  );
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
      text: { type: 'mrkdwn', text: `*Task:* ${truncateToLength(obj.task as string, 2900)}` },
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
        text: { type: 'mrkdwn', text: '*Results:*' },
      });
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '```\n' + truncateToLength(json, 2990) + '\n```' },
      });
    }
  }

  // Code — show in a preformatted block
  const code = obj.code as string;
  if (code && code.trim()) {
    blocks.push(buildDivider());
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*Code:*' },
    });

    const codePreview = code.length > 2900 ? code.slice(0, 2900) + '\n// ...(truncated)' : code;
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '```\n' + codePreview + '\n```' },
    });
  }

  // Errors
  if (Array.isArray(obj.errors) && (obj.errors as unknown[]).length > 0) {
    const errors = (obj.errors as string[]).filter(Boolean);
    if (errors.length > 0) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `⚠️ *Errors:* ${errors.slice(0, 5).join('; ')}`,
          },
        ],
      });
    }
  }

  // Iteration count
  const iterations = obj.iterations;
  if (typeof iterations === 'number' && iterations > 1) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Completed in ${iterations} iterations`,
        },
      ],
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
      text: { type: 'plain_text', text: truncateToLength(goal, 150), emoji: true },
    });
  }

  // Status indicator
  const status = metadata.status as string | undefined;
  if (status === 'in_progress') {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '_Research is in progress..._' }],
    });
  }

  // Plan description
  const initialPlan = plan.initialPlan as string | undefined;
  if (initialPlan) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncateToLength(initialPlan, 3000) },
    });
  }

  // Research questions
  const questions = plan.researchQuestions as string[] | undefined;
  if (Array.isArray(questions) && questions.length > 0) {
    const questionList = questions
      .slice(0, 10)
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n');
    blocks.push(buildDivider());
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Research Questions*\n${truncateToLength(questionList, 2900)}` },
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
        text: { type: 'mrkdwn', text: '*Findings*' },
      });
      for (const item of (obj[field] as Record<string, unknown>[]).slice(0, 8)) {
        const block = buildFindingItemBlock(item);
        if (block) blocks.push(block);
      }
      break;
    }
  }

  // Sources
  const sourcesBlock = findFirstSourcesBlock(obj, ['sources', 'Sources']);
  if (sourcesBlock) blocks.push(sourcesBlock);

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
      text: { type: 'mrkdwn', text: `*Iteration ${iterNum}*` },
    });
  }

  // Summary or content
  const summary = (iteration.summary ?? iteration.findings ?? iteration.content ?? iteration.result) as string | undefined;
  if (typeof summary === 'string' && summary.trim()) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncateToLength(summary, 3000) },
    });
  }

  // Nested findings
  const findings = iteration.extractedFindings as Record<string, unknown>[] | undefined;
  if (Array.isArray(findings) && findings.length > 0) {
    for (const f of findings.slice(0, 5)) {
      const block = buildFindingItemBlock(f);
      if (block) blocks.push(block);
    }
  }

  return blocks;
}

/**
 * Build rich Block Kit blocks for a generic structured payload with title/sections/findings.
 */
function buildStructuredContentBlocks(obj: Record<string, unknown>): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  // Title
  const title = (obj.title ?? obj.Title) as string | undefined;
  if (title) {
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: truncateToLength(title, 150), emoji: true },
    });
  }

  // Summary
  const summary = (obj.summary ?? obj.Summary) as string | undefined;
  if (summary) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncateToLength(summary, 3000) },
    });
  }

  // Findings / Sections — first matching array
  const arrayFields = ['findings', 'Findings', 'extractedFindings', 'sections', 'Sections', 'items', 'results'];
  for (const field of arrayFields) {
    if (Array.isArray(obj[field]) && (obj[field] as unknown[]).length > 0) {
      blocks.push(buildDivider());
      for (const item of (obj[field] as Record<string, unknown>[]).slice(0, 10)) {
        const block = buildFindingItemBlock(item);
        if (block) blocks.push(block);
      }
      break;
    }
  }

  // Sources
  const sourcesBlock = findFirstSourcesBlock(obj, ['sources', 'Sources', 'sourceRecords', 'references']);
  if (sourcesBlock) blocks.push(sourcesBlock);

  return blocks.length > 0 ? blocks : [];
}

// ─── Catch-All Payload Content Extraction ─────────────────────────────────

/** Minimum text length to be considered substantial payload content. */
const MIN_PAYLOAD_CONTENT_LENGTH = 200;

/**
 * Extract substantive text content from the agent result payload.
 *
 * This is the catch-all for when structured payload detection and artifact
 * detection both fail. It deep-walks the payload looking for the longest
 * text value — catching blog posts, reports, and other content buried under
 * arbitrary agent-specific field names.
 *
 * Returns null if no substantial content is found.
 */
function extractPayloadContent(result: ExecuteAgentResult | null): { title: string | null; content: string } | null {
  if (!result) return null;

  // Collect candidate payloads
  const candidates: Record<string, unknown>[] = [];

  if (result.payload != null && typeof result.payload === 'object') {
    candidates.push(result.payload as Record<string, unknown>);
  }

  const finalPayloadStr = result.agentRun?.FinalPayload;
  if (finalPayloadStr && typeof finalPayloadStr === 'string') {
    try {
      const parsed = JSON.parse(finalPayloadStr);
      if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Plain text FinalPayload
      if (finalPayloadStr.trim().length > MIN_PAYLOAD_CONTENT_LENGTH) {
        return { title: null, content: finalPayloadStr };
      }
    }
  }

  for (const obj of candidates) {
    // Skip orchestration payloads
    if (isOrchestrationPayload(obj)) continue;

    // Try to extract a title
    const title = extractTitle(obj);

    // Deep-walk for the longest text content
    const content = deepExtractText(obj, 4);
    if (content && content.length >= MIN_PAYLOAD_CONTENT_LENGTH) {
      return { title, content };
    }
  }

  return null;
}

/**
 * Extract a title from common field names in a payload object.
 * Checks the top level first, then one level deep in nested objects.
 */
function extractTitle(obj: Record<string, unknown>): string | null {
  const titleFields = ['title', 'Title', 'name', 'Name', 'heading', 'Heading', 'subject', 'Subject', 'topic', 'Topic'];
  // Top-level check
  for (const field of titleFields) {
    if (typeof obj[field] === 'string' && (obj[field] as string).trim()) {
      return (obj[field] as string).trim();
    }
  }
  // One level deep
  for (const value of Object.values(obj)) {
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      for (const field of titleFields) {
        if (typeof nested[field] === 'string' && (nested[field] as string).trim()) {
          return (nested[field] as string).trim();
        }
      }
    }
  }
  return null;
}

/** Fields that are unlikely to contain user-facing document content. */
const PAYLOAD_NON_CONTENT_FIELDS = new Set([
  'id', 'ID', 'uuid', 'status', 'type', 'step', 'nextStep',
  'createdAt', 'updatedAt', 'timestamp', 'metadata',
  'subAgentResult', 'payloadChangeResult', 'shouldTerminate',
  'terminateAfter', 'iterationNumber', 'number',
  'taskGraph', 'actionResult', 'resultCode', 'allMatches',
  'similarityScore', 'systemPrompt', 'matchCount',
]);

/**
 * Deep-walk an object to find the longest text value that looks like content.
 * Skips known non-content fields, serialized JSON strings, and short values.
 */
function deepExtractText(obj: Record<string, unknown>, maxDepth: number): string | null {
  if (maxDepth <= 0) return null;

  let bestText: string | null = null;
  let bestLength = 0;

  for (const [key, value] of Object.entries(obj)) {
    if (PAYLOAD_NON_CONTENT_FIELDS.has(key)) continue;

    if (typeof value === 'string' && value.trim().length > 50) {
      const trimmed = value.trim();
      // Skip serialized JSON
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 200) continue;
      if (value.length > bestLength) {
        bestLength = value.length;
        bestText = value;
      }
    } else if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = deepExtractText(value as Record<string, unknown>, maxDepth - 1);
      if (nested && nested.length > bestLength) {
        bestLength = nested.length;
        bestText = nested;
      }
    } else if (Array.isArray(value) && value.length > 0) {
      // Check arrays of objects (e.g., sections: [{ content: "..." }])
      for (const item of value) {
        if (item != null && typeof item === 'object' && !Array.isArray(item)) {
          const nested = deepExtractText(item as Record<string, unknown>, maxDepth - 1);
          if (nested && nested.length > bestLength) {
            bestLength = nested.length;
            bestText = nested;
          }
        }
      }
    }
  }

  return bestText;
}

/**
 * Check if two texts are similar enough that showing both would be redundant.
 * Uses a simple prefix/containment check — not a full diff.
 */
function isContentSimilar(payloadContent: string, responseText: string): boolean {
  const a = payloadContent.trim().toLowerCase();
  const b = responseText.trim().toLowerCase();
  if (a.length === 0 || b.length === 0) return false;
  // If one contains the other, they're similar
  if (a.includes(b) || b.includes(a)) return true;
  // If first 200 chars match, similar enough
  if (a.substring(0, 200) === b.substring(0, 200)) return true;
  return false;
}

/**
 * Build blocks to display payload content inline with a "View Full Content" button.
 *
 * Renders:
 * - Title header (if available)
 * - Inline preview (first ~1500 chars of content)
 * - "View Full Content" button if content exceeds preview length
 */
function buildPayloadContentCard(title: string | null, content: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  // Title
  if (title) {
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: truncateToLength(title, 150), emoji: true },
    });
  }

  // Inline content preview — render as markdown blocks
  const PREVIEW_LENGTH = 1500;
  const needsTruncation = content.length > PREVIEW_LENGTH;
  const preview = needsTruncation
    ? content.substring(0, PREVIEW_LENGTH) + '\n\n_... content continues ..._'
    : content;

  const contentBlocks = markdownToBlocks(preview);
  blocks.push(...contentBlocks.slice(0, 15)); // Cap at 15 blocks for the preview

  // "View Full Content" button when content is long
  if (needsTruncation) {
    const storeKey = storeFullResponseText(content);
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Full Content', emoji: true },
          action_id: 'mj:view_full:payload',
          value: storeKey,
        },
      ],
    });
  }

  return blocks;
}

// ─── Shared Block Helpers ─────────────────────────────────────────────────

/**
 * Build a section block for a finding/item with heading and/or content.
 * Extracts heading and content from common field names used across agent payloads.
 * Returns null if no displayable content is found.
 */
function buildFindingItemBlock(item: Record<string, unknown>): Record<string, unknown> | null {
  const heading = (item.heading ?? item.Heading ?? item.title ?? item.Title ?? item.name ?? item.Name) as string | undefined;
  const content = (item.content ?? item.Content ?? item.text ?? item.Text ?? item.description ?? item.Description ?? item.finding ?? item.Finding) as
    | string
    | undefined;
  if (!heading && !content) return null;
  const text = heading && content
    ? `*${heading}*\n${truncateToLength(content, 2800)}`
    : truncateToLength((heading ?? content) as string, 2900);
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

/**
 * Build a context block with formatted source links.
 * Returns null if the sources array is empty or contains no valid entries.
 */
function buildSourceLinksBlock(sources: Record<string, unknown>[]): Record<string, unknown> | null {
  const entries = sources.slice(0, 10);
  if (entries.length === 0) return null;
  const links = entries
    .map((s) => {
      const title = (s.title ?? s.Title ?? s.name ?? 'Source') as string;
      const url = (s.url ?? s.URL ?? s.link) as string | undefined;
      return url ? `<${url}|${title}>` : title;
    })
    .join(' · ');
  return {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `📎 Sources: ${links}` }],
  };
}

/**
 * Search an object for the first non-empty sources array from the given field names
 * and build a source links block from it.
 */
function findFirstSourcesBlock(obj: Record<string, unknown>, fieldNames: string[]): Record<string, unknown> | null {
  for (const field of fieldNames) {
    if (Array.isArray(obj[field]) && (obj[field] as unknown[]).length > 0) {
      return buildSourceLinksBlock(obj[field] as Record<string, unknown>[]);
    }
  }
  return null;
}

function normalizeSections(raw: unknown[] | undefined): ArtifactSection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s != null && typeof s === 'object')
    .map((s) => {
      const section = s as Record<string, unknown>;
      return {
        Heading: (section.heading as string) ?? (section.Heading as string) ?? (section.title as string) ?? '',
        Content: (section.content as string) ?? (section.Content as string) ?? (section.text as string) ?? '',
      };
    })
    .filter((s) => s.Heading || s.Content);
}

function normalizeSources(raw: unknown[] | undefined): ArtifactSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s != null && typeof s === 'object')
    .map((s) => {
      const source = s as Record<string, unknown>;
      return {
        Title: (source.title as string) ?? (source.Title as string) ?? (source.name as string) ?? 'Source',
        URL: (source.url as string) ?? (source.URL as string) ?? (source.link as string) ?? '',
      };
    })
    .filter((s) => s.URL);
}

/**
 * Enforce Slack's block count (≤ 50) AND payload byte size (~38KB) limits.
 *
 * Strategy when over budget:
 * 1. Trim block count to ≤ 50
 * 2. If still over byte budget, progressively truncate long section text
 * 3. If still over, remove tail blocks
 * 4. Always reserve last 2 slots for truncation notice + "View Full" button
 *
 * @param blocks - The full set of blocks to potentially truncate.
 * @param fullText - The full response text, stored for retrieval in the "View Full" modal.
 */
function enforceBlockLimit(blocks: Record<string, unknown>[], fullText?: string): Record<string, unknown>[] {
  // Store full text for later retrieval by the "View Full" modal
  const storeKey = fullText ? storeFullResponseText(fullText) : undefined;

  // Phase 1: block count enforcement
  let result = blocks.length > SLACK_MAX_BLOCKS
    ? blocks.slice(0, SLACK_MAX_BLOCKS - 2)
    : blocks;

  // Phase 2: byte size enforcement
  result = trimBlocksForPayloadSize(result, SLACK_MAX_PAYLOAD_BYTES);

  // If we trimmed anything (block count or byte size), add notice + button
  if (result.length < blocks.length || result !== blocks) {
    // Check if we already added truncation elements (trimBlocksForPayloadSize may have)
    const lastBlock = result[result.length - 1];
    const hasNotice = lastBlock && (lastBlock as Record<string, unknown>).type === 'actions' &&
      Array.isArray((lastBlock as Record<string, unknown>).elements) &&
      ((lastBlock as Record<string, unknown>).elements as Record<string, unknown>[]).some(
        (e) => (e as Record<string, unknown>).action_id === 'mj:view_full:response'
      );

    if (!hasNotice) {
      result = appendTruncationNotice(result, storeKey);
    }
  }

  return result;
}

/**
 * Progressively trim blocks to fit within the byte budget.
 * First truncates long text fields, then removes tail blocks.
 */
function trimBlocksForPayloadSize(blocks: Record<string, unknown>[], maxBytes: number): Record<string, unknown>[] {
  let serialized = JSON.stringify(blocks);
  if (serialized.length <= maxBytes) return blocks;

  // Pass 1: truncate section text to 500 chars
  let trimmed = truncateBlockTexts(blocks, 500);
  serialized = JSON.stringify(trimmed);
  if (serialized.length <= maxBytes) return trimmed;

  // Pass 2: truncate section text to 200 chars
  trimmed = truncateBlockTexts(blocks, 200);
  serialized = JSON.stringify(trimmed);
  if (serialized.length <= maxBytes) return trimmed;

  // Pass 3: remove blocks from the tail until under budget (reserve 2 for notice)
  const reduced = [...trimmed];
  while (reduced.length > 2 && JSON.stringify(reduced).length > maxBytes) {
    reduced.splice(reduced.length - 1, 1);
  }

  return reduced;
}

/**
 * Clone blocks with section text fields truncated to maxChars.
 */
function truncateBlockTexts(blocks: Record<string, unknown>[], maxChars: number): Record<string, unknown>[] {
  return blocks.map((block) => {
    if (block.type !== 'section') return block;
    const textObj = block.text as Record<string, unknown> | undefined;
    if (!textObj || typeof textObj.text !== 'string') return block;
    if ((textObj.text as string).length <= maxChars) return block;
    return {
      ...block,
      text: {
        ...textObj,
        text: (textObj.text as string).substring(0, maxChars) + '...',
      },
    };
  });
}

/**
 * Append truncation notice and "View Full Response" button to a block array.
 */
function appendTruncationNotice(blocks: Record<string, unknown>[], storeKey?: string): Record<string, unknown>[] {
  // Ensure room for 2 extra blocks
  const trimmed = blocks.length > SLACK_MAX_BLOCKS - 2
    ? blocks.slice(0, SLACK_MAX_BLOCKS - 2)
    : [...blocks];

  trimmed.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: '⋯ _Response truncated due to length._',
      },
    ],
  });

  const buttonValue = storeKey ?? 'no_stored_text';
  trimmed.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View Full Response', emoji: true },
        action_id: 'mj:view_full:response',
        value: buttonValue,
      },
    ],
  });

  return trimmed;
}

/**
 * Truncate a string to a given length with ellipsis.
 */
function truncateToLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
