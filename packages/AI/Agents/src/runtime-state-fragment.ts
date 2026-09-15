/**
 * @fileoverview Renders the loop agent's volatile per-iteration state as a trailing message fragment.
 *
 * Under `volatileStatePlacement: 'trailingMessage'` (see {@link VolatileStatePlacement}), the three
 * blocks that change on almost every iteration — current date/time, Scratchpad State, and the
 * Payload — are omitted from the system prompt and delivered instead as the FINAL message of the
 * request, wrapped in `<mj-runtime-state>` tags. When the agent's child prompt (its specialization)
 * is itself volatile, it rides in the same message inside `<mj-agent-specialization>` tags.
 *
 * Why: provider prompt caching is a prefix match over `tools → system → messages`. Anything that
 * changes inside `system` invalidates the entire message history on every iteration. Measured on
 * Sage (2026-09-14/15): today's layout caches ~21K tokens and re-processes 60–70K per call; moving
 * these blocks after the history took cached share from 36% to 83% (Gemini 2.5 Flash) and, with the
 * Anthropic breakpoint fix, from 12% to 96% (Claude Opus 5), with output quality unchanged.
 *
 * The rendered blocks reproduce the system-prompt template's sections (`## Current Date/Time`,
 * `## Scratchpad State`, `## Current State`) so the model sees the same content in the same shape,
 * only in a different position. A snapshot test asserts that equivalence.
 *
 * Security posture: the fragment carries STATE only, never rules. All instructions stay in the
 * system prompt, which also tells the model (in a static sentence) where the fragment lives. The tag
 * literals are escaped out of user-authored and action-result text elsewhere so they cannot be forged.
 *
 * @module @memberjunction/ai-agents
 */
import { ChatMessage, ChatMessageContent, ChatMessageContentBlock } from '@memberjunction/ai';

/** Tag wrapping the runtime-state blocks in the trailing fragment. */
export const RUNTIME_STATE_TAG = 'mj-runtime-state';

/** Tag wrapping a relocated agent specialization (child prompt) in the trailing fragment. */
export const AGENT_SPECIALIZATION_TAG = 'mj-agent-specialization';

/** Resolved date/time strings, as the system placeholders render them. */
export interface RuntimeStateDateTime {
    /** e.g. "2026-09-15" — the `_CURRENT_DATE` placeholder */
    Date: string;
    /** e.g. "Monday" — the `_CURRENT_DAY_OF_WEEK` placeholder */
    DayOfWeek: string;
    /** e.g. "4:37 PM CDT" — the `_CURRENT_TIME` placeholder */
    Time: string;
}

/** Scratchpad text as `ScratchpadManager` renders it (fallbacks already applied by the caller). */
export interface RuntimeStateScratchpad {
    /** Rendered notes, or the caller's empty-state text (the template uses `_(no notes yet)_`). */
    Notes: string;
    /** e.g. "0 of 5 tasks complete" */
    TaskSummary: string;
    /** Rendered task list. */
    Tasks: string;
}

/**
 * Everything the fragment can carry. Each block is optional so the fragment honors the same
 * `includeDateTimeInPrompt` / `includeScratchpadDocs` / `includePayloadInPrompt` flags the template
 * does: a block the agent has turned off is omitted in either placement.
 */
export interface RuntimeStateFragmentInput {
    DateTime?: RuntimeStateDateTime | null;
    Scratchpad?: RuntimeStateScratchpad | null;
    /**
     * Wrapped so that "no payload block" (`undefined`) is distinguishable from "a payload whose value
     * is undefined/null/{}" (`{ Value: ... }`). Serialized compactly, as the template's `dump` filter does.
     */
    Payload?: { Value: unknown } | null;
    /** The rendered child prompt, when the specialization is being relocated. Omitted otherwise. */
    Specialization?: string | null;
}

/**
 * Builds the trailing-message fragment for the loop agent's volatile state.
 *
 * Pure: no I/O, no framework dependencies. The caller (BaseAgent's prompt-execution prep) resolves
 * the strings and decides which blocks to include; this class only renders them.
 */
export class RuntimeStateFragmentBuilder {
    /**
     * Render the complete fragment: an optional specialization block, then the runtime-state block.
     * Returns an empty string if nothing was supplied, so callers can skip appending an empty message.
     */
    public Build(input: RuntimeStateFragmentInput): string {
        const parts: string[] = [];
        const specialization = input.Specialization?.trim();
        if (specialization) {
            parts.push(this.wrap(AGENT_SPECIALIZATION_TAG, specialization));
        }
        const state = this.RenderStateBlocks(input);
        if (state) {
            parts.push(this.wrap(RUNTIME_STATE_TAG, state));
        }
        return parts.join('\n\n');
    }

    /**
     * Render just the three state sections, unwrapped, in the system-prompt template's shape.
     * Exposed so the snapshot test can compare it against the template's own rendering.
     */
    public RenderStateBlocks(input: RuntimeStateFragmentInput): string {
        const blocks: string[] = [];
        if (input.DateTime) {
            blocks.push(this.renderDateTime(input.DateTime));
        }
        if (input.Scratchpad) {
            blocks.push(this.renderScratchpad(input.Scratchpad));
        }
        if (input.Payload) {
            blocks.push(this.renderPayload(input.Payload.Value));
        }
        return blocks.join('\n\n');
    }

    private renderDateTime(dt: RuntimeStateDateTime): string {
        return [
            '## Current Date/Time',
            `- **Date**: ${dt.Date} (${dt.DayOfWeek})`,
            `- **Time**: ${dt.Time}`,
        ].join('\n');
    }

    private renderScratchpad(sp: RuntimeStateScratchpad): string {
        return [
            '## Scratchpad State',
            'Your private working memory. Manage via `scratchpad` in your response.',
            '',
            '### Notes',
            sp.Notes,
            '',
            `### Tasks (${sp.TaskSummary})`,
            sp.Tasks,
        ].join('\n');
    }

    private renderPayload(value: unknown): string {
        // Mirrors the template's `{{ _CURRENT_PAYLOAD | dump | safe }}` — nunjucks `dump` is a compact JSON.stringify.
        const json = JSON.stringify(value ?? {});
        return [
            '## Current State',
            '**Payload:** Represents your work state. Request changes via `payloadChangeRequest`',
            '```json',
            json,
            '```',
        ].join('\n');
    }

    private wrap(tag: string, body: string): string {
        return `<${tag}>\n${body}\n</${tag}>`;
    }
}

/**
 * Matches the fragment's tag literals — opening or closing, any case, tolerant of stray whitespace
 * inside the angle brackets — so that text from anywhere else cannot pose as the real fragment.
 */
const FRAGMENT_TAG_PATTERN = new RegExp(`<\\s*(/?)\\s*(${RUNTIME_STATE_TAG}|${AGENT_SPECIALIZATION_TAG})\\s*>`, 'gi');

/**
 * Escapes the fragment's tag literals in a piece of text so they cannot be mistaken for the real
 * trailing fragment. Applied to every non-system message in the OUTGOING copy of the history under
 * `'trailingMessage'` placement — user turns, action results, sub-agent results, anything the model or
 * an external source wrote — never to stored data, and never to the fragment itself.
 *
 * This closes tag SPOOFING only. A model that follows imperative text inside a tool result will do so
 * with or without our tags (measured: Gemini 2.5 Flash/Pro obey; Claude Opus 5 refuses); that exposure
 * is pre-existing, layout-independent, and addressed structurally elsewhere.
 */
export function EscapeRuntimeStateTags(text: string): string {
    return text.replace(FRAGMENT_TAG_PATTERN, (_m, slash: string, tag: string) => `&lt;${slash}${tag.toLowerCase()}&gt;`);
}

/**
 * Returns a copy of the message with fragment tag literals escaped in its text content (string content,
 * and `text` / `tool_result` blocks). Returns the SAME object when nothing needed escaping, so untouched
 * messages keep their identity.
 */
export function EscapeRuntimeStateTagsInMessage<M>(message: ChatMessage<M>): ChatMessage<M> {
    const escaped = escapeContent(message.content);
    return escaped === message.content ? message : { ...message, content: escaped };
}

function escapeContent(content: ChatMessageContent): ChatMessageContent {
    if (typeof content === 'string') {
        return EscapeRuntimeStateTags(content);
    }
    let changed = false;
    const blocks = content.map((block: ChatMessageContentBlock) => {
        if ((block.type === 'text' || block.type === 'tool_result') && typeof block.content === 'string') {
            const next = EscapeRuntimeStateTags(block.content);
            if (next !== block.content) {
                changed = true;
                return { ...block, content: next };
            }
        }
        return block;
    });
    return changed ? blocks : content;
}
