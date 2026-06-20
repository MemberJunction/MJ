# Remote Operations Guide

**Remote Operations** are MemberJunction's primitive for a *typed, code-to-code capability that the
browser and server both invoke through one surface*. They are the missing peer of `BaseEntity`
(record CRUD) and `RunView` (set reads): you define an operation once as a typed object, call it the
same way on the client (marshalled over GraphQL) or the server (dispatched in-process), and the
input/output types are shared across the wire.

> **Read this before hand-writing a TypeGraphQL resolver + a typed GraphQL client + duplicated I/O
> types for a non-CRUD capability.** That ceremony is exactly what Remote Operations replaces.

## When to use what

| Need | Tool |
|---|---|
| A typed capability the **browser and server both invoke**, one type system | **`BaseRemotableOperation`** (this guide) |
| A metadata/string-discoverable boundary for **agents / workflows / low-code** | **Action** |
| A first-class **public GraphQL API** surface, or an unusual transport (upload, native stream) | **bespoke typed resolver** |
| Table-backed record **CRUD** | **`BaseEntity`** (already generated) |

Remote Operations is **not** a replacement for Actions. Actions are the *agent surface* (their I/O is
an untyped `ActionParam` bag, by design); Remote Operations add **compile-time typed structured I/O
declared once and shared by both sides**, a structured-object input model, and a code-oriented
registry distinct from the agent catalog.

## Authoring an operation

A concrete operation extends `BaseRemotableOperation<TInput, TOutput>` (in `@memberjunction/core`)
and registers under a stable key:

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';

interface GetRunStatusInput  { processRunID: string; }
interface GetRunStatusOutput { status: string; processed: number; }

@RegisterClass(BaseRemotableOperation, 'RecordProcess.GetRunStatus')
export class RecordProcessGetRunStatusOperation
    extends BaseRemotableOperation<GetRunStatusInput, GetRunStatusOutput> {
    public readonly OperationKey = 'RecordProcess.GetRunStatus';
    public readonly RequiredScope = 'recordprocess:execute';   // optional API-key scope (§ Auth)
    public readonly ExecutionMode = 'Sync' as const;            // or 'LongRunning'

    // The server-side work. Use `provider` for data access (never `new Metadata()`).
    protected async InternalExecute(input: GetRunStatusInput, provider: IMetadataProvider, user: UserInfo): Promise<GetRunStatusOutput> {
        const run = await provider.GetEntityObject('MJ: Process Runs', user);
        await run.Load(input.processRunID);
        return { status: run.Status, processed: run.ProcessedItems };
    }
}
```

`InternalExecute` is **concrete, never abstract** — a CodeGen-emitted base (a future enhancement,
RO-2) can carry AI- or default-generated plumbing so an operation needs no hand-written subclass. The
per-operation `Authorize(input, user)` hook (returns `true` by default) is the operation's own gate.

## Calling an operation

The same call site works on the client and the server:

```typescript
const result = await new RecordProcessGetRunStatusOperation().Execute({ processRunID });
if (result.Success) {
    console.log(result.Output?.status);   // typed TOutput
}
```

- **Client**: `Execute` routes through `GraphQLDataProvider`, which marshals the call over the generic
  `ExecuteRemoteOperation` mutation and parses the typed result back.
- **Server**: `Execute` routes through `DatabaseProviderBase`, which resolves the operation by key from
  the ClassFactory and runs it **in-process** via `ExecuteServer`.

Both never throw for logical failures — inspect `result.Success` / `result.ResultCode` /
`result.ErrorMessage`.

### The `RouteOperation` power tool

`IRemoteOperationProvider.RouteOperation(key, input, options)` (implemented once in `ProviderBase`) is
the public, stringly-typed transport seam. **Prefer the typed `Operation.Execute()`** — `RouteOperation`
is for dynamic dispatch / generic tooling, not for building significant systems. Only **registered**
operations are routable, and every call is authorized server-side, so it is safe by construction.

## Authorization

The server resolver composes the **existing** auth seams — an operation never *requires* an API key:

1. **Resolve the acting user** (`GetUserFromPayload`) — works for interactive OAuth/JWT and API-key sessions.
2. **API-key scope gate** (`CheckAPIKeyScopeAuthorization(RequiredScope, key, userPayload)`) — a **no-op
   for interactive users**, enforced for API-key / MCP callers; `RequiredScope` is optional.
3. **System-user gate** (`RequiresSystemUser`) and entity-permission ceiling, as the operation touches data.
4. The operation's own **`Authorize(input, user)`** hook.

So a logged-in user is bounded by their role/entity permissions; an API-key caller additionally clears
the scope.

## Long-running operations

Set `ExecutionMode = 'LongRunning'` for operations backed by a tracked run (e.g. a `ProcessRun`); the
handle is the run ID. The caller-selected **detached** (fire-and-forget + poll/notify) and **attached**
(await + `onProgress` stream) modes, plus the generic progress channel, are delivered in RO-3.

## Reference implementations

- `RecordProcess.GetRunStatus` — a `Sync` read (`@memberjunction/record-set-processor`).
- `RecordProcess.RunNow` / `PauseRun` / `ResumeRun` / `CancelRun` — the Record Process control surface.
- Server transport: `dispatchRemoteOperationInProcess` + `DatabaseProviderBase.InternalRouteOperation`.
- Client transport: `GraphQLDataProvider.InternalRouteOperation`.
- Resolver: `ExecuteRemoteOperationResolver` (`@memberjunction/server`).

## Status

RO-0 (the typed object + provider seam) and RO-1 (transport + resolver + POC) are implemented. RO-2
(the `MJ: Remote Operations` metadata table is already created; the CodeGen emitter + AI-from-Description
body + `RemoteOperationEngineBase` cache remain), and RO-3 (the long-running detached/attached channel)
are the next phases — see `plans/record-set-processing-and-record-processes.md` §16–§17.
