# Messaging Adapters Setup Guide

Step-by-step guide for connecting Slack and Microsoft Teams to MemberJunction AI agents.

## Prerequisites

- MJAPI server running (or ability to start it)
- At least one active AI Agent in your MJ database (e.g., "Sage")
- An MJ user email to use as the service account (fallback identity for agent execution)
- For HTTP mode: a publicly reachable URL for your MJAPI server (use ngrok for local dev)

---

## Permissions Summary

### Slack Permissions

The Slack bot requires these **Bot Token OAuth Scopes** (configured under OAuth & Permissions):

| Scope | Required? | Purpose |
|-------|-----------|---------|
| `chat:write` | **Yes** | Post messages and replies in channels and DMs |
| `chat:write.customize` | **Yes** | Post with per-agent username and avatar (e.g., "Sage" icon instead of generic bot icon) |
| `channels:history` | **Yes** | Read thread history in public channels for multi-turn conversation context |
| `groups:history` | **Yes** | Read thread history in private channels for multi-turn conversation context |
| `im:history` | **Yes** | Read thread history in DMs for multi-turn conversation context |
| `users:read` | **Yes** | Look up user profiles for identity mapping |
| `users:read.email` | **Yes** | Retrieve user email addresses to map Slack users to MJ users |
| `app_mentions:read` | **Yes** | Receive events when users @mention the bot |
| `commands` | Optional | Required only if you configure slash commands (e.g., `/sage`, `/research`) |
| `connections:write` | Socket Mode only | Required for the App-Level Token used by Socket Mode |

**Bot Event Subscriptions** (configured under Event Subscriptions):

| Event | Purpose |
|-------|---------|
| `message.im` | Receive direct messages to the bot |
| `message.channels` | Receive messages in public channels (needed for thread replies) |
| `message.groups` | Receive messages in private channels (needed for thread replies) |
| `app_mention` | Receive @mention events in channels |

### Teams / Azure Bot Service Permissions

The Teams bot requires an **Azure Bot Service** registration with a Microsoft App ID and Password.

**Azure Bot Service Configuration:**

| Setting | Value |
|---------|-------|
| **Type of App** | Single Tenant (recommended) or Multi Tenant |
| **Messaging endpoint** | `https://your-server.com/webhook/teams` |
| **Microsoft Teams channel** | Must be enabled under Channels |

**Microsoft App Registration (Azure AD):**

The App ID created by Azure Bot Service is an Azure AD app registration. The default permissions are sufficient — no additional Microsoft Graph API permissions are needed for basic messaging. The Bot Framework SDK handles authentication automatically using the App ID and Password.

| Permission | Required? | Purpose |
|------------|-----------|---------|
| (none beyond default) | — | Bot Framework handles JWT validation and message routing automatically |
| `ChannelMessage.Read.All` | Future | Will be needed when Teams thread history is implemented (not yet required) |

**Teams App Manifest Permissions:**

In your `manifest.json`, these scopes control where the bot can operate:

| Manifest Field | Value | Purpose |
|----------------|-------|---------|
| `bots[].scopes` | `["personal", "team", "groupChat"]` | Where the bot can be used — personal (DMs), team channels, and group chats |
| `permissions` | `["identity", "messageTeamMembers"]` | Bot can identify users and send messages to team members |
| `validDomains` | `["your-server.com"]` | Domains the bot can link to (for "View in MJ Explorer" buttons) |

---

## Part 1: Slack Integration

### Step 1: Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**, name your app (e.g., "MJ Bot"), and select your workspace

### Step 2: Configure OAuth Scopes

Go to **OAuth & Permissions** and add these **Bot Token Scopes**:

| Scope | Purpose |
|-------|---------|
| `chat:write` | Post messages |
| `chat:write.customize` | Post with per-agent username and avatar |
| `channels:history` | Read thread history in public channels |
| `groups:history` | Read thread history in private channels |
| `im:history` | Read thread history in DMs |
| `users:read` | Look up user profiles |
| `users:read.email` | Map Slack users to MJ users by email |
| `app_mentions:read` | Receive @mention events |

### Step 3: Enable Event Subscriptions

Go to **Event Subscriptions**:

1. Toggle **Enable Events** to ON
2. Set **Request URL** to: `https://your-server.com/webhook/slack`
   - Slack will send a verification challenge — MJAPI handles this automatically
   - For local dev with ngrok: `https://abc123.ngrok.io/webhook/slack`
3. Under **Subscribe to bot events**, add:
   - `message.im` — DMs to the bot
   - `message.channels` — Messages in public channels (for thread replies)
   - `message.groups` — Messages in private channels (for thread replies)
   - `app_mention` — @mentions of the bot
4. Click **Save Changes**

### Step 4: Enable Interactivity (for buttons, modals, forms)

Go to **Interactivity & Shortcuts**:

1. Toggle **Interactivity** to ON
2. Set **Request URL** to: `https://your-server.com/webhook/slack/interact`
3. Click **Save Changes**

This enables:
- "View Full Response" button (opens modal with complete content)
- Agent response forms (modal input fields)
- Form choice buttons (quick-select options)
- Action buttons from agent responses

### Step 5: Configure Slash Commands (optional)

Go to **Slash Commands** and create commands like:

| Command | Request URL | Description |
|---------|-------------|-------------|
| `/sage` | `https://your-server.com/webhook/slack/slash` | Ask Sage a question |
| `/research` | `https://your-server.com/webhook/slack/slash` | Ask the Research Agent |

All slash commands point to the same URL — the adapter routes by command name.

Slash commands are also auto-generated from agent names: an agent named "Research Agent" automatically gets `/research`. Config overrides take precedence.

### Step 6: Install the App

Go to **Install App** and click **Install to Workspace**. After installation, copy:

- **Bot User OAuth Token** (`xoxb-...`) — this is `SLACK_BOT_TOKEN`
- **Signing Secret** (from **Basic Information** → **App Credentials**) — this is `SLACK_SIGNING_SECRET`

### Step 7: Configure MJAPI

Add environment variables to your `.env` file:

```bash
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
MJ_BOT_DEFAULT_AGENT_NAME=Sage
MJ_BOT_CONTEXT_USER_EMAIL=bot@yourcompany.com
MJ_EXPLORER_BASE_URL=https://explorer.yourcompany.com
```

Add to `mj.config.cjs`:

```javascript
module.exports = {
  serverExtensions: [
    {
      Enabled: true,
      DriverClass: 'SlackMessagingExtension',
      RootPath: '/webhook/slack',
      Settings: {
        DefaultAgentName: process.env.MJ_BOT_DEFAULT_AGENT_NAME || 'Sage',
        ContextUserEmail: process.env.MJ_BOT_CONTEXT_USER_EMAIL || 'bot@yourcompany.com',
        BotToken: process.env.SLACK_BOT_TOKEN,
        SigningSecret: process.env.SLACK_SIGNING_SECRET,
        ConnectionMode: 'http',
        MaxThreadMessages: 50,
        StreamingUpdateIntervalMs: 1500,
        ExplorerBaseURL: process.env.MJ_EXPLORER_BASE_URL || 'http://localhost:4201',
      }
    }
  ]
};
```

### Step 8: Start MJAPI

```bash
npm run start:api
```

Watch the logs for:
```
Server extension 'SlackMessagingExtension' initialized: Slack extension loaded (HTTP mode) for agent Sage
  Routes: POST /webhook/slack, POST /webhook/slack/interact, POST /webhook/slack/slash
```

### Step 9: Test It

1. Open Slack and DM your bot — it should respond using the default agent
2. In a channel, @mention the bot: `@MJ Bot what is MemberJunction?`
3. Try @mentioning a specific agent: `@MJ Bot @Research Agent what is quantum computing?`
4. Try a slash command: `/sage what's the weather like?`

---

## Part 1b: Slack Socket Mode (Local Development)

Socket Mode uses a WebSocket connection instead of HTTP webhooks. **No public URL or ngrok needed** — ideal for local development.

### Additional Setup

1. Go to your Slack App → **Basic Information** → **App-Level Tokens**
2. Click **Generate Token and Scopes**
3. Name it (e.g., "socket-mode"), add scope `connections:write`
4. Copy the token (`xapp-...`) — this is `SLACK_APP_TOKEN`
5. Go to **Socket Mode** and toggle it ON

### Configuration

```bash
# .env
SLACK_APP_TOKEN=xapp-your-app-token-here
```

```javascript
// mj.config.cjs
{
  Enabled: true,
  DriverClass: 'SlackMessagingExtension',
  RootPath: '/webhook/slack',
  Settings: {
    DefaultAgentName: 'Sage',
    ContextUserEmail: 'bot@yourcompany.com',
    BotToken: process.env.SLACK_BOT_TOKEN,
    AppToken: process.env.SLACK_APP_TOKEN,
    ConnectionMode: 'socket',  // <-- Socket Mode
    // SigningSecret not needed for Socket Mode
  }
}
```

Watch for: `Slack Socket Mode connected`

---

## Part 2: Microsoft Teams Integration

### Step 1: Register a Bot in Azure

1. Go to the [Azure Portal](https://portal.azure.com)
2. Search for **Azure Bot** and click **Create**
3. Fill in:
   - **Bot handle**: Your bot's unique identifier
   - **Subscription**: Your Azure subscription
   - **Resource group**: Create new or use existing
   - **Type of App**: Choose **Single Tenant** (recommended) or **Multi Tenant**
   - **Creation type**: Create new Microsoft App ID
4. Click **Create** and wait for deployment

### Step 2: Get App Credentials

1. Go to your bot resource → **Configuration**
2. Copy the **Microsoft App ID**
3. Click **Manage Password** → **New client secret**
4. Copy the secret value — this is `MICROSOFT_APP_PASSWORD`
5. Note the **Tenant ID** if using Single Tenant

### Step 3: Configure the Messaging Endpoint

1. In your bot resource → **Configuration**
2. Set **Messaging endpoint** to: `https://your-server.com/webhook/teams`

### Step 4: Enable Teams Channel

1. Go to your bot resource → **Channels**
2. Click **Microsoft Teams** and follow the prompts to enable it
3. Accept the terms of service

### Step 5: Create a Teams App Manifest

Create a Teams app package (a `.zip` file) containing `manifest.json`:

```json
{
  "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.16/MicrosoftTeams.schema.json",
  "manifestVersion": "1.16",
  "version": "1.0.0",
  "id": "YOUR-APP-GUID",
  "developer": {
    "name": "Your Company",
    "websiteUrl": "https://yourcompany.com",
    "privacyUrl": "https://yourcompany.com/privacy",
    "termsOfUseUrl": "https://yourcompany.com/terms"
  },
  "name": {
    "short": "MJ Bot",
    "full": "MemberJunction AI Bot"
  },
  "description": {
    "short": "AI agent assistant",
    "full": "Chat with MemberJunction AI agents directly in Teams"
  },
  "icons": {
    "color": "color.png",
    "outline": "outline.png"
  },
  "accentColor": "#264FAF",
  "bots": [
    {
      "botId": "YOUR-MICROSOFT-APP-ID",
      "scopes": ["personal", "team", "groupChat"],
      "supportsFiles": false,
      "isNotificationOnly": false
    }
  ],
  "permissions": ["identity", "messageTeamMembers"],
  "validDomains": ["your-server.com"]
}
```

Include `color.png` (192x192) and `outline.png` (32x32) icons in the zip.

### Step 6: Install in Teams

**For development/testing:**
1. Open Teams → Apps → **Manage your apps**
2. Click **Upload a custom app** → **Upload for me or my teams**
3. Select your `.zip` package

**For organization-wide deployment:**
1. Go to [Teams Admin Center](https://admin.teams.microsoft.com)
2. **Teams apps** → **Manage apps** → **Upload new app**
3. Upload your `.zip` package
4. Set up app policies to control who can use it

### Step 7: Configure MJAPI

Add environment variables:

```bash
MICROSOFT_APP_ID=your-app-id-guid
MICROSOFT_APP_PASSWORD=your-client-secret
MICROSOFT_APP_TENANT_ID=your-tenant-id  # Only for Single Tenant
```

Add to `mj.config.cjs`:

```javascript
module.exports = {
  serverExtensions: [
    {
      Enabled: true,
      DriverClass: 'TeamsMessagingExtension',
      RootPath: '/webhook/teams',
      Settings: {
        DefaultAgentName: process.env.MJ_BOT_DEFAULT_AGENT_NAME || 'Sage',
        ContextUserEmail: process.env.MJ_BOT_CONTEXT_USER_EMAIL || 'bot@yourcompany.com',
        MicrosoftAppId: process.env.MICROSOFT_APP_ID,
        MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD,
        MicrosoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID,
        MaxThreadMessages: 50,
        StreamingUpdateIntervalMs: 2000,
        ExplorerBaseURL: process.env.MJ_EXPLORER_BASE_URL || 'http://localhost:4201',
      }
    }
  ]
};
```

### Step 8: Start and Test

```bash
npm run start:api
```

Watch for:
```
Server extension 'TeamsMessagingExtension' initialized: Teams messaging extension loaded for agent Sage
  Routes: POST /webhook/teams
```

Test by DM-ing the bot in Teams or @mentioning it in a channel.

---

## Part 3: Running Both Platforms Together

Both adapters can run simultaneously in a single MJAPI instance:

```javascript
// mj.config.cjs
module.exports = {
  serverExtensions: [
    {
      Enabled: true,
      DriverClass: 'SlackMessagingExtension',
      RootPath: '/webhook/slack',
      Settings: {
        DefaultAgentName: process.env.MJ_BOT_DEFAULT_AGENT_NAME || 'Sage',
        ContextUserEmail: process.env.MJ_BOT_CONTEXT_USER_EMAIL || 'bot@yourcompany.com',
        BotToken: process.env.SLACK_BOT_TOKEN,
        SigningSecret: process.env.SLACK_SIGNING_SECRET,
        ConnectionMode: 'http',
        MaxThreadMessages: 50,
        StreamingUpdateIntervalMs: 1500,
        ExplorerBaseURL: process.env.MJ_EXPLORER_BASE_URL || 'http://localhost:4201',
      }
    },
    {
      Enabled: true,
      DriverClass: 'TeamsMessagingExtension',
      RootPath: '/webhook/teams',
      Settings: {
        DefaultAgentName: process.env.MJ_BOT_DEFAULT_AGENT_NAME || 'Sage',
        ContextUserEmail: process.env.MJ_BOT_CONTEXT_USER_EMAIL || 'bot@yourcompany.com',
        MicrosoftAppId: process.env.MICROSOFT_APP_ID,
        MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD,
        MicrosoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID,
        MaxThreadMessages: 50,
        StreamingUpdateIntervalMs: 2000,
        ExplorerBaseURL: process.env.MJ_EXPLORER_BASE_URL || 'http://localhost:4201',
      }
    }
  ]
};
```

---

## Environment Variables Reference

| Variable | Required For | Description |
|----------|-------------|-------------|
| `SLACK_BOT_TOKEN` | Slack | Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Slack (HTTP) | App signing secret for webhook verification |
| `SLACK_APP_TOKEN` | Slack (Socket) | App-Level Token (`xapp-...`) for Socket Mode |
| `MICROSOFT_APP_ID` | Teams | Azure Bot Service App ID |
| `MICROSOFT_APP_PASSWORD` | Teams | Azure Bot Service client secret |
| `MICROSOFT_APP_TENANT_ID` | Teams (Single Tenant) | Azure AD Tenant ID |
| `MJ_BOT_DEFAULT_AGENT_NAME` | Both | Default agent name (e.g., "Sage") |
| `MJ_BOT_CONTEXT_USER_EMAIL` | Both | Fallback MJ user email for agent execution |
| `MJ_EXPLORER_BASE_URL` | Both (optional) | MJ Explorer URL for deep-link buttons |

---

## Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `DefaultAgentName` | `string` | (required) | Default MJ AI Agent name — resolved at startup |
| `ContextUserEmail` | `string` | (required) | Fallback service account email for agent execution |
| `BotToken` | `string` | (required for Slack) | Slack Bot OAuth Token (`xoxb-...`) |
| `SigningSecret` | `string` | — | Slack signing secret for HMAC-SHA256 verification |
| `AppToken` | `string` | — | Slack App-Level Token for Socket Mode (`xapp-...`) |
| `ConnectionMode` | `'http' \| 'socket'` | `'http'` | Slack connection mode |
| `MaxThreadMessages` | `number` | `50` | Max thread messages fetched for conversation context |
| `ShowTypingIndicator` | `boolean` | `true` | Show typing/thinking indicator while processing |
| `StreamingUpdateIntervalMs` | `number` | `1000` | Min interval between streaming message updates (ms) |
| `ExplorerBaseURL` | `string` | — | MJ Explorer URL for "View in Explorer" buttons |
| `SlashCommands` | `Record<string, string>` | — | Slash command → agent name mapping (Slack only) |
| `MicrosoftAppId` | `string` | — | Azure Bot Service App ID (Teams only) |
| `MicrosoftAppPassword` | `string` | — | Azure Bot Service client secret (Teams only) |
| `MicrosoftAppTenantId` | `string` | — | Azure AD Tenant ID for Single Tenant (Teams only) |
| `MicrosoftAppType` | `string` | auto | `'SingleTenant'`, `'MultiTenant'`, or `'UserAssignedMsi'` |

---

## How It Works

### Message Flow

```
1. User sends message in Slack/Teams
2. Platform sends webhook → MJAPI endpoint
3. Extension verifies auth (HMAC/JWT) and acknowledges immediately
4. Adapter normalizes event → IncomingMessage
5. BaseMessagingAdapter.HandleMessage():
   a. shouldRespond() — filter: DMs, @mentions, thread replies
   b. resolveContextUser() — map platform user → MJ UserInfo
   c. showTypingIndicator() — "Agent is thinking..."
   d. fetchThreadHistory() — load conversation context
   e. resolveAgent() — @mention → thread affinity → default
   f. buildConversationMessages() — thread → ChatMessage[]
   g. AgentRunner.RunAgentInConversation() with streaming
   h. detectDelegation() — auto-route to sub-agents
   i. formatResponse() → Block Kit / Adaptive Card
   j. sendFinalMessage() or updateFinalMessage()
```

### Agent Routing

Users can @mention specific agents:

```
@MJ Bot @Research Agent what is quantum computing?
```

The adapter uses a 4-pass matching strategy:
1. **Exact full-name match** with `@` prefix (e.g., `@Research Agent`)
2. **First-word prefix match** (e.g., `@Research` → "Research Agent")
3. **Bare name at start** (e.g., `Research Agent help me` after bot mention stripped)
4. **Name anywhere in message** (e.g., `help me research agent` — unambiguous only)

In thread replies, the adapter remembers which agent was originally invoked (thread affinity) — no need to @mention again for follow-ups.

### User Identity Mapping

Platform users are mapped to MJ users by email:
1. Extract email from platform message (Teams provides it directly)
2. For Slack: call `users.info` API to get email (`users:read.email` scope)
3. Look up email in MJ `UserCache` (case-insensitive)
4. Fall back to `ContextUserEmail` service account if no match

This gives proper per-user permission scoping without a separate auth flow.

### Agent Delegation

When an agent returns `payload.invokeAgent`, the adapter auto-delegates:
1. Shows the source agent's message (e.g., "Delegating to Marketing Agent...")
2. Executes the target agent with the same conversation context
3. Sends the target agent's response
4. Supports chained delegation up to 3 hops

### Deep Links

When `ExplorerBaseURL` is configured, responses include a "View in MJ Explorer" button:
- If an artifact was created: links to `{base}/resource/artifact/{artifactId}`
- If only a conversation: links to `{base}/conversations/{conversationId}`

---

## Troubleshooting

### Slack: "Invalid signature" (401)

- Verify `SLACK_SIGNING_SECRET` matches your app's Signing Secret (not Bot Token)
- Check server clock sync — signatures include a timestamp (5-minute window)
- Ensure the raw body is preserved (the adapter handles this automatically)

### Slack: Bot doesn't respond in channels

- Verify `app_mention` is subscribed in Event Subscriptions
- Add `message.channels` and `message.groups` for thread replies
- Invite the bot to the channel (`/invite @MJ Bot`)

### Teams: "Sorry, an error occurred"

- Verify `MICROSOFT_APP_ID` and `MICROSOFT_APP_PASSWORD` are correct
- Check Azure Bot Service → **Test in Web Chat** to test without Teams
- Verify messaging endpoint URL matches your `RootPath`

### Agent not found

- Check MJAPI logs for: `Default agent 'AgentName' not found`
- Verify the agent exists and has `Status='Active'` in the database
- Agent name matching is case-insensitive but must be exact

### No response (silent failure)

- Check MJAPI logs for errors
- Verify `ContextUserEmail` matches an existing MJ user
- Ensure `@memberjunction/messaging-adapters` is imported and `LoadMessagingAdapters()` is called
- Check the extension loaded: look for `Server extension '...' initialized` in logs

### Tree-shaking: Extension not found in ClassFactory

If you see `Server extension 'SlackMessagingExtension' not found in ClassFactory`:

1. Ensure `@memberjunction/messaging-adapters` is a dependency
2. Call `LoadMessagingAdapters()` before server startup
3. Or add it to the class manifest via `npm run mj:manifest`

---

## Local Development with ngrok

For testing webhooks locally:

```bash
# Terminal 1: Start ngrok
ngrok http 4001  # Match your GRAPHQL_PORT

# Terminal 2: Start MJAPI
npm run start:api
```

Update your Slack app's URLs:
- Event Subscriptions Request URL: `https://abc123.ngrok.io/webhook/slack`
- Interactivity Request URL: `https://abc123.ngrok.io/webhook/slack/interact`
- Slash Command Request URLs: `https://abc123.ngrok.io/webhook/slack/slash`

For Teams, update Azure Bot Service → Configuration → Messaging endpoint.

Or use **Slack Socket Mode** to avoid ngrok entirely (see Part 1b above).

---

## Known Limitations

- **Teams thread history**: Not yet implemented (requires Microsoft Graph API with `ChannelMessage.Read.All`). Teams conversations are currently single-turn; each message is independent.
- **Full response text store**: The "View Full" button in Slack stores content in memory with a 30-minute TTL. Content is lost on server restart.
- **Conversation references**: Teams conversation references for proactive messaging are stored in memory (lost on restart).
- **Max delegation hops**: Agent delegation chains are limited to 3 hops to prevent infinite loops.
