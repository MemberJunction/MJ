# @memberjunction/ai-agent-client

Framework-agnostic SDK for connecting client applications to MemberJunction AI agents. Provides session management, client-side tool registration, and agent execution -- all over GraphQL transport via `GraphQLDataProvider`.

## Architecture

```
+----------------------------------+
|  Your Application (Angular, etc) |
+----------------------------------+
          |
          v
+----------------------------------+
|   AgentClientSession             |  <-- This package
|   - Session lifecycle            |
|   - Tool registration & dispatch |
|   - RxJS observables             |
+----------------------------------+
          |
          v
+----------------------------------+
|   GraphQLDataProvider            |  <-- @memberjunction/graphql-dataprovider
|   - ClientToolRequests (sub)     |
|   - ExecuteGQL (mutation)        |
|   - GraphQLAIClient (agent runs) |
+----------------------------------+
          |
          v
+----------------------------------+
|   MJAPI GraphQL Server           |
+----------------------------------+
```

**No WebSocket layer.** All communication flows through `Metadata.Provider` (a `GraphQLDataProvider` instance), which handles GraphQL subscriptions, mutations, and queries internally. The SDK has zero framework dependencies -- Angular, React, or plain TypeScript all work the same way.

## Key Classes

### `AgentClientSession`

The main entry point. Manages a bidirectional session with an MJ agent:

- **`StartSession(sessionId)`** -- Subscribes to `ClientToolRequests` via the data provider. Incoming tool requests are dispatched to registered handlers automatically.
- **`StopSession()`** -- Unsubscribes and cleans up.
- **`RunAgent(params)`** -- Executes an agent via `GraphQLAIClient.RunAIAgentFromConversationDetail()`.
- **`RunAgentFromConversationDetail(params)`** -- Optimized path that loads conversation history server-side.
- **`RegisterTool(tool)`** / **`UnregisterTool(name)`** -- Register client-side tool handlers that agents can invoke.
- **`Dispose()`** -- Completes all observables and releases resources.

#### RxJS Observables

| Observable | Emits |
|---|---|
| `ToolRequested$` | When a tool request arrives from the server (before execution) |
| `ToolExecuted$` | After a tool handler finishes (with result) |
| `Error$` | On communication or execution errors |
| `SessionActive$` | `true` on start, `false` on stop |
| `AgentProgress$` | Progress updates during agent execution |

### `ClientToolRegistry`

Manages registered tool definitions and handles execution with timeout protection.

- **`Register(tool)`** -- Add a tool (throws on duplicate name).
- **`Unregister(name)`** -- Remove a tool.
- **`Execute(name, params, timeoutMs?)`** -- Run a tool handler with configurable timeout (default 30s).
- **`GetTool(name)`** / **`GetAllTools()`** -- Lookup tools.

### Tool Decoration

For metadata-driven tools that need runtime context enrichment:

- **`RegisterToolDecorator(toolName, decorator)`** -- Register a function that enriches a tool's metadata.
- **`SetDecoratorContext(context)`** -- Update the runtime context (available entities, current app, etc.).
- **`DecorateAndSendTools(baseTools)`** -- Apply decorators and send enriched definitions to the server.

## Usage

```typescript
import { AgentClientSession } from '@memberjunction/ai-agent-client';

// 1. Create a session
const session = new AgentClientSession();

// 2. Register client-side tools
session.RegisterTool({
    Name: 'NavigateToRecord',
    Description: 'Open an entity record in the UI',
    ParameterSchema: {
        type: 'object',
        properties: {
            EntityName: { type: 'string' },
            RecordID: { type: 'string' },
        },
        required: ['EntityName', 'RecordID'],
    },
    Handler: async (params) => {
        // Your app-specific navigation logic
        router.navigate(['/entity', params['EntityName'], params['RecordID']]);
        return { Success: true, Data: 'navigated' };
    },
});

// 3. Subscribe to events
session.ToolRequested$.subscribe(event =>
    console.log(`Tool requested: ${event.Request.ToolName}`)
);
session.ToolExecuted$.subscribe(event =>
    console.log(`Tool result: ${event.Result.Success}`)
);
session.Error$.subscribe(err =>
    console.error(`Session error: ${err.Message}`)
);

// 4. Start session (begins listening for tool requests)
session.StartSession('your-session-id');

// 5. Run an agent
const result = await session.RunAgent({
    AgentId: 'agent-uuid',
    Messages: [{ role: 'user', content: 'Show me active members' }],
});

// 6. Or run from an existing conversation detail
const result2 = await session.RunAgentFromConversationDetail({
    ConversationDetailId: 'detail-uuid',
    AgentId: 'agent-uuid',
    MaxHistoryMessages: 20,
});

// 7. Clean up when done
session.Dispose();
```

## Client Tools Guide

For detailed documentation on the client tools protocol -- how tools are defined on the server, dispatched to clients, and how results flow back -- see:

**[packages/AI/Agents/docs/CLIENT_TOOLS_GUIDE.md](../Agents/docs/CLIENT_TOOLS_GUIDE.md)**

## Angular Integration

For Angular applications, use **`@memberjunction/ng-agent-client`** which provides an injectable Angular service wrapping this SDK. See [packages/Angular/Generic/agent-client/README.md](../../Angular/Generic/agent-client/README.md).
