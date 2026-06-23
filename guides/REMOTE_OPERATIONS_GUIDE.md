# Remote Operations Guide

**Remote Operations are MemberJunction's 4th data primitive** — a *typed, provider-routed server capability
that the browser and server both invoke through one call site*. They complete the set you already use every
day:

| # | Primitive | Shape | What it's for |
|---|---|---|---|
| 1 | `BaseEntity` | record CRUD | save / load / delete a single row, with validation + Record Changes |
| 2 | `RunView` | **dynamic** set reads | filter / sort / page over an entity at runtime |
| 3 | `RunQuery` | **stored, parameterized** queries | run a named, pre-defined query (often cross-entity / hand-tuned SQL) by key |
| 4 | **`BaseRemotableOperation`** | **typed RPC** | "run X on the server" — typed structured **input → output** that isn't a read or a CRUD write |

All four share one shape: **one call site that works on client and server, with the provider routing** —
`entity.Save()`, `rv.RunView()`, `rq.RunQuery()`, and now `op.Execute()`. On the client each marshals over
GraphQL; on the server each runs in-process. You write the same code regardless of tier.

So the mental slot for a Remote Operation is: *"I have a server capability that's neither a row write
(`BaseEntity`), a dynamic query (`RunView`), nor a stored query (`RunQuery`) — it takes typed input and returns
typed output."* Running a record process, rendering a template, kicking off clustering, classifying text.

> **Read this before hand-writing a TypeGraphQL resolver + a typed GraphQL client + duplicated I/O types for a
> non-CRUD capability.** That ceremony is exactly what Remote Operations replaces.
>
> 📊 **New to the idea?** Start with the **[Remote Operations Showcase](REMOTE_OPERATIONS_SHOWCASE.md)** — a
> visual before/after (with diagrams) of the layers this removes, built from two real migrations in this PR.

## When to use what

| Need | Tool |
|---|---|
| Table-backed record **CRUD** | **`BaseEntity`** (already generated) |
| A **dynamic** filtered/sorted read over an entity | **`RunView`** |
| A **stored, parameterized** query by key | **`RunQuery`** |
| A typed capability the **browser and server both invoke**, one type system | **`BaseRemotableOperation`** (this guide) |
| A metadata/string-discoverable boundary for **agents / workflows / low-code** | **Action** |
| A first-class **public GraphQL API** surface, or an unusual transport (upload, native stream) | **bespoke typed resolver** |

Remote Operations is **not** a replacement for Actions. Actions are the *agent surface* (their I/O is an
untyped `ActionParam` bag, by design); Remote Operations add **compile-time typed structured I/O declared once
and shared by both sides**, a structured-object input model, and a code-oriented registry distinct from the
agent catalog.

## Three ways to author an operation

Every operation is a subclass of `BaseRemotableOperation<TInput, TOutput>` registered under a stable key. The
**typed base** (key, execution mode, scope, and the `TInput`/`TOutput` interfaces) can be hand-written or, now,
**CodeGen-emitted from an `MJ: Remote Operations` metadata row** — the typed peer of generated entity
subclasses. How much you write depends on the row's `GenerationType`:

| `GenerationType` | CodeGen emits | You write |
|---|---|---|
| **`Manual`** | a typed **base shell** (no body, no `@RegisterClass`) | a hand-authored **server subclass** with `InternalExecute` + `@RegisterClass` |
| **`AI`** | a **complete registered class** with an LLM-authored body (after approval) | nothing — describe it in `Description` and approve the code |
| **`Default`** | a complete registered class with default/boilerplate plumbing | nothing |

The generated bases land in `@memberjunction/core-entities` (`generated/remote_operations.ts`) for the MJ repo,
or a downstream repo's `GeneratedEntities` — parallel to the entity-subclass split (`CoreRemoteOperations` /
`RemoteOperations` CodeGen output config). The emitter de-dups shared type definitions and emits each operation's
declared library imports + the always-available defaults.

### 1 — Manual (hand-authored subclass)

Add an `MJ: Remote Operations` row with `GenerationType='Manual'` and the typed I/O definitions; CodeGen emits
the base, and you supply the body in a server subclass that extends it:

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
// CodeGen-emitted base (OperationKey / ExecutionMode / RequiredScope / typed I/O all come from metadata):
import { RecordProcessGetRunStatusOperation, type RecordProcessGetRunStatusInput, type RecordProcessGetRunStatusOutput } from '@memberjunction/core-entities';

@RegisterClass(BaseRemotableOperation, 'RecordProcess.GetRunStatus')
export class RecordProcessGetRunStatusServerOperation extends RecordProcessGetRunStatusOperation {
    // Use `provider`/`user` for data access (never `new Metadata()`); the typed signature comes from the base.
    protected async InternalExecute(input: RecordProcessGetRunStatusInput, provider: IMetadataProvider, user: UserInfo): Promise<RecordProcessGetRunStatusOutput> {
        const run = await provider.GetEntityObject('MJ: Process Runs', user);
        await run.Load(input.processRunID);
        return { status: run.Status, processed: run.ProcessedItems, total: run.TotalItemCount, success: run.SuccessCount, error: run.ErrorCount, skipped: run.SkippedCount };
    }
}
```

The server subclass registers **last** (it imports + extends the generated base), so it wins ClassFactory
dispatch by key.

### 2 — AI-from-Description (RO-4)

Set `GenerationType='AI'` and a clear `Description`; **no hand-written subclass at all**. On save,
`MJRemoteOperationEntityServer` calls the **`Generate Remote Operation Code`** prompt to author the body of
`InternalExecute`, stores it in `Code`, records the libraries it used in `LibrariesObject`, and sets
`CodeApprovalStatus='Pending'`. After a human approves, CodeGen emits a complete `@RegisterClass`'d class with
that body. Changing the `Description` re-generates and re-resets approval (unless `CodeLocked`).

**The ambient contract the model codes against** — taught by the generation prompt:

- `input: TInput` — the typed payload
- `provider: IMetadataProvider` — `RunView.FromMetadataProvider(provider)`, `provider.GetEntityObject(name, user)`
- `user: UserInfo` — the acting user (threaded into every data call)
- `context: RemoteOpServerContext` — `context.emitProgress(...)` for `LongRunning`
- the **default libraries** (`RunView`, `Metadata`, `RunQuery` from `@memberjunction/core`), imported for every body

Anything beyond the defaults is **declared** by the model and stored in the `Libraries` JSONType field
(`Array<RemoteOperationLibrary>` of `{ Library, ItemsUsed[] }`); the emitter turns each entry into an `import`.
Most ops — "RunView some rows, shape them, return" — declare **zero** libraries.

### 3 — Default plumbing

`GenerationType='Default'` emits a complete class with boilerplate plumbing (no LLM). Useful for rote shapes;
the smallest deployment footprint.

## Calling an operation

The same call site works on the client and the server:

```typescript
const result = await new TemplateRunOperation().Execute({ templateID, data });
if (result.Success) {
    console.log(result.Output?.output);   // typed TOutput
}
```

- **Client**: `Execute` routes through `GraphQLDataProvider`, which marshals the call over the generic
  `ExecuteRemoteOperation` mutation and parses the typed result back.
- **Server**: `Execute` routes through `DatabaseProviderBase`, which resolves the operation by key from the
  ClassFactory and runs it **in-process** via `ExecuteServer`.

Both never throw for logical failures — inspect `result.Success` / `result.ResultCode` / `result.ErrorMessage`.
**Server-side callers must pass the acting user** in the options (`Execute(input, { provider, user })`); the
browser session supplies it automatically.

### The `RouteOperation` power tool

`IRemoteOperationProvider.RouteOperation(key, input, options)` (implemented once in `ProviderBase`) is the
public, stringly-typed transport seam. **Prefer the typed `Operation.Execute()`** — `RouteOperation` is for
dynamic dispatch / generic tooling, not for building significant systems. Only **registered** operations are
routable, and every call is authorized server-side, so it is safe by construction.

## Authorization

The server resolver (`ExecuteRemoteOperationResolver`) composes the **existing** auth seams — an operation never
*requires* an API key:

1. **Resolve the acting user** (`GetUserFromPayload`) — works for interactive OAuth/JWT and API-key sessions.
2. **API-key scope gate** (`CheckAPIKeyScopeAuthorization(RequiredScope, key, userPayload)`) — a **no-op for
   interactive users**, enforced for API-key / MCP callers; `RequiredScope` is optional and seeded as an
   `MJ: API Scopes` row (e.g. `recordprocess:execute`).
3. **Metadata gate** (`RemoteOperationEngineBase.IsInvokable`) — defense-in-depth: the operation's row must be
   `Active`, and `AI` ops must additionally be `Approved`, so a registered-but-disabled (or unapproved AI)
   operation is rejected on the wire even though its class is still in code. A code-only op with no row passes.
4. **System-user gate** (`RequiresSystemUser`) and the entity-permission ceiling, as the operation touches data.
5. The operation's own **`Authorize(input, user)`** hook.

So a logged-in user is bounded by their role/entity permissions; an API-key caller additionally clears the scope.

## Long-running operations (RO-3)

Set `ExecutionMode = 'LongRunning'` for operations backed by a tracked run (e.g. a `ProcessRun`); the handle is
the run ID, and the body reports progress through the execution context:

```typescript
// inside InternalExecute(input, provider, user, context):
context.emitProgress({ OperationKey: this.OperationKey, Processed: n, Total: t, Status: 'Running', Message: `…` });
```

**Attached, both tiers (shipped).** Operations *emit* typed `RemoteOpProgress`, and an **attached** caller's
`onProgress` receives it:

- **In-process** — immediate (`emitProgress → onProgress`). `RecordProcess.RunNow` forwards the
  `RecordSetProcessor`'s per-batch progress this way.
- **Over the wire** — the client (`GraphQLDataProvider`) opens a `RemoteOperationProgress` GraphQL subscription
  with a self-generated `channelId`, passes that id to the `ExecuteRemoteOperation` mutation, and the server
  publishes each emitted `RemoteOpProgress` to that channel (`@Subscription`/`@PubSub` in
  `ExecuteRemoteOperationResolver`). Filtered by `channelId` so concurrent calls never interleave; progress is
  best-effort (a channel error never fails the call); the subscription is torn down when the call ends. A
  browser caller's `onProgress` fires live during a `LongRunning` mutation — no API change, just pass `onProgress`.

**Detached mode (partial).** Today `mode: 'detached'` still completes synchronously and returns the run handle
(`ProcessRunID`), which the caller can poll via `RecordProcess.GetRunStatus` — correct, but not yet
*fire-and-forget*. True return-immediately background execution + completion notification is the remaining
piece; it needs a durable execution context (so the run outlives the request) and a completion-notification
mechanism — the latter is an open design decision (reuse the push/notification entity vs. a new one) called
out in `plans/record-set-processing-and-record-processes.md` §17. Deliberately not rushed.

## Reference implementations

- **AI-authored body**: `MJRemoteOperationEntityServer` (`@memberjunction/core-entities-server`) + the
  `Generate Remote Operation Code` prompt + `remote-operation-generation.template.md`.
- **CodeGen emitter**: `RemoteOperationGeneratorBase` (`@memberjunction/codegen-lib`) → `remote_operations.ts`.
- **Metadata gate**: `RemoteOperationEngineBase` (`@memberjunction/core-entities`).
- **Operations**: `Template.Run` (`@memberjunction/templates`); `RecordProcess.RunNow` (LongRunning, emits
  progress) / `GetRunStatus` / `PauseRun` / `ResumeRun` / `CancelRun` (`@memberjunction/record-set-processor`).
- **Transport**: `dispatchRemoteOperationInProcess` + `DatabaseProviderBase.InternalRouteOperation` (server);
  `GraphQLDataProvider.InternalRouteOperation` (client); `ExecuteRemoteOperationResolver` (`@memberjunction/server`).

## Status

| Phase | What | Status |
|---|---|---|
| RO-0 | `BaseRemotableOperation` + `IRemoteOperationProvider` + in-process dispatch | ✅ shipped |
| RO-1 | `ExecuteRemoteOperation` resolver + auth chain | ✅ shipped |
| RO-2 | `MJ: Remote Operations` metadata + **CodeGen emitter** + `RemoteOperationEngineBase` cache | ✅ shipped |
| RO-3 | LongRunning progress — **attached, in-process AND over-the-wire** (subscription channel) | ✅ shipped · detached fire-and-forget partial |
| RO-4 | **AI-from-Description** operation bodies | ✅ shipped |

See `plans/record-set-processing-and-record-processes.md` §16–§17 for the full design history.
