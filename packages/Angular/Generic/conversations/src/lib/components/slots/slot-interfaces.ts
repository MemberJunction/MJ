/**
 * @fileoverview Interface contracts for the chat-area's slot system.
 *
 * Each slot has a typed interface so the widget can speak with confidence to
 * whatever component (default or consumer-supplied) is rendered into it. Each
 * interface is paired with an exported standalone default component (in
 * `*-default.component.ts` siblings) that consumers can:
 *
 * 1. **Project an ad-hoc template into**, via the `mjChatSlot` directive.
 * 2. **Wrap with a containment pattern** — render the default inside their own
 *    component to add framing without losing the default behavior.
 * 3. **Subclass** — extend the default standalone component, override only what
 *    they need, declare the subclass as the slot's component.
 *
 * @module @memberjunction/ng-conversations
 */

import type { EventEmitter } from '@angular/core';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

/** State surfaced to the agent-presence slot for visualization. */
export type MJChatAgentPresenceState = 'idle' | 'listening' | 'thinking' | 'speaking';

/** Contract for the `emptyState` slot — what renders before any messages exist. */
export interface IMJChatEmptyStateComponent {
    /** Top-line welcome text. */
    Greeting: string;
    /** Optional secondary line beneath the greeting. */
    Subtext?: string;
    /** Optional suggested prompts to render as clickable chips. */
    SuggestedPrompts?: string[];
    /** Emitted when the user selects one of the suggested prompts. */
    PromptSelected: EventEmitter<string>;
}

/**
 * Contract for the `agentPresence` slot — character / avatar / voice-state
 * visualization, rendered alongside the chat composer.
 */
export interface IMJChatAgentPresenceComponent {
    State: MJChatAgentPresenceState;
    /** Display name of the agent, e.g., "Sage" or "Sid". */
    AgentName?: string;
    /** Optional avatar image URL. */
    AvatarUrl?: string;
    /** Visual intensity — subtle for production chat, prominent for tutor surfaces. */
    Mode?: 'subtle' | 'prominent';
}

/** Contract for the `header` slot — top bar above the message list. */
export interface IMJChatHeaderComponent {
    ConversationTitle?: string | null;
    SharedBy?: string | null;
    /** Number of artifacts on the conversation (for an inline badge). */
    ArtifactCount?: number;
    /** Pass-through whether the artifact-count chip should render at all. */
    ShowArtifactIndicator?: boolean;
}

/**
 * Contract for the `messageExtra` slot — per-message inline decoration rendered
 * within the message bubble, after the content.
 */
export interface IMJChatMessageExtraComponent {
    Message: MJConversationDetailEntity;
}

/**
 * Contract for the `demonstrationSurface` slot — full-width adjacent surface
 * for content the agent is "walking through" (e.g., annotated lesson material,
 * step-by-step screenshots). Off unless a slot is supplied.
 */
export interface IMJChatDemonstrationSurfaceComponent {
    /** Optional content payload — shape is consumer-defined. */
    Content?: unknown;
    /** Whether the surface should be visible. */
    Visible?: boolean;
}

/**
 * Contract for the `messageRenderer` slot — per-item template applied to every
 * message in the list. Unlike the other slots (which replace a fixed positional
 * zone), `messageRenderer` is invoked once per message via `*ngTemplateOutlet`
 * with the message as the implicit context (`let-message`).
 *
 * Lets consumers swap the entire feed-vs-bubble-vs-anything-else rendering
 * decision without forking. Two default components ship:
 *
 *   • `MJChatMessageFeedDefaultComponent` — the existing avatar+name+timestamp
 *     feed layout (current behavior; default when no slot is supplied).
 *   • `MJChatMessageBubbleDefaultComponent` — bubble layout where identity
 *     comes from side + shape (user on right, agent on left), using the
 *     `--mj-chat-bubble-*` tokens for color.
 *
 * Implementing components keep the contract minimal — just receive the message
 * entity and render however they want. Subclasses extend a default to inherit
 * its shell and override specific behavior.
 */
export interface IMJChatMessageRendererComponent {
    /** The conversation detail row to render. */
    Message: import('@memberjunction/core-entities').MJConversationDetailEntity | null;
}
