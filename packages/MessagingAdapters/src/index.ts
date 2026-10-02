/**
 * @module @memberjunction/messaging-adapters
 *
 * Messaging platform adapters for MemberJunction AI agents.
 *
 * This package provides Slack and Microsoft Teams integrations that allow
 * MJ AI agents to be invoked directly from messaging platforms. Messages
 * are received via webhooks, routed to the appropriate agent via
 * `AgentRunner.RunAgent()`, and responses are streamed back as rich
 * formatted messages (Slack Block Kit / Teams Adaptive Cards).
 *
 * ## Architecture
 *
 * Built on the MJServer Extension framework (`@memberjunction/server-extensions-core`):
 * - `SlackMessagingExtension` and `TeamsMessagingExtension` extend `BaseServerExtension`
 * - Auto-discovered via `@RegisterClass` and configured in `mj.config.cjs`
 * - Zero MJServer source code changes needed per adapter
 *
 * ## Quick Start
 *
 * ```javascript
 * // mj.config.cjs
 * serverExtensions: [
 *     {
 *         Enabled: true,
 *         DriverClass: 'SlackMessagingExtension',
 *         RootPath: '/webhook/slack',
 *         Settings: {
 *             DefaultAgentName: 'Sage',
 *             ContextUserEmail: 'bot@company.com',
 *             BotToken: process.env.SLACK_BOT_TOKEN,
 *             SigningSecret: process.env.SLACK_SIGNING_SECRET,
 *         }
 *     }
 * ]
 * ```
 *
 * @see {@link BaseMessagingAdapter} for the shared adapter base class
 * @see {@link SlackMessagingExtension} for Slack integration
 * @see {@link TeamsMessagingExtension} for Teams integration
 */

// Base adapter and types
export { BaseMessagingAdapter } from './base/BaseMessagingAdapter.js';
export type { UploadableFile } from './base/BaseMessagingAdapter.js';
export {
    MessagingAdapterSettings,
    IncomingMessage,
    FormattedResponse,
    AgentIdentity,
    ThreadHistoryResult,
    MarkdownSection,
    RequestWithRawBody,
} from './base/types.js';
export {
    SplitMarkdownIntoSections, splitMarkdownIntoSections,
    ConvertToSlackMrkdwn, convertToSlackMrkdwn,
    ConvertBoldToSlackFormat, convertBoldToSlackFormat,
    ConvertLinksToSlackFormat, convertLinksToSlackFormat,
    TruncateText, truncateText,
    SplitTextIntoChunks, splitTextIntoChunks,
} from './base/message-formatter.js';

// Slack adapter
export { SlackMessagingExtension } from './slack/SlackMessagingExtension.js';
export { SlackAdapter } from './slack/SlackAdapter.js';
export { MarkdownToBlocks, markdownToBlocks } from './slack/slack-formatter.js';
export { VerifySlackSignature, verifySlackSignature } from './slack/slack-routes.js';
export { HandleSlackInteraction, handleSlackInteraction, RegisterActiveForm, registerActiveForm } from './slack/slack-interactivity.js';
export {
    BuildRichResponse, buildRichResponse,
    BuildAgentContextBlock, buildAgentContextBlock,
    BuildTextBlocks, buildTextBlocks,
    BuildArtifactCard, buildArtifactCard,
    BuildActionButtons, buildActionButtons,
    BuildMediaBlocks, buildMediaBlocks,
    BuildErrorBlocks, buildErrorBlocks,
    BuildMetadataFooter, buildMetadataFooter,
    BuildDivider, buildDivider,
    BuildResponseForm, buildResponseForm,
    BuildFormModal, buildFormModal,
    BuildNotificationBlocks, buildNotificationBlocks,
    GetFullResponseText, getFullResponseText,
} from './slack/slack-block-builder.js';
export type { BuildRichResponseOptions } from './slack/slack-block-builder.js';

// Teams adapter
export { TeamsMessagingExtension } from './teams/TeamsMessagingExtension.js';
export { TeamsAdapter } from './teams/TeamsAdapter.js';
export { MarkdownToAdaptiveCard, markdownToAdaptiveCard } from './teams/teams-formatter.js';
export {
    BuildRichAdaptiveCard, buildRichAdaptiveCard,
    buildAgentHeader as buildTeamsAgentHeader,
    buildTextBody as buildTeamsTextBody,
    buildArtifactCard as buildTeamsArtifactCard,
    buildActionButtons as buildTeamsActionButtons,
    buildExplorerLink as buildTeamsExplorerLink,
    buildMetadataFooter as buildTeamsMetadataFooter,
    buildErrorCard as buildTeamsErrorCard,
    buildResponseFormElements as buildTeamsResponseFormElements,
    buildUnopenableResourceNotes as buildTeamsUnopenableResourceNotes,
} from './teams/teams-card-builder.js';
export type { BuildRichCardOptions } from './teams/teams-card-builder.js';

/**
 * Tree-shaking prevention function.
 *
 * Import and call this function from your application's entry point
 * (or include it in the class manifest) to ensure the `@RegisterClass`
 * decorators on `SlackMessagingExtension` and `TeamsMessagingExtension`
 * fire at module load time.
 *
 * @example
 * ```typescript
 * import { LoadMessagingAdapters } from '@memberjunction/messaging-adapters';
 * LoadMessagingAdapters();
 * ```
 */
export function LoadMessagingAdapters(): void {
    // This function exists solely to create a static reference that
    // prevents bundlers from tree-shaking the @RegisterClass decorators.
    // The decorators fire as a side effect of importing the module.
}
