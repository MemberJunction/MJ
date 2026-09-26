/**
 * Wire types for the Betty Public API v1.
 *
 * These mirror `packages/BettyPublicAPI/src/types.ts` in the Betty repository. They are restated
 * here rather than imported because that package is not published to npm and MJ must not take a
 * dependency on a customer application. If the contract changes there, it changes here.
 */

/** Advisory, non-authorizing context for a turn. Never widens what content the answer can reach. */
export type BettyRequestContext = {
    /** URL of the page the question was asked from. */
    pageUrl?: string;

    /** Free-text situational context, e.g. "The current user's name is Dray". */
    text?: string;
};

/** Request body for `POST /messages`. */
export type BettyChatRequest = {
    /** The end user's message. Required, non-empty. */
    message: string;

    /** Existing Betty conversation to continue. Omit to start a new one. */
    conversationId?: string;

    /** Attribution metadata only — unverified, and never used for authorization. */
    endUserId?: string;

    /** Advisory context passed to the agent. */
    context?: BettyRequestContext;
};

/** A citation returned alongside an answer. */
export type BettyReference = {
    /** Display title of the source. */
    title: string;

    /** Link to the source, when one exists. */
    url?: string;

    /** MJ ContentItem record id backing this reference, when known. */
    contentItemId?: string;
};

/** Response body from `POST /messages`. */
export type BettyChatResponse = {
    /** Conversation this turn belongs to. */
    conversationId: string;

    /** MJ ConversationDetail id of the assistant's reply, for feedback calls. */
    messageId?: string;

    /** The assistant's answer, in markdown. */
    response: string;

    /** Citations supporting the answer. */
    references: BettyReference[];

    /** Correlation id — echoed in logs and error payloads. Quote it in support requests. */
    requestId: string;
};
