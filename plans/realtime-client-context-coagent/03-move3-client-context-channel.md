# Move 3 — `ClientContextChannel` + `ContextTool`

**Goal:** Give the realtime co-agent a continuous, bidirectional wire to the app surface — it always knows *where the user is, what they see, and what it can do* — and a single stable tool to act through. This is the parity with async client tools the whole program is about.

**Depends on:** Move 1 (app capability metadata) + Move 2 (shared resolver). **Independently shippable** once those land.

## Why a headless channel

The realtime stack already has the perfect seam: **interactive channels** (`BaseRealtimeChannelClient` in `ng-conversations`, `BaseRealtimeChannelServer` in `@memberjunction/ai`), with `SendContextNote()` as a built-in mid-session context pipe and `ApplyAgentTool()` as the action path. The whiteboard/remote-browser/media channels all use it. `ClientContextChannel` is the same machinery with **no visible surface** — it never mounts a tab. It's the live link, not a UI.

## The two halves + the stable tool

```
  App surface (Explorer shell / Form Studio / Component Studio / chat-overlay)
        │  publishes ContextSnapshot deltas + capability manifest
        ▼
  ClientContextChannel (client)  ──SendContextNote(serialized)──►  Realtime model
        ▲                                                              │
        │  ContextTool({action, ...})  ◄──── one stable provider tool ─┘
        ▼
  ResolveClientTools(...) → local handler  (client-direct: no server hop)
```

### 3.1 The `ContextTool` (single stable proxy)
Declared once at session start **iff** the agent supports the channel. It's the only tool whose schema the provider ever sees for app actions, so the provider re-declaration constraint never bites.

```typescript
// Stable tool definition, registered with the realtime session at mint:
{
  name: 'ContextTool',
  description:
    'Perform an action in the application the user is currently in. The set of valid actions ' +
    '(tool names, agent names to invoke, navigation targets) is provided to you continuously as ' +
    'context — only call actions listed as currently available.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'The tool/verb/agent name to invoke (must be currently available).' },
      params: { type: 'object', description: 'Arguments for the action, matching its advertised input schema.' }
    },
    required: ['action']
  }
}
```

On call: the broker reads the live resolved set (`ResolveClientTools` + allowed-agent union from Move 4), validates `action` is currently valid, dispatches:
- a **client tool** → execute its handler locally (client-direct) or via the existing round-trip (server-bridged);
- an **`invoke_agent`** action → Move 4's delegation;
- a **navigation/show verb** → the surface's registered handler.

Unknown/stale `action` → structured error back to the model ("that action isn't available here right now"), so it self-corrects conversationally.

### 3.2 The `ContextSnapshot` (typed, in `ai-core-plus`)
New `packages/AI/CorePlus/src/client-context.ts`:

```typescript
import { ClientToolMetadata } from './agent-types';

/** A point-in-time description of the user's situation + what the agent can do. */
export interface ClientContextSnapshot {
    /** Where the user is. */
    Location?: {
        ApplicationID?: string | null;
        Route?: string | null;            // current route/url fragment
        ResourceType?: string | null;     // e.g. 'Record', 'Dashboard', 'Custom'
        EntityName?: string | null;
        RecordID?: string | null;
        Label?: string | null;            // human label of the current view
    };
    /** What the user sees / has selected. */
    View?: {
        VisibleEntities?: string[];       // entity names on screen
        Selection?: { EntityName?: string; RecordIDs?: string[] } | null;
        FreeText?: string | null;         // surface-supplied extra ("editing field X")
    };
    /** The live capability manifest — names + descriptions only (the catalog, not handlers). */
    Capabilities?: {
        Tools?: ClientToolMetadata[];     // currently-valid client tools (resolved)
        Agents?: ClientContextAgentRef[]; // currently-valid invoke_agent targets
    };
}

export interface ClientContextAgentRef {
    AgentID: string;
    Name: string;
    Description?: string | null;
    /** loop | flow — informational; delegation is transparent either way. */
    Kind?: 'loop' | 'flow' | null;
}

/** Serialize a snapshot/delta to the compact text form sent over SendContextNote. */
export function FormatContextNote(snapshot: ClientContextSnapshot): string { /* ... */ }
```

> The snapshot is **structured** (typed) and serialized to text **only at the channel boundary** via `FormatContextNote`, keeping the model's signal clean while staying within the text-only `SendContextNote` contract (provider-compatible).

### 3.3 The channel implementation
- **Server half:** `ClientContextChannelServer extends BaseRealtimeChannelServer` in `packages/AI/Agents/src/realtime/` (next to `whiteboard-channel-server.ts`). `ToolNamePrefix` empty (it owns `ContextTool` as a session-level tool, not a prefixed channel tool). `GetServerToolDefinitions()` contributes `ContextTool` when active. `OnChannelStateSave` is a no-op (this channel is ephemeral — it persists no state-of-record; it's a live wire).
- **Client half:** `ClientContextChannelClient extends BaseRealtimeChannelClient` in `ng-conversations` realtime channels dir. Overrides a new `IsSurfaceless = true` so the host doesn't try to mount a tab/surface. `BindSurface()` becomes a no-op. It exposes a small API the app calls:

```typescript
// Surface pushes context; channel debounces + diffs + sends a note.
PublishContext(snapshot: ClientContextSnapshot): void;        // full or partial
RegisterClientTool(tool: ClientToolDefinition): void;          // dynamic tier (handler + metadata)
UnregisterClientTool(name: string): void;
RegisterAllowedAgent(ref: ClientContextAgentRef): void;        // dynamic allowed-target (Move 4)
```

Debounce/coalesce snapshot deltas (≈ the whiteboard's 3s coalescing) so rapid navigation doesn't spam the model. Only send a note when the *manifest or salient location* actually changes.

### 3.4 Mark a channel as surfaceless
Add `IsSurfaceless?: boolean` to the channel base contract (`BaseRealtimeChannelClient`), defaulting false. The host's channel-mount loop skips surface binding when true. Tiny additive change to the base — pushes the capability to the generic level so future headless channels are free.

### 3.5 Wire `ContextTool` dispatch to the resolver
The realtime broker (Move 2.5) now, on `ContextTool` call:
1. Pull the current resolved tool set: `ResolveClientTools({ agentId, staticTools, sessionTools: channel.DynamicTools, appTools, overrideTools })`.
2. Pull the current allowed-agent union (Move 4).
3. Validate + dispatch as in 3.1.

### 3.6 Surface adoption (thin consumers — proof of the pattern)
- **Explorer shell** publishes a **baseline** `ClientContextSnapshot` (current app, route, open record) and registers the existing `NavigateToRecord` / `NavigateToApp` as client tools on the channel.
- **Form Studio / Component Studio** augment the snapshot (`View.FreeText = "editing form X, field Y"`) and register surface-specific tools (e.g. `AddFormField`, `PreviewComponent`).
- **Chat overlay** rides the same channel — no third mechanism.

These are *demonstration* adopters; the heavy lifting is all in the generic channel + resolver.

## Tests
- `client-context.test.ts` (ai-core-plus): `FormatContextNote` shape, partial-snapshot merge, empty.
- Channel unit: surfaceless mount skips binding; `ContextTool` dispatch validates `action` against the live set; stale action → structured error.
- Debounce/coalesce: N rapid `PublishContext` calls → ≤1 note within the window.
- Run `AI/Agents`, `ai-core-plus`, and the `ng-conversations` channel suites.

## Risks / notes
- **`SendContextNote` is provider-gated.** Where a provider lacks it, the manifest can't stream — document the degradation (co-agent falls back to the session-start tool set). This is a provider-capability fact, not a regression.
- **Token cost** — the manifest in context grows with capability count. Cap/trim descriptions; send deltas not full snapshots after the first. Log when trimmed (no silent truncation).
- **Don't persist** — this channel writes no `AIAgentSessionChannel.Config` state-of-record; it's live-only. Keep `OnChannelStateSave` a no-op to avoid DB churn.
