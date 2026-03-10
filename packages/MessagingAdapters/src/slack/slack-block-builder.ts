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

  // Mirror MJ Explorer: show the user-facing Message text (responseText) and let
  // the Explorer deep-link provide access to the full payload/artifact. We do NOT
  // mine agent payloads for content — that requires hardcoding agent-specific payload
  // shapes and inevitably leaks internal LLM state (research plans, orchestration
  // metadata, etc.) to the user. The data model itself tells us what's user-facing:
  // agentRun.Message is the text, the artifact is the structured content.
  blocks.push(...buildTextBlocks(responseText));

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
