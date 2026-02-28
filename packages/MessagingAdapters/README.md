# @memberjunction/messaging-adapters

Slack and Microsoft Teams integrations for MemberJunction AI agents. Receive messages from messaging platforms, route them to MJ AI agents via `AgentRunner.RunAgent()`, and stream rich formatted responses back to users.

## Overview

This package provides ready-to-use server extensions that connect messaging platforms to MJ AI agents:

- **Slack** — Webhook-based integration with Block Kit rich formatting and HMAC-SHA256 signature verification
- **Microsoft Teams** — Bot Framework integration with Adaptive Card formatting and JWT validation

Built on the [`@memberjunction/server-extensions-core`](../ServerExtensionsCore/) framework, these adapters are auto-discovered by MJServer via `@RegisterClass` and configured in `mj.config.cjs` — no MJServer source code changes needed.

## Features

- **Multi-agent routing** — Users can @mention different agents in different messages. Each message routes to exactly one agent. If multiple agents are mentioned, the first is used and a note is included in the response.
- **User identity mapping** — Platform user emails are mapped to MJ `UserInfo` records via `UserCache` for proper per-user permission scoping. Falls back to a configured service account.
- **Streaming responses** — Progressive message updates as the agent generates its response, with configurable update intervals to avoid rate limiting.
- **Rich formatting** — Agent Markdown responses are converted to Slack Block Kit blocks or Teams Adaptive Cards, with automatic splitting for responses that exceed platform limits.
- **Thread context** — Conversation history from threads is passed to the agent for multi-turn conversations.
- **Platform-specific auth** — Slack uses HMAC-SHA256 signature verification with replay protection; Teams uses Bot Framework JWT validation.

## Installation

```bash
npm install @memberjunction/messaging-adapters
```

## Slack Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Enable **Event Subscriptions** — set the Request URL to `{your-server}/webhook/slack`
3. Subscribe to bot events: `message.im`, `app_mention`
4. Add OAuth scopes: `chat:write`, `channels:history`, `groups:history`, `im:history`, `users:read`, `users:read.email`, `app_mentions:read`
5. Install the app to your workspace
6. Copy the **Bot User OAuth Token** and **Signing Secret**

### 2. Configure in `mj.config.cjs`

```javascript
module.exports = {
    serverExtensions: [
        {
            Enabled: true,
            DriverClass: 'SlackMessagingExtension',
            RootPath: '/webhook/slack',
            Settings: {
                AgentID: 'your-agent-guid',           // Default MJ AI Agent ID
                ContextUserEmail: 'bot@company.com',  // Fallback service account
                BotToken: process.env.SLACK_BOT_TOKEN,
                SigningSecret: process.env.SLACK_SIGNING_SECRET,
                ConnectionMode: 'http',               // 'http' or 'socket'
                MaxThreadMessages: 50,
                ShowTypingIndicator: true,
                StreamingUpdateIntervalMs: 1500,
            }
        }
    ]
};
```

### 3. Import the Package

Add `@memberjunction/messaging-adapters` as a dependency and import the tree-shaking prevention function:

```typescript
import { LoadMessagingAdapters } from '@memberjunction/messaging-adapters';
LoadMessagingAdapters();
```

## Teams Setup

### 1. Register a Bot in Azure

1. Register a bot in the **Azure Bot Service**
2. Set the messaging endpoint to `{your-server}/webhook/teams`
3. Note the **Microsoft App ID** and **Password**
4. Create a Teams app manifest pointing to the bot registration
5. Install the app in your Teams organization

### 2. Configure in `mj.config.cjs`

```javascript
module.exports = {
    serverExtensions: [
        {
            Enabled: true,
            DriverClass: 'TeamsMessagingExtension',
            RootPath: '/webhook/teams',
            Settings: {
                AgentID: 'your-agent-guid',
                ContextUserEmail: 'bot@company.com',
                BotToken: '',  // Not used for Teams
                MicrosoftAppId: process.env.MICROSOFT_APP_ID,
                MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD,
                MaxThreadMessages: 50,
                StreamingUpdateIntervalMs: 2000,
            }
        }
    ]
};
```

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │           mj.config.cjs             │
                    │  serverExtensions: [{               │
                    │    DriverClass: 'SlackMessaging...'  │
                    │    Settings: { AgentID: '...' }     │
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
    │ (registers POST     │ │ (registers POST  │ │                 │
    │  /webhook/slack)    │ │  /webhook/teams) │ │                 │
    └─────────┬──────────┘ └──────┬──────────┘ └─────────────────┘
              │                    │
    ┌─────────▼──────────┐ ┌──────▼──────────┐
    │ SlackAdapter        │ │ TeamsAdapter     │
    │                     │ │                  │
    │ 1. Verify signature │ │ 1. JWT validate  │
    │ 2. Map Slack event  │ │ 2. Map activity  │
    │ 3. Resolve MJ user  │ │ 3. Resolve user  │
    │ 4. Resolve agent    │ │ 4. Resolve agent │
    │ 5. Run agent        │ │ 5. Run agent     │
    │ 6. Stream response  │ │ 6. Stream resp.  │
    │ 7. Format Block Kit │ │ 7. Format Card   │
    └────────────────────┘ └─────────────────┘
```

## Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `AgentID` | `string` | (required) | Default MJ AI Agent GUID |
| `ContextUserEmail` | `string` | (required) | Fallback service account email |
| `BotToken` | `string` | (required for Slack) | Slack Bot OAuth Token (`xoxb-...`) |
| `SigningSecret` | `string` | — | Slack app signing secret for webhook verification |
| `AppToken` | `string` | — | Slack app token for Socket Mode |
| `ConnectionMode` | `'http' \| 'socket'` | `'http'` | Slack connection mode |
| `MaxThreadMessages` | `number` | `50` | Max thread messages for conversation context |
| `ShowTypingIndicator` | `boolean` | `true` | Show typing indicator while processing |
| `StreamingUpdateIntervalMs` | `number` | `1000` | Min interval between streaming updates (ms) |
| `MicrosoftAppId` | `string` | — | Azure Bot Service App ID (Teams only) |
| `MicrosoftAppPassword` | `string` | — | Azure Bot Service App Password (Teams only) |

## Exported Utilities

The package also exports shared formatting utilities useful for building custom adapters:

```typescript
import {
    splitMarkdownIntoSections,  // Parse Markdown into typed sections
    convertToSlackMrkdwn,       // Convert Markdown to Slack mrkdwn format
    truncateText,               // Truncate text with ellipsis
    splitTextIntoChunks,        // Split text at paragraph boundaries
    markdownToBlocks,           // Convert Markdown to Slack Block Kit
    markdownToAdaptiveCard,     // Convert Markdown to Teams Adaptive Card
    verifySlackSignature,       // HMAC-SHA256 webhook verification
} from '@memberjunction/messaging-adapters';
```

## Building a Custom Adapter

To add support for a new messaging platform (Discord, Google Chat, etc.):

1. Create a class extending `BaseMessagingAdapter`
2. Implement all abstract methods (see JSDoc for details)
3. Create a `BaseServerExtension` subclass with `@RegisterClass` that sets up routes and delegates to your adapter
4. Add a formatter that converts Markdown to your platform's rich format

See `SlackAdapter.ts` and `SlackMessagingExtension.ts` for a complete reference implementation.

## Testing

```bash
npm run test           # Run all 74 tests
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
```

Test suites:
- `BaseMessagingAdapter.test.ts` — Core orchestration logic, user resolution, agent routing
- `message-formatter.test.ts` — Markdown parsing, text splitting, Slack mrkdwn conversion
- `slack-formatter.test.ts` — Slack Block Kit formatting
- `teams-formatter.test.ts` — Teams Adaptive Card formatting
- `slack-routes.test.ts` — HMAC-SHA256 signature verification

## Known Limitations

- **Teams thread history**: Fetching thread history requires Microsoft Graph API with `ChannelMessage.Read.All` permission, which is not yet implemented. Conversations are currently single-turn.
- **Slack Socket Mode**: Socket Mode connection is not yet implemented (HTTP webhook mode is fully functional).

## Related Packages

- [`@memberjunction/server-extensions-core`](../ServerExtensionsCore/) — The extension framework this package builds on
- [`@memberjunction/server`](../MJServer/) — MJServer that loads and manages extensions
- [`@memberjunction/ai-agents`](../AI/Agents/) — Agent execution engine
