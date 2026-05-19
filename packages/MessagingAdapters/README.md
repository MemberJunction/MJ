# @memberjunction/messaging-adapters

Slack and Microsoft Teams integrations for MemberJunction AI agents. Receive messages from messaging platforms, route them to MJ AI agents via `AgentRunner.RunAgentInConversation()`, and stream rich formatted responses back to users.

## Overview

This package provides ready-to-use server extensions that connect messaging platforms to MJ AI agents:

- **Slack** — Webhook + Socket Mode integration with Block Kit rich formatting, interactive modals, slash commands, and HMAC-SHA256 signature verification
- **Microsoft Teams** — Bot Framework integration with Adaptive Card formatting, form handling, and JWT validation

Built on the [`@memberjunction/server-extensions-core`](../ServerExtensionsCore/) framework, these adapters are auto-discovered by MJServer via `@RegisterClass` and configured in `mj.config.cjs` — no MJServer source code changes needed.

## Features

- **Multi-agent routing** — Users can @mention different agents (e.g., `@Research Agent`). 4-pass name matching handles full names, prefixes, bare names, and anywhere-in-message patterns. Thread affinity remembers the agent across follow-up messages.
- **Agent delegation** — When an agent returns `payload.invokeAgent`, the adapter auto-delegates to the target agent (up to 3 chained hops), mirroring MJ Explorer behavior.
- **User identity mapping** — Platform user emails are mapped to MJ `UserInfo` records for proper per-user permission scoping. Falls back to a configured service account.
- **Streaming responses** — Progressive message updates as the agent generates content, with configurable throttle intervals to avoid rate limiting.
- **Rich formatting** — Markdown responses convert to Slack Block Kit blocks or Teams Adaptive Cards, with agent identity headers, artifact deep-links, action buttons, response forms, and metadata footers.
- **Conversation context** — Thread history is passed to agents for multi-turn conversations. MJ Conversations and Artifacts are automatically created.
- **Interactive forms** — Response forms render as Slack modals or Teams Adaptive Card forms, with round-trip back to the agent.
- **Slash commands** — Slack slash commands auto-generated from agent names, with config overrides.
- **Deep links** — "View in MJ Explorer" buttons link to artifacts and conversations.
- **Platform-specific auth** — Slack uses HMAC-SHA256 signature verification with replay protection; Teams uses Bot Framework JWT validation.
- **Dual Slack connection modes** — HTTP webhooks (production) or Socket Mode (local dev, no public URL needed).

## Quick Start

See **[SETUP_GUIDE.md](SETUP_GUIDE.md)** for detailed step-by-step instructions including Slack App creation, Azure Bot registration, and Teams manifest setup.

### Slack (minimal config)

```javascript
// mj.config.cjs
module.exports = {
  serverExtensions: [{
    Enabled: true,
    DriverClass: 'SlackMessagingExtension',
    RootPath: '/webhook/slack',
    Settings: {
      DefaultAgentName: 'Sage',
      ContextUserEmail: 'bot@company.com',
      BotToken: process.env.SLACK_BOT_TOKEN,
      SigningSecret: process.env.SLACK_SIGNING_SECRET,
    }
  }]
};
```

### Teams (minimal config)

```javascript
// mj.config.cjs
module.exports = {
  serverExtensions: [{
    Enabled: true,
    DriverClass: 'TeamsMessagingExtension',
    RootPath: '/webhook/teams',
    Settings: {
      DefaultAgentName: 'Sage',
      ContextUserEmail: 'bot@company.com',
      MicrosoftAppId: process.env.MICROSOFT_APP_ID,
      MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD,
    }
  }]
};
```

### Tree-Shaking Prevention

Ensure the `@RegisterClass` decorators fire at module load time:

```typescript
import { LoadMessagingAdapters } from '@memberjunction/messaging-adapters';
LoadMessagingAdapters();
```

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │           mj.config.cjs             │
                    │  serverExtensions: [{               │
                    │    DriverClass: 'SlackMessaging...'  │
                    │    Settings: { ... }                │
                    │  }]                                 │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │      ServerExtensionLoader          │
                    │  ClassFactory.CreateInstance(        │
                    │    BaseServerExtension, driverClass  │
                    │  )                                  │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
    ┌─────────▼──────────┐ ┌──────▼──────────┐ ┌───────▼─────────┐
    │ SlackMessaging      │ │ TeamsMessaging   │ │ YourCustom      │
    │ Extension           │ │ Extension        │ │ Extension       │
    │ POST /webhook/slack │ │ POST /webhook/   │ │                 │
    │ POST .../interact   │ │      teams       │ │                 │
    │ POST .../slash      │ │                  │ │                 │
    └─────────┬──────────┘ └──────┬──────────┘ └─────────────────┘
              │                    │
    ┌─────────▼──────────┐ ┌──────▼──────────┐
    │ SlackAdapter        │ │ TeamsAdapter     │
    │  extends            │ │  extends         │
    │  BaseMessaging-     │ │  BaseMessaging-  │
    │  Adapter            │ │  Adapter         │
    └─────────┬──────────┘ └──────┬──────────┘
              │                    │
              └────────┬───────────┘
                       │
              ┌────────▼────────┐
              │ BaseMessaging   │
              │ Adapter         │
              │ (orchestration) │
              │                 │
              │ 1. Resolve user │
              │ 2. Resolve agent│
              │ 3. Fetch thread │
              │ 4. Run agent    │
              │ 5. Delegation   │
              │ 6. Format resp  │
              │ 7. Send/update  │
              └─────────────────┘
```

## Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `DefaultAgentName` | `string` | (required) | Default MJ AI Agent name |
| `ContextUserEmail` | `string` | (required) | Fallback service account email |
| `BotToken` | `string` | (required for Slack) | Slack Bot OAuth Token (`xoxb-...`) |
| `SigningSecret` | `string` | — | Slack signing secret for webhook verification |
| `AppToken` | `string` | — | Slack App-Level Token for Socket Mode (`xapp-...`) |
| `ConnectionMode` | `'http' \| 'socket'` | `'http'` | Slack connection mode |
| `MaxThreadMessages` | `number` | `50` | Max thread messages for conversation context |
| `ShowTypingIndicator` | `boolean` | `true` | Show typing indicator while processing |
| `StreamingUpdateIntervalMs` | `number` | `1000` | Min interval between streaming updates (ms) |
| `ExplorerBaseURL` | `string` | — | MJ Explorer URL for "View in Explorer" buttons |
| `SlashCommands` | `Record<string, string>` | — | Slash command → agent name mapping (Slack only) |
| `MicrosoftAppId` | `string` | — | Azure Bot Service App ID (Teams only) |
| `MicrosoftAppPassword` | `string` | — | Azure Bot Service App Password (Teams only) |
| `MicrosoftAppTenantId` | `string` | — | Azure AD Tenant ID for Single Tenant (Teams only) |
| `MicrosoftAppType` | `string` | auto | `'SingleTenant'`, `'MultiTenant'`, or `'UserAssignedMsi'` |

## Exported Utilities

The package exports shared formatting utilities useful for building custom adapters:

```typescript
import {
    // Base utilities
    BaseMessagingAdapter,
    splitMarkdownIntoSections,
    convertToSlackMrkdwn,
    truncateText,
    splitTextIntoChunks,

    // Slack
    SlackAdapter,
    SlackMessagingExtension,
    markdownToBlocks,
    verifySlackSignature,
    handleSlackInteraction,
    buildRichResponse,
    buildAgentContextBlock,
    buildFormModal,

    // Teams
    TeamsAdapter,
    TeamsMessagingExtension,
    markdownToAdaptiveCard,
    buildRichAdaptiveCard,

    // Tree-shaking prevention
    LoadMessagingAdapters,
} from '@memberjunction/messaging-adapters';
```

## Building a Custom Adapter

To add support for a new messaging platform (Discord, Google Chat, etc.):

1. Create a class extending `BaseMessagingAdapter` and implement all abstract methods
2. Create a `BaseServerExtension` subclass with `@RegisterClass` that sets up routes
3. Add a formatter that converts Markdown to your platform's rich format
4. Optionally add a block/card builder for rich layouts

See `SlackAdapter.ts` and `SlackMessagingExtension.ts` for a complete reference implementation.

## Testing

```bash
npm run test           # Run all 301 tests
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
```

Test suites cover every module:

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `BaseMessagingAdapter.test.ts` | 40 | Core orchestration, agent resolution, thread affinity, delegation |
| `message-formatter.test.ts` | 28 | Markdown parsing, text splitting, Slack mrkdwn conversion |
| `slack-formatter.test.ts` | 10 | Markdown → Block Kit conversion |
| `slack-block-builder.test.ts` | 57 | Rich layouts, truncation, payload limits, "View Full" |
| `slack-routes.test.ts` | 10 | HMAC-SHA256 verification, replay attack prevention |
| `slack-interactivity.test.ts` | 19 | Modal forms, button routing, form submissions |
| `SlackAdapter.test.ts` | 12 | Event mapping, mention parsing, typing indicators |
| `SlackMessagingExtension.test.ts` | 26 | HTTP/Socket mode, signature verification, slash commands |
| `TeamsAdapter.test.ts` | 31 | Activity mapping, form extraction, streaming |
| `TeamsMessagingExtension.test.ts` | 12 | Bot Framework routing, JWT validation |
| `teams-formatter.test.ts` | 7 | Markdown → Adaptive Card TextBlock |
| `teams-card-builder.test.ts` | 52 | Rich card composition, actions, forms, payload limits |

## Known Limitations

- **Teams thread history**: Requires Microsoft Graph API with `ChannelMessage.Read.All` permission, not yet implemented. Teams conversations are currently single-turn.
- **Full response store**: The "View Full" button in Slack stores content in memory with a 30-minute TTL. Content is lost on server restart.
- **Conversation references**: Teams conversation references for proactive messaging are stored in memory (lost on restart).
- **Max delegation hops**: Agent delegation chains limited to 3 hops.

## Related Packages

- [`@memberjunction/server-extensions-core`](../ServerExtensionsCore/) — The extension framework this package builds on
- [`@memberjunction/server`](../MJServer/) — MJServer that loads and manages extensions
- [`@memberjunction/ai-agents`](../AI/Agents/) — Agent execution engine (`AgentRunner`)
- [`@memberjunction/ai-core-plus`](../AI/CorePlus/) — Agent types and execution result structures
