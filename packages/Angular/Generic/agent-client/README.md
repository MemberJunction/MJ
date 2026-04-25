# @memberjunction/ng-agent-client

Thin Angular wrapper around [`@memberjunction/ai-agent-client`](../../../AI/AgentsClient/README.md). Provides Angular dependency injection and automatic lifecycle cleanup -- nothing more.

## What This Package Does

- **`AgentClientService`** -- An `@Injectable({ providedIn: 'root' })` singleton that owns an `AgentClientSession` internally.
- **Pass-through API** -- Every public method and observable on `AgentClientSession` is exposed directly. No transformation, no added logic.
- **Lifecycle management** -- Calls `session.Dispose()` in `ngOnDestroy` to prevent memory leaks.

## What This Package Does NOT Do

- No business logic
- No tool handlers -- the consuming application registers tools
- No GraphQL code -- that lives in the core SDK
- No WebSocket code -- removed; transport is handled by `GraphQLDataProvider`

## Usage

```typescript
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import { Subject, takeUntil } from 'rxjs';

@Component({ ... })
export class MyChatComponent implements OnInit, OnDestroy {
    private agentClient = inject(AgentClientService);
    private destroy$ = new Subject<void>();

    ngOnInit(): void {
        // Register tools
        this.agentClient.RegisterTool({
            Name: 'NavigateToRecord',
            Description: 'Open an entity record',
            ParameterSchema: { type: 'object', properties: { EntityName: { type: 'string' } } },
            Handler: async (params) => {
                // app-specific logic
                return { Success: true, Data: 'done' };
            },
        });

        // Listen for events
        this.agentClient.ToolRequested$
            .pipe(takeUntil(this.destroy$))
            .subscribe(event => console.log('Tool requested:', event.Request.ToolName));

        // Start session
        this.agentClient.StartSession('session-id');
    }

    async SendMessage(text: string): Promise<void> {
        const result = await this.agentClient.RunAgent({
            AgentId: 'agent-uuid',
            Messages: [{ role: 'user', content: text }],
        });
        console.log('Agent result:', result.Success);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        // AgentClientService.ngOnDestroy() calls session.Dispose() automatically
    }
}
```

## API

All methods and observables mirror `AgentClientSession` from the core SDK:

| Member | Type | Description |
|---|---|---|
| `ToolRequested$` | `Observable` | Emitted before tool execution |
| `ToolExecuted$` | `Observable` | Emitted after tool execution |
| `AgentProgress$` | `Observable` | Agent progress updates |
| `SessionActive$` | `Observable` | Session state changes |
| `Error$` | `Observable` | Errors during communication or execution |
| `SessionId` | `string \| null` | Current session ID |
| `IsActive` | `boolean` | Whether a session is active |
| `RegisterTool(tool)` | method | Register a client-side tool handler |
| `UnregisterTool(name)` | method | Remove a tool |
| `GetRegisteredTools()` | method | List all registered tools |
| `StartSession(id)` | method | Start listening for tool requests |
| `StopSession()` | method | Stop and clean up |
| `RunAgent(params)` | method | Execute an agent |
| `RunAgentFromConversationDetail(params)` | method | Execute from conversation detail |

## Using the Core SDK Directly

This Angular wrapper is a convenience, not a requirement. The core SDK (`@memberjunction/ai-agent-client`) already provides RxJS observables and requires no Angular-specific APIs. If you run into issues with Angular's `providedIn: 'root'` singleton pattern — such as duplicate instances from multiple module imports or npm hoisting conflicts — you can use `AgentClientSession` directly:

```typescript
import { AgentClientSession } from '@memberjunction/ai-agent-client';

// Create and manage the session yourself
const session = new AgentClientSession();
session.RegisterTool({ Name: 'MyTool', ... });
session.StartSession('session-id');

// Same observables, same API — no Angular DI involved
session.ToolRequested$.subscribe(event => { ... });
await session.RunAgent({ AgentId: 'sage-id', Messages: [...] });

// Clean up when done
session.Dispose();
```

This is particularly useful in non-standard Angular setups (micro-frontends, lazy-loaded feature modules with their own injectors, or hybrid apps).

## Further Reading

- **Core SDK**: [`@memberjunction/ai-agent-client` README](../../../AI/AgentsClient/README.md) -- full architecture, types, and examples
- **Client Tools Protocol**: [CLIENT_TOOLS_GUIDE.md](../../../AI/Agents/docs/CLIENT_TOOLS_GUIDE.md) -- how tools are defined, dispatched, and resolved
