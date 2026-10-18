import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import type { CapturedAttachment } from '@/data/services/attachment-meta';
import type { MJChatSlots } from './slots';

/**
 * @fileoverview The chat surface's public contract — the React Native counterpart of the Angular
 * chat-area's inputs, outputs and public methods.
 *
 * ## The four extension mechanisms, and their React equivalents
 *
 * MJ's Angular chat is extensible four ways, and a consumer product like Sidecar's Sid uses all
 * four. Each has a direct React idiom, so parity is real rather than aspirational:
 *
 * | Angular | React Native | Where |
 * |---|---|---|
 * | `@Input()` | props | {@link MJChatProps} |
 * | `@Output()` EventEmitter | `On*` callback props | {@link MJChatProps} |
 * | public methods on the component | `ref` + `useImperativeHandle` | {@link MJChatHandle} |
 * | `<ng-template mjChatSlot>` projection | component props with typed contracts | {@link MJChatSlots} |
 *
 * Plus the fifth, which is already shared: `MJGlobal.ClassFactory` registries. Anything resolved by
 * key on the web — composer trigger providers, artifact viewers — is resolved the same way here.
 */

/** What the user did, for hosts that want to observe or intercept. */
export type MJChatEvents = {
    /**
     * A message is about to be sent. Return `false` to cancel.
     *
     * The cancelable-before hook MJ's UI layering guide specifies: a host can validate, rewrite the
     * flow, or route the turn somewhere else without forking the composer.
     */
    OnBeforeSend?: (text: string, attachment: CapturedAttachment | null) => boolean | Promise<boolean>;
    /** A message was sent and the turn started. */
    OnMessageSent?: (text: string) => void;
    /** An agent turn finished, successfully or not. */
    OnTurnComplete?: (result: { Success: boolean; ErrorMessage?: string }) => void;
    /** A message row was tapped. */
    OnMessagePress?: (message: MJConversationDetailEntity) => void;
    /** The user asked to leave the conversation. */
    OnBack?: () => void;
};

/** Everything a host can configure. */
export type MJChatProps = MJChatEvents & {
    /** The conversation to render. */
    ConversationID: string;

    // ── Feature switches, named to match their Angular counterparts ──────────────
    /** Show the attachment button. Default `true`. */
    EnableAttachments?: boolean;
    /** Enable `@` agent/people mentions. Default `true`. */
    EnableMentions?: boolean;
    /** Enable `#` record/query mentions. Default `true`. */
    EnableEntityMentions?: boolean;
    /** Enable `/` skill commands. Default `true`. */
    EnableSkillCommands?: boolean;
    /** Show the voice-call launcher. Default `true`. */
    EnableRealtime?: boolean;
    /** Show the recent-conversations strip. Default `true`. */
    EnableRecents?: boolean;

    /** Composer placeholder. Defaults to wording that advertises the triggers. */
    Placeholder?: string;
    /** Agent to address when the user does not `@mention` one. Defaults to the Profile choice. */
    DefaultAgentID?: string;
    /** Greeting for the empty state. */
    Greeting?: string;
    /** Secondary line for the empty state. */
    GreetingSubtext?: string;
    /** Prompts offered as chips on the empty state. */
    SuggestedPrompts?: string[];

    /**
     * Slot fills. Omitted slots use the shipped default; the defaults are exported so a host can
     * wrap one rather than replace it. See {@link MJChatSlots}.
     */
    Slots?: MJChatSlots;
};

/**
 * The imperative surface, reached with a `ref`.
 *
 * The React equivalent of calling a public method on an Angular component instance — for the
 * things that are genuinely commands rather than state: send this, refresh now, focus the box.
 */
export type MJChatHandle = {
    /** Sends a message as if the user had typed it. */
    Send: (text: string, attachment?: CapturedAttachment | null) => Promise<void>;
    /** Re-reads the conversation from the server. */
    Refresh: () => Promise<void>;
    /** Puts the caret in the composer. */
    FocusComposer: () => void;
    /** Replaces the composer's text without sending — for pre-filling from a host action. */
    SetComposerText: (text: string) => void;
};
