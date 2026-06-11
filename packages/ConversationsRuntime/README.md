# @memberjunction/conversations-runtime

Framework-agnostic runtime layer for MemberJunction conversational AI experiences.

## What this package is

The pure-TypeScript orchestration layer that sits beneath every chat surface in MJ — overlay, embedded panel, full-page Chat workspace, and any future custom UX. **Zero UX dependencies**, **client + server consumable**.

```
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│  ANGULAR APPS                         │   │  NON-ANGULAR JS APPS                  │
│  (MJ Explorer, Angular widgets)       │   │  (React, Vue, Node workers, CLI)     │
└──────────────────────────────────────┘   └──────────────────────────────────────┘
                  │                                            │
                  ▼                                            │
        @memberjunction/ng-conversations                       │
        (Angular widget wrapper)                                │
                  │                                            │
                  └──────────────────┬─────────────────────────┘
                                     ▼
                    @memberjunction/conversations-runtime   ★ this package
                                     │
                                     ▼
            @memberjunction/core-entities (ConversationEngine — data layer)
```

## What it provides

| Sub-component | Purpose |
|---|---|
| `Mentions` | Parse `@`-mentions out of message text (JSON + legacy formats). Pure string logic. |
| `Bridge` | Coordinate active-conversation state between the corner overlay and the full-page workspace. |
| `DefaultAgent` | Resolve which agent handles a conversation turn via Application-Settings-driven chain (explicit → app-scoped → global → code-const Sage fallback). |
| `Tools` | The shared `ClientToolRegistry` from `@memberjunction/ai-agent-client` — register tools the agent can invoke on the client. |
| `Sessions` | Stub observability over the AI Agent Sessions/Channels infrastructure from PR #2787. Wired in once that PR lands. |

> **Not yet in this package** (PR 2 / widget refactor): the agent-run pipeline, PubSub streaming routing. Those depend on widget-internal notification + cache abstractions that get resolved alongside the widget rewire.

## Quick start

```typescript
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';

// At app boot — lazy, idempotent, no penalty if called per entry point
await ConversationsRuntime.Instance.Config(false, contextUser);

// Parse a mention out of user text
const mentions = ConversationsRuntime.Instance.Mentions.parseMentions(
    '@Sage help me',
    AIEngineBase.Instance.Agents
);

// Resolve the default agent for the current application
const agent = await ConversationsRuntime.Instance.DefaultAgent.resolve({
    applicationId: currentAppId,
});

// Register a client tool the agent can invoke
ConversationsRuntime.Instance.Tools.Register({
    Name: 'NavigateToRecord',
    Description: 'Open an entity record in the UI',
    ParameterSchema: { type: 'object', properties: { EntityName: { type: 'string' } } },
    Handler: async (params) => {
        // ... your navigation code ...
        return { Success: true };
    },
});
```

## Multi-provider support

Every API accepts an optional `provider?: IMetadataProvider` parameter and falls back to `Metadata.Provider` when omitted. Apps connecting to multiple MJ servers in parallel should pass an explicit provider to scope the runtime to that server.

## Documentation

- See [`guides/CONVERSATIONS_UX_STACK_GUIDE.md`](../../guides/CONVERSATIONS_UX_STACK_GUIDE.md) for the full three-layer stack reference (added in PR 3 — docs).
- See [`plans/conversations-runtime-extraction.md`](../../plans/conversations-runtime-extraction.md) for the design rationale.
- See [`plans/ai-agent-sessions.md`](../../plans/ai-agent-sessions.md) (PR #2787) for the Sessions/Channels infrastructure the runtime integrates with.
