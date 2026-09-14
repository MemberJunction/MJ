import type { ComponentType } from 'react';
import type { MJConversationDetailEntity, MJConversationEntity } from '@memberjunction/core-entities';

/**
 * @fileoverview The chat surface's slot contracts — the React Native counterpart of
 * `ng-conversations`' `slot-interfaces.ts`.
 *
 * ## Why the names match the web exactly
 *
 * MJ's Angular chat is extensible by design: a consumer configures it with inputs, observes and
 * intercepts through outputs, drives it through public methods, and **replaces whole visual zones
 * through named slots** — each with a typed contract and a shipped default they can project over,
 * wrap, or subclass. That is what lets a product like Sidecar's Sid look nothing like stock MJ chat
 * while still being stock MJ chat underneath.
 *
 * A native app needs the same latitude, and a consumer who has already tailored the web surface
 * should not have to learn a second vocabulary to tailor the phone. So the slot names here are the
 * same strings (`emptyState`, `agentPresence`, `header`, …), the contracts carry the same fields,
 * and every slot ships a default component that can be wrapped or replaced.
 *
 * ## How a slot is filled, in React terms
 *
 * Angular projects an `<ng-template mjChatSlot="emptyState">`. React's equivalent of content
 * projection is passing a component, so a slot is an optional prop taking a `ComponentType` with
 * the slot's contract as its props:
 *
 * ```tsx
 * <MJChat
 *     ConversationID={id}
 *     Slots={{
 *         emptyState: SidWelcome,                    // replace outright
 *         agentPresence: SidCharacter,               // replace outright
 *         header: (p) => <Framed><MJChatHeaderDefault {...p} /></Framed>,  // wrap the default
 *     }}
 * />
 * ```
 *
 * The three Angular patterns all survive the translation: **replace** by passing your own
 * component, **wrap** by rendering the exported default inside your own, and **extend** by
 * spreading the contract into the default after overriding the fields you care about.
 */

/** What the agent is doing right now, for presence visualisation. */
export type MJChatAgentPresenceState = 'idle' | 'listening' | 'thinking' | 'speaking';

/** Contract for the `emptyState` slot — what renders before any messages exist. */
export type MJChatEmptyStateProps = {
    /** Top-line welcome text. */
    Greeting: string;
    /** Optional secondary line beneath the greeting. */
    Subtext?: string;
    /** Optional suggested prompts, rendered as tappable chips. */
    SuggestedPrompts?: string[];
    /** Called when the user taps one of the suggested prompts. */
    OnPromptSelected: (prompt: string) => void;
};

/** Contract for the `agentPresence` slot — avatar / character / voice-state visualisation. */
export type MJChatAgentPresenceProps = {
    State: MJChatAgentPresenceState;
    /** Display name of the agent, e.g. "Sage" or "Sid". */
    AgentName?: string;
    /** Optional avatar image URL. */
    AvatarUrl?: string;
    /** Visual intensity — subtle for production chat, prominent for tutor surfaces. */
    Mode?: 'subtle' | 'prominent';
};

/** Contract for the `header` slot — the bar above the message list. Replaces it entirely. */
export type MJChatHeaderProps = {
    ConversationTitle?: string | null;
    SharedBy?: string | null;
    /** Number of artifacts on the conversation, for an inline badge. */
    ArtifactCount?: number;
    /** Whether the artifact-count chip should render at all. */
    ShowArtifactIndicator?: boolean;
    /** Navigate back. Supplied by the host so a replacement header keeps working. */
    OnBack?: () => void;
};

/**
 * Contract for the `headerActions` slot — extra buttons rendered INSIDE the default header's
 * action strip, after the stock ones.
 *
 * Additive rather than replacing, and deliberately not rendered when a full `header` slot is
 * supplied: that slot owns the whole header, actions included. Same rule as the web.
 */
export type MJChatHeaderActionsProps = {
    /** The active conversation, or null before one exists. */
    Conversation: MJConversationEntity | null;
    /** The active conversation's id, or null before one exists. */
    ConversationID: string | null;
    /** True while an agent turn is in flight — disable anything that mutates the conversation. */
    IsProcessing: boolean;
};

/** Contract for the `messageExtra` slot — per-message decoration, after the content. */
export type MJChatMessageExtraProps = {
    Message: MJConversationDetailEntity;
};

/**
 * Contract for the `demonstrationSurface` slot — a full-width adjacent surface for content the
 * agent is walking through. Off unless a slot is supplied.
 */
export type MJChatDemonstrationSurfaceProps = {
    /** Consumer-defined payload. */
    Content?: unknown;
    /** Whether the surface should be visible. */
    Visible?: boolean;
};

/**
 * Contract for the `messageRenderer` slot — applied once per message.
 *
 * Unlike the positional slots this one replaces the per-item rendering decision itself, so a
 * consumer can swap feed-vs-bubble-vs-anything-else without forking the list, its scrolling, or
 * its pending/progress handling.
 */
export type MJChatMessageRendererProps = {
    /** The conversation detail row to render. */
    Message: MJConversationDetailEntity | null;
};

/**
 * Every slot the chat surface exposes.
 *
 * Names and semantics mirror `MJChatSlotName` in `@memberjunction/ng-conversations`. Omitting a
 * slot uses the shipped default; the defaults are exported so a consumer can wrap rather than
 * replace.
 */
export type MJChatSlots = {
    emptyState?: ComponentType<MJChatEmptyStateProps>;
    agentPresence?: ComponentType<MJChatAgentPresenceProps>;
    header?: ComponentType<MJChatHeaderProps>;
    headerActions?: ComponentType<MJChatHeaderActionsProps>;
    messageExtra?: ComponentType<MJChatMessageExtraProps>;
    demonstrationSurface?: ComponentType<MJChatDemonstrationSurfaceProps>;
    messageRenderer?: ComponentType<MJChatMessageRendererProps>;
};
