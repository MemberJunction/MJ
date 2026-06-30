# Move 3 — `ClientContextChannel` + `ContextTool`

**Goal:** Give the realtime co-agent a continuous, bidirectional wire to the app surface — it always knows *where the user is, what they see, and what it can do* — and a single stable tool to act through. This is the parity with async client tools the whole program is about.

**Depends on:** Move 1 (app capability metadata) + Move 2 (shared resolver). **Independently shippable** once those land.

## Why a headless channel

The realtime stack already has the perfect seam: **interactive channels** (`BaseRealtimeChannelClient` in `ng-conversations`, `BaseRealtimeChannelServer` in `@memberjunction/ai`), with `SendContextNote()` as a built-in mid-session context pipe and `ApplyAgentTool()` as the action path. The whiteboard/remote-browser/media channels all use it. `ClientContextChannel` is the same machinery with **no visible surface** — it never mounts a tab. It's the live link, not a UI.

## The two halves + the stable tool

```
  App surface (Explorer shell / Form Studio / Component Studio / chat-overlay)
        │  publishes AppContextSnapshot deltas + capability manifest
        ▼
  ClientContextChannel (client)  ──SendContextNote(serialized)──►  Realtime model
        ▲                                                              │
        │  ContextTool({action, ...})  ◄──── one stable provider tool ─┘
        ▼
  ResolveClientTools(...) → local handler  (client-direct: no server hop)
```

### 3.0 Two delivery parts (the audit found both are missing in realtime)

Realtime receives **no** app context today — neither at mint nor mid-session (`buildRealtimeSessionParams` never injects `appContext`; `SendContextNote` exists but is never called with context). So Move 3 has **two** parts, both required:

- **(a) Session-start injection** — fold the initial `AppContextSnapshot` into the realtime system prompt at mint, mirroring `BaseAgent.buildAppContextSection()`. New task in `buildRealtimeSessionParams` (base-agent.ts) + the client-direct mint path: read `params.Data.appContext` (already populated for async) and render it into the system prompt via the shared formatter. This gives the co-agent a correct picture from its first word.
- **(b) Streaming deltas** — the `ClientContextChannel` pushes subsequent changes via `SendContextNote` (sections 3.1–3.6 below). Keeps it current as the user moves.

Part (a) is the baseline; part (b) is the live wire. Ship (a) first — it's a small injection and instantly useful even before the channel exists.

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

### 3.2 EXTEND the existing `AppContextSnapshot` (do NOT create a new type)

> ⚠️ **Audit correction.** A typed snapshot **already exists and is async-wired**: `AppContextSnapshot` + `BuildAppContextSnapshot()` in [`packages/AI/CorePlus/src/app-context.ts`](packages/AI/CorePlus/src/app-context.ts), carrying `App / ActiveNavItem / OtherNavItems / User / AdditionalContext`, flowing through `NavigationService` → `MJExplorerAppComponent.handleAgentContextUpdate` → `AppContextSnapshot$` → `[appContext]` → `ProcessMessageInput.appContext` → `BaseAgent.buildAppContextSection()` (base-agent.ts:6368). **We extend this type — a new `ClientContextSnapshot` would fork it.** This is the single most important plan correction from the audit.

Add two optional members to `AppContextSnapshot` in `app-context.ts` (additive; existing async consumers ignore them):

```typescript
// Existing: App, ActiveNavItem, OtherNavItems, User, AdditionalContext
export interface AppContextSnapshot {
    // ...existing members unchanged...

    /** NEW — what the user currently sees / has selected on the active surface. */
    View?: {
        VisibleEntities?: string[];                              // entity names on screen
        Selection?: { EntityName?: string; RecordIDs?: string[] } | null;
        FreeText?: string | null;                               // e.g. "editing form X, field Y"
    };
    /** NEW — the live capability manifest: names + descriptions only (catalog, not handlers). */
    Capabilities?: {
        Tools?: ClientToolMetadata[];                           // currently-valid client tools (resolved, Move 2)
        Agents?: AppContextAgentRef[];                          // currently-valid invoke_agent targets (Move 4)
    };
}

export interface AppContextAgentRef {
    AgentID: string;
    Name: string;
    Description?: string | null;
    Kind?: 'loop' | 'flow' | null;                              // informational; delegation is transparent
}

/** Serialize a snapshot/delta to the compact text form sent over SendContextNote (realtime). */
export function FormatAppContextNote(snapshot: AppContextSnapshot): string { /* ... */ }
```

Notes:
- `App`/`ActiveNavItem` already encode "where the user is" — we add `View` (what they see) and `Capabilities` (what they can do), not a parallel `Location`.
- `BuildAppContextSnapshot()` gains optional population of the new members; async path keeps working untouched.
- `FormatAppContextNote` lives beside `buildAppContextSection`'s logic conceptually — reuse the same field-formatting so async-prompt and realtime-note read consistently. The snapshot stays **structured**; serialization to text happens **only at the channel boundary**, within the text-only `SendContextNote` contract.

### 3.3 The channel implementation
- **Server half:** `ClientContextChannelServer extends BaseRealtimeChannelServer` in `packages/AI/Agents/src/realtime/` (next to `whiteboard-channel-server.ts`). `ToolNamePrefix` empty (it owns `ContextTool` as a session-level tool, not a prefixed channel tool). `GetServerToolDefinitions()` contributes `ContextTool` when active. `OnChannelStateSave` is a no-op (this channel is ephemeral — it persists no state-of-record; it's a live wire).
- **Client half:** `ClientContextChannelClient extends BaseRealtimeChannelClient` in `ng-conversations` realtime channels dir. `BindSurface()`/`GetSurfaceComponent()` return nothing (no-op). The host knows to skip surface-mounting from **channel metadata** (`MJ: AI Agent Channels.IsHeadless` — see 3.4). *Note:* headlessness already works **implicitly** today — the mount loop instantiates+`Initialize`s every channel and the overlay just skips rendering when `GetSurfaceComponent()` is null (there's a `channel-optional-surface.test.ts`). `IsHeadless` makes it **explicit metadata** (do-it-right) so the host can also skip instantiation cost and the registry self-documents which channels are wires vs. surfaces. It exposes a small API the app calls:

```typescript
// Surface pushes context; channel debounces + diffs + sends a note.
PublishContext(snapshot: AppContextSnapshot): void;           // full or partial
RegisterClientTool(tool: ClientToolDefinition): void;          // dynamic tier (handler + metadata)
UnregisterClientTool(name: string): void;
RegisterAllowedAgent(ref: AppContextAgentRef): void;           // dynamic allowed-target (Move 4)
```

> **Converge, don't fork (Phase 5 link).** `PublishContext` / `RegisterClientTool` here are the **evolution of the existing `NavigationService.SetAgentContext` / `SetAgentClientTools`** — the same surface call should feed both async (`AppContextSnapshot$`) and realtime (this channel). Either fold the channel publish into `NavigationService`, or have it delegate. Do **not** ship a second surface API. See [06](06-phase-app-context-rollout.md).

Debounce/coalesce snapshot deltas (≈ the whiteboard's 3s coalescing) so rapid navigation doesn't spam the model. Only send a note when the *manifest or salient location* actually changes.

### 3.4 Extend the `MJ: AI Agent Channels` registry entity (metadata, generic-level win)
The channel registry entity (`MJAIAgentChannelEntity`) today has only `ID, Name, Description, ServerPluginClass, ClientPluginClass, TransportType, ConfigSchema, IsActive`. It has **no** way to say a channel is headless, no tab display name, no grouping, no color/icon. We add a **behavioral column + a JSONType presentation bag** — benefiting *every* channel (whiteboard/media/remote-browser get nicer chrome for free).

**Why the split (column vs. bag):**
- `IsHeadless` is a **behavioral contract** the framework reads to decide surface-mounting. It belongs as a first-class `BIT NOT NULL DEFAULT 0` column: unambiguous, schema-self-documenting, native form checkbox, and a missing/typo'd JSON key can't silently flip mount behavior.
- `DisplayName`, `GroupName`, `Color`, `Icon` (and future chrome — sort order, badge, default-open, visibility rules) are **presentation**: read in-memory by the UI, never SQL-filtered, open-ended. That's exactly the JSONType case — extensible with **zero future migrations**.

Migration (single `ALTER TABLE`, with `sp_addextendedproperty` per column):

```sql
ALTER TABLE ${flyway:defaultSchema}.AIAgentChannel ADD
    IsHeadless     BIT            NOT NULL DEFAULT 0,
    ChannelConfig  NVARCHAR(MAX)  NULL;   -- JSONType; shape = IChannelConfig
```

> **Naming:** `ConfigSchema` (existing) validates the *per-session* `AIAgentSessionChannel.Config` state-of-record. `ChannelConfig` (new) is *channel-definition-level* presentation config — different scope. Document the distinction inline, or rename the new column **`UIConfig`** (`IChannelUIConfig`) to remove any "config vs. configschema" ambiguity. **Open micro-decision** — lean `UIConfig`.

`IChannelConfig` interface (`metadata/entities/JSONType-interfaces/IChannelConfig.ts`, registered via `.entity-field-jsontype-channel-config.json` exactly like Move 1):

```typescript
/** Channel-definition-level presentation/chrome config. Stored as JSON in AIAgentChannel.ChannelConfig. */
export interface IChannelConfig {
    /** Human label for the tab/chrome. Null → fall back to the channel's Name. */
    DisplayName?: string | null;
    /** Optional group for clustering channels in the UI. Null → ungrouped. */
    GroupName?: string | null;
    /** Chrome accent. Prefer a semantic design-token name (e.g. "--mj-brand-primary"); hex allowed but discouraged. */
    Color?: string | null;
    /** Font Awesome class, e.g. "fa-solid fa-satellite-dish". */
    Icon?: string | null;
    /** Display order within a group/list. */
    SortOrder?: number | null;
    // Extensible: add future chrome here with no DB change.
}
```

> `Color` guidance: the consuming chrome resolves token names through the design-token system (no hardcoded hex in component CSS) so dark-mode / white-label stay correct.

Then: run migration + CodeGen against `MJ_5_43_0_Predictive` so `IsHeadless` (typed `boolean`) and `ChannelConfigObject: IChannelConfig | null` generate. Seed `ClientContextChannel` (`IsHeadless=1`) and backfill existing whiteboard/media/remote-browser rows with sensible `ChannelConfig` chrome via **metadata sync**, not SQL inserts. The host's channel-mount loop reads `channel.IsHeadless` to skip binding; the tab chrome reads `ChannelConfigObject?.DisplayName ?? Name`, `.Icon`, `.Color`, and clusters by `.GroupName`.

**Alternative (one mechanism):** put `IsHeadless` in the bag too — trades the schema-level guarantee for uniformity. Not recommended here, but a clean fallback.

### 3.5 Wire `ContextTool` dispatch to the resolver
The realtime broker (Move 2.5) now, on `ContextTool` call:
1. Pull the current resolved tool set: `ResolveClientTools({ agentId, staticTools, sessionTools: channel.DynamicTools, appTools, overrideTools })`.
2. Pull the current allowed-agent union (Move 4).
3. Validate + dispatch as in 3.1.

### 3.6 Surface adoption (thin consumers — proof of the pattern)
- **Explorer shell** already publishes the baseline `AppContextSnapshot` (app, active nav item) — extend it with `View`/`Capabilities` and route the existing `NavigateToRecord` / `NavigateToApp` registration through the channel too.
- **Form Studio / Component Studio** augment the snapshot (`View.FreeText = "editing form X, field Y"`) and register surface-specific tools (e.g. `AddFormField`, `PreviewComponent`).
- **Chat overlay** rides the same channel — no third mechanism.

These are *demonstration* adopters; the heavy lifting is all in the generic channel + resolver.

## Tests
- `app-context.test.ts` (ai-core-plus): `FormatAppContextNote` shape (incl. new `View`/`Capabilities`), partial-snapshot merge, empty; existing async consumers unaffected by the additive members.
- Session-start injection (part a): `buildRealtimeSessionParams` renders `appContext` into the system prompt; absent when no appContext.
- Channel unit: `IsHeadless` channel skips surface binding; visible channels still mount; `DisplayName ?? Name` fallback; `ContextTool` dispatch validates `action` against the live set; stale action → structured error.
- CodeGen smoke: `IsHeadless` (boolean) and `ChannelConfigObject` (`IChannelConfig`) generate and round-trip.
- Debounce/coalesce: N rapid `PublishContext` calls → ≤1 note within the window.
- Run `AI/Agents`, `ai-core-plus`, and the `ng-conversations` channel suites.

## Risks / notes
- **`SendContextNote` is provider-gated.** Where a provider lacks it, the manifest can't stream — document the degradation (co-agent falls back to the session-start tool set). This is a provider-capability fact, not a regression.
- **Token cost** — the manifest in context grows with capability count. Cap/trim descriptions; send deltas not full snapshots after the first. Log when trimmed (no silent truncation).
- **Don't persist** — this channel writes no `AIAgentSessionChannel.Config` state-of-record; it's live-only. Keep `OnChannelStateSave` a no-op to avoid DB churn.
